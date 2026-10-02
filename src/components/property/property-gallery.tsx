"use client";

import { CaretLeftIcon, CaretRightIcon, SquaresFourIcon, XIcon } from "@phosphor-icons/react";
import Image from "next/image";
import { Dialog as RadixDialog } from "radix-ui";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export interface GalleryImage {
  id: string;
  url: string;
  alt: string;
  width: number;
  height: number;
}

/**
 * Both layouts are in the markup and each one's first photo is preloaded, so each declares a tiny size
 * where it is hidden: phones and desktops then preload only the photo they actually show, instead of
 * also fetching a full-width copy for the other layout.
 */
// The tiles are squarer than the 3:2 photos they crop, hence sizes a bit wider than the tiles themselves.
const STRIP_SIZES = "113vw";
const FIRST_STRIP_SIZES = `(min-width: 768px) 1px, ${STRIP_SIZES}`;
const MAIN_TILE_SIZES = "(min-width: 1280px) 860px, (min-width: 768px) 66vw, 1px";
const TILE_SIZES = "(min-width: 1280px) 420px, 33vw";

/**
 * Desktop: one large photo and a 2x2 grid. Phones: a swipeable strip.
 * Any photo opens a fullscreen viewer with keyboard and swipe navigation.
 */
export function PropertyGallery({ images, title }: { images: GalleryImage[]; title: string }) {
  const t = useTranslations("property.gallery");
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [stripIndex, setStripIndex] = useState(0);
  const strip = useRef<HTMLDivElement>(null);

  const show = (i: number) => {
    setIndex(i);
    setOpen(true);
  };

  useEffect(() => {
    const node = strip.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) if (entry.isIntersecting) setStripIndex(Number((entry.target as HTMLElement).dataset.index));
      },
      { root: node, threshold: 0.6 },
    );
    node.querySelectorAll("[data-index]").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [images.length]);

  if (images.length === 0) return null;
  const grid = images.slice(1, 5);

  return (
    <>
      {/* Phones */}
      <div className="-mx-4 sm:-mx-6 md:hidden">
        <div ref={strip} className="scrollbar-none flex snap-x snap-mandatory overflow-x-auto">
          {images.map((image, i) => (
            <button key={image.id} type="button" data-index={i} onClick={() => show(i)} className="relative aspect-[4/3] w-full shrink-0 snap-center" aria-label={t("open", { index: i + 1 })}>
              <Image src={image.url} alt={image.alt} fill sizes={i === 0 ? FIRST_STRIP_SIZES : STRIP_SIZES} preload={i === 0} className="object-cover" />
            </button>
          ))}
        </div>
        <div className="mt-3 flex justify-center gap-1.5" aria-hidden>
          {images.map((image, i) => (
            <span key={image.id} className={cn("h-1.5 rounded-full transition-all duration-300", i === stripIndex ? "w-4 bg-ink" : "w-1.5 bg-line-strong")} />
          ))}
        </div>
      </div>

      {/* Tablet and desktop */}
      <div className={cn("relative hidden gap-2 overflow-hidden rounded-3xl md:grid", grid.length >= 4 ? "h-[min(62vh,560px)] grid-cols-4 grid-rows-2" : "h-[min(56vh,480px)] grid-cols-2")}>
        <button type="button" onClick={() => show(0)} className={cn("group relative overflow-hidden", grid.length >= 4 && "col-span-2 row-span-2")} aria-label={t("open", { index: 1 })}>
          <Image src={images[0]!.url} alt={images[0]!.alt} fill preload sizes={MAIN_TILE_SIZES} className="object-cover transition-transform duration-700 ease-(--ease-soft) group-hover:scale-[1.02]" />
        </button>
        {(grid.length >= 4 ? grid : grid.slice(0, 1)).map((image, i) => (
          <button key={image.id} type="button" onClick={() => show(i + 1)} className="group relative overflow-hidden" aria-label={t("open", { index: i + 2 })}>
            <Image src={image.url} alt={image.alt} fill sizes={TILE_SIZES} className="object-cover transition-transform duration-700 ease-(--ease-soft) group-hover:scale-[1.03]" />
          </button>
        ))}
        <button
          type="button"
          onClick={() => show(0)}
          className="absolute right-4 bottom-4 inline-flex h-10 items-center gap-2 rounded-full bg-surface px-4 text-sm font-medium text-ink shadow-soft transition-transform hover:scale-[1.02] active:scale-[0.98]"
        >
          <SquaresFourIcon size={16} />
          {t("showAll", { count: images.length })}
        </button>
      </div>

      <Lightbox images={images} title={title} open={open} onOpenChange={setOpen} index={index} setIndex={setIndex} />
    </>
  );
}

function Lightbox({
  images,
  title,
  open,
  onOpenChange,
  index,
  setIndex,
}: {
  images: GalleryImage[];
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  index: number;
  setIndex: (index: number) => void;
}) {
  const t = useTranslations("property.gallery");
  const track = useRef<HTMLDivElement>(null);

  const go = useCallback(
    (next: number) => {
      const clamped = (next + images.length) % images.length;
      setIndex(clamped);
      track.current?.children[clamped]?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    },
    [images.length, setIndex],
  );

  // Keep the counter in sync while swiping.
  useEffect(() => {
    const node = track.current;
    if (!open || !node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) if (entry.isIntersecting) setIndex(Number((entry.target as HTMLElement).dataset.index));
      },
      { root: node, threshold: 0.6 },
    );
    Array.from(node.children).forEach((child) => observer.observe(child));
    return () => observer.disconnect();
  }, [open, setIndex]);

  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Content
          className="fixed inset-0 z-50 flex flex-col bg-[#0b0f0d] text-white outline-none data-[state=open]:animate-[fade-in_200ms_ease-out]"
          onOpenAutoFocus={() => {
            // Jump (no animation) to the photo that was clicked.
            requestAnimationFrame(() => track.current?.children[index]?.scrollIntoView({ behavior: "instant", inline: "center", block: "nearest" }));
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowRight") go(index + 1);
            if (event.key === "ArrowLeft") go(index - 1);
          }}
        >
          <div className="flex h-16 shrink-0 items-center justify-between px-4 sm:px-6">
            <RadixDialog.Title className="truncate text-sm font-medium text-white/80">{title}</RadixDialog.Title>
            <RadixDialog.Description className="sr-only">{t("description")}</RadixDialog.Description>
            <div className="flex items-center gap-4">
              <p className="tabular text-sm text-white/70" aria-live="polite">
                {t("counter", { index: index + 1, total: images.length })}
              </p>
              <RadixDialog.Close className="grid size-10 place-items-center rounded-full bg-white/10 transition-colors hover:bg-white/20" aria-label={t("close")}>
                <XIcon size={18} />
              </RadixDialog.Close>
            </div>
          </div>
          <div ref={track} className="scrollbar-none flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto">
            {images.map((image, i) => (
              <figure key={image.id} data-index={i} className="relative flex w-full shrink-0 snap-center flex-col items-center justify-center px-4 pb-6 sm:px-20">
                <div className="relative h-full w-full">
                  <Image src={image.url} alt={image.alt} fill sizes="100vw" className="object-contain" loading={Math.abs(i - index) <= 1 ? "eager" : "lazy"} />
                </div>
                {image.alt ? <figcaption className="mt-3 text-center text-sm text-white/70">{image.alt}</figcaption> : null}
              </figure>
            ))}
          </div>
          <button type="button" onClick={() => go(index - 1)} className="absolute top-1/2 left-4 hidden size-12 -translate-y-1/2 place-items-center rounded-full bg-white/10 transition-colors hover:bg-white/20 sm:grid" aria-label={t("previous")}>
            <CaretLeftIcon size={20} />
          </button>
          <button type="button" onClick={() => go(index + 1)} className="absolute top-1/2 right-4 hidden size-12 -translate-y-1/2 place-items-center rounded-full bg-white/10 transition-colors hover:bg-white/20 sm:grid" aria-label={t("next")}>
            <CaretRightIcon size={20} />
          </button>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
