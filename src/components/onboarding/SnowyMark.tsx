/**
 * The Snowy brand mark, inlined so it can be tinted, sized and animated like
 * any other element. Geometry is transcribed from src/assets/icon.svg — the
 * 824/1024 tile of that file maps onto this 32-unit viewBox, so the glyph,
 * the two orbit rings and every stroke keep their original proportions.
 */

interface MarkProps {
  className?: string;
  /** Unique gradient id — needed when several marks render on one page. */
  gradientId?: string;
}

/** Full lockup tile: teal rounded square, orbit rings, white snowflake. */
export function SnowyMark({ className = "", gradientId = "snowy-mark-field" }: MarkProps) {
  return (
    <svg viewBox="0 0 32 32" className={className} role="img" aria-label="Snowy">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#02c6cf" />
          <stop offset="1" stopColor="#009aa1" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="32" height="32" rx="7.18" fill={`url(#${gradientId})`} />
      <circle
        cx="16"
        cy="16"
        r="11.04"
        fill="none"
        stroke="#ffffff"
        strokeOpacity="0.16"
        strokeWidth="0.45"
      />
      <circle
        cx="16"
        cy="16"
        r="14.08"
        fill="none"
        stroke="#ffffff"
        strokeOpacity="0.09"
        strokeWidth="0.45"
      />
      <g transform="translate(6.86 6.86) scale(1.143)">
        <path
          d="M8 1.5v13M2.4 4.75l11.2 6.5M2.4 11.25l11.2-6.5"
          fill="none"
          stroke="#ffffff"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
}

/** Bare six-spoke snowflake in currentColor (src/assets/logo.svg). */
export function SnowyGlyph({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={className} aria-hidden="true">
      <path
        d="M8 1.5v13M2.4 4.75l11.2 6.5M2.4 11.25l11.2-6.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
