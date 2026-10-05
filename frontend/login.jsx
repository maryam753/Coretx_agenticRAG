import { Sparkles, FileText, ArrowRight, ArrowLeft, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { login, signup, googleLogin, forgotPassword, resetPassword, githubLogin } from "./apiclient.js";
import { setToken } from "./auth.js";

export default function Login({ onAuthenticated, initialMode = "login", onBack }) {
  const [mode, setMode] = useState(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const googleBtnRef = useRef(null);
  const [info, setInfo] = useState("");
  const [resetToken, setResetToken] = useState("");

  useEffect(() => {
    if (!window.google || !googleBtnRef.current) return;
    window.google.accounts.id.initialize({
      client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
      callback: async (response) => {
        setError("");
        setBusy(true);
        try {
          const { token } = await googleLogin(response.credential);
          setToken(token);
          onAuthenticated();
        } catch (err) {
          setError(err.message || "Google sign-in failed.");
        } finally {
          setBusy(false);
        }
      },
    });
    window.google.accounts.id.renderButton(googleBtnRef.current, {
      theme: "outline",
      size: "large",
      width: googleBtnRef.current.offsetWidth || 280,
    });
  }, []);

  const isLogin = mode === "login";

  async function submit(e) {
    e.preventDefault();
    setError("");
    setInfo("");
    setBusy(true);
    try {
      if (mode === "forgot") {
        const res = await forgotPassword(email.trim());
        if (res.dev_token) {
          setResetToken(res.dev_token);
          setPassword("");
          setMode("reset");
          setInfo("Demo mode: no email service is set up yet, so here's your reset link directly.");
        } else {
          setInfo(res.message);
        }
      } else if (mode === "reset") {
        await resetPassword(resetToken, password);
        setMode("login");
        setPassword("");
        setInfo("Password updated. You can log in with your new password now.");
      } else {
        const fn = isLogin ? login : signup;
        const { token } = await fn(email.trim(), password);
        setToken(token);
        onAuthenticated();
      }
    } catch (err) {
      setError(err.message || "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    if (!code) return;

    window.history.replaceState({}, "", window.location.pathname);

    setBusy(true);
    githubLogin(code)
      .then(({ token }) => {
        setToken(token);
        onAuthenticated();
      })
      .catch((err) => {
        setError(err.message || "GitHub sign-in failed.");
      })
      .finally(() => setBusy(false));
  }, []);
  function startGithubLogin() {
    const clientId = import.meta.env.VITE_GITHUB_CLIENT_ID;
    const redirectUri = `${window.location.origin}/auth/github/callback`;
    const githubUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=read:user user:email`;
    window.location.href = githubUrl;
  }

  const heading =
    mode === "forgot" ? "Reset your password" :
    mode === "reset" ? "Choose a new password" :
    isLogin ? "Welcome back" : "Create your account";

  const subtext =
    mode === "forgot" ? "Enter your email and we'll create a reset link." :
    mode === "reset" ? "Enter your new password below." :
    isLogin ? "Sign in to your account to continue to Cortex." :
    "Get started with your AI knowledge assistant.";

  return (
    <main className="auth-page">
      <section className="auth-form-col" aria-label="Account access">
        <header className="auth-brand-row">
          <div className="auth-brand">
            <span className="auth-brand-mark"><Sparkles size={19} aria-hidden="true" /></span>
            <span>Cortex<span className="auth-brand-dot">.</span></span>
          </div>
          {onBack && (
            <button type="button" className="link-btn-v2 auth-back" onClick={onBack}>
              <ArrowLeft size={16} aria-hidden="true" /> Back
            </button>
          )}
        </header>

        <div className="auth-form-wrap">
          <div className="auth-intro">
            <span className="auth-eyebrow">YOUR KNOWLEDGE, WITHIN REACH</span>
            <h1 className="auth-heading">{heading}<span className="auth-heading-period">.</span></h1>
            <p className="auth-subtext">{subtext}</p>
          </div>

          <form className="auth-form" onSubmit={submit}>
            {(mode === "login" || mode === "signup" || mode === "forgot") && (
              <label className="field-v2">
                <span>Email address</span>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com" required autoComplete="email" />
              </label>
            )}
            {(mode === "login" || mode === "signup") && (
              <label className="field-v2">
                <span>Password</span>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password" minLength={8} required
                  autoComplete={isLogin ? "current-password" : "new-password"} />
              </label>
            )}
            {mode === "reset" && (
              <label className="field-v2">
                <span>New password</span>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters" minLength={8} required autoComplete="new-password" />
              </label>
            )}
            {mode === "login" && (
              <div className="auth-forgot">
                <button type="button" className="link-btn-v2"
                  onClick={() => { setMode("forgot"); setError(""); setInfo(""); }}>
                  Forgot password?
                </button>
              </div>
            )}

            {error && <div className="error-v2" role="alert">{error}</div>}
            {info && <div className="info-v2" role="status">{info}</div>}

            <button className="btn-v2 btn-v2-primary auth-submit" type="submit" disabled={busy}>
              <span>{busy ? "Please wait…" :
                mode === "forgot" ? "Send reset link" :
                mode === "reset" ? "Set new password" :
                isLogin ? "Sign in" : "Create account"}</span>
              {!busy && <ArrowRight size={17} aria-hidden="true" />}
            </button>

                    {(mode === "login" || mode === "signup") && (
          <>
            <div className="auth-divider-v2"><span>or continue with</span></div>
            <div className="social-row">
              <div className="google-btn-stack-v2">
                <button type="button" className="btn-v2 btn-v2-outline" tabIndex={-1}>
                  Google
                </button>
                <div ref={googleBtnRef} className="google-btn-overlay" />
              </div>
              <button type="button" className="btn-v2 btn-v2-outline" onClick={startGithubLogin}>
                GitHub
              </button>
            </div>
          </>
        )}
            <p className="auth-switch">
              {mode === "login" && <>New to Cortex? <button type="button" className="link-btn-v2 inline" onClick={() => { setMode("signup"); setError(""); setInfo(""); }}>Create an account</button></>}
              {mode === "signup" && <>Already have an account? <button type="button" className="link-btn-v2 inline" onClick={() => { setMode("login"); setError(""); setInfo(""); }}>Sign in</button></>}
              {(mode === "forgot" || mode === "reset") && <button type="button" className="link-btn-v2 inline" onClick={() => { setMode("login"); setError(""); setInfo(""); }}>Back to login</button>}
            </p>
          </form>
        </div>
        <footer className="auth-form-footer"><ShieldCheck size={16} aria-hidden="true" /> A secure space for what matters.</footer>
      </section>

      <aside className="auth-illustration-col" aria-label="About Cortex">
        <div className="auth-illustration-top"><span className="auth-rule" /> INTELLIGENCE, MADE USEFUL</div>
        <div className="auth-document-scene" aria-hidden="true">
          <div className="auth-document auth-document-back"><span className="auth-doc-line short" /><span className="auth-doc-line" /><span className="auth-doc-line mid" /></div>
          <div className="auth-document auth-document-front">
            <div className="auth-doc-header"><FileText size={20} /><span>KNOWLEDGE / 01</span></div>
            <span className="auth-doc-title" /><span className="auth-doc-title small" />
            <span className="auth-doc-line" /><span className="auth-doc-line" /><span className="auth-doc-line mid" />
            <span className="auth-doc-highlight"><Sparkles size={14} /> Clear answers, connected.</span>
          </div>
        </div>
        <div className="auth-illustration-inner">
          <span className="auth-illustration-icon"><FileText size={22} aria-hidden="true" /></span>
          <h2>Find clarity in<br />everything you know.</h2>
          <p>Cortex helps you find, understand and use information from your own knowledge base — securely and accurately.</p>
          <div className="auth-illustration-bottom"><span className="auth-rule" /> YOUR WORK. BETTER CONNECTED.</div>
        </div>
      </aside>
    </main>
  );
}