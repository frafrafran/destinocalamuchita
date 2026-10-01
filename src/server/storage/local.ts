import "server-only";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Bucket, StorageDriver, StoredObject } from "./index";

const ROOT = path.resolve(process.cwd(), "storage");
const SAFE_KEY = /^[a-zA-Z0-9][a-zA-Z0-9/_.-]{0,255}$/;

/** Filesystem storage for development (and single-server deployments). */
export class LocalStorage implements StorageDriver {
  private resolve(bucket: Bucket, key: string): string {
    if (!SAFE_KEY.test(key) || key.includes("..")) throw new Error(`Unsafe storage key: ${key}`);
    const base = path.join(ROOT, bucket);
    const full = path.resolve(base, key);
    if (!full.startsWith(base + path.sep)) throw new Error(`Storage key escapes bucket: ${key}`);
    return full;
  }

  async put(bucket: Bucket, key: string, body: Buffer, contentType: string): Promise<void> {
    const file = this.resolve(bucket, key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, body);
    await writeFile(`${file}.meta`, contentType);
  }

  async get(bucket: Bucket, key: string): Promise<StoredObject | null> {
    const file = this.resolve(bucket, key);
    try {
      const [body, contentType] = await Promise.all([readFile(file), readFile(`${file}.meta`, "utf8")]);
      return { body, contentType };
    } catch {
      return null;
    }
  }

  async delete(bucket: Bucket, key: string): Promise<void> {
    const file = this.resolve(bucket, key);
    await Promise.all([rm(file, { force: true }), rm(`${file}.meta`, { force: true })]);
  }

  publicUrl(key: string): string {
    return `/media/${key}`;
  }
}
