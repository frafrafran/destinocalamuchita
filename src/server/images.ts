import "server-only";
import { cloudflare, type ImagesBindingLike } from "./platform";

export type ImageFormat = "webp" | "jpeg" | "png";

export interface ImageJob {
  input: Buffer;
  format: ImageFormat;
  quality?: number;
  /** Longest side in pixels; smaller images are never enlarged. */
  maxSide: number;
}

export interface ImageResult {
  buffer: Buffer;
  width: number;
  height: number;
}

/** Above this the input is refused before decoding (decompression bombs). */
const MAX_INPUT_PIXELS = 60_000_000;

/**
 * Decodes, auto-rotates, shrinks and re-encodes an image. Re-encoding drops metadata (GPS, camera)
 * and anything appended to the file. Uses sharp on Node.js and the Images binding on Cloudflare,
 * where native modules cannot run. Throws on anything that is not a decodable image.
 */
export async function transformImage(job: ImageJob): Promise<ImageResult> {
  const images = cloudflare()?.env.IMAGES;
  return images ? withBinding(images, job) : withSharp(job);
}

async function withSharp({ input, format, quality, maxSide }: ImageJob): Promise<ImageResult> {
  const { default: sharp } = await import("sharp");
  const pipeline = sharp(input, { limitInputPixels: MAX_INPUT_PIXELS })
    .rotate()
    .resize({ width: maxSide, height: maxSide, fit: "inside", withoutEnlargement: true });
  const encoded =
    format === "webp"
      ? pipeline.webp({ quality: quality ?? 82 })
      : format === "png"
        ? pipeline.png({ compressionLevel: 9 })
        : pipeline.jpeg({ quality: quality ?? 86, mozjpeg: true });
  const { data, info } = await encoded.toBuffer({ resolveWithObject: true });
  return { buffer: data, width: info.width, height: info.height };
}

const stream = (bytes: Uint8Array) => new Blob([new Uint8Array(bytes)]).stream();

async function withBinding(images: ImagesBindingLike, { input, format, quality, maxSide }: ImageJob): Promise<ImageResult> {
  const source = await images.info(stream(input));
  if (!source.width || !source.height || source.width * source.height > MAX_INPUT_PIXELS) throw new Error("Unsupported image");
  const output = await images
    .input(stream(input))
    .transform({ width: maxSide, height: maxSide, fit: "scale-down" })
    .output({ format: `image/${format}`, quality: format === "png" ? undefined : (quality ?? (format === "webp" ? 82 : 86)) });
  const buffer = Buffer.from(await output.response().arrayBuffer());
  const result = await images.info(stream(buffer));
  if (!result.width || !result.height) throw new Error("Unsupported image");
  return { buffer, width: result.width, height: result.height };
}
