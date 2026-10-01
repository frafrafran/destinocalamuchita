import "server-only";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { env } from "../env";
import type { Bucket, StorageDriver, StoredObject } from "./index";

/** S3-compatible storage: AWS S3, Cloudflare R2, Supabase Storage (S3 API), MinIO… */
export class S3Storage implements StorageDriver {
  private client = new S3Client({
    region: env.S3_REGION,
    endpoint: env.S3_ENDPOINT,
    forcePathStyle: Boolean(env.S3_ENDPOINT),
    credentials: { accessKeyId: env.S3_ACCESS_KEY_ID!, secretAccessKey: env.S3_SECRET_ACCESS_KEY! },
  });

  private bucketName(bucket: Bucket): string {
    return bucket === "public" ? env.S3_BUCKET_PUBLIC! : env.S3_BUCKET_PRIVATE!;
  }

  async put(bucket: Bucket, key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucketName(bucket),
        Key: key,
        Body: body,
        ContentType: contentType,
        CacheControl: bucket === "public" ? "public, max-age=31536000, immutable" : "private, no-store",
      }),
    );
  }

  async get(bucket: Bucket, key: string): Promise<StoredObject | null> {
    try {
      const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucketName(bucket), Key: key }));
      if (!result.Body) return null;
      const body = Buffer.from(await result.Body.transformToByteArray());
      return { body, contentType: result.ContentType ?? "application/octet-stream" };
    } catch (error) {
      if ((error as { name?: string }).name === "NoSuchKey") return null;
      throw error;
    }
  }

  async delete(bucket: Bucket, key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucketName(bucket), Key: key }));
  }

  publicUrl(key: string): string {
    return `${env.S3_PUBLIC_BASE_URL!.replace(/\/$/, "")}/${key}`;
  }
}
