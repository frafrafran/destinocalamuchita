import "server-only";
import { env } from "../env";
import { LocalStorage } from "./local";
import { R2Storage } from "./r2";
import { S3Storage } from "./s3";

/**
 * Object storage abstraction.
 * - `public` bucket: property photos, served to anyone.
 * - `private` bucket: payment receipts, only streamed through an authorised route.
 */
export type Bucket = "public" | "private";

export interface StoredObject {
  body: Buffer;
  contentType: string;
}

export interface StorageDriver {
  put(bucket: Bucket, key: string, body: Buffer, contentType: string): Promise<void>;
  get(bucket: Bucket, key: string): Promise<StoredObject | null>;
  delete(bucket: Bucket, key: string): Promise<void>;
  /** Public URL for objects in the public bucket. */
  publicUrl(key: string): string;
}

let driver: StorageDriver | undefined;

export function storage(): StorageDriver {
  driver ??= env.STORAGE_DRIVER === "r2" ? new R2Storage() : env.STORAGE_DRIVER === "s3" ? new S3Storage() : new LocalStorage();
  return driver;
}
