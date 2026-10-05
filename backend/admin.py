import time
from backend.db import get_db
import os
import time
from backend.db import get_db
from langsmith import Client as LangSmithClient


def init_admin_db():
    with get_db() as db:
        cur = db.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS guardrail_logs (
                id SERIAL PRIMARY KEY,
                user_id TEXT NOT NULL,
                kind TEXT NOT NULL,
                detail TEXT NOT NULL,
                created_at DOUBLE PRECISION NOT NULL
            )
        """)
        cur.execute("CREATE INDEX IF NOT EXISTS idx_guardrail_logs_created ON guardrail_logs(created_at)")


init_admin_db()


def log_guardrail_event(user_id: str, kind: str, detail: str):
    """kind is 'input_blocked' or 'output_warning'. Never raises — a logging
    failure should never break the actual chat response the user is waiting on."""
    try:
        with get_db() as db:
            cur = db.cursor()
            cur.execute(
                "INSERT INTO guardrail_logs (user_id, kind, detail, created_at) VALUES (%s, %s, %s, %s)",
                (user_id, kind, detail, time.time()),
            )
    except Exception as e:
        print(f"Warning: could not log guardrail event: {e}")
def get_guardrail_logs(limit: int = 50) -> list[dict]:
    """Most recent guardrail events first, for the admin panel."""
    with get_db() as db:
        cur = db.cursor()
        cur.execute(
            """SELECT id, user_id, kind, detail, created_at
               FROM guardrail_logs
               ORDER BY created_at DESC
               LIMIT %s""",
            (limit,),
        )
        rows = cur.fetchall()
    return [dict(r) for r in rows]


def get_guardrail_summary() -> dict:
    """Quick counts for the admin dashboard overview."""
    with get_db() as db:
        cur = db.cursor()
        cur.execute(
            """SELECT kind, COUNT(*) as count
               FROM guardrail_logs
               GROUP BY kind"""
        )
        rows = cur.fetchall()
    counts = {r["kind"]: r["count"] for r in rows}
    return {
        "input_blocked": counts.get("input_blocked", 0),
        "output_warning": counts.get("output_warning", 0),
        "total": sum(counts.values()),
    }
def get_langsmith_client():
    api_key = os.getenv("LANGSMITH_API_KEY")
    if not api_key:
        return None
    return LangSmithClient(api_key=api_key)


def get_recent_traces(limit: int = 20) -> list[dict]:
    """
    Fetches the most recent LangSmith runs for this project, with the
    fields that matter for an admin dashboard: question, latency, tokens,
    cost, and whether it succeeded or errored.
    """
    client = get_langsmith_client()
    if client is None:
        return []

    project_name = os.getenv("LANGSMITH_PROJECT", "default")

    try:
        runs = client.list_runs(
            project_name=project_name,
            execution_order=1,  # only top-level runs, not every inner node
            limit=limit,
        )
    except Exception as e:
        print(f"Warning: could not fetch LangSmith traces: {e}")
        return []

    results = []
    for run in runs:
        results.append({
            "id": str(run.id),
            "name": run.name,
            "status": run.status,
            "start_time": run.start_time.isoformat() if run.start_time else None,
            "latency_seconds": (
                (run.end_time - run.start_time).total_seconds()
                if run.end_time and run.start_time else None
            ),
            "total_tokens": run.total_tokens if hasattr(run, "total_tokens") else None,
            "total_cost": float(run.total_cost) if getattr(run, "total_cost", None) else None,
            "error": run.error,
        })
    return results


def get_observability_summary() -> dict:
    """Quick aggregate numbers for the admin dashboard overview card."""
    traces = get_recent_traces(limit=100)
    if not traces:
        return {
            "total_runs": 0,
            "total_cost": 0.0,
            "avg_latency_seconds": 0.0,
            "error_count": 0,
        }

    total_cost = sum(t["total_cost"] or 0 for t in traces)
    latencies = [t["latency_seconds"] for t in traces if t["latency_seconds"] is not None]
    avg_latency = sum(latencies) / len(latencies) if latencies else 0.0
    error_count = sum(1 for t in traces if t["status"] == "error")

    return {
        "total_runs": len(traces),
        "total_cost": round(total_cost, 6),
        "avg_latency_seconds": round(avg_latency, 2),
        "error_count": error_count,
    }
def check_database_health() -> dict:
    """PostgreSQL ko ek halki query se check karta hai."""
    start = time.time()
    try:
        with get_db() as db:
            cur = db.cursor()
            cur.execute("SELECT 1")
            cur.fetchone()
        return {
            "status": "healthy",
            "latency_ms": round((time.time() - start) * 1000, 1),
        }
    except Exception as e:
        return {"status": "down", "error": str(e)}


def check_groq_keys_health() -> list[dict]:
    """Har Groq API key se ek chhota test call karta hai, taake pata chale
    kaunsi keys abhi kaam kar rahi hain (rate-limited ya invalid nahi)."""
    from backend.RAG_engine import GROQ_KEY_NAMES, load_groq_keys
    import groq as groq_sdk

    results = []
    key_names = [name for name in GROQ_KEY_NAMES if os.getenv(name)]

    for name in key_names:
        key = os.getenv(name)
        start = time.time()
        try:
            client = groq_sdk.Groq(api_key=key)
            client.chat.completions.create(
                model="openai/gpt-oss-120b",
                messages=[{"role": "user", "content": "ping"}],
                max_tokens=1,
            )
            results.append({
                "key_name": name,
                "status": "healthy",
                "latency_ms": round((time.time() - start) * 1000, 1),
            })
        except groq_sdk.RateLimitError:
            results.append({"key_name": name, "status": "rate_limited", "error": "Rate limit hit"})
        except Exception as e:
            results.append({"key_name": name, "status": "down", "error": str(e)})

    return results


def check_chroma_health() -> dict:
    """Chroma vector store client ko check karta hai — collections list karne
    ki koshish karta hai, jo confirm karta hai ke yeh respond kar raha hai."""
    start = time.time()
    try:
        from backend.persistence import get_chroma_client
        client = get_chroma_client()
        collections = client.list_collections()
        return {
            "status": "healthy",
            "latency_ms": round((time.time() - start) * 1000, 1),
            "collection_count": len(collections),
        }
    except Exception as e:
        return {"status": "down", "error": str(e)}


def get_system_health() -> dict:
    """Saare components ek sath check kar ke ek summary deta hai."""
    db_health = check_database_health()
    groq_health = check_groq_keys_health()
    chroma_health = check_chroma_health()

    groq_overall = "healthy" if any(k["status"] == "healthy" for k in groq_health) else "down"

    return {
        "database": db_health,
        "groq_keys": groq_health,
        "groq_overall": groq_overall,
        "chroma": chroma_health,
        "checked_at": time.time(),
    }
def get_all_users() -> list[dict]:
    """All registered users, newest first, for the admin panel."""
    with get_db() as db:
        cur = db.cursor()
        cur.execute(
            "SELECT user_id, email, created_at FROM users ORDER BY created_at DESC"
        )
        rows = cur.fetchall()
    return [dict(r) for r in rows]


def get_user_activity_counts() -> dict:
    """Per-user session and message counts, to show alongside the user list."""
    with get_db() as db:
        cur = db.cursor()
        cur.execute("""
            SELECT s.user_id,
                   COUNT(DISTINCT s.session_id) AS session_count,
                   COUNT(m.id) AS message_count
            FROM sessions s
            LEFT JOIN messages m ON m.session_id = s.session_id
            GROUP BY s.user_id
        """)
        rows = cur.fetchall()
    return {r["user_id"]: {"sessions": r["session_count"], "messages": r["message_count"]} for r in rows}


def get_users_with_activity() -> list[dict]:
    """Combines user info with their activity counts, for a single admin endpoint."""
    users = get_all_users()
    activity = get_user_activity_counts()
    for u in users:
        stats = activity.get(u["user_id"], {"sessions": 0, "messages": 0})
        u["session_count"] = stats["sessions"]
        u["message_count"] = stats["messages"]
    return users