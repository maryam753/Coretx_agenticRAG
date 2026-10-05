import "./style.css";
import { useCallback, useEffect, useRef, useState } from "react";
import AgentRobot from "./agentrobot.jsx";
import ChatView from "./chatview.jsx";
import Login from "./login.jsx";
import MarketingLanding from "./marketinglanding.jsx";
import Sidebar from "./sidebar.jsx";
import {
  createSession,
  getSession,
  getState,
  listSessions,
  voiceChat,
  removeDocuments,
  streamChat,
  addDocuments,
  indexDocuments,
  getMe,
  addUrlDocument,
} from "./apiclient.js";
import { buildChatExport, downloadText } from "./utils.js";
import { getToken, clearToken } from "./auth.js";
import AdminDashboard from "./admindashboard.jsx";
import { getStoredTheme, applyTheme } from "./theme.js";

export default function App() {
  const currentAudioRef = useRef(null);

  function stopCurrentAudio() {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current.currentTime = 0;
      currentAudioRef.current = null;
    }
  }
  const [authed, setAuthed] = useState(!!getToken());
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState("login");
  const [booting, setBooting] = useState(true);
  const [bootError, setBootError] = useState("");
  const [stats, setStats] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [picked, setPicked] = useState([]);
  const [turn, setTurn] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [kbOpen, setKbOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [addingDocs, setAddingDocs] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const [theme, setTheme] = useState(getStoredTheme());

  const refreshSessions = useCallback(
    async () => setSessions(await listSessions()),
    [],
  );
  const loadSession = useCallback(async (id) => {
    const data = await getSession(id);
    setActiveId(id);
    setMessages(data.messages);
  }, []);
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  function toggleTheme() {
    setTheme((t) => (t === "light" ? "dark" : "light"));
  }

  useEffect(() => {
    if (!authed) {
      setBooting(false);
      return;
    }
    (async () => {
      try {
        try {
          const me = await getMe();
          setIsAdmin(!!me.is_admin);
          setUserEmail(me.email || "");
        } catch {
          setIsAdmin(false);
        }

        const state = await getState();
        if (state.stats) {
          setStats(state.stats);
          setPicked(state.stats.document_names || []);
          const userSessions = await listSessions();
          setSessions(userSessions);
          if (userSessions.length > 0) {
            await loadSession(userSessions[0].session_id);
          } else {
            const { session_id } = await createSession();
            setActiveId(session_id);
          }
        }
      } catch (err) {
        if (err.status === 401) {
          setAuthed(false);
        } else {
          setBootError(
            "Can't reach the Cortex API. Start the backend on port 8000, then reload.",
          );
        }
      } finally {
        setBooting(false);
      }
    })();
  }, [authed, loadSession]);

  
  useEffect(() => {
    if (!booting && authed && !stats) setKbOpen(true);
  }, [booting, authed, stats]);

    async function handleAuthenticated() {
    setBooting(true);
    setBootError("");
    setStats(null);
    setSessions([]);
    setActiveId(null);
    setMessages([]);
    setTurn(null);
    setIsAdmin(false);
    setPicked([]);
    setUserEmail("");
    setAuthed(true);

    try {
      try {
        const me = await getMe();
        setIsAdmin(!!me.is_admin);
        setUserEmail(me.email || "");
      } catch {
        setIsAdmin(false);
      }

      const state = await getState();
      if (state.stats) {
        setStats(state.stats);
        setPicked(state.stats.document_names || []);
        const userSessions = await listSessions();
        setSessions(userSessions);
        if (userSessions.length > 0) {
          await loadSession(userSessions[0].session_id);
        } else {
          const { session_id } = await createSession();
          setActiveId(session_id);
        }
      }
    } catch (err) {
      if (err.status !== 401) {
        setBootError("Can't reach the Cortex API. Start the backend on port 8000, then reload.");
      }
    } finally {
      setBooting(false);
    }
  }

  function logout() {
    clearToken();
    setAuthed(false);
    setStats(null);
    setSessions([]);
    setActiveId(null);
    setMessages([]);
    setTurn(null);
    setKbOpen(false);
    setUserEmail("");
  }

  async function handleIndexed({ stats: newStats, session_id }) {
    setStats(newStats);
    setPicked(newStats.document_names || []);
    setActiveId(session_id);
    setMessages([]);
    setTurn(null);
    await refreshSessions();
  }

  async function handleAddDocuments({
    files,
    pastedText,
    chunkSize,
    chunkOverlap,
    topK,
  }) {
    setAddingDocs(true);
    try {
      if (!stats) {
        const result = await indexDocuments({
          files,
          pastedText,
          chunkSize,
          chunkOverlap,
          topK,
        });
        await handleIndexed(result);
      } else {
        const { stats: newStats } = await addDocuments({ files, pastedText });
        setStats(newStats);
        setPicked(newStats.document_names || []);
      }
    } finally {
      setAddingDocs(false);
    }
  }
  async function handleAddUrl(url) {
    setAddingDocs(true);
    try {
      const { stats: newStats } = await addUrlDocument(url);
      setStats(newStats);
      setPicked(newStats.document_names || []);
    } finally {
      setAddingDocs(false);
    }
  }

  function stopSpeaking() {
    window.speechSynthesis.cancel();
    stopCurrentAudio();
  }

  async function newChat() {
    const { session_id } = await createSession();
    setActiveId(session_id);
    setMessages([]);
    setTurn(null);
    setMenuOpen(false);
    await refreshSessions();
  }

  async function selectSession(id) {
    setTurn(null);
    setMenuOpen(false);
    await loadSession(id);
  }

  async function removeDocs() {
    await removeDocuments();
    setStats(null);
    setPicked([]);
    setKbOpen(true);
  }

  async function sendVoice(audioBlob) {
    if (!stats) {
      setKbOpen(true);
      return;
    }
    try {
      const all = stats.document_names || [];
      const selectedDocuments =
        picked.length === 0 || picked.length === all.length ? null : picked;

      setTurn({
        status: "running",
        question: "Listening...",
        steps: ["Processing voice input..."],
        answer: "",
        sources: [],
      });

      const result = await voiceChat({
        sessionId: activeId,
        audioBlob,
        selectedDocuments,
      });

      if (result.question) {
        setTurn((prev) => ({ ...prev, question: result.question }));
      }

      if (result.answer) {
        setTurn({
          status: "done",
          question: result.question,
          answer: result.answer,
          sources: result.sources || [],
          steps: result.steps || [],
        });

        window.speechSynthesis.cancel();
        stopCurrentAudio();

        if (result.audio) {
          const audioBytes = Uint8Array.from(atob(result.audio), (c) =>
            c.charCodeAt(0),
          );
          const audioBlob = new Blob([audioBytes], { type: "audio/mpeg" });
          const audioUrl = URL.createObjectURL(audioBlob);
          const audio = new Audio(audioUrl);
          currentAudioRef.current = audio;
          audio.play();
        }
      }

      if (result.question) {
        await refreshSessions();
        setTurn(null);
      }
    } catch (error) {
      console.error("Voice chat error:", error);
      setTurn({
        status: "error",
        question: "Voice input",
        answer: "",
        sources: [],
        steps: [],
        error: error.message || "Voice chat failed.",
      });
    }
  }

  async function send(question) {
    if (!stats) {
      setKbOpen(true);
      return;
    }
    const all = stats.document_names || [];
    const selectedDocuments =
      picked.length === 0 || picked.length === all.length ? null : picked;

    let failed = false;
    setTurn({
      question,
      steps: [],
      answer: "",
      sources: [],
      status: "running",
    });
    try {
      await streamChat(
        { sessionId: activeId, question, selectedDocuments },
        (ev) => {
          if (ev.type === "error") failed = true;
          setTurn((t) => {
            if (!t) return t;
            if (ev.type === "step")
              return { ...t, steps: [...t.steps, ev.text] };
            if (ev.type === "token")
              return { ...t, answer: t.answer + ev.text };
            if (ev.type === "sources") return { ...t, sources: ev.sources };
            if (ev.type === "error")
              return { ...t, status: "error", error: ev.message };
            return t;
          });
        },
      );
      if (!failed) {
        await loadSession(activeId);
        setTurn(null);
      }
    } catch (e) {
      setTurn((t) => (t ? { ...t, status: "error", error: e.message } : t));
    }
    await refreshSessions();
  }

  if (!authed) {
    if (!showAuth) {
      return (
        <MarketingLanding
          onSignIn={() => {
            setAuthMode("login");
            setShowAuth(true);
          }}
          onGetStarted={() => {
            setAuthMode("signup");
            setShowAuth(true);
          }}
        />
      );
    }
    return (
      <Login
        initialMode={authMode}
        onAuthenticated={handleAuthenticated}
        onBack={() => setShowAuth(false)}
      />
    );
  }
  if (booting)
    return (
      <div className="boot">
        <AgentRobot state="thinking" size={200} />
      </div>
    );

  if (bootError) {
    return (
      <div className="boot">
        <AgentRobot state="error" size={200} />
        <p>{bootError}</p>
        <button
          className="btn btn-primary"
          onClick={() => window.location.reload()}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="app">
      <Sidebar
        stats={stats}
        userEmail={userEmail}
        sessions={sessions}
        activeId={activeId}
        picked={picked}
        onPick={setPicked}
        onNewChat={newChat}
        onSelect={selectSession}
        canExport={messages.length > 0}
        onExport={() =>
          downloadText("cortex_chat.md", buildChatExport(messages))
        }
        onRemove={removeDocs}
        onLogout={logout}
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        isAdmin={isAdmin}
        onOpenAdmin={() => setAdminOpen(true)}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
      <main className="main">
        <ChatView
          messages={messages}
          turn={turn}
          onSend={send}
          onVoiceSend={sendVoice}
          onStopSpeaking={stopSpeaking}
          onMenu={() => setMenuOpen(true)}
          onAddDocuments={handleAddDocuments}
          onAddUrl={handleAddUrl}
          adding={addingDocs}
          stats={stats}
          picked={picked}
          onPick={setPicked}
          kbOpen={kbOpen}
          onToggleKb={() => setKbOpen((o) => !o)}
        />
      </main>
      {adminOpen && <AdminDashboard onClose={() => setAdminOpen(false)} />}
    </div>
  );
}