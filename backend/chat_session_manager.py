import json
import time
import uuid
from dataclasses import dataclass, field
from types import SimpleNamespace
from typing import Optional

from backend.db import get_db

SCHEMA = """
CREATE TABLE IF NOT EXISTS sessions (
    session_id TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL,
    title      TEXT NOT NULL DEFAULT 'New Chat',
    created_at DOUBLE PRECISION NOT NULL,
    updated_at DOUBLE PRECISION NOT NULL
);
CREATE TABLE IF NOT EXISTS messages (
    id         SERIAL PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
    role       TEXT NOT NULL,
    content    TEXT NOT NULL,
    sources    TEXT NOT NULL DEFAULT '[]',
    created_at DOUBLE PRECISION NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, id);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
"""


@dataclass
class ChatMessage:
    role: str
    content: str
    sources: list = field(default_factory=list)
    timestamp: float = field(default_factory=time.time)


@dataclass
class ChatSession:
    session_id: str
    title: str = "New Chat"
    messages: list = field(default_factory=list)
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)

    def get_history_pairs(self) -> list[tuple[str, str]]:
        pairs = []
        pending_q = None
        for msg in self.messages:
            if msg.role == "user":
                pending_q = msg.content
            elif msg.role == "assistant" and pending_q is not None:
                pairs.append((pending_q, msg.content))
                pending_q = None
        return pairs


def _sources_to_json(sources) -> str:
    """Document objects can't go into a database, so keep only {source, page}."""
    seen, out = set(), []
    for doc in sources or []:
        meta = doc if isinstance(doc, dict) else (getattr(doc, "metadata", None) or {})
        source = str(meta.get("source", "unknown"))
        page = meta.get("page", "?")
        if not isinstance(page, (int, str)):
            page = str(page)
        key = (source, str(page))
        if key in seen:
            continue
        seen.add(key)
        out.append({"source": source, "page": page})
    return json.dumps(out, ensure_ascii=False)


def _sources_from_json(text: str) -> list:
    """Give the saved sources the same shape the rest of the app already expects (.metadata)."""
    try:
        items = json.loads(text or "[]")
    except json.JSONDecodeError:
        return []
    return [
        SimpleNamespace(metadata={"source": i.get("source", "unknown"), "page": i.get("page", "?")})
        for i in items
    ]


class ChatSessionManager:
    def __init__(self):
        with get_db() as db:
            cur = db.cursor()
            cur.execute(SCHEMA)

    def create_session(self, user_id: str) -> str:
        now = time.time()
        with get_db() as db:
            cur = db.cursor()
            cur.execute(
                """SELECT s.session_id FROM sessions s
                   WHERE s.user_id = %s
                   AND NOT EXISTS (SELECT 1 FROM messages m WHERE m.session_id = s.session_id)
                   ORDER BY s.updated_at DESC LIMIT 1""",
                (user_id,),
            )
            row = cur.fetchone()
            if row:
                cur.execute("UPDATE sessions SET updated_at = %s WHERE session_id = %s", (now, row["session_id"]))
                return row["session_id"]
            session_id = str(uuid.uuid4())
            cur.execute(
                "INSERT INTO sessions (session_id, user_id, title, created_at, updated_at) VALUES (%s, %s, 'New Chat', %s, %s)",
                (session_id, user_id, now, now),
            )
            return session_id

    def get_session(self, session_id: str, user_id: str) -> ChatSession:
        with get_db() as db:
            cur = db.cursor()
            cur.execute(
                "SELECT * FROM sessions WHERE session_id = %s AND user_id = %s", (session_id, user_id)
            )
            s = cur.fetchone()
            if s is None:
                raise KeyError(f"Unknown session_id: {session_id}")
            cur.execute(
                "SELECT role, content, sources, created_at FROM messages WHERE session_id = %s ORDER BY id",
                (session_id,),
            )
            rows = cur.fetchall()
        messages = [
            ChatMessage(role=r["role"], content=r["content"],
                        sources=_sources_from_json(r["sources"]), timestamp=r["created_at"])
            for r in rows
        ]
        return ChatSession(session_id=s["session_id"], title=s["title"], messages=messages,
                           created_at=s["created_at"], updated_at=s["updated_at"])

    def add_exchange(self, session_id: str, user_id: str, question: str, answer: str, sources: Optional[list] = None):
        now = time.time()
        with get_db() as db:
            cur = db.cursor()
            cur.execute(
                "SELECT title FROM sessions WHERE session_id = %s AND user_id = %s", (session_id, user_id)
            )
            s = cur.fetchone()
            if s is None:
                raise KeyError(f"Unknown session_id: {session_id}")
            cur.execute(
                "INSERT INTO messages (session_id, role, content, sources, created_at) VALUES (%s, 'user', %s, '[]', %s)",
                (session_id, question, now),
            )
            cur.execute(
                "INSERT INTO messages (session_id, role, content, sources, created_at) VALUES (%s, 'assistant', %s, %s, %s)",
                (session_id, answer, _sources_to_json(sources), now),
            )
            title = s["title"]
            if title == "New Chat" and question.strip():
                trimmed = question.strip()
                title = (trimmed[:40] + "...") if len(trimmed) > 40 else trimmed
            cur.execute("UPDATE sessions SET title = %s, updated_at = %s WHERE session_id = %s",
                       (title, now, session_id))

    def get_history_pairs(self, session_id: str, user_id: str) -> list[tuple[str, str]]:
        return self.get_session(session_id, user_id).get_history_pairs()

    def get_other_sessions_context(
        self,
        exclude_session_id: str,
        user_id: str,
        max_sessions: int = 5,
        max_pairs_per_session: int = 4,
    ) -> str:
        blocks = []
        for info in self.list_sessions(user_id):
            if len(blocks) >= max_sessions:
                break
            if info["session_id"] == exclude_session_id or info["message_count"] == 0:
                continue
            pairs = self.get_session(info["session_id"], user_id).get_history_pairs()
            if not pairs:
                continue
            lines = [f'Chat: "{info["title"]}"']
            for q, a in pairs[:max_pairs_per_session]:
                lines.append(f"- Asked: {q}")
                lines.append(f"  Answered: {a[:200]}")
            blocks.append("\n".join(lines))
        return "\n\n".join(blocks)

    def list_sessions(self, user_id: str) -> list[dict]:
        with get_db() as db:
            cur = db.cursor()
            cur.execute(
                """SELECT s.session_id, s.title, s.created_at, s.updated_at,
                          COUNT(m.id) AS message_count
                   FROM sessions s LEFT JOIN messages m ON m.session_id = s.session_id
                   WHERE s.user_id = %s
                   GROUP BY s.session_id
                   ORDER BY s.updated_at DESC, s.created_at DESC""",
                (user_id,),
            )
            rows = cur.fetchall()
        return [dict(r) for r in rows]

    def rename_session(self, session_id: str, user_id: str, new_title: str):
        with get_db() as db:
            cur = db.cursor()
            cur.execute(
                "UPDATE sessions SET title = %s WHERE session_id = %s AND user_id = %s",
                (new_title, session_id, user_id),
            )

    def delete_session(self, session_id: str, user_id: str):
        with get_db() as db:
            cur = db.cursor()
            cur.execute("DELETE FROM sessions WHERE session_id = %s AND user_id = %s", (session_id, user_id))

    def clear(self, user_id: str):
        with get_db() as db:
            cur = db.cursor()
            cur.execute("DELETE FROM sessions WHERE user_id = %s", (user_id,))