import {
  Download,
  LogOut,
  Plus,
  FileStack,
  Trash2,
  X,
  ShieldAlert,
  Sun,
  Moon,
} from "lucide-react";

export default function Sidebar({
  stats,
  userEmail,
  sessions,
  activeId,
  onNewChat,
  onSelect,
  onExport,
  canExport,
  onRemove,
  onLogout,
  open,
  onClose,
  isAdmin,
  onOpenAdmin,
  theme,
  onToggleTheme,
}) {
  const history = sessions.filter((s) => s.message_count > 0);

  return (
    <aside className={`sidebar-v2 ${open ? "open" : ""}`}>
      <div className="side-top-v2">
        <div className="auth-brand light-on-dark">
          <FileStack size={19} strokeWidth={1.9} aria-hidden="true" />{" "}
          <span>Cortex</span>
        </div>
        <button
          className="icon-btn menu-close"
          aria-label="Close menu"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </div>

      <button className="btn-v2 btn-v2-primary block" onClick={onNewChat}>
        <Plus size={16} aria-hidden="true" /> New Chat
      </button>

      <section className="side-section-v2 grow">
        <h4>Recent conversations</h4>
        {history.length === 0 ? (
          <p className="caption-v2">Your past chats will show up here.</p>
        ) : (
          <ul className="history-v2">
            {history.map((s) => (
              <li key={s.session_id}>
                <button
                  className={s.session_id === activeId ? "active" : ""}
                  aria-current={s.session_id === activeId ? "page" : undefined}
                  onClick={() => onSelect(s.session_id)}
                  title={s.title}
                >
                  {s.title}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="side-actions-v2">
        {isAdmin && (
          <button className="side-action-btn" onClick={onOpenAdmin}>
            <ShieldAlert size={15} aria-hidden="true" /> Admin Dashboard
          </button>
        )}
        {canExport && (
          <button className="side-action-btn" onClick={onExport}>
            <Download size={15} aria-hidden="true" /> Download this chat
          </button>
        )}
        <button className="side-action-btn danger" onClick={onRemove}>
          <Trash2 size={15} aria-hidden="true" /> Remove documents
        </button>
        <button className="side-action-btn" onClick={onToggleTheme}>
          {theme === "dark" ? (
            <Sun size={15} aria-hidden="true" />
          ) : (
            <Moon size={15} aria-hidden="true" />
          )}
          {theme === "dark" ? "Light mode" : "Dark mode"}
        </button>
      </div>

      <div className="side-profile">
        <div className="side-profile-avatar">
          {(userEmail || "U")[0].toUpperCase()}
        </div>
        <div className="side-profile-info">
          <span>{userEmail || "Account"}</span>
        </div>
        <button
          className="icon-btn light-on-dark"
          aria-label="Log out"
          onClick={onLogout}
        >
          <LogOut size={16} />
        </button>
      </div>
    </aside>
  );
}