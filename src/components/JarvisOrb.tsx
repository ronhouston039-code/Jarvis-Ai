/** Decorative original hologram; it conveys activity, never device or location data. */
export function JarvisOrb({ active = false }: { active?: boolean }) {
  return (
    <div
      className={`jarvis-orb ${active ? "is-active" : ""}`}
      aria-hidden="true"
    >
      <svg className="hud-reactor" viewBox="0 0 500 500" fill="none">
        <defs>
          <linearGradient id="radar-beam">
            <stop stopColor="#00ddff" stopOpacity="0" />
            <stop offset="1" stopColor="#00e4ff" stopOpacity=".7" />
          </linearGradient>
          <radialGradient id="reactor-light">
            <stop stopColor="#39d5ff" stopOpacity=".28" />
            <stop offset="1" stopColor="#0876da" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="250" cy="250" r="246" fill="url(#reactor-light)" />
        <g className="reactor-outer">
          {[230, 218, 202, 194, 177].map((r, i) => (
            <circle
              key={r}
              cx="250"
              cy="250"
              r={r}
              stroke={i % 2 ? "#0670bc" : "#36caff"}
              strokeWidth={i === 2 ? 6 : 1}
              strokeDasharray={i === 2 ? "48 13 4 13" : "4 7"}
              opacity={i === 2 ? 0.85 : 0.5}
            />
          ))}
          {Array.from({ length: 80 }, (_, i) => (
            <path
              key={i}
              d="M250 8V22"
              stroke={i % 5 === 0 ? "#98ecff" : "#1678ba"}
              strokeWidth={i % 5 === 0 ? 3 : 1}
              transform={`rotate(${i * 4.5} 250 250)`}
            />
          ))}
        </g>
        <g className="reactor-inner">
          <circle
            cx="250"
            cy="250"
            r="159"
            stroke="#26b7f0"
            strokeWidth="3"
            strokeDasharray="200 30 8 20"
          />
          <circle
            cx="250"
            cy="250"
            r="143"
            stroke="#134b75"
            strokeWidth="9"
            strokeDasharray="60 20"
          />
          <circle cx="250" cy="250" r="116" stroke="#38a6e4" opacity=".5" />
          <circle
            cx="250"
            cy="250"
            r="88"
            stroke="#2dbbff"
            strokeDasharray="125 50"
            strokeWidth="3"
          />
        </g>
        <path
          d="M250 40V145M250 355V460M40 250H145M355 250H460"
          stroke="#2ac1ff"
          opacity=".5"
        />
        <g className="radar-sweep">
          <path
            d="M250 250 L250 38 A212 212 0 0 1 400 100 Z"
            fill="url(#radar-beam)"
          />
          <path d="M250 250L400 100" stroke="#10e8ff" strokeWidth="3" />
        </g>
        {Array.from({ length: 12 }, (_, i) => {
          const angle = ((i * 30 - 90) * Math.PI) / 180;
          return (
            <text
              key={i}
              x={250 + 244 * Math.cos(angle)}
              y={254 + 244 * Math.sin(angle)}
              fill="#17d7eb"
              fontSize="10"
              textAnchor="middle"
            >
              {i * 30}
            </text>
          );
        })}
        <circle cx="250" cy="250" r="10" fill="#67edff" />
        <circle cx="250" cy="250" r="20" stroke="#32b9ff" opacity=".5" />
        {[0, 90, 180, 270].map((a) => (
          <rect
            key={a}
            x="245"
            y="29"
            width="10"
            height="24"
            rx="2"
            fill="#79e6ff"
            transform={`rotate(${a} 250 250)`}
          />
        ))}
      </svg>
      <svg className="holographic-earth" viewBox="0 0 240 300" fill="none">
        <defs>
          <radialGradient id="earth-light">
            <stop stopColor="#0c7cce" stopOpacity=".45" />
            <stop offset="1" stopColor="#04346c" stopOpacity=".15" />
          </radialGradient>
          <clipPath id="earth-clip">
            <circle cx="120" cy="118" r="83" />
          </clipPath>
        </defs>
        <ellipse
          cx="120"
          cy="268"
          rx="107"
          ry="22"
          stroke="#13bafe"
          strokeWidth="2"
        />
        <ellipse
          cx="120"
          cy="268"
          rx="79"
          ry="13"
          stroke="#62e5ff"
          strokeWidth="3"
        />
        <ellipse cx="120" cy="268" rx="46" ry="7" stroke="#17a9e4" />
        <path
          d="M39 134L92 267M201 134L148 267"
          stroke="#1bb9f2"
          opacity=".28"
        />
        <circle
          cx="120"
          cy="118"
          r="83"
          fill="url(#earth-light)"
          stroke="#75eaff"
          strokeWidth="2"
        />
        <g clipPath="url(#earth-clip)" stroke="#38b7f0" opacity=".6">
          {[25, 52, 72].map((r) => (
            <ellipse key={r} cx="120" cy="118" rx={r} ry="83" />
          ))}
          {[65, 90, 118, 146, 171].map((y) => (
            <ellipse key={y} cx="120" cy={y} rx="84" ry="12" />
          ))}
          <path d="M38 118H204M120 34V204" />
        </g>
        <g
          clipPath="url(#earth-clip)"
          fill="#42d7ff"
          fillOpacity=".2"
          stroke="#7adeff"
          strokeWidth="1.4"
        >
          <path d="M59 60L82 46L103 54L112 70L99 83L101 99L86 101L78 118L69 109L66 91L53 88L47 74Z M84 119L103 124L112 144L106 164L97 190L87 176L88 152L80 138Z M137 57L154 50L181 60L197 79L182 94L160 93L153 110L135 105L129 86L139 76Z M140 111L164 115L170 131L158 157L147 169L136 147L130 127Z M178 162L196 163L204 179L192 188L176 178Z" />
        </g>
        <circle
          cx="120"
          cy="118"
          r="88"
          stroke="#0c98ff"
          strokeDasharray="3 7"
          opacity=".6"
        />
      </svg>
      <div className="hologram-platform">
        <i />
        <i />
        <i />
      </div>
    </div>
  );
}
