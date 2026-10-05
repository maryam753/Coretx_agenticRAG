// state: idle | reading | thinking | speaking | done | error
// variant: "full" (head + shoulders) or "head" (small avatar)
const SCAN_Y = [234, 246, 258, 270, 282];
const EQ_X = [304, 317, 330, 343, 356, 369];
const EQ_DELAY = [0, -0.2, -0.5, -0.7, -0.35, -0.6];

export default function AgentRobot({ state = "idle", variant = "full", size = 250, still = false }) {
  const head = variant === "head";
  const viewBox = head ? "205 84 270 320" : "150 84 380 400";
  const [vw, vh] = head ? [270, 320] : [380, 400];

  return (
    <div className="robot" data-state={state} data-still={still || undefined}>
      <svg viewBox={viewBox} width={size} height={Math.round((size * vh) / vw)} role="img" aria-label={`Cortex agent, ${state}`}>
        {!head && (
          <g>
            <path d="M170 560 L170 480 Q170 436 218 426 L462 426 Q510 436 510 480 L510 560 Z" fill="#1E2430" stroke="#2F3748" strokeWidth="2" />
            <circle cx="212" cy="458" r="26" fill="#2A3140" stroke="#3A4152" strokeWidth="2" />
            <circle cx="212" cy="458" r="13" fill="#171B24" stroke="#3A4152" />
            <circle cx="468" cy="458" r="26" fill="#2A3140" stroke="#3A4152" strokeWidth="2" />
            <circle cx="468" cy="458" r="13" fill="#171B24" stroke="#3A4152" />
            <rect x="262" y="446" width="156" height="100" rx="16" fill="#262D3B" stroke="#3A4152" strokeWidth="1.5" />
            <circle cx="340" cy="482" r="20" fill="#0B0D12" stroke="#3A4152" strokeWidth="2" />
            <circle className="r-pulse" cx="340" cy="482" r="8" />
            <rect x="312" y="384" width="56" height="52" rx="8" fill="#171B24" />
            <rect x="308" y="394" width="64" height="9" rx="4" fill="#2A3140" stroke="#3A4152" />
            <rect x="308" y="410" width="64" height="9" rx="4" fill="#2A3140" stroke="#3A4152" />
          </g>
        )}

        <g className="r-head">
          <line x1="340" y1="146" x2="340" y2="112" stroke="#3A4152" strokeWidth="3" />
          <circle className="r-pulse" cx="340" cy="102" r="9" />
          <circle cx="340" cy="102" r="14" fill="none" stroke="#7C8CFF" strokeWidth="1" opacity=".4" />
          <rect x="212" y="226" width="30" height="84" rx="12" fill="#1E2430" stroke="#3A4152" strokeWidth="2" />
          <rect x="220" y="246" width="8" height="44" rx="4" fill="#7C8CFF" opacity=".85" />
          <rect x="438" y="226" width="30" height="84" rx="12" fill="#1E2430" stroke="#3A4152" strokeWidth="2" />
          <rect x="452" y="246" width="8" height="44" rx="4" fill="#7C8CFF" opacity=".85" />
          <rect x="236" y="144" width="208" height="248" rx="72" fill="#2A3140" stroke="#3A4152" strokeWidth="2" />
          <path d="M256 250 Q252 190 292 160" fill="none" stroke="#4A5468" strokeWidth="4" strokeLinecap="round" />
          <path d="M272 172 Q340 152 408 172" fill="none" stroke="#3A4152" strokeWidth="2" />
          <rect x="258" y="200" width="164" height="110" rx="40" fill="#05070B" stroke="#4A5468" strokeWidth="2" />
          <rect x="266" y="208" width="148" height="94" rx="34" fill="#0A0E1A" />
          {SCAN_Y.map((y) => (
            <line key={y} x1="272" y1={y} x2="408" y2={y} stroke="#7C8CFF" opacity=".1" />
          ))}
          <g className="r-look">
            <g className="r-blink eyes">
              <rect x="296" y="236" width="30" height="40" rx="15" />
              <rect x="354" y="236" width="30" height="40" rx="15" />
              <circle cx="307" cy="248" r="5" fill="#E3E7FF" />
              <circle cx="365" cy="248" r="5" fill="#E3E7FF" />
            </g>
          </g>
          <path d="M280 214 L330 214 L296 296 L272 296 Z" fill="#FFFFFF" opacity=".05" />
          <rect x="288" y="326" width="104" height="44" rx="14" fill="#1E2430" stroke="#3A4152" strokeWidth="1.5" />
          {EQ_X.map((x, i) => (
            <rect key={x} className="r-eq" style={{ animationDelay: `${EQ_DELAY[i]}s` }} x={x} y="338" width="6" height="20" rx="3" />
          ))}
        </g>
      </svg>
    </div>
  );
}