import json
import shutil
from functools import lru_cache
from pathlib import Path

import chromadb

DATA_DIR = Path(__file__).resolve().parent / "data"
CHROMA_DIR = DATA_DIR / "chroma"
USERS_DIR = DATA_DIR / "users"


@lru_cache(maxsize=1)
def get_chroma_client():
    # One shared client for the whole app, every user's collection lives in it,
    # kept apart only by each collection's unique name.
    CHROMA_DIR.mkdir(parents=True, exist_ok=True)
    return chromadb.PersistentClient(path=str(CHROMA_DIR))


class SavedFile:
    """Looks like an upload (.name and .getvalue()) so load_uploaded_documents() accepts it."""

    def __init__(self, path: Path):
        self.name = path.name
        self._data = path.read_bytes()

    def getvalue(self) -> bytes:
        return self._data


def _user_dir(user_id: str) -> Path:
    return USERS_DIR / user_id


def _uploads_dir(user_id: str) -> Path:
    return _user_dir(user_id) / "uploads"


def _manifest_path(user_id: str) -> Path:
    return _user_dir(user_id) / "manifest.json"


def list_user_ids() -> list[str]:
    """Every user who has ever saved an index, used to restore all of them on startup."""
    if not USERS_DIR.exists():
        return []
    return [p.name for p in USERS_DIR.iterdir() if p.is_dir()]


def save_uploads(user_id: str, uploads):
    uploads_dir = _uploads_dir(user_id)
    shutil.rmtree(uploads_dir, ignore_errors=True)
    uploads_dir.mkdir(parents=True)
    for f in uploads:
        # Path(...).name keeps only the file name, so a name like "../x" can't escape the folder
        (uploads_dir / Path(f.name).name).write_bytes(f.getvalue())


def add_uploads(user_id: str, new_files):
    """Like save_uploads, but appends instead of wiping the folder first."""
    uploads_dir = _uploads_dir(user_id)
    uploads_dir.mkdir(parents=True, exist_ok=True)
    for f in new_files:
        (uploads_dir / Path(f.name).name).write_bytes(f.getvalue())


def list_saved_files(user_id: str):
    uploads_dir = _uploads_dir(user_id)
    if not uploads_dir.exists():
        return []
    return [SavedFile(p) for p in sorted(uploads_dir.iterdir()) if p.is_file()]


def save_manifest(user_id: str, service, stats):
    manifest = {
        "collection_name": service.collection_name,
        "chunk_size": service.chunk_size,
        "chunk_overlap": service.chunk_overlap,
        "top_k": service.top_k,
        "summaries": service.document_summaries,
        "stats": stats,
    }
    user_dir = _user_dir(user_id)
    user_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = _manifest_path(user_id)
    # Write to a temp file, then rename, so a crash never leaves a half-written manifest
    tmp = manifest_path.with_suffix(".tmp")
    tmp.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(manifest_path)


def load_manifest(user_id: str):
    manifest_path = _manifest_path(user_id)
    if not manifest_path.exists():
        return None
    try:
        return json.loads(manifest_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None


def delete_collection_by_name(name: str | None):
    """Delete one specific Chroma collection, e.g. a user's old index before replacing it.
    Deliberately scoped to one name, never a blanket "delete everything else", so one
    user re-indexing can never wipe out another user's vector data."""
    if not name:
        return
    client = get_chroma_client()
    try:
        client.delete_collection(name)
    except Exception:
        pass  # already gone, or never existed


def clear_all(user_id: str):
    """Wipe one user's saved index: their Chroma collection, uploads, and manifest."""
    manifest = load_manifest(user_id)
    if manifest:
        delete_collection_by_name(manifest.get("collection_name"))
    shutil.rmtree(_uploads_dir(user_id), ignore_errors=True)
    _manifest_path(user_id).unlink(missing_ok=True)