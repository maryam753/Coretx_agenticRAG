import { authHeader, clearToken } from "./auth.js";

const BASE = import.meta.env.VITE_API_URL || "/api";

function extractDetail(data) {
  if (!data) return null;
  if (typeof data.detail === "string") return data.detail;
  if (Array.isArray(data.detail)) {
    // FastAPI validation errors: a list of {loc, msg, ...}
    return data.detail.map((d) => d.msg || JSON.stringify(d)).join("; ");
  }
  return null;
}

async function handle(res) {
  if (!res.ok) {
    let message = res.statusText;
    try {
      const data = await res.json();
      message = extractDetail(data) || message;
    } catch {
      /* body was not JSON */
    }
    if (res.status === 401) clearToken();
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export const signup = (email, password) =>
  fetch(`${BASE}/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  }).then(handle);

export const login = (email, password) =>
  fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  }).then(handle);
export const googleLogin = (credential) =>
  fetch(`${BASE}/auth/google`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ credential }),
  }).then(handle);
export const forgotPassword = (email) =>
  fetch(`${BASE}/auth/forgot-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  }).then(handle);

export const resetPassword = (token, newPassword) =>
  fetch(`${BASE}/auth/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, new_password: newPassword }),
  }).then(handle);
export const getState = () =>
  fetch(`${BASE}/state`, { headers: authHeader() }).then(handle);

export async function indexDocuments({ files, pastedText, chunkSize, chunkOverlap, topK }) {
  const form = new FormData();
  files.forEach((f) => form.append("files", f));
  form.append("pasted_text", pastedText || "");
  form.append("chunk_size", chunkSize);
  form.append("chunk_overlap", chunkOverlap);
  form.append("top_k", topK);
  return handle(
    await fetch(`${BASE}/index`, { method: "POST", headers: authHeader(), body: form })
  );
}

export async function addDocuments({ files, pastedText }) {
  const form = new FormData();
  files.forEach((f) => form.append("files", f));
  form.append("pasted_text", pastedText || "");
  return handle(
    await fetch(`${BASE}/index/add`, { method: "POST", headers: authHeader(), body: form })
  );
}

export const getMe = () => fetch(`${BASE}/me`, { headers: authHeader() }).then(handle);

export const removeDocuments = () =>
  fetch(`${BASE}/index`, { method: "DELETE", headers: authHeader() }).then(handle);

export const listSessions = () =>
  fetch(`${BASE}/sessions`, { headers: authHeader() }).then(handle);

export const createSession = () =>
  fetch(`${BASE}/sessions`, { method: "POST", headers: authHeader() }).then(handle);

export const getSession = (id) =>
  fetch(`${BASE}/sessions/${id}`, { headers: authHeader() }).then(handle);

export async function streamChat({ sessionId, question, selectedDocuments }, onEvent) {
  const res = await fetch(`${BASE}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeader() },
    body: JSON.stringify({
      session_id: sessionId,
      question,
      selected_documents: selectedDocuments,
    }),
  });
  if (!res.ok || !res.body) {
    let message = res.statusText;
    try {
      message = extractDetail(await res.json()) || message;
    } catch {
      /* ignore */
    }
    if (res.status === 401) clearToken();
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop();
    for (const line of lines) {
      if (line.trim()) onEvent(JSON.parse(line));
    }
  }
  if (buffer.trim()) onEvent(JSON.parse(buffer));
}

export async function voiceChat({ sessionId, audioBlob, selectedDocuments = [] }) {
  const formData = new FormData();
  formData.append("session_id", sessionId);
  formData.append("audio", audioBlob, "voice.webm");
  if (selectedDocuments?.length > 0) {
    formData.append("selected_documents", JSON.stringify(selectedDocuments));
  }
  const response = await fetch(`${BASE}/voice-chat`, {
    method: "POST",
    headers: authHeader(),
    body: formData,
  });
  return handle(response);
}


export const getAdminGuardrailSummary = () =>
  fetch(`${BASE}/admin/guardrails/summary`, { headers: authHeader() }).then(handle);

export const getAdminGuardrailLogs = () =>
  fetch(`${BASE}/admin/guardrails/logs`, { headers: authHeader() }).then(handle);

export const getAdminObservabilitySummary = () =>
  fetch(`${BASE}/admin/observability/summary`, { headers: authHeader() }).then(handle);

export const getAdminObservabilityTraces = () =>
  fetch(`${BASE}/admin/observability/traces`, { headers: authHeader() }).then(handle);

export const getAdminSystemHealth = () =>
  fetch(`${BASE}/admin/system-health`, { headers: authHeader() }).then(handle);

export const getAdminUsers = () =>
  fetch(`${BASE}/admin/users`, { headers: authHeader() }).then(handle);

export const addUrlDocument = (url) =>
  fetch(`${BASE}/index/add-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeader() },
    body: JSON.stringify({ url }),
  }).then(handle);
export const githubLogin = (code) =>
  fetch(`${BASE}/auth/github`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  }).then(handle);