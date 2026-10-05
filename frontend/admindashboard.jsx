import "./style.css";
import { useEffect, useState } from "react";
import { X, Shield, Activity, Database, Users as UsersIcon, RefreshCw } from "lucide-react";
import {
  getAdminGuardrailSummary, getAdminGuardrailLogs,
  getAdminObservabilitySummary, getAdminObservabilityTraces,
  getAdminSystemHealth, getAdminUsers,
} from "./apiclient.js";

const TABS = [
  { id: "overview", label: "Overview", icon: Activity },
  { id: "guardrails", label: "Guardrails", icon: Shield },
  { id: "health", label: "System Health", icon: Database },
  { id: "users", label: "Users", icon: UsersIcon },
];

function StatCard({ label, value, tone = "default" }) {
  return (
    <div className={`admin-stat-card tone-${tone}`}>
      <span className="admin-stat-label">{label}</span>
      <span className="admin-stat-value">{value}</span>
    </div>
  );
}

function StatusBadge({ status }) {
  const tone = status === "healthy" || status === "success" ? "ok"
    : status === "rate_limited" ? "warn" : "err";
  return <span className={`admin-badge tone-${tone}`}>{status}</span>;
}

function OverviewTab({ data }) {
  const { guardrails, observability, health } = data;
  if (!guardrails || !observability || !health) return <p className="admin-empty">Loading…</p>;

  return (
    <div className="admin-overview">
      <div className="admin-section-heading"><h3>At a glance</h3><span>Latest system snapshot</span></div>
      <div className="admin-grid">
      <StatCard label="Blocked Inputs" value={guardrails.input_blocked} tone={guardrails.input_blocked > 0 ? "warn" : "ok"} />
      <StatCard label="Output Warnings" value={guardrails.output_warning} tone={guardrails.output_warning > 0 ? "warn" : "ok"} />
      <StatCard label="Total Runs (last 100)" value={observability.total_runs} />
      <StatCard label="Total Cost" value={`$${observability.total_cost.toFixed(5)}`} />
      <StatCard label="Avg Latency" value={`${observability.avg_latency_seconds}s`} />
      <StatCard label="Errors" value={observability.error_count} tone={observability.error_count > 0 ? "err" : "ok"} />
      <StatCard label="Database" value={health.database.status} tone={health.database.status === "healthy" ? "ok" : "err"} />
      <StatCard label="Chroma Collections" value={health.chroma.collection_count} />
      </div>
    </div>
  );
}

function GuardrailsTab({ logs }) {
  if (!logs) return <p className="admin-empty">Loading…</p>;
  if (logs.length === 0) return <p className="admin-empty">No guardrail events yet.</p>;

  return (
    <div className="admin-table-wrap" role="region" aria-label="Guardrail events" tabIndex={0}>
      <table className="admin-table">
      <thead>
        <tr><th>Kind</th><th>Detail</th><th>User</th><th>Time</th></tr>
      </thead>
      <tbody>
        {logs.map((l) => (
          <tr key={l.id}>
            <td><StatusBadge status={l.kind === "input_blocked" ? "err" : "warn"} /></td>
            <td className="admin-detail-cell">{l.detail}</td>
            <td className="admin-mono">{l.user_id.slice(0, 8)}…</td>
            <td>{new Date(l.created_at * 1000).toLocaleString()}</td>
          </tr>
        ))}
      </tbody>
      </table>
    </div>
  );
}

function HealthTab({ health }) {
  if (!health) return <p className="admin-empty">Loading…</p>;

  return (
    <div className="admin-health-list">
      <div className="admin-health-row">
        <span>Database</span>
        <StatusBadge status={health.database.status} />
        {health.database.latency_ms && <span className="admin-muted">{health.database.latency_ms}ms</span>}
      </div>
      <div className="admin-health-row">
        <span>Chroma Vector Store</span>
        <StatusBadge status={health.chroma.status} />
        {health.chroma.latency_ms && <span className="admin-muted">{health.chroma.latency_ms}ms · {health.chroma.collection_count} collections</span>}
      </div>
      {health.groq_keys.map((k) => (
        <div className="admin-health-row" key={k.key_name}>
          <span>{k.key_name}</span>
          <StatusBadge status={k.status} />
          {k.latency_ms && <span className="admin-muted">{k.latency_ms}ms</span>}
        </div>
      ))}
    </div>
  );
}

function UsersTab({ users }) {
  if (!users) return <p className="admin-empty">Loading…</p>;

  return (
    <div className="admin-table-wrap" role="region" aria-label="Users" tabIndex={0}>
      <table className="admin-table">
      <thead>
        <tr><th>Email</th><th>Sessions</th><th>Messages</th><th>Joined</th></tr>
      </thead>
      <tbody>
        {users.map((u) => (
          <tr key={u.user_id}>
            <td>{u.email}</td>
            <td>{u.session_count}</td>
            <td>{u.message_count}</td>
            <td>{new Date(u.created_at * 1000).toLocaleDateString()}</td>
          </tr>
        ))}
      </tbody>
      </table>
    </div>
  );
}

export default function AdminDashboard({ onClose }) {
  const [tab, setTab] = useState("overview");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState({
    guardrails: null, guardrailLogs: null,
    observability: null, traces: null,
    health: null, users: null,
  });

  async function loadAll() {
    setLoading(true);
    setError("");
    try {
      const [guardrails, guardrailLogs, observability, traces, health, users] = await Promise.all([
        getAdminGuardrailSummary(),
        getAdminGuardrailLogs(),
        getAdminObservabilitySummary(),
        getAdminObservabilityTraces(),
        getAdminSystemHealth(),
        getAdminUsers(),
      ]);
      setData({
        guardrails,
        guardrailLogs: guardrailLogs.logs,
        observability,
        traces: traces.traces,
        health,
        users: users.users,
      });
    } catch (e) {
      setError(e.message || "Could not load admin data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadAll(); }, []);

  return (
    <div className="admin-overlay">
      <div className="admin-panel-shell" role="dialog" aria-modal="true" aria-labelledby="admin-dashboard-title">
        <div className="admin-panel-header">
          <div className="admin-title-group">
            <span className="admin-eyebrow">CORTEX / OPERATIONS</span>
            <h2 id="admin-dashboard-title">Admin Dashboard</h2>
            <p>System activity and service status</p>
          </div>
          <div className="admin-header-actions">
            <button type="button" className="icon-btn" onClick={loadAll} aria-label="Refresh dashboard" title="Refresh dashboard" disabled={loading}>
              <RefreshCw size={18} className={loading ? "spin" : ""} />
            </button>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Close dashboard" title="Close dashboard"><X size={20} /></button>
          </div>
        </div>

        <div className="admin-tabs" role="tablist" aria-label="Dashboard sections">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              aria-controls="admin-active-panel"
              className={`admin-tab ${tab === id ? "active" : ""}`}
              onClick={() => setTab(id)}
            >
              <Icon size={15} aria-hidden="true" /> {label}
            </button>
          ))}
        </div>

        <div className="admin-panel-body" id="admin-active-panel" role="tabpanel">
          {error && <div className="error-v2" role="alert">{error}</div>}
          {tab === "overview" && <OverviewTab data={data} />}
          {tab === "guardrails" && <GuardrailsTab logs={data.guardrailLogs} />}
          {tab === "health" && <HealthTab health={data.health} />}
          {tab === "users" && <UsersTab users={data.users} />}
        </div>
      </div>
    </div>
  );
}