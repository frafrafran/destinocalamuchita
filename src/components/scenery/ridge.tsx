import { RIDGE_WIDTH, type RidgeOptions, ridgePath } from "@/lib/ridges";

interface RidgeProps {
  options: RidgeOptions;
  /** Solid fill (any CSS colour, including var(--token)), or a top-to-bottom gradient. */
  fill: string | { id: string; top: string; bottom: string };
  /** Which side stays in view when the box is narrower than the ridge (phones). */
  anchor?: "left" | "center" | "right";
  className?: string;
}

const ANCHOR = { left: "xMinYMax", center: "xMidYMax", right: "xMaxYMax" } as const;

/** Decorative mountain silhouette. Server-rendered, so it ships as markup and no script. */
export function Ridge({ options, fill, anchor = "center", className }: RidgeProps) {
  return (
    <svg
      aria-hidden
      focusable="false"
      viewBox={`0 0 ${RIDGE_WIDTH} ${options.height}`}
      preserveAspectRatio={`${ANCHOR[anchor]} slice`}
      className={className}
    >
      {typeof fill === "string" ? null : (
        <defs>
          <linearGradient id={fill.id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: fill.top }} />
            <stop offset="1" style={{ stopColor: fill.bottom }} />
          </linearGradient>
        </defs>
      )}
      <path d={ridgePath(options)} style={{ fill: typeof fill === "string" ? fill : `url(#${fill.id})` }} />
    </svg>
  );
}
