export function JarvisOrb({ active = false }: { active?: boolean }) {
  return (
    <div
      className={`jarvis-orb ${active ? "is-active" : ""}`}
      aria-hidden="true"
    >
      <div className="orb-orbit" />
      <div className="orb-core">
        <span>J</span>
      </div>
      <div className="orb-ticks">
        {Array.from({ length: 48 }, (_, i) => (
          <i
            key={i}
            style={{ transform: `rotate(${i * 7.5}deg) translateY(-94px)` }}
          />
        ))}
      </div>
    </div>
  );
}
