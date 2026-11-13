/**
 * The Cortex mark: a grid of modules with one lifted out of its slot (apps
 * slotting into one suite). Ink blocks, an outlined slot, the accent block.
 * On hover the block settles into place.
 */
export function LogoMark({ size = 28, title = "Cortex" }: { size?: number; title?: string }) {
  return (
    <svg className="cx-logo" width={size} height={size} viewBox="0 0 32 32" role="img" aria-label={title}>
      <rect x="2" y="2" width="12" height="12" rx="1.5" className="cx-logo__block" />
      <rect x="17" y="2" width="12" height="12" rx="1.5" className="cx-logo__block" />
      <rect x="2" y="17" width="12" height="12" rx="1.5" className="cx-logo__block" />
      <rect x="17.5" y="17.5" width="11" height="11" rx="1" className="cx-logo__slot" />
      <rect x="17" y="17" width="12" height="12" rx="1.5" className="cx-logo__lift" />
    </svg>
  );
}
