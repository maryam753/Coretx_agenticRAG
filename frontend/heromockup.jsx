import { useEffect, useState } from "react";
import { Plus, Search, Sparkles, FileText, ShieldCheck, ArrowUp, CheckCircle2 } from "lucide-react";

const STEPS = ["Searching 3 documents", "Reranking passages", "Verifying citations"];

export default function HeroMockup() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setStep((s) => (s + 1) % (STEPS.length + 1)), 1400);
    return () => clearInterval(id);
  }, []);

  const done = step === STEPS.length;

  return (
    <div className="hm">
      <div className="hm-glow" />
      <div className="hm-window">
        <div className="hm-chrome">
          <span /><span /><span />
          <em>app.cortex.ai</em>
        </div>

        <div className="hm-body">
          <aside className="hm-side">
            <div className="hm-brand"><Sparkles size={14} aria-hidden="true" /> Cortex</div>
            <div className="hm-new"><Plus size={12} aria-hidden="true" /> New chat</div>
            <div className="hm-search"><Search size={11} aria-hidden="true" /> Search…</div>
            <div className="hm-label">Recent</div>
            <div className="hm-item active">Employee Handbook</div>
            <div className="hm-item">Product Guide</div>
            <div className="hm-item">Resume Review</div>
          </aside>

          <div className="hm-main">
            <div className="hm-top">
              <span>Employee Handbook</span>
              <span className="hm-pill"><FileText size={11} aria-hidden="true" /> 3 docs</span>
            </div>

            <div className="hm-user">Summarize the main leave requirements.</div>

            <div className="hm-bot">
              <div className="hm-status">
                {done ? <CheckCircle2 size={12} aria-hidden="true" /> : <span className="hm-spinner" />}
                {done ? "Answer verified" : STEPS[step]}
              </div>
              <div className="hm-line w-90" />
              <div className="hm-line w-100" />
              <div className="hm-line w-70" />
              <div className="hm-cites">
                <span>Handbook.pdf · p.12</span>
                <span>Policy.pdf · p.4</span>
              </div>
            </div>

            <div className="hm-composer">
              <span>Ask anything about your documents…</span>
              <b><ArrowUp size={12} aria-hidden="true" /></b>
            </div>
          </div>
        </div>
      </div>

      <div className="hm-float hm-float-a">
        <ShieldCheck size={16} aria-hidden="true" />
        <div><strong>Grounded answers</strong><span>Every response cites your documents.</span></div>
      </div>
      <div className="hm-float hm-float-b">
        <FileText size={16} aria-hidden="true" />
        <div><strong>Handbook.pdf</strong><span>Indexed · 48 pages</span></div>
      </div>
    </div>
  );
}