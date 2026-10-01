import "server-only";
import { z } from "zod";

/**
 * Environment is validated once at startup. A missing or malformed variable fails fast with a
 * readable message instead of surfacing later as an obscure runtime error.
 */
const optional = z
  .string()
  .optional()
  .transform((value) => (value ? value : undefined));

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: z.string().min(1),
    APP_URL: z.url(),
    CRON_SECRET: z.string().min(16, "CRON_SECRET must be at least 16 characters"),
    APP_SECRET: z.string().min(32, "APP_SECRET must be at least 32 characters"),

    STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
    S3_ENDPOINT: optional,
    S3_REGION: z.string().default("auto"),
    S3_BUCKET_PUBLIC: optional,
    S3_BUCKET_PRIVATE: optional,
    S3_ACCESS_KEY_ID: optional,
    S3_SECRET_ACCESS_KEY: optional,
    S3_PUBLIC_BASE_URL: optional,

    EMAIL_DRIVER: z.enum(["console", "smtp", "resend"]).default("console"),
    EMAIL_FROM: z.string().min(3),
    SMTP_HOST: optional,
    SMTP_PORT: z.coerce.number().int().positive().default(587),
    SMTP_USER: optional,
    SMTP_PASSWORD: optional,
    RESEND_API_KEY: optional,

    ICAL_SYNC_INTERVAL_MINUTES: z.coerce.number().int().min(5).default(30),
  })
  .superRefine((value, ctx) => {
    if (value.STORAGE_DRIVER === "s3") {
      for (const key of [
        "S3_BUCKET_PUBLIC",
        "S3_BUCKET_PRIVATE",
        "S3_ACCESS_KEY_ID",
        "S3_SECRET_ACCESS_KEY",
        "S3_PUBLIC_BASE_URL",
      ] as const) {
        if (!value[key]) ctx.addIssue({ code: "custom", path: [key], message: `${key} is required when STORAGE_DRIVER=s3` });
      }
    }
    if (value.EMAIL_DRIVER === "smtp" && !value.SMTP_HOST) {
      ctx.addIssue({ code: "custom", path: ["SMTP_HOST"], message: "SMTP_HOST is required when EMAIL_DRIVER=smtp" });
    }
    if (value.EMAIL_DRIVER === "resend" && !value.RESEND_API_KEY) {
      ctx.addIssue({ code: "custom", path: ["RESEND_API_KEY"], message: "RESEND_API_KEY is required when EMAIL_DRIVER=resend" });
    }
    if (value.NODE_ENV === "production" && value.STORAGE_DRIVER === "local" && !process.env.ALLOW_LOCAL_STORAGE) {
      ctx.addIssue({
        code: "custom",
        path: ["STORAGE_DRIVER"],
        message: "Use STORAGE_DRIVER=s3 in production (serverless filesystems are ephemeral). Set ALLOW_LOCAL_STORAGE=1 on a VPS.",
      });
    }
  });

function parseEnv() {
  const result = schema.safeParse(process.env);
  if (!result.success) {
    const details = result.error.issues.map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`).join("\n");
    throw new Error(`Invalid environment variables:\n${details}\nSee .env.example.`);
  }
  return result.data;
}

export const env = parseEnv();

export const isProduction = env.NODE_ENV === "production";

/** Absolute URL on the public site. */
export function absoluteUrl(path: string): string {
  return new URL(path, env.APP_URL).toString();
}
