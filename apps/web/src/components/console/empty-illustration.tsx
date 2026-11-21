type EmptyIllustrationName = 'today' | 'template' | 'notification';

type EmptyIllustrationProps = {
  name: EmptyIllustrationName;
};

export function EmptyIllustration({ name }: EmptyIllustrationProps) {
  return (
    <svg
      aria-hidden="true"
      className="fw-empty-illustration"
      viewBox="0 0 160 120"
      width="160"
      height="120"
      focusable="false"
    >
      {name === 'today' && (
        <>
          <path d="M72 104H30a6 6 0 0 1-6-6V22a6 6 0 0 1 6-6h100a6 6 0 0 1 6 6v76a6 6 0 0 1-6 6H88" />
          <rect
            className="fw-empty-illustration__block"
            x="36"
            y="28"
            width="32"
            height="12"
            rx="3"
          />
          <rect
            className="fw-empty-illustration__block"
            x="84"
            y="28"
            width="40"
            height="6"
            rx="3"
          />
          <rect
            className="fw-empty-illustration__block"
            x="84"
            y="44"
            width="40"
            height="6"
            rx="3"
          />
          <rect
            className="fw-empty-illustration__block"
            x="84"
            y="60"
            width="40"
            height="6"
            rx="3"
          />
          <path
            className="fw-empty-illustration__route"
            d="M80 116V84M112 84H48V56"
          />
          <circle
            className="fw-empty-illustration__checkpoint"
            cx="48"
            cy="56"
            r="4.5"
          />
          <circle
            className="fw-empty-illustration__checkpoint"
            cx="80"
            cy="84"
            r="4.5"
          />
          <circle
            className="fw-empty-illustration__checkpoint"
            cx="112"
            cy="84"
            r="4.5"
          />
        </>
      )}
      {name === 'template' && (
        <>
          <rect x="40" y="12" width="80" height="96" rx="6" />
          <path className="fw-empty-illustration__route" d="M56 32V92" />
          <circle
            className="fw-empty-illustration__checkpoint"
            cx="56"
            cy="32"
            r="4.5"
          />
          <circle
            className="fw-empty-illustration__checkpoint"
            cx="56"
            cy="52"
            r="4.5"
          />
          <circle
            className="fw-empty-illustration__checkpoint"
            cx="56"
            cy="72"
            r="4.5"
          />
          <rect
            className="fw-empty-illustration__block"
            x="68"
            y="29"
            width="40"
            height="6"
            rx="3"
          />
          <rect
            className="fw-empty-illustration__block"
            x="68"
            y="49"
            width="32"
            height="6"
            rx="3"
          />
          <rect
            className="fw-empty-illustration__block"
            x="68"
            y="69"
            width="36"
            height="6"
            rx="3"
          />
          <circle
            cx="56"
            cy="92"
            r="7"
            fill="var(--fw-primary)"
            stroke="none"
          />
          <path
            d="M56 88.5v7M52.5 92h7"
            fill="none"
            stroke="var(--fw-primary-foreground)"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
          <rect
            className="fw-empty-illustration__raised"
            x="68"
            y="89"
            width="28"
            height="6"
            rx="3"
          />
        </>
      )}
      {name === 'notification' && (
        <>
          <rect x="24" y="16" width="112" height="88" rx="6" />
          {Array.from({ length: 4 }, (_, row) =>
            Array.from({ length: 6 }, (_, column) => {
              const cx = 40 + column * 16;
              const cy = 36 + row * 16;
              if (cx === 88 && cy === 52) return null;
              return (
                <circle
                  key={`${cx}-${cy}`}
                  className="fw-empty-illustration__dot"
                  cx={cx}
                  cy={cy}
                  r="1.75"
                />
              );
            }),
          )}
          <circle
            className="fw-empty-illustration__halo"
            cx="88"
            cy="52"
            r="10"
          />
          <circle cx="88" cy="52" r="4" fill="var(--fw-primary)" />
        </>
      )}
    </svg>
  );
}
