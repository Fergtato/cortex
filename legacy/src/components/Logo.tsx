// Cortex brand mark: a blocky two-hemisphere brain drawn on a 32-unit grid
// with square strokes. Always white (not the accent) so it sits neutrally
// against every accent/theme. Mirrored in public/favicon.svg.
export function Logo({ size = 16 }: { size?: number }) {
  return (
    <svg
      className="logo-mark"
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="square"
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      <path d="M14 5H7v4H4v14h3v4h7V5" />
      <path d="M18 5h7v4h3v14h-3v4h-7V5" />
      <path d="M10 9v4h4M4 17h5v4" />
      <path d="M22 9v4h-4M28 17h-5v4" />
    </svg>
  );
}
