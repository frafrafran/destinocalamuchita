"use client";

import { motion, useMotionValue, useReducedMotion, useScroll, useTransform } from "motion/react";
import { type ReactNode, useRef } from "react";
import { useMediaQuery } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";

type Offset = NonNullable<Parameters<typeof useScroll>[0]>["offset"];

/**
 * Progress (0-1) of an element crossing the viewport, driven in JS so every layer reads the same value
 * (Motion would otherwise hand opacity to a native ScrollTimeline). Frozen at `still` under reduced
 * motion or when `enabledQuery` does not match, e.g. parallax only on wide screens.
 */
function useElementProgress(offset: Offset, enabledQuery: string | undefined, still: number) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const matches = useMediaQuery(enabledQuery ?? "all");
  const { scrollYProgress } = useScroll({ target: ref, offset });
  const tracked = useTransform(scrollYProgress, (value) => value);
  const frozen = useMotionValue(still);
  return { ref, progress: reduce || !matches ? frozen : tracked };
}

/** Moves its content from `from` to `to` pixels while it crosses the viewport (depth between siblings). */
export function Parallax({
  children,
  from,
  to,
  scale,
  enabledQuery,
  className,
}: {
  children: ReactNode;
  from: number;
  to: number;
  /** Optional zoom while crossing, e.g. [1.15, 1] for a photo settling into its frame. */
  scale?: [number, number];
  /** Media query that must match for the effect to run (content stays still otherwise). */
  enabledQuery?: string;
  className?: string;
}) {
  const { ref, progress } = useElementProgress(["start end", "end start"], enabledQuery, 0.5);
  const y = useTransform(progress, [0, 1], [from, to]);
  const zoom = useTransform(progress, [0, 1], scale ?? [1, 1]);
  return (
    <motion.div ref={ref} className={cn("will-change-transform", className)} style={{ y, scale: zoom }}>
      {children}
    </motion.div>
  );
}

/** A line that draws itself (left to right) as it scrolls up the screen. */
export function ScrollDrawLine({ className }: { className?: string }) {
  const { ref, progress } = useElementProgress(["start 0.85", "start 0.4"], undefined, 1);
  return <motion.div ref={ref} aria-hidden className={cn("origin-left", className)} style={{ scaleX: progress }} />;
}
