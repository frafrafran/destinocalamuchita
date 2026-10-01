/**
 * Deterministic mountain silhouettes for the scroll scenes (layered 1D value noise).
 * Same seed, same ridge: the shapes are stable across renders and cost nothing to download.
 * Paths are drawn in a WIDTH x height box with the ground at the bottom edge.
 */

export const RIDGE_WIDTH = 1600;

export interface RidgeOptions {
  seed: number;
  /** Height of the SVG box. */
  height: number;
  /** Mean elevation above the bottom edge, in box units. */
  base: number;
  /** How far peaks rise above / dip below the base. */
  amplitude: number;
  /** 0-1: how much each finer octave contributes (higher = craggier). */
  roughness?: number;
  /** Lower = broader mountains. */
  frequency?: number;
  /** "left" / "right" slope down toward the centre, to frame the scene like foreground hills. */
  envelope?: "full" | "left" | "right";
  /** Adds a jagged tree canopy of this height on top of the ridge. */
  treeline?: number;
}

function mulberry32(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const smooth = (t: number) => t * t * (3 - 2 * t);

function smoothstep(edge0: number, edge1: number, x: number) {
  return smooth(Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0))));
}

export function ridgePath({ seed, height, base, amplitude, roughness = 0.45, frequency = 3, envelope = "full", treeline = 0 }: RidgeOptions): string {
  const random = mulberry32(seed);
  const octaves = 4;
  const lattices = Array.from({ length: octaves }, (_, octave) => Array.from({ length: Math.ceil(frequency * 2 ** octave) + 2 }, () => random()));

  const noise = (x: number) => {
    let total = 0;
    let weight = 0;
    for (let octave = 0; octave < octaves; octave++) {
      const position = x * frequency * 2 ** octave;
      const index = Math.floor(position);
      const lattice = lattices[octave]!;
      const value = lattice[index]! + (lattice[index + 1]! - lattice[index]!) * smooth(position - index);
      const amp = roughness ** octave;
      total += value * amp;
      weight += amp;
    }
    return (total / weight) * 2 - 1;
  };

  const shape = (x: number) => {
    if (envelope === "left") return 1 - smoothstep(0, 0.7, x);
    if (envelope === "right") return smoothstep(0.3, 1, x);
    return 1;
  };

  const ground = (px: number) => {
    const x = px / RIDGE_WIDTH;
    return shape(x) * (base + amplitude * noise(x));
  };
  const points: [number, number][] = [];

  if (treeline > 0) {
    // Individual conifers: irregular width, spacing and height, taller where the canopy is dense.
    const canopy = mulberry32(seed * 7 + 3);
    for (let px = 0; px <= RIDGE_WIDTH; ) {
      const density = 0.55 + 0.45 * noise(0.1 + (px / RIDGE_WIDTH) * 0.8);
      const width = 7 + canopy() * 13;
      const envelopeValue = shape(px / RIDGE_WIDTH);
      const tree = envelopeValue > 0.05 ? treeline * envelopeValue * density * (0.45 + canopy() * 0.55) : 0;
      points.push([px, ground(px) + tree * 0.18]);
      points.push([px + width / 2, ground(px + width / 2) + tree]);
      px += width * (0.55 + canopy() * 0.6);
    }
  } else {
    for (let px = 0; px <= RIDGE_WIDTH; px += 10) points.push([px, ground(px)]);
  }

  const path = points
    .filter(([px]) => px <= RIDGE_WIDTH)
    .map(([px, elevation]) => `${px.toFixed(1)} ${Math.min(height, Math.max(0, height - elevation)).toFixed(1)}`);
  return `M0 ${height}L0 ${Math.max(0, height - ground(0)).toFixed(1)}L${path.join("L")}L${RIDGE_WIDTH} ${Math.max(0, height - ground(RIDGE_WIDTH)).toFixed(1)}L${RIDGE_WIDTH} ${height}Z`;
}
