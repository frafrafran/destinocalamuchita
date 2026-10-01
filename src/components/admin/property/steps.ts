/** Wizard steps, in order. Plain module (no "use client") so server pages can read it too. */
export const PROPERTY_STEPS = ["info", "fotos", "servicios", "precios", "reglas", "canales", "publicar"] as const;
export type PropertyStep = (typeof PROPERTY_STEPS)[number];
