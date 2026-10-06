import io
import json
import json as json_module
import os 
import re
import base64
from typing import List, Optional
from backend.db import get_db

from backend.admin import (
    log_guardrail_event, get_guardrail_logs, get_guardrail_summary,
    get_recent_traces, get_observability_summary,
    get_system_health,
    get_users_with_activity,
)
from backend.auto_eval import generate_testset, collect_rows, score_rows
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from backend.chat_session_manager import ChatSessionManager
from backend.guardrails import check_input, check_output
from contextlib import asynccontextmanager
from backend import persistence
from backend.RAG_engine import RAGService, EMBEDDING_MODEL, load_url_document
from backend.voice_service import transcribe_audio, synthesize_speech
from backend.auth import (
    create_user, authenticate_user, create_token, get_current_user_id, get_current_admin,
    get_current_user_email,
    verify_google_token, get_or_create_google_user,
    verify_github_code,
    create_password_reset_token, complete_password_reset,
)
from fastapi import Depends

@asynccontextmanager
async def lifespan(app):
    restore_from_disk()   
    yield


app = FastAPI(title="Cortex API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "splendid-exploration-production-f3e9.up.railway.app",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)
class SignupRequest(BaseModel):
    email: str
    password: str
class UrlRequest(BaseModel):
    url: str

class LoginRequest(BaseModel):
    email: str
    password: str
class GoogleLoginRequest(BaseModel):
    credential: str

class ForgotPasswordRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str
class GitHubLoginRequest(BaseModel):
    code: str
    
class Store:
    services: dict = {}
    stats: dict = {}
    manager = ChatSessionManager()


store = Store()
def restore_from_disk():
    for user_id in persistence.list_user_ids():
        manifest = persistence.load_manifest(user_id)
        if not manifest:
            continue
        if manifest["stats"].get("embedding_model") != EMBEDDING_MODEL:
            print(f"Saved index for a user used a different embedding model, so it was ignored.")
            continue
        try:
            service = RAGService.from_saved(manifest, persistence.list_saved_files(user_id))
        except Exception as e:
            print(f"Could not restore a saved index: {e}")
            continue
        store.services[user_id] = service
        store.stats[user_id] = manifest["stats"]
        print(f"Restored {len(manifest['stats']['document_names'])} file(s) for a user from disk.")

class UploadedFileShim(io.BytesIO):
   

    def __init__(self, data: bytes, name: str):
        super().__init__(data)
        self.name = name
        self.size = len(data)
        self.type = "application/pdf" if name.lower().endswith(".pdf") else "text/plain"


def serialize_sources(docs):
    seen, out = set(), []
    for doc in docs or []:
        source = str(doc.metadata.get("source", "unknown"))
        page = doc.metadata.get("page", "?")
        if not isinstance(page, (int, str)):
            page = str(page)
        key = (source, str(page))
        if key in seen:
            continue
        seen.add(key)
        out.append({"source": source, "page": page})
    return out


@app.get("/api/state")
def get_state(user_id: str = Depends(get_current_user_id)):
    return {"stats": store.stats.get(user_id)}
@app.post("/api/index")
def index_documents(
    files: List[UploadFile] = File(default=[]),
    pasted_text: str = Form(""),
    chunk_size: int = Form(800),
    chunk_overlap: int = Form(150),
    top_k: int = Form(4),
    user_id: str = Depends(get_current_user_id),
):
    if chunk_size <= 0:
        raise HTTPException(400, "Chunk size must be greater than 0.")
    if top_k <= 0:
        raise HTTPException(400, "Top K must be greater than 0.")
    if chunk_overlap < 0:
        raise HTTPException(400, "Chunk overlap cannot be negative.")
    if chunk_overlap >= chunk_size:
        raise HTTPException(
            400,
            f"Chunk overlap ({chunk_overlap}) must be smaller than chunk size ({chunk_size}).",
        )

    uploads = [UploadedFileShim(f.file.read(), f.filename) for f in files]
    if pasted_text.strip():
        uploads.append(UploadedFileShim(pasted_text.encode("utf-8"), "pasted-text.txt"))
    if not uploads:
        raise HTTPException(400, "Add at least one PDF or TXT file, or paste some text.")

    try:
        service = RAGService(chunk_size=chunk_size, chunk_overlap=chunk_overlap, top_k=top_k)
        stats = service.build_index(uploads)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, f"Could not index these files: {e}")

    old_manifest = persistence.load_manifest(user_id)  # this user's previous index, if any
    store.services[user_id] = service
    store.stats[user_id] = stats
    store.manager.clear(user_id)
    session_id = store.manager.create_session(user_id)

    try:
        persistence.save_uploads(user_id, uploads)
        persistence.save_manifest(user_id, service, stats)
        if old_manifest:
            persistence.delete_collection_by_name(old_manifest.get("collection_name"))
    except Exception as e:
        print(f"Warning: could not save the index to disk: {e}")
    return {"stats": stats, "session_id": session_id}

@app.get("/api/me")
def get_me(user_id: str = Depends(get_current_user_id)):
    email = get_current_user_email(user_id)
    admin_email = os.getenv("ADMIN_EMAIL", "").lower().strip()
    is_admin = bool(email) and email.lower().strip() == admin_email
    return {"user_id": user_id, "email": email, "is_admin": is_admin}

@app.post("/api/index/add")
def add_documents(
    files: List[UploadFile] = File(default=[]),
    pasted_text: str = Form(""),
    user_id: str = Depends(get_current_user_id),
):
    service = store.services.get(user_id)
    if service is None:
        raise HTTPException(400, "Upload your first document before adding more.")

    uploads = [UploadedFileShim(f.file.read(), f.filename) for f in files]
    if pasted_text.strip():
        uploads.append(UploadedFileShim(pasted_text.encode("utf-8"), "pasted-text.txt"))
    if not uploads:
        raise HTTPException(400, "Add at least one PDF or TXT file, or paste some text.")

    try:
        stats = service.add_documents(uploads)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, f"Could not add these files: {e}")

    store.stats[user_id] = stats
    try:
        persistence.add_uploads(user_id, uploads)
        persistence.save_manifest(user_id, service, stats)
    except Exception as e:
        print(f"Warning: could not save the added documents to disk: {e}")

    return {"stats": stats}
@app.post("/api/index/add-url")
def add_url_document(req: UrlRequest, user_id: str = Depends(get_current_user_id)):
    service = store.services.get(user_id)
    if service is None:
        raise HTTPException(400, "Upload your first document before adding a link.")

    try:
        url_docs = load_url_document(req.url)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, f"Could not fetch that link: {e}")

    # UploadedFileShim ki tarah use karne ke liye, ek chhota wrapper banate hain
    class UrlDocShim:
        def __init__(self, doc):
            self.name = f"{doc.metadata['source']}.url.txt"
            self._text = doc.page_content

        def getvalue(self) -> bytes:
            return self._text.encode("utf-8")

    uploads = [UrlDocShim(d) for d in url_docs]

    try:
        stats = service.add_documents(uploads)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, f"Could not index this link: {e}")

    store.stats[user_id] = stats
    try:
        persistence.add_uploads(user_id, uploads)
        persistence.save_manifest(user_id, service, stats)
    except Exception as e:
        print(f"Warning: could not save the added link to disk: {e}")

    return {"stats": stats}

@app.delete("/api/index")
def remove_documents(user_id: str = Depends(get_current_user_id)):
    store.services.pop(user_id, None)
    store.stats.pop(user_id, None)
    store.manager.clear(user_id)
    persistence.clear_all(user_id)
    return {"ok": True}

@app.get("/api/me")
def get_me(user_id: str = Depends(get_current_user_id)):
    with get_db() as db:
        cur = db.cursor()
        cur.execute("SELECT email FROM users WHERE user_id = %s", (user_id,))
        row = cur.fetchone()
    return {"email": row["email"] if row else None}

@app.get("/api/sessions")
def list_sessions(user_id: str = Depends(get_current_user_id)):
    return store.manager.list_sessions(user_id)


@app.post("/api/sessions")
def new_session(user_id: str = Depends(get_current_user_id)):
    session_id = store.manager.create_session(user_id)
    return {"session_id": session_id}


@app.get("/api/sessions/{session_id}")
def get_session(session_id: str, user_id: str = Depends(get_current_user_id)):
    session = store.manager.get_session(session_id,user_id)
    messages = []
    for i, m in enumerate(session.messages):
        role = "user" if i % 2 == 0 else "assistant"  
        messages.append({
            "role": role,
            "content": m.content,
            "sources": serialize_sources(getattr(m, "sources", None)) if role == "assistant" else [],
        })
    return {"session_id": session_id, "messages": messages}


@app.post("/api/evaluate/auto")
def auto_evaluate(n_questions: int = 5, user_id: str = Depends(get_current_user_id)):
    service = store.services.get(user_id)
    if service is None:
        raise HTTPException(400, "Index documents before running evaluation.")

    items = generate_testset(service, n_questions)
    if not items:
        raise HTTPException(500, "Could not generate test questions.")

    rows = collect_rows(service, items)
    with open("backend/eval_rows.json", "w", encoding="utf-8") as f:
        json_module.dump(rows, f, ensure_ascii=False, indent=2)
    try:
        scores, per_question = score_rows(rows)
    except RuntimeError as e:
        raise HTTPException(429, str(e))

    with open("backend/eval_auto_report.json", "w", encoding="utf-8") as f:
        json_module.dump({"testset": items, "scores": scores}, f, ensure_ascii=False, indent=2)

    return {"testset": items, "scores": scores, "per_question": per_question}


class ChatRequest(BaseModel):
    session_id: str
    question: str
    selected_documents: Optional[List[str]] = None


def event(payload: dict) -> str:
    return json.dumps(payload, ensure_ascii=False) + "\n"

@app.post("/api/chat")
def chat(req: ChatRequest, user_id: str = Depends(get_current_user_id)):
    service = store.services.get(user_id)
    if service is None:
        raise HTTPException(400, "Process your documents before asking questions.")

    def generate():
        try:
            guard = check_input(req.question)
            saved_question = guard.text if guard.allowed else "[message blocked by guardrail]"
            if not guard.allowed:
                log_guardrail_event(user_id, "input_blocked", guard.reason or "Blocked")
            history = store.manager.get_history_pairs(req.session_id, user_id)[-3:]
            cross_context = store.manager.get_other_sessions_context(req.session_id, user_id)

            stream, sources = None, []
            for kind, payload in service.run_agent(
                req.question,
                chat_history=history,
                selected_documents=req.selected_documents,
                cross_session_context=cross_context,
            ):
                if kind == "step":
                    yield event({"type": "step", "text": str(payload)})
                elif kind == "result":
                    stream, sources = payload

            if stream is None:
                raise RuntimeError("The agent did not return an answer.")

            parts = []
            for chunk in stream:
                text = chunk if isinstance(chunk, str) else str(getattr(chunk, "content", chunk))
                if text:
                    parts.append(text)
                    yield event({"type": "token", "text": text})
            answer = "".join(parts)
            answer, out_warnings = check_output(answer, sources)
            if out_warnings:
                log_guardrail_event(user_id, "output_warning", "; ".join(out_warnings))

            if isinstance(sources, dict):
                cited = sorted({int(n) for n in re.findall(r"\[(\d+)\]", answer)})
                display = [sources[i] for i in cited if i in sources] or list(sources.values())
            else:
                display = sources

            store.manager.add_exchange(req.session_id, user_id, saved_question, answer, display)
            yield event({"type": "sources", "sources": serialize_sources(display)})
            yield event({"type": "done"})
        except RuntimeError as e:
            yield event({"type": "error", "message": str(e)})
        except Exception as e:
            yield event({"type": "error", "message": f"Something went wrong while answering: {e}"})

    return StreamingResponse(
        generate(),
        media_type="application/x-ndjson",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
@app.post("/api/voice-chat")
async def voice_chat(
    session_id: str = Form(...),
    audio: UploadFile = File(...),
    selected_documents: Optional[str] = Form(None),
    user_id: str = Depends(get_current_user_id),
):
    service = store.services.get(user_id)
    if service is None:
        raise HTTPException(400, "Process your documents before using voice chat.")

    try:
        audio_bytes = await audio.read()
        if not audio_bytes:
            raise HTTPException(400, "Empty audio file.")

        question = transcribe_audio(audio_bytes, audio.filename or "voice.webm")
        if not question.strip():
            raise HTTPException(400, "Could not understand the audio.")
        guard = check_input(question)
        if not guard.allowed:
            log_guardrail_event(user_id, "input_blocked", guard.reason or "Blocked")

        selected_docs = json.loads(selected_documents) if selected_documents else None

        history = store.manager.get_history_pairs(session_id, user_id)
        cross_session_context = store.manager.get_other_sessions_context(session_id, user_id)

        result = list(
            service.run_agent(
                question=question,
                chat_history=history,
                selected_documents=selected_docs,
                cross_session_context=cross_session_context,
            )
        )

        answer, sources, steps = "", [], []
        for event_type, data in result:
            if event_type == "step":
                steps.append(data)
            elif event_type == "result":
                stream, sources = data
                for chunk in stream:
                    answer += chunk

        answer, out_warnings = check_output(answer, sources)
        if out_warnings:
            log_guardrail_event(user_id, "output_warning", "; ".join(out_warnings))        

        if isinstance(sources, dict):
            cited = sorted({int(n) for n in re.findall(r"\[(\d+)\]", answer)})
            display_sources = [sources[i] for i in cited if i in sources] or list(sources.values())
        else:
            display_sources = sources

        store.manager.add_exchange(session_id, user_id, question, answer, display_sources)

        audio_base64 = None
        try:
            tts_bytes = synthesize_speech(answer)
            audio_base64 = base64.b64encode(tts_bytes).decode("utf-8")
        except Exception as e:
            print(f"Warning: TTS failed: {e}") 

        return {
            "question": question,
            "answer": answer,
            "sources": serialize_sources(display_sources),
            "steps": steps,
            "audio": audio_base64,
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Voice processing failed: {e}")



@app.post("/api/auth/signup")
def signup(req: SignupRequest):
    if len(req.password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters.")
    try:
        user_id = create_user(req.email.lower().strip(), req.password)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return {"token": create_token(user_id)}


@app.post("/api/auth/login")
def login(req: LoginRequest):
    try:
        user_id = authenticate_user(req.email.lower().strip(), req.password)
    except ValueError as e:
        raise HTTPException(401, str(e))
    return {"token": create_token(user_id)}
@app.post("/api/auth/forgot-password")
def forgot_password(req: ForgotPasswordRequest):
    email = req.email.lower().strip()
    token = create_password_reset_token(email)
    if token:
        print(f"[DEV] Password reset token for {email}: {token}")
    return {
        "message": "If that email exists, a reset link has been created.",
        "dev_token": token,
    }


@app.post("/api/auth/reset-password")
def reset_password(req: ResetPasswordRequest):
    if len(req.new_password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters.")
    try:
        complete_password_reset(req.token, req.new_password)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return {"ok": True}

@app.post("/api/auth/google")
def google_login(req: GoogleLoginRequest):
    try:
        email = verify_google_token(req.credential)
        user_id = get_or_create_google_user(email)
    except ValueError as e:
        raise HTTPException(401, str(e))
    return {"token": create_token(user_id)}
@app.get("/api/admin/guardrails/logs")
def admin_guardrail_logs(limit: int = 50, admin_id: str = Depends(get_current_admin)):
    return {"logs": get_guardrail_logs(limit)}


@app.get("/api/admin/guardrails/summary")
def admin_guardrail_summary(admin_id: str = Depends(get_current_admin)):
    return get_guardrail_summary()
@app.get("/api/admin/observability/traces")
def admin_observability_traces(limit: int = 20, admin_id: str = Depends(get_current_admin)):
    return {"traces": get_recent_traces(limit)}


@app.get("/api/admin/observability/summary")
def admin_observability_summary(admin_id: str = Depends(get_current_admin)):
    return get_observability_summary()
@app.get("/api/admin/system-health")
def admin_system_health(admin_id: str = Depends(get_current_admin)):
    return get_system_health()
@app.get("/api/admin/users")
def admin_list_users(admin_id: str = Depends(get_current_admin)):
    return {"users": get_users_with_activity()}

@app.post("/api/auth/github")
def github_login(req: GitHubLoginRequest):
    try:
        email = verify_github_code(req.code)
        user_id = get_or_create_google_user(email)  # same helper works for any OAuth provider
    except ValueError as e:
        raise HTTPException(401, str(e))
    return {"token": create_token(user_id)}