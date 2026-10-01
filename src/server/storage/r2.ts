import "server-only";
import { cloudflare, type R2BucketLike } from "../platform";
import type { Bucket, StorageDriver, StoredObject } from "./index";

/**
 * Cloudflare R2 through Worker bindings (no access keys): MEDIA holds property photos, RECEIPTS the
 * payment receipts. Photos are served by the /media route on the site's own domain, with long caching.
 */
export class R2Storage implements StorageDriver {
  private bucket(bucket: Bucket): R2BucketLike {
    const env = cloudflare()?.env;
    const binding = bucket === "public" ? env?.MEDIA : env?.RECEIPTS;
    if (!binding) throw new Error(`R2 binding for the ${bucket} bucket is missing (see wrangler.jsonc).`);
    return binding;
  }

  async put(bucket: Bucket, key: string, body: Buffer, contentType: string): Promise<void> {
    await this.bucket(bucket).put(key, new Uint8Array(body), {
      httpMetadata: { contentType, cacheControl: bucket === "public" ? "public, max-age=31536000, immutable" : "private, no-store" },
    });
  }

  async get(bucket: Bucket, key: string): Promise<StoredObject | null> {
    const object = await this.bucket(bucket).get(key);
    if (!object) return null;
    return { body: Buffer.from(await object.arrayBuffer()), contentType: object.httpMetadata?.contentType ?? "application/octet-stream" };
  }

  async delete(bucket: Bucket, key: string): Promise<void> {
    await this.bucket(bucket).delete(key);
  }

  publicUrl(key: string): string {
    return `/media/${key}`;
  }
}
