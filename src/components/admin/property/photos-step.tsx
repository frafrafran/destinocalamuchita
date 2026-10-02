"use client";

import { ArrowLeftIcon, ArrowRightIcon, ImagesIcon, TrashIcon, UploadSimpleIcon } from "@phosphor-icons/react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { type DragEvent, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { deleteImageAction, saveImagesAction } from "@/actions/properties";
import { Button } from "@/components/ui/button";
import { EmptyState, Notice } from "@/components/ui/feedback";
import { Input } from "@/components/ui/field";
import { useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { useAction } from "../use-action";

export interface PhotoItem {
  id: string;
  url: string;
  alt: string;
  width: number;
  height: number;
}

export function PhotosStep({ propertyId, images }: { propertyId: string; images: PhotoItem[] }) {
  const t = useTranslations("admin.property.photos");
  const te = useTranslations("errors");
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState(images);
  const [dragging, setDragging] = useState<number | null>(null);
  const [dropActive, setDropActive] = useState(false);
  const [uploading, startUpload] = useTransition();
  const [uploadErrors, setUploadErrors] = useState<string[]>([]);
  const save = useAction();
  const remove = useAction();
  const dirty = JSON.stringify(items.map((i) => [i.id, i.alt])) !== JSON.stringify(images.map((i) => [i.id, i.alt]));

  // The server list changes after uploads/deletes; keep local edits otherwise.
  const [source, setSource] = useState(images);
  if (source !== images) {
    setSource(images);
    setItems(images);
  }

  function move(from: number, to: number) {
    if (to < 0 || to >= items.length) return;
    setItems((current) => {
      const next = [...current];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item!);
      return next;
    });
  }

  /**
   * One photo per request: a batch of phone photos in a single body could pass Cloudflare's request
   * size limit (100 MB) or the Worker's memory, failing every file at once. Large photos are first
   * scaled down in the browser to the size the server keeps anyway, so uploads are much faster.
   */
  function upload(files: FileList | File[]) {
    const list = Array.from(files).slice(0, 12);
    if (!list.length) return;
    setUploadErrors([]);
    startUpload(async () => {
      const errors: string[] = [];
      let uploaded = 0;
      for (const original of list) {
        const body = new FormData();
        body.append("files", await shrinkForUpload(original));
        try {
          const response = await fetch(`/api/admin/properties/${propertyId}/images`, { method: "POST", body });
          const result = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string; results?: { ok: boolean; error?: string }[] };
          const error = !response.ok || !result.ok ? (result.error ?? "UNKNOWN") : result.results?.find((r) => !r.ok)?.error;
          if (error === undefined) uploaded++;
          else errors.push(`${original.name}: ${te(error as "UNKNOWN")}`);
          // Limits that apply to the whole property (or the account) will refuse the remaining files too.
          if (error === "TOO_MANY_FILES" || error === "RATE_LIMITED" || error === "FORBIDDEN") break;
        } catch {
          errors.push(`${original.name}: ${te("UNKNOWN")}`);
        }
      }
      setUploadErrors(errors);
      if (uploaded) {
        toast.success(t("uploaded", { count: uploaded }));
        router.refresh();
      }
    });
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDropActive(false);
    if (event.dataTransfer.files.length) upload(event.dataTransfer.files);
  }

  return (
    <div className="space-y-6">
      <div
        onDragOver={(event) => {
          if (event.dataTransfer.types.includes("Files")) {
            event.preventDefault();
            setDropActive(true);
          }
        }}
        onDragLeave={() => setDropActive(false)}
        onDrop={onDrop}
        className={cn(
          "flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors",
          dropActive ? "border-accent bg-accent-soft" : "border-line-strong bg-surface",
        )}
      >
        <UploadSimpleIcon size={30} className="text-accent-text" />
        <div>
          <p className="font-medium">{t("dropTitle")}</p>
          <p className="mt-1 text-sm text-ink-3">{t("dropHint")}</p>
        </div>
        <Button variant="secondary" size="sm" loading={uploading} onClick={() => input.current?.click()}>
          {t("choose")}
        </Button>
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          multiple
          className="sr-only"
          aria-label={t("choose")}
          onChange={(event) => {
            if (event.target.files) upload(event.target.files);
            event.target.value = "";
          }}
        />
      </div>

      {uploadErrors.length ? (
        <Notice tone="danger" title={t("someFailed")}>
          <ul className="list-disc pl-4">
            {uploadErrors.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </Notice>
      ) : null}
      {save.error ? <Notice tone="danger">{save.error}</Notice> : null}
      {remove.error ? <Notice tone="danger">{remove.error}</Notice> : null}

      {items.length ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-ink-3">{t("orderHint")}</p>
            <Button disabled={!dirty} loading={save.pending} onClick={() => save.run(() => saveImagesAction(propertyId, items.map(({ id, alt }) => ({ id, alt }))))}>
              {t("saveOrder")}
            </Button>
          </div>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item, index) => (
              <li
                key={item.id}
                draggable
                onDragStart={() => setDragging(index)}
                onDragOver={(event) => {
                  if (dragging === null) return;
                  event.preventDefault();
                  if (dragging !== index) {
                    move(dragging, index);
                    setDragging(index);
                  }
                }}
                onDragEnd={() => setDragging(null)}
                className={cn("overflow-hidden rounded-2xl border border-line bg-surface transition-shadow", dragging === index && "opacity-60 shadow-lift")}
              >
                <div className="relative aspect-[4/3] cursor-grab bg-surface-2 active:cursor-grabbing">
                  <Image src={item.url} alt={item.alt} fill sizes="(min-width: 1024px) 30vw, 50vw" className="object-cover" />
                  {index === 0 ? <span className="absolute top-3 left-3 rounded-full bg-surface px-2.5 py-1 text-xs font-semibold shadow-soft">{t("cover")}</span> : null}
                </div>
                <div className="space-y-3 p-3">
                  <Input
                    value={item.alt}
                    onChange={(event) => setItems((current) => current.map((i) => (i.id === item.id ? { ...i, alt: event.target.value } : i)))}
                    aria-label={t("altLabel", { index: index + 1 })}
                    placeholder={t("altPlaceholder")}
                    className="h-9 text-sm"
                  />
                  <div className="flex items-center justify-between">
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon-sm" onClick={() => move(index, index - 1)} disabled={index === 0} aria-label={t("moveLeft")}>
                        <ArrowLeftIcon size={15} />
                      </Button>
                      <Button variant="ghost" size="icon-sm" onClick={() => move(index, index + 1)} disabled={index === items.length - 1} aria-label={t("moveRight")}>
                        <ArrowRightIcon size={15} />
                      </Button>
                    </div>
                    <Button
                      variant="danger-ghost"
                      size="sm"
                      disabled={remove.pending}
                      onClick={() => {
                        if (window.confirm(t("confirmDelete"))) remove.run(() => deleteImageAction(item.id), { success: t("deleted") });
                      }}
                    >
                      <TrashIcon size={15} />
                      {t("delete")}
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <EmptyState icon={<ImagesIcon size={22} />} title={t("empty")} description={t("emptyHint")} />
      )}
    </div>
  );
}

/** The server stores photos at most this long on their longest side (src/server/uploads.ts). */
const MAX_SIDE = 2400;
/** Files below this are sent untouched. */
const SHRINK_ABOVE_BYTES = 2.5 * 1024 * 1024;

/**
 * Scales a large photo down to MAX_SIDE (honouring its EXIF orientation) and re-encodes it as a
 * high-quality JPEG. Anything the browser cannot decode, or that would not get smaller, is sent as is:
 * the server validates and re-encodes every file regardless.
 */
async function shrinkForUpload(file: File): Promise<File> {
  if (file.size <= SHRINK_ABOVE_BYTES || typeof createImageBitmap !== "function") return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.fillStyle = "#fff"; // JPEG has no transparency
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], `${file.name.replace(/\.[^.]+$/, "")}.jpg`, { type: "image/jpeg" });
  } catch {
    return file;
  }
}
