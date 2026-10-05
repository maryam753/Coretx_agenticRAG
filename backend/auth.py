import os
import time
import uuid
import requests
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from dotenv import load_dotenv
from backend.db import get_db
from google.oauth2 import id_token as google_id_token
from google.auth.transport import requests as google_requests

load_dotenv()

ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "").lower().strip()
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
GITHUB_CLIENT_ID = os.getenv("GITHUB_CLIENT_ID")
GITHUB_CLIENT_SECRET = os.getenv("GITHUB_CLIENT_SECRET")
JWT_SECRET = os.getenv("JWT_SECRET")
JWT_ALGORITHM = "HS256"
TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60
RESET_TOKEN_TTL_SECONDS = 30 * 60  

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
bearer_scheme = HTTPBearer()


def init_auth_db():
    with get_db() as db:
        cur = db.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS users (
                user_id TEXT PRIMARY KEY,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                created_at DOUBLE PRECISION NOT NULL
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS password_resets (
                token TEXT PRIMARY KEY,
                user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
                expires_at DOUBLE PRECISION NOT NULL,
                used INTEGER NOT NULL DEFAULT 0
            )
        """)

init_auth_db()


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return pwd_context.verify(password, password_hash)


def create_token(user_id: str) -> str:
    payload = {"sub": user_id, "exp": time.time() + TOKEN_TTL_SECONDS}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def create_user(email: str, password: str) -> str:
    user_id = str(uuid.uuid4())
    with get_db() as db:
        cur = db.cursor()
        cur.execute("SELECT 1 FROM users WHERE email = %s", (email,))
        existing = cur.fetchone()
        if existing:
            raise ValueError("An account with this email already exists.")
        cur.execute(
            "INSERT INTO users (user_id, email, password_hash, created_at) VALUES (%s, %s, %s, %s)",
            (user_id, email, hash_password(password), time.time()),
        )
    return user_id


def authenticate_user(email: str, password: str) -> str:
    with get_db() as db:
        cur = db.cursor()
        cur.execute(
            "SELECT user_id, password_hash FROM users WHERE email = %s", (email,)
        )
        row = cur.fetchone()
    if row is None or not verify_password(password, row["password_hash"]):
        raise ValueError("Incorrect email or password.")
    return row["user_id"]


def create_password_reset_token(email: str) -> str | None:
    """Returns a token if the email exists, else None (so we don't reveal which emails are registered)."""
    with get_db() as db:
        cur = db.cursor()
        cur.execute("SELECT user_id FROM users WHERE email = %s", (email,))
        row = cur.fetchone()
        if row is None:
            return None
        token = uuid.uuid4().hex
        cur.execute(
            "INSERT INTO password_resets (token, user_id, expires_at, used) VALUES (%s, %s, %s, 0)",
            (token, row["user_id"], time.time() + RESET_TOKEN_TTL_SECONDS),
        )
    return token


def complete_password_reset(token: str, new_password: str):
    with get_db() as db:
        cur = db.cursor()
        cur.execute(
            "SELECT user_id, expires_at, used FROM password_resets WHERE token = %s", (token,)
        )
        row = cur.fetchone()
        if row is None:
            raise ValueError("Invalid reset link.")
        if row["used"]:
            raise ValueError("This reset link has already been used.")
        if row["expires_at"] < time.time():
            raise ValueError("This reset link has expired.")
        cur.execute(
            "UPDATE users SET password_hash = %s WHERE user_id = %s",
            (hash_password(new_password), row["user_id"]),
        )
        cur.execute("UPDATE password_resets SET used = 1 WHERE token = %s", (token,))


def verify_google_token(token: str) -> str:
    """Asks Google to confirm the token is real and returns the verified email."""
    try:
        info = google_id_token.verify_oauth2_token(
            token, google_requests.Request(), GOOGLE_CLIENT_ID
        )
    except ValueError:
        raise ValueError("Invalid Google sign-in token.")
    email = info.get("email")
    if not email or not info.get("email_verified", False):
        raise ValueError("Google account email is not verified.")
    return email.lower().strip()
def verify_github_code(code: str) -> str:
    """
    Exchanges the GitHub OAuth 'code' for an access token, then uses that
    token to fetch the user's verified email from GitHub's API.
    """
    token_response = requests.post(
        "https://github.com/login/oauth/access_token",
        headers={"Accept": "application/json"},
        data={
            "client_id": GITHUB_CLIENT_ID,
            "client_secret": GITHUB_CLIENT_SECRET,
            "code": code,
        },
        timeout=10,
    )
    token_data = token_response.json()
    access_token = token_data.get("access_token")
    if not access_token:
        raise ValueError("GitHub sign-in failed — invalid or expired code.")

    emails_response = requests.get(
        "https://api.github.com/user/emails",
        headers={"Authorization": f"Bearer {access_token}", "Accept": "application/json"},
        timeout=10,
    )
    emails = emails_response.json()
    if not isinstance(emails, list):
        raise ValueError("Could not read email from GitHub account.")

    primary_verified = next(
        (e["email"] for e in emails if e.get("primary") and e.get("verified")), None
    )
    if not primary_verified:
        raise ValueError("Your GitHub account needs a verified email address.")

    return primary_verified.lower().strip()


def get_or_create_google_user(email: str) -> str:
    """Logs in an existing account by email, or creates one with no usable password."""
    with get_db() as db:
        cur = db.cursor()
        cur.execute("SELECT user_id FROM users WHERE email = %s", (email,))
        row = cur.fetchone()
        if row:
            return row["user_id"]
        user_id = str(uuid.uuid4())
        cur.execute(
            "INSERT INTO users (user_id, email, password_hash, created_at) VALUES (%s, %s, %s, %s)",
            (user_id, email, hash_password(uuid.uuid4().hex), time.time()),
        )
    return user_id


def get_current_user_id(creds: HTTPAuthorizationCredentials = Depends(bearer_scheme)) -> str:
    try:
        payload = jwt.decode(creds.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload["sub"]
    except JWTError:
        raise HTTPException(401, "Invalid or expired token.")
def get_current_admin(creds: HTTPAuthorizationCredentials = Depends(bearer_scheme)) -> str:
    """Same as get_current_user_id, but also confirms this user's email matches ADMIN_EMAIL."""
    try:
        payload = jwt.decode(creds.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload["sub"]
    except JWTError:
        raise HTTPException(401, "Invalid or expired token.")

    with get_db() as db:
        cur = db.cursor()
        cur.execute("SELECT email FROM users WHERE user_id = %s", (user_id,))
        row = cur.fetchone()

    if row is None or row["email"].lower().strip() != ADMIN_EMAIL:
        raise HTTPException(403, "Admin access required.")
    return user_id
def get_current_user_email(user_id: str) -> str | None:
    with get_db() as db:
        cur = db.cursor()
        cur.execute("SELECT email FROM users WHERE user_id = %s", (user_id,))
        row = cur.fetchone()
    return row["email"] if row else None

