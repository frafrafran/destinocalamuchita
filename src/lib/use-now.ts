"use client";

import { useEffect, useState } from "react";

/**
 * Current time in ms, refreshed every `intervalMs`.
 * Null during the server render and the first client render, so markup always hydrates cleanly.
 */
export function useNow(intervalMs: number): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, intervalMs);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [intervalMs]);
  return now;
}
