"use client";

import { useEffect, useRef, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";

const STYLES = {
  light: "https://tiles.openfreemap.org/styles/positron",
  dark: "https://tiles.openfreemap.org/styles/dark",
};

/**
 * Approximate location map (a soft circle, never the exact pin: the address is only shared once
 * the stay is confirmed). MapLibre is loaded only when the map scrolls near the viewport.
 */
export function LocationMap({ latitude, longitude, label }: { latitude: number; longitude: number; label: string }) {
  const container = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const node = container.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => entry?.isIntersecting && setVisible(true), { rootMargin: "300px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || !container.current) return;
    let map: import("maplibre-gl").Map | undefined;
    let cancelled = false;
    const dark = document.documentElement.dataset.theme === "dark" || (!document.documentElement.dataset.theme && matchMedia("(prefers-color-scheme: dark)").matches);

    import("maplibre-gl")
      .then(({ Map: MapLibreMap, NavigationControl }) => {
        if (cancelled || !container.current) return;
        // Round to ~1 km so the public map never reveals the exact house.
        const center: [number, number] = [Math.round(longitude * 100) / 100, Math.round(latitude * 100) / 100];
        map = new MapLibreMap({
          container: container.current,
          style: dark ? STYLES.dark : STYLES.light,
          center,
          zoom: 12.4,
          attributionControl: { compact: true },
          cooperativeGestures: true,
        });
        map.addControl(new NavigationControl({ showCompass: false }), "top-right");
        map.on("load", () => {
          map!.addSource("area", { type: "geojson", data: { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: center } } });
          map!.addLayer({
            id: "area",
            type: "circle",
            source: "area",
            paint: {
              "circle-radius": ["interpolate", ["exponential", 2], ["zoom"], 10, 18, 15, 420],
              "circle-color": dark ? "#8cc5a8" : "#1f4d3d",
              "circle-opacity": 0.18,
              "circle-stroke-color": dark ? "#8cc5a8" : "#1f4d3d",
              "circle-stroke-width": 1.5,
            },
          });
        });
        map.on("error", () => setFailed(true));
      })
      .catch(() => setFailed(true));

    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [visible, latitude, longitude]);

  return (
    <div className="relative aspect-[16/10] overflow-hidden rounded-2xl bg-surface-2 sm:aspect-[21/9]">
      <div ref={container} className="absolute inset-0" role="img" aria-label={label} />
      {failed ? <p className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-ink-3">{label}</p> : null}
    </div>
  );
}
