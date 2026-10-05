import os
from contextlib import contextmanager

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL is not set in .env")


@contextmanager
def get_db():
    """
    Ek Postgres connection deta hai, jise 'with get_db() as db:' se use karte hain.
    Kaam khatam hote hi connection khud commit/close ho jata hai.
    cursor_factory=DictCursor use kiya hai taake rows ko 'row["column_name"]' se
    access kar sakein, jaise SQLite ka sqlite3.Row karta tha.
    """
    conn = psycopg2.connect(DATABASE_URL, cursor_factory=psycopg2.extras.DictCursor)
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()