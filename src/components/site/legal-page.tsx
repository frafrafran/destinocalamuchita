import type { ReactNode } from "react";

/** Shared layout for terms, cancellation and privacy pages. Text comes from Settings (editable). */
export function LegalPage({ title, updated, body, aside }: { title: string; updated?: string; body: string; aside?: ReactNode }) {
  const paragraphs = body.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  return (
    <div className="mx-auto grid max-w-5xl gap-12 px-4 pt-[120px] pb-24 sm:px-6 lg:grid-cols-[1fr_280px] lg:px-10">
      <article>
        <h1 className="text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">{title}</h1>
        {updated ? <p className="mt-2 text-sm text-ink-3">{updated}</p> : null}
        <div className="mt-10 max-w-[68ch] space-y-5 leading-relaxed text-ink-2">
          {paragraphs.map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
        </div>
      </article>
      {aside ? <aside className="h-fit rounded-2xl bg-surface-2 p-6 text-sm leading-relaxed text-ink-2 lg:sticky lg:top-28">{aside}</aside> : null}
    </div>
  );
}
