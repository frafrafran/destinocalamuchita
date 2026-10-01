/**
 * Stand-in for Node-only packages in the Cloudflare build (aliased in next.config.ts when
 * CF_BUILD=1). The app never reaches these paths on Workers (images go through the Images binding,
 * files through R2, email through Resend); if it ever did, the error says why.
 */
function unavailable(): never {
  throw new Error("This feature needs Node.js and is not available on Cloudflare Workers. Check STORAGE_DRIVER / EMAIL_DRIVER.");
}

class Unavailable {
  constructor() {
    unavailable();
  }
}

const stub = Object.assign(unavailable, { createTransport: unavailable });
export default stub;

// Named exports used by @aws-sdk/client-s3 imports in storage/s3.ts.
export const S3Client = Unavailable;
export const PutObjectCommand = Unavailable;
export const GetObjectCommand = Unavailable;
export const DeleteObjectCommand = Unavailable;
