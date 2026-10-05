export default function HeroBg() {
  return (
    <div className="hero-bg" aria-hidden="true">
      <div className="hero-bg-blob hero-bg-blob-1" />
      <div className="hero-bg-blob hero-bg-blob-2" />
      <svg className="hero-bg-lines" viewBox="0 0 800 600" preserveAspectRatio="none">
        <line x1="550" y1="0" x2="800" y2="250" />
        <line x1="620" y1="0" x2="800" y2="180" />
        <line x1="690" y1="0" x2="800" y2="110" />
        <line x1="400" y1="600" x2="800" y2="350" />
        <line x1="480" y1="600" x2="800" y2="420" />
      </svg>
    </div>
  );
}