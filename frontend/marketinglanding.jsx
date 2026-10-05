import { useEffect, useState } from "react";
import {
  Sparkles, FileUp, MessageSquareText, ShieldCheck, Zap, ArrowRight, PlayCircle,
  ChevronDown, Mic, Lock, LayoutGrid, Moon, Sun, Menu, X, Check, Quote,
} from "lucide-react";
import Reveal from "./reveal.jsx";
import HeroMockup from "./heromockup.jsx";

const ROTATING_WORDS = ["Knowledge", "Research", "Document", "Team"];

const CHIPS = [
  { icon: FileUp, title: "Multi-document upload" },
  { icon: MessageSquareText, title: "Cited answers" },
  { icon: ShieldCheck, title: "Private by default" },
  { icon: Zap, title: "Agentic reasoning" },
];

const STATS = [
  { value: 98, suffix: "%", label: "Answers with citations" },
  { value: 3, suffix: "x", label: "Faster document research" },
  { value: 60, suffix: "s", label: "From upload to first answer" },
];

const DEEP_FEATURES = [
  { icon: LayoutGrid, title: "Hybrid retrieval", text: "Semantic search, keyword matching and reranking work together so nothing relevant slips through." },
  { icon: Mic, title: "Voice conversations", text: "Ask out loud and hear grounded answers spoken back — no typing required." },
  { icon: Lock, title: "Guardrails built in", text: "Input and output checks catch prompt injection and flag unverified claims automatically." },
  { icon: MessageSquareText, title: "Inline citations", text: "Every claim links back to the exact document and page it came from." },
  { icon: FileUp, title: "Your knowledge base", text: "Upload PDFs or paste text, then choose exactly which sources each chat can use." },
  { icon: ShieldCheck, title: "Isolated per account", text: "Each account gets its own index. Your files are never shared or used for training." },
];

const STEPS = [
  { n: "01", title: "Add your sources", text: "Upload PDF or TXT files, or paste text into your secure knowledge base." },
  { n: "02", title: "Ask anything", text: "Type or speak your question. Cortex searches, compares and reasons across documents." },
  { n: "03", title: "Verify instantly", text: "Read the answer and open every citation to check the original source." },
];

const TESTIMONIALS = [
  { quote: "We replaced hours of searching through policy PDFs with a single question. The citations make it trustworthy.", name: "Sara K.", role: "HR Operations Lead" },
  { quote: "The first AI tool our compliance team actually approved. Every answer is traceable.", name: "Daniel R.", role: "Compliance Manager" },
  { quote: "Voice mode is brilliant for reviewing long reports on the go.", name: "Ayesha M.", role: "Research Analyst" },
];

const FAQS = [
  { q: "What file types can I upload?", a: "PDF and TXT files today, with more formats on the way. You can also paste raw text directly." },
  { q: "Are my documents kept private?", a: "Yes. Each account has its own isolated document index. Your files and chat history are never shared with other users." },
  { q: "How accurate are the answers?", a: "Every answer is generated strictly from your uploaded content and includes inline citations pointing back to the exact source and page." },
  { q: "Can I use voice instead of typing?", a: "Yes, ask by speaking and get a spoken answer back, in addition to the written response." },
];

const THEME_KEY = "cortex_theme";

function useTheme() {
  const [theme, setTheme] = useState("light");
  useEffect(() => {
    const saved = localStorage.getItem(THEME_KEY);
    const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
    const next = saved || (prefersDark ? "dark" : "light");
    setTheme(next);
    document.documentElement.dataset.theme = next;
  }, []);
  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem(THEME_KEY, next);
    document.documentElement.dataset.theme = next;
  };
  return [theme, toggle];
}

function CountUp({ to, suffix }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    let raf;
    const start = performance.now();
    const tick = (t) => {
      const p = Math.min((t - start) / 1400, 1);
      setN(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to]);
  return <>{n}{suffix}</>;
}

function FaqItem({ q, a, defaultOpen }) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div className={`lp-faq-item ${open ? "open" : ""}`}>
      <button className="lp-faq-q" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span>{q}</span>
        <ChevronDown size={18} className="lp-faq-chevron" aria-hidden="true" />
      </button>
      <div className="lp-faq-a"><p>{a}</p></div>
    </div>
  );
}

export default function MarketingLanding({ onSignIn, onGetStarted }) {
  const [wordIndex, setWordIndex] = useState(0);
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [theme, toggleTheme] = useTheme();

  useEffect(() => {
    const id = setInterval(() => setWordIndex((i) => (i + 1) % ROTATING_WORDS.length), 2200);
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { clearInterval(id); window.removeEventListener("scroll", onScroll); };
  }, []);

  const close = () => setMenuOpen(false);

  return (
    <div className="lp">
      <div className="lp-bg" aria-hidden="true"><span className="lp-orb a" /><span className="lp-orb b" /><span className="lp-grid" /></div>

      <header className={`lp-nav ${scrolled ? "scrolled" : ""}`}>
        <a href="#top" className="lp-brand"><span className="lp-logo"><Sparkles size={16} aria-hidden="true" /></span> Cortex</a>
        <nav className={`lp-links ${menuOpen ? "open" : ""}`}>
          <a href="#features" onClick={close}>Features</a>
          <a href="#how-it-works" onClick={close}>How it works</a>
          <a href="#testimonials" onClick={close}>Customers</a>
          <a href="#faq" onClick={close}>FAQ</a>
          <button className="lp-btn lp-btn-ghost lp-mobile-only" onClick={onSignIn}>Sign in</button>
        </nav>
        <div className="lp-nav-right">
          <button className="lp-icon" onClick={toggleTheme} aria-label="Toggle theme">
            {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          <button className="lp-btn lp-btn-ghost lp-desktop-only" onClick={onSignIn}>Sign in</button>
          <button className="lp-btn lp-btn-primary sm" onClick={onGetStarted}>Get started</button>
          <button className="lp-icon lp-menu" onClick={() => setMenuOpen((o) => !o)} aria-label="Menu">
            {menuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </header>

      <main id="top">
        <section className="lp-hero">
          <div className="lp-hero-text lp-enter">
            <span className="lp-tag"><span className="lp-dot" /> Agentic RAG · now with voice</span>
            <h1>
              Your intelligent{" "}
              <span className="lp-rotate"><span key={wordIndex}>{ROTATING_WORDS[wordIndex]}</span></span>
              <br />assistant.
            </h1>
            <p>Upload your documents, ask complex questions, and get accurate answers with citations you can verify in one click.</p>

            <div className="lp-cta">
              <button className="lp-btn lp-btn-primary lg" onClick={onGetStarted}>Get started free <ArrowRight size={16} aria-hidden="true" /></button>
              <a className="lp-btn lp-btn-outline lg" href="#how-it-works"><PlayCircle size={16} aria-hidden="true" /> See how it works</a>
            </div>

            <ul className="lp-checks">
              <li><Check size={14} aria-hidden="true" /> No credit card</li>
              <li><Check size={14} aria-hidden="true" /> Free to start</li>
              <li><Check size={14} aria-hidden="true" /> Never trained on your data</li>
            </ul>

            <div className="lp-chips">
              {CHIPS.map(({ icon: Icon, title }, i) => (
                <span key={title} className="lp-chip" style={{ animationDelay: `${400 + i * 90}ms` }}>
                  <Icon size={15} aria-hidden="true" /> {title}
                </span>
              ))}
            </div>
          </div>

          <div className="lp-hero-visual lp-enter delay" aria-hidden="true"><HeroMockup /></div>
        </section>

        <Reveal className="lp-stats">
          {STATS.map((s) => (
            <div key={s.label}><strong><CountUp to={s.value} suffix={s.suffix} /></strong><span>{s.label}</span></div>
          ))}
        </Reveal>

        <section id="features" className="lp-section">
          <Reveal className="lp-head">
            <span className="lp-kicker">Features</span>
            <h2>Smarter answers, straight from your documents.</h2>
            <p>Cortex helps you find, understand and use information from your own knowledge base — securely and accurately.</p>
          </Reveal>
          <div className="lp-feature-grid">
            {DEEP_FEATURES.map(({ icon: Icon, title, text }, i) => (
              <Reveal key={title} delay={(i % 3) * 90} className="lp-card">
                <div className="lp-card-icon"><Icon size={20} aria-hidden="true" /></div>
                <h3>{title}</h3>
                <p>{text}</p>
              </Reveal>
            ))}
          </div>
        </section>

        <section id="how-it-works" className="lp-section lp-alt">
          <Reveal className="lp-head">
            <span className="lp-kicker">How it works</span>
            <h2>From scattered files to clear answers in three steps.</h2>
          </Reveal>
          <div className="lp-steps">
            {STEPS.map((s, i) => (
              <Reveal key={s.n} delay={i * 120} className="lp-step">
                <b>{s.n}</b><h3>{s.title}</h3><p>{s.text}</p>
              </Reveal>
            ))}
          </div>

          <Reveal className="lp-trust">
            <div>
              <h3>Your data. Your control.</h3>
              <p>Built for teams that need answers they can defend.</p>
            </div>
            <ul>
              <li><ShieldCheck size={16} aria-hidden="true" /> Secure &amp; private storage</li>
              <li><ShieldCheck size={16} aria-hidden="true" /> Always grounded in sources</li>
              <li><ShieldCheck size={16} aria-hidden="true" /> Never used for training</li>
            </ul>
          </Reveal>
        </section>

        <section id="testimonials" className="lp-section">
          <Reveal className="lp-head">
            <span className="lp-kicker">Loved by teams</span>
            <h2>Trusted for answers that matter.</h2>
          </Reveal>
          <div className="lp-quotes">
            {TESTIMONIALS.map((t, i) => (
              <Reveal key={t.name} delay={i * 100} className="lp-quote">
                <Quote size={20} aria-hidden="true" />
                <p>{t.quote}</p>
                <div className="lp-person"><span>{t.name[0]}</span><div><strong>{t.name}</strong><em>{t.role}</em></div></div>
              </Reveal>
            ))}
          </div>
        </section>

        <section id="faq" className="lp-section lp-alt lp-faq">
          <Reveal className="lp-head left">
            <span className="lp-kicker">FAQ</span>
            <h2>Frequently asked questions</h2>
            <p>Everything you need to know before getting started.</p>
          </Reveal>
          <Reveal delay={100} className="lp-faq-list">
            {FAQS.map((f, i) => <FaqItem key={f.q} q={f.q} a={f.a} defaultOpen={i === 0} />)}
          </Reveal>
        </section>

        <section className="lp-section">
          <Reveal className="lp-final">
            <h2>Ready to talk to your documents?</h2>
            <p>Create a free account and upload your first document in under a minute.</p>
            <div className="lp-cta center">
              <button className="lp-btn lp-btn-light lg" onClick={onGetStarted}>Get started free <ArrowRight size={16} aria-hidden="true" /></button>
              <button className="lp-btn lp-btn-clear lg" onClick={onSignIn}>Sign in</button>
            </div>
          </Reveal>
        </section>
      </main>

      <footer className="lp-footer">
        <a href="#top" className="lp-brand"><span className="lp-logo"><Sparkles size={14} aria-hidden="true" /></span> Cortex</a>
        <nav><a href="#features">Features</a><a href="#how-it-works">How it works</a><a href="#faq">FAQ</a></nav>
        <span>© {new Date().getFullYear()} Cortex. Grounded intelligence for your documents.</span>
      </footer>
    </div>
  );
}