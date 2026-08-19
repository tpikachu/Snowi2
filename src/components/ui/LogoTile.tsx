interface LogoTileProps {
  src: string;
  alt: string;
  monochrome?: boolean;
}

/**
 * A mounted plate for a third-party mark: 3px corner, functional edge, raised.
 * The old version hard-coded a white fill and an rgba ring, which is why
 * provider logos were the one thing on the page that ignored the theme.
 */
export function LogoTile({ src, alt, monochrome }: LogoTileProps) {
  return (
    <div className="flex size-8 shrink-0 items-center justify-center rounded-control border border-border-control bg-surface-2 shadow-(--shadow-control)">
      <img src={src} alt={alt} className={`size-4.5${monochrome ? " icon-monochrome" : ""}`} />
    </div>
  );
}
