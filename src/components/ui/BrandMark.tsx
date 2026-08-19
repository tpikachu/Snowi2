/**
 * The Snowi mark, in one place.
 *
 * The geometry is the six-spoke snowflake from `src/assets/logo.svg`, and the
 * tile is the teal field from `src/assets/icon.svg`. Both were previously
 * re-typed inline at each call site, which is how three surfaces ended up
 * still drawing the microphone glyph this app was forked from long after the
 * rest of the rebrand had landed.
 *
 * Anything that shows the brand should import from here rather than pasting
 * paths, so the next change is one edit and not a hunt.
 */

/** Path data shared by both marks — the snowflake on a 16x16 grid. */
const SNOWFLAKE_PATH = "M8 1.5v13M2.4 4.75l11.2 6.5M2.4 11.25l11.2-6.5";

interface SnowiGlyphProps {
  size?: number;
  className?: string;
  /** Announce it; leave unset for decoration beside a visible name. */
  title?: string;
}

/**
 * The bare snowflake in `currentColor` — for rails, buttons and anywhere the
 * mark should take the surrounding text colour.
 */
export function SnowiGlyph({ size = 17, className, title }: SnowiGlyphProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="none"
      className={className}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <path d={SNOWFLAKE_PATH} stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
    </svg>
  );
}

interface SnowiAppIconProps {
  className?: string;
  title?: string;
}

/**
 * The app icon: the snowflake on its teal field, matching what the OS shows in
 * the dock, tray and installer. Used where the mark stands in for the
 * application itself rather than for a piece of its UI.
 */
export function SnowiAppIcon({ className, title = "Snowi" }: SnowiAppIconProps) {
  return (
    <svg viewBox="0 0 1024 1024" className={className} role="img" aria-label={title}>
      <defs>
        <linearGradient id="snowi-field" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#02c6cf" />
          <stop offset="1" stopColor="#009aa1" />
        </linearGradient>
      </defs>
      <rect x="100" y="100" width="824" height="824" rx="185" ry="185" fill="url(#snowi-field)" />
      {/* The faint rings from the packaged icon — they read as depth at large
          sizes and disappear cleanly at small ones. */}
      <circle
        cx="512"
        cy="512"
        r="284.28"
        fill="none"
        stroke="#ffffff"
        strokeOpacity={0.16}
        strokeWidth={11.54}
      />
      <circle
        cx="512"
        cy="512"
        r="362.56"
        fill="none"
        stroke="#ffffff"
        strokeOpacity={0.09}
        strokeWidth={11.54}
      />
      <g transform="translate(276.57 276.57) scale(29.42857)">
        <path
          d={SNOWFLAKE_PATH}
          fill="none"
          stroke="#ffffff"
          strokeWidth={1.8}
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
}
