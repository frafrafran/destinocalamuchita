import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * Where the server code runs. Production is a Cloudflare Worker (OpenNext); development, tests and
 * scripts run on Node.js. Only the few modules that touch I/O (database, files, images) care.
 */
export const isWorkers = typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers";

/** The subset of the bindings declared in wrangler.jsonc that the app uses. */
export interface CloudflareBindings {
  /** Pooled PostgreSQL connection (Hyperdrive). */
  HYPERDRIVE?: { connectionString: string };
  /** Property photos (public, served through /media). */
  MEDIA?: R2BucketLike;
  /** Payment receipts (private, only streamed to staff). */
  RECEIPTS?: R2BucketLike;
  /** Image resizing and re-encoding. */
  IMAGES?: ImagesBindingLike;
}

export interface R2ObjectLike {
  arrayBuffer(): Promise<ArrayBuffer>;
  httpMetadata?: { contentType?: string };
}

export interface R2BucketLike {
  get(key: string): Promise<R2ObjectLike | null>;
  put(key: string, value: ArrayBuffer | Uint8Array, options?: { httpMetadata?: { contentType?: string; cacheControl?: string } }): Promise<unknown>;
  delete(key: string): Promise<void>;
}

export interface ImagesBindingLike {
  input(stream: ReadableStream<Uint8Array>): {
    transform(options: { width?: number; height?: number; fit?: "scale-down" | "contain" | "cover"; rotate?: 0 | 90 | 180 | 270 }): {
      output(options: { format: "image/webp" | "image/jpeg" | "image/png"; quality?: number }): Promise<{ response(): Response }>;
    };
  };
  info(stream: ReadableStream<Uint8Array>): Promise<{ format: string; fileSize?: number; width?: number; height?: number }>;
}

export interface WorkerRequestContext {
  env: CloudflareBindings;
  /** Unique per request; used to scope per-request resources such as database clients. */
  ctx: object;
}

/** Bindings and execution context of the current request, or null outside a Worker. */
export function cloudflare(): WorkerRequestContext | null {
  if (!isWorkers) return null;
  const context = getCloudflareContext();
  return { env: context.env as unknown as CloudflareBindings, ctx: context.ctx as object };
}
