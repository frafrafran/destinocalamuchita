import "server-only";
import { fileTypeFromBuffer } from "file-type";
import sharp from "sharp";
import { ActionError } from "./action-result";
import { sha256 } from "./auth/crypto";

export const PROOF_MAX_BYTES = 10 * 1024 * 1024;
export const IMAGE_MAX_BYTES = 15 * 1024 * 1024;
const MAX_INPUT_PIXELS = 60_000_000;

/** Characters that are never needed in a stored file name. */
export function sanitizeFileName(name: string): string {
  const cleaned = name
    .normalize("NFKD")
    .replace(/[^\w.\- ]+/g, "")
    .replace(/\s+/g, "-")
    .replace(/^[.-]+/, "")
    .slice(0, 100);
  return cleaned || "archivo";
}

async function readFile(file: File, maxBytes: number): Promise<Buffer> {
  if (file.size === 0) throw new ActionError("FILE_TYPE");
  if (file.size > maxBytes) throw new ActionError("FILE_TOO_LARGE", { maxMb: Math.round(maxBytes / 1024 / 1024) });
  return Buffer.from(await file.arrayBuffer());
}

/** PDF names may escape characters as #xx, e.g. /J#61vaScript. Decode before scanning. */
function decodePdfNames(text: string): string {
  return text.replace(/\/[^\s/<>[\]()]+/g, (name) =>
    name.replace(/#([0-9a-fA-F]{2})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16))),
  );
}

const DANGEROUS_PDF_TOKENS = [/\/JavaScript\b/, /\/JS\b/, /\/Launch\b/, /\/EmbeddedFile\b/, /\/RichMedia\b/, /\/SubmitForm\b/];

export function isPdfSafe(buffer: Buffer): boolean {
  if (!buffer.subarray(0, 1024).toString("latin1").includes("%PDF-")) return false;
  const text = decodePdfNames(buffer.toString("latin1"));
  return !DANGEROUS_PDF_TOKENS.some((token) => token.test(text));
}

export interface ProcessedProof {
  buffer: Buffer;
  mimeType: "image/jpeg" | "image/png" | "application/pdf";
  extension: "jpg" | "png" | "pdf";
  /** Hash of the bytes the guest sent (before re-encoding), to detect reused receipts. */
  sha256: string;
}

/**
 * Receipts: JPG, PNG or PDF up to 10 MB. The type comes from the file's magic bytes, never from its
 * name or the browser's Content-Type. Images are re-encoded (drops metadata and any appended
 * payload); PDFs with scripts, launch actions or embedded files are rejected.
 */
export async function processProofFile(file: File): Promise<ProcessedProof> {
  const original = await readFile(file, PROOF_MAX_BYTES);
  const type = await fileTypeFromBuffer(original);
  const hash = sha256(original);

  if (type?.mime === "application/pdf") {
    if (!isPdfSafe(original)) throw new ActionError("FILE_UNSAFE");
    return { buffer: original, mimeType: "application/pdf", extension: "pdf", sha256: hash };
  }
  if (type?.mime === "image/jpeg" || type?.mime === "image/png") {
    try {
      const pipeline = sharp(original, { limitInputPixels: MAX_INPUT_PIXELS })
        .rotate()
        .resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true });
      const buffer =
        type.mime === "image/png"
          ? await pipeline.png({ compressionLevel: 9 }).toBuffer()
          : await pipeline.jpeg({ quality: 86, mozjpeg: true }).toBuffer();
      return {
        buffer,
        mimeType: type.mime,
        extension: type.mime === "image/png" ? "png" : "jpg",
        sha256: hash,
      };
    } catch {
      throw new ActionError("FILE_UNSAFE");
    }
  }
  throw new ActionError("FILE_TYPE");
}

export interface ProcessedImage {
  buffer: Buffer;
  width: number;
  height: number;
}

/** Property photos: JPG, PNG, WEBP or AVIF up to 15 MB, normalised to WEBP (max 2400px). */
export async function processPropertyImage(file: File): Promise<ProcessedImage> {
  const original = await readFile(file, IMAGE_MAX_BYTES);
  const type = await fileTypeFromBuffer(original);
  if (!type || !["image/jpeg", "image/png", "image/webp", "image/avif"].includes(type.mime)) {
    throw new ActionError("FILE_TYPE");
  }
  try {
    const { data, info } = await sharp(original, { limitInputPixels: MAX_INPUT_PIXELS })
      .rotate()
      .resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
    return { buffer: data, width: info.width, height: info.height };
  } catch {
    throw new ActionError("FILE_UNSAFE");
  }
}
