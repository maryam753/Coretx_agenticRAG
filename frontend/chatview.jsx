import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import {
  ArrowUp,
  Check,
  ChevronDown,
  FileStack,
  FileText,
  Loader2,
  Menu,
  Mic,
  ShieldCheck,
  Square,
} from "lucide-react";
import AgentRobot from "./agentrobot.jsx";
import KnowledgeBasePanel from "./knowledgebasepanel.jsx";

const SUGGESTIONS = [
  "Summarize the key points",
  "What are the main risks or open issues?",
  "List every date or number mentioned",
];
function renderWithCitations(text) {
  const parts = text.split(/(\[\d+\])/g);
  return parts.map((part, i) =>
    /^\[\d+\]$/.test(part) ? (
      <sup key={i} className="citation-marker">
        {part}
      </sup>
    ) : (
      part
    ),
  );
}
function Sources({ sources }) {
  const [open, setOpen] = useState(false);
  if (!sources?.length) return null;

  return (
    <div className="sources-v2">
      <button
        type="button"
        className="sources-toggle"
        aria-label={`Show ${sources.length} answer sources`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <ShieldCheck size={14} aria-hidden="true" />
        Grounded in {sources.length} source{sources.length > 1 ? "s" : ""}
        <ChevronDown
          size={14}
          className={open ? "chev-open" : ""}
          aria-hidden="true"
        />
      </button>
      {open && (
        <div className="sources-list">
          {sources.map((s, i) => (
            <div key={`${s.source}:${s.page}`} className="sources-row">
              <FileText size={14} aria-hidden="true" />
              <span className="sources-name">{s.source}</span>
              <span className="sources-page">Page {s.page}</span>
              <span className="sources-num">{i + 1}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Steps({ turn }) {
  if (!turn.steps.length && turn.status !== "running") return null;
  const running = turn.status === "running" && !turn.answer;
  const lastIndex = turn.steps.length - 1;

  return (
    <details
      className="agent-activity"
      key={running ? "open" : "closed"}
      open={running}
    >
      <summary>
        {running ? (
          <Loader2 size={14} className="spin" aria-hidden="true" />
        ) : (
          <Check size={14} className="ok" aria-hidden="true" />
        )}
        <span>{running ? "Agent working…" : "Agent activity"}</span>
      </summary>
      <ul className="agent-activity-list">
        {turn.steps.map((s, i) => {
          const isLast = i === lastIndex;
          const stillRunning = running && isLast;
          return (
            <li key={i}>
              {stillRunning ? (
                <Loader2 size={13} className="spin" aria-hidden="true" />
              ) : (
                <Check size={13} className="ok" aria-hidden="true" />
              )}
              <span>{s}</span>
            </li>
          );
        })}
      </ul>
    </details>
  );
}

function Message({ m }) {
  if (m.role === "user") {
    return (
      <div className="msg user">
        <div className="bubble">{m.content}</div>
      </div>
    );
  }
  return (
    <div className="msg bot">
      <AgentRobot variant="head" size={34} still />
      <div className="bubble">
        <div className="md">
          <ReactMarkdown
            components={{
              p: ({ children }) => (
                <p>
                  {Array.isArray(children)
                    ? children.map((c, i) =>
                        typeof c === "string" ? renderWithCitations(c) : c,
                      )
                    : typeof children === "string"
                      ? renderWithCitations(children)
                      : children}
                </p>
              ),
            }}
          >
            {m.content}
          </ReactMarkdown>
        </div>
        <Sources sources={m.sources} />
      </div>
    </div>
  );
}
export default function ChatView({
  messages,
  turn,
  onSend,
  onVoiceSend,
  onStopSpeaking,
  onMenu,
  onAddDocuments,
  onAddUrl,
  adding,
  stats,
  picked,
  onPick,
  kbOpen,
  onToggleKb,
}) {
  const [input, setInput] = useState("");
  const fileInputRef = useRef(null);
  const [recording, setRecording] = useState(false);

  const endRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  const running = turn?.status === "running";
  const chatTitle =
    messages.length > 0
      ? messages[0]?.content?.slice(0, 50) || "Conversation"
      : turn
        ? turn.question?.slice(0, 50) || "Conversation"
        : "New Conversation";

  useEffect(() => {
    endRef.current?.scrollIntoView({
      behavior: running ? "auto" : "smooth",
      block: "end",
    });
  }, [messages, turn, running]);

  function submit(text = input) {
    const q = text.trim();
    if (!q || running) return;
    setInput("");
    onSend(q);
  }
  async function startRecording() {
    if (running || recording) return;

    onStopSpeaking?.();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      const recorder = new MediaRecorder(stream);

      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, {
          type: recorder.mimeType,
        });

        stream.getTracks().forEach((track) => track.stop());

        if (audioBlob.size > 0 && onVoiceSend) {
          await onVoiceSend(audioBlob);
        }
      };

      recorder.start();
      setRecording(true);
    } catch (error) {
      console.error("Microphone error:", error);
      alert("Microphone permission is required to use voice chat.");
    }
  }
  function stopRecording() {
    if (!mediaRecorderRef.current || !recording) return;

    mediaRecorderRef.current.stop();
    setRecording(false);
  }

  const robotState = !turn
    ? "idle"
    : turn.status === "error"
      ? "error"
      : turn.answer
        ? "speaking"
        : "thinking";
  const empty = messages.length === 0 && !turn;

  return (
    <div className="chat-layout">
      <div className="chat-main-col">
        <header className="topbar-v2">
          <button
            className="icon-btn menu-btn"
            aria-label="Open menu"
            onClick={onMenu}
          >
            <Menu size={20} />
          </button>

          <div className="topbar-title-block">
            <div className="topbar-title-row">
              <span className="topbar-title" title={chatTitle}>
                {chatTitle}
              </span>
            </div>
            <span className="topbar-subtitle">
              <span className="topbar-dot" /> AI Knowledge Assistant
            </span>
          </div>

          <button
            className="btn-v2 btn-v2-outline topbar-docs"
            aria-label="Open knowledge base"
            aria-expanded={kbOpen}
            onClick={onToggleKb}
          >
            <FileStack size={15} aria-hidden="true" />
            {stats?.document_names?.length
              ? `${stats.document_names.length} document${stats.document_names.length > 1 ? "s" : ""}`
              : "Add document"}
          </button>
        </header>

        <div
          className="chat-scroll"
          role="log"
          aria-label="Conversation"
          aria-live="polite"
          aria-relevant="additions text"
        >
          <div className="chat-inner">
            {empty && (
              <div className="empty">
                <AgentRobot state="idle" size={190} />
                {stats ? (
                  <>
                    <h2>Ask your documents anything</h2>
                    <p>
                      Every answer is drawn only from the files you added, with
                      the source and page cited.
                    </p>
                    <div className="suggest">
                      {SUGGESTIONS.map((s) => (
                        <button
                          key={s}
                          className="btn btn-ghost"
                          onClick={() => submit(s)}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <>
                    <h2>Add a document to get started</h2>
                    <p>
                      Open the Knowledge Base panel and upload a PDF or TXT
                      file, then ask anything about it.
                    </p>
                    <button
                      type="button"
                      className="btn-v2 btn-v2-outline"
                      onClick={onToggleKb}
                    >
                      <FileStack size={15} aria-hidden="true" /> Open knowledge
                      base
                    </button>
                  </>
                )}
              </div>
            )}

            {messages.map((m, i) => (
              <Message key={i} m={m} />
            ))}

            {turn && (
              <>
                <div className="msg user">
                  <div className="bubble">{turn.question}</div>
                </div>
                <div className="msg bot">
                  <AgentRobot variant="head" size={34} state={robotState} />
                  <div className="bubble">
                    <Steps turn={turn} />
                    {turn.answer && (
                      <div className="md">
                        <ReactMarkdown
                          components={{
                            p: ({ children }) => (
                              <p>
                                {Array.isArray(children)
                                  ? children.map((c, i) =>
                                      typeof c === "string"
                                        ? renderWithCitations(c)
                                        : c,
                                    )
                                  : typeof children === "string"
                                    ? renderWithCitations(children)
                                    : children}
                              </p>
                            ),
                          }}
                        >
                          {turn.answer}
                        </ReactMarkdown>
                        {running && <span className="caret" />}
                      </div>
                    )}
                    {turn.status === "error" && (
                      <div className="error-box" role="alert">
                        {turn.error}
                      </div>
                    )}
                    <Sources sources={turn.sources} />
                  </div>
                </div>
              </>
            )}
            <div ref={endRef} />
          </div>
        </div>

        <div className="composer-v2">
          <div className="composer-v2-inner">
            <textarea
              rows={1}
              value={input}
              placeholder={
                recording
                  ? "Listening..."
                  : "Ask anything about your documents…"
              }
              aria-label="Your question"
              disabled={recording}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
            />

            <div className="composer-v2-actions">
              <button
                type="button"
                className={`voice-btn-v2 ${recording ? "recording" : ""}`}
                aria-label={
                  recording ? "Stop recording" : "Start voice recording"
                }
                title={recording ? "Stop recording" : "Start voice recording"}
                onClick={recording ? stopRecording : startRecording}
                disabled={running}
              >
                {recording ? <Square size={16} /> : <Mic size={17} />}
              </button>

              <button
                type="button"
                className="send-v2"
                aria-label="Send question"
                title="Send question"
                onClick={() => submit()}
                disabled={running || recording || !input.trim()}
              >
                <ArrowUp size={18} />
              </button>
            </div>
          </div>
          <p className="composer-v2-hint">
            Cortex answers using your selected knowledge sources.
          </p>
        </div>
      </div>

      {kbOpen && (
        <KnowledgeBasePanel
          stats={stats}
          picked={picked}
          onPick={onPick}
          onAddDocuments={onAddDocuments}
          onAddUrl={onAddUrl}
          adding={adding}
          onClose={onToggleKb}
        />
      )}
    </div>
  );
}