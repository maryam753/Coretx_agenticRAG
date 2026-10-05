import { useRef, useState } from "react";
import {
  CheckCircle2,
  Link2,
  FileText,
  Loader2,
  Plus,
  Settings,
  Upload,
  X,
} from "lucide-react";

const isAllowed = (file) => /\.(pdf|txt)$/i.test(file.name);

function UrlAddForm({ onAddUrl, adding }) {
  const [url, setUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    const trimmed = url.trim();
    if (!trimmed) return;
    setSubmitting(true);
    try {
      await onAddUrl(trimmed);
      setUrl("");
    } catch (e) {
      alert(e.message || "Could not add that link.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="kb-url-form">
      <Link2 size={14} aria-hidden="true" />
      <input
        type="url"
        value={url}
        placeholder="Paste a link to add…"
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
        }}
        disabled={adding || submitting}
      />
      <button
        type="button"
        className="kb-url-submit"
        aria-label="Add link to knowledge base"
        onClick={submit}
        disabled={adding || submitting || !url.trim()}
      >
        {submitting ? "…" : "Add"}
      </button>
    </div>
  );
}

export default function KnowledgeBasePanel({
  stats,
  picked,
  onPick,
  onAddDocuments,
  onAddUrl,
  adding,
  onClose,
}) {
  const names = stats?.document_names || [];
  const isFirstBuild = !stats;

  const [text, setText] = useState("");
  const [files, setFiles] = useState([]);
  const [chunkSize, setChunkSize] = useState(800);
  const [chunkOverlap, setChunkOverlap] = useState(150);
  const [topK, setTopK] = useState(4);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);

  const toggle = (name) =>
    onPick(
      picked.includes(name)
        ? picked.filter((n) => n !== name)
        : [...picked, name],
    );
  const allSelected = picked.length === 0 || picked.length === names.length;

  const hasInput = text.trim().length > 0 || files.length > 0;

  function addFiles(list) {
    const incoming = Array.from(list);
    const valid = incoming.filter(isAllowed);
    if (valid.length < incoming.length)
      setError("Only PDF and TXT files are supported.");
    else setError("");
    setFiles((prev) => {
      const keys = new Set(prev.map((f) => `${f.name}:${f.size}`));
      return [
        ...prev,
        ...valid.filter((f) => !keys.has(`${f.name}:${f.size}`)),
      ];
    });
  }

  async function submit() {
    setError("");
    if (!hasInput)
      return setError("Paste some text or add a PDF or TXT file first.");
    if (isFirstBuild) {
      if (chunkSize <= 0) return setError("Chunk size must be greater than 0.");
      if (topK <= 0)
        return setError("Chunks per question must be greater than 0.");
      if (chunkOverlap < 0)
        return setError("Chunk overlap cannot be negative.");
      if (chunkOverlap >= chunkSize)
        return setError(
          `Chunk overlap (${chunkOverlap}) must be smaller than chunk size (${chunkSize}).`,
        );
    }

    try {
      await onAddDocuments({
        files,
        pastedText: text,
        chunkSize,
        chunkOverlap,
        topK,
      });
      setText("");
      setFiles([]);
    } catch (e) {
      setError(e.message || "Something went wrong.");
    }
  }

  return (
    <aside className="kb-panel" aria-label="Knowledge base">
      <div className="kb-panel-header">
        <h3>Knowledge Base</h3>
        <button className="icon-btn" aria-label="Close panel" onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      <p className="kb-panel-subtext">
        Manage your documents and control what the AI can use for answers.
      </p>
      <div
        className={`kb-dropzone ${dragging ? "drag" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          addFiles(e.dataTransfer.files);
        }}
      >
        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setError("");
          }}
          placeholder="Paste text here, or drop PDF / TXT files"
          aria-label="Document text"
        />

        {files.length > 0 && (
          <ul className="file-chips">
            {files.map((f) => (
              <li key={`${f.name}:${f.size}`}>
                <FileText size={14} aria-hidden="true" />
                <span>{f.name}</span>
                <button
                  className="icon-btn"
                  aria-label={`Remove ${f.name}`}
                  onClick={() => setFiles(files.filter((x) => x !== f))}
                >
                  <X size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}

        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}

        <div className="kb-row">
          <button
            type="button"
            className="btn-v2 btn-v2-outline block"
            onClick={() => inputRef.current?.click()}
          >
            <Upload size={16} aria-hidden="true" /> Browse files
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.txt"
            multiple
            hidden
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        <UrlAddForm onAddUrl={onAddUrl} adding={adding} />

        <button
          type="button"
          className="btn-v2 btn-v2-primary block"
          onClick={submit}
          disabled={adding}
        >
          {adding ? (
            <>
              <Loader2 size={15} className="spin" aria-hidden="true" />{" "}
              Processing…
            </>
          ) : (
            <>
              <Plus size={16} aria-hidden="true" />{" "}
              {isFirstBuild ? "Build Knowledge Base" : "Add to Knowledge Base"}
            </>
          )}
        </button>

        {isFirstBuild && (
          <details className="kb-advanced">
            <summary>Advanced settings</summary>
            <div className="kb-advanced-grid">
              <label>
                Chunk size
                <input
                  type="number"
                  min="200"
                  max="2000"
                  step="50"
                  value={chunkSize}
                  onChange={(e) => setChunkSize(Number(e.target.value))}
                />
              </label>
              <label>
                Chunk overlap
                <input
                  type="number"
                  min="0"
                  step="10"
                  value={chunkOverlap}
                  onChange={(e) => setChunkOverlap(Number(e.target.value))}
                />
              </label>
              <label>
                Chunks per question
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={topK}
                  onChange={(e) => setTopK(Number(e.target.value))}
                />
              </label>
            </div>
          </details>
        )}
      </div>

      {!isFirstBuild && (
        <button className="kb-manage-btn" disabled>
          <Settings size={15} aria-hidden="true" /> Manage Knowledge Base
        </button>
      )}

      <div className="kb-docs-header">
        <span>Uploaded Documents ({names.length})</span>
        {names.length > 1 && (
          <button
            className="kb-select-all"
            onClick={() => onPick(allSelected ? [] : names)}
          >
            {allSelected ? "Deselect all" : "Select All"}
          </button>
        )}
      </div>

      <ul className="kb-doc-list">
        {names.map((n) => {
          const checked = picked.length === 0 || picked.includes(n);
          return (
            <li key={n} className="kb-doc-row">
              <div className="kb-doc-icon">
                <CheckCircle2 size={16} />
              </div>
              <div className="kb-doc-info">
                <span className="kb-doc-name">{n}</span>
                <span className="kb-doc-status">
                  <span className="kb-doc-dot" /> Ready
                </span>
              </div>
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggle(n)}
                aria-label={`Include ${n} in search`}
              />
            </li>
          );
        })}
      </ul>

      {names.length > 0 && (
        <div className="kb-note">
          The AI uses your selected documents to provide accurate, grounded
          answers with citations.
        </div>
      )}
    </aside>
  );
}