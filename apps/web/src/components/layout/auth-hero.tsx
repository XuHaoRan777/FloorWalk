import type { CSSProperties } from 'react';

const checkpoints = [
  { x: 320, y: 370, progress: 0.057, rowWidth: '48%' },
  { x: 270, y: 165, progress: 0.266, rowWidth: '64%' },
  { x: 420, y: 144, progress: 0.406, rowWidth: '54%' },
  { x: 420, y: 214, progress: 0.668, rowWidth: '68%' },
  { x: 460, y: 340, progress: 1, rowWidth: '44%' },
];

function animationDelay(progress: number) {
  return `${175 + 1000 * progress}ms`;
}

export function AuthHero() {
  return (
    <section className="fw-auth-hero fw-auth-hero--playing">
      <svg
        aria-hidden="true"
        className="fw-auth-hero__drawing"
        viewBox="0 0 640 520"
        preserveAspectRatio="xMidYMid meet"
        focusable="false"
      >
        <defs>
          <pattern
            id="fw-auth-hero-dots"
            width="24"
            height="24"
            patternUnits="userSpaceOnUse"
          >
            <circle
              cx="12"
              cy="12"
              r="1.2"
              fill="color-mix(in srgb, var(--fw-card) 20%, transparent)"
            />
          </pattern>
        </defs>
        <rect width="640" height="520" fill="url(#fw-auth-hero-dots)" />
        <g transform="translate(56 92) scale(.86)">
          <g
            fill="none"
            stroke="color-mix(in srgb, var(--fw-card) 22%, transparent)"
            strokeWidth="1.7"
            strokeLinejoin="round"
          >
            <path d="M290 410H70V60h500v350H350" />
            <rect x="100" y="90" width="150" height="56" rx="4" />
            <rect x="300" y="100" width="230" height="20" rx="3" />
            <rect x="300" y="170" width="230" height="20" rx="3" />
            <rect x="300" y="240" width="160" height="20" rx="3" />
            <rect x="482" y="296" width="62" height="88" rx="4" />
            <path d="M70 290h150v120" />
          </g>
          <path
            className="fw-auth-hero__route"
            pathLength={1}
            d="M320 440V370h-50V144h275v70H300v86h160v40"
            fill="none"
            stroke="var(--fw-card)"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {checkpoints.map((checkpoint) => (
            <g
              key={checkpoint.x + '-' + checkpoint.y}
              className="fw-auth-hero__checkpoint"
              transform={'translate(' + checkpoint.x + ' ' + checkpoint.y + ')'}
              style={
                {
                  '--fw-auth-delay': animationDelay(checkpoint.progress),
                } as CSSProperties
              }
            >
              <circle
                r="7"
                fill="none"
                stroke="color-mix(in srgb, var(--fw-card) 45%, transparent)"
                strokeWidth="1.5"
              />
              <circle
                className="fw-auth-hero__checkpoint-fill"
                r="7"
                fill="var(--fw-card)"
              />
            </g>
          ))}
        </g>
      </svg>
      <div className="fw-auth-hero__copy">
        <h1 id="fw-auth-brand-title">门店巡检，逐条落实</h1>
        <p>按日程生成任务，店长现场拍照，AI 逐条审核</p>
      </div>
      <div className="fw-auth-checklist" aria-hidden="true">
        {checkpoints.map((checkpoint, index) => (
          <div
            key={checkpoint.progress + '-' + index}
            className="fw-auth-checklist__row"
          >
            <span
              className="fw-auth-checklist__check"
              style={
                {
                  '--fw-auth-delay': animationDelay(checkpoint.progress),
                } as CSSProperties
              }
            >
              <svg viewBox="0 0 10 10" focusable="false">
                <path d="m2 5.2 2 2 4-4.4" />
              </svg>
            </span>
            <span
              className="fw-auth-checklist__line"
              style={{ width: checkpoint.rowWidth }}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
