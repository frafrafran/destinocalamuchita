import type { z } from "zod";

/**
 * Shape returned by every Server Action. Errors carry a stable code (translated in the UI through
 * the `errors` message namespace) plus optional per-field codes for forms.
 */
export type ErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "VALIDATION"
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "DATES_UNAVAILABLE"
  | "PRICE_CHANGED"
  | "INVALID_STATE"
  | "CALENDAR_CONFLICT"
  | "INVALID_CREDENTIALS"
  | "FILE_TOO_LARGE"
  | "FILE_TYPE"
  | "FILE_UNSAFE"
  | "TOO_MANY_FILES"
  | "HAS_RESERVATIONS"
  | "DUPLICATE"
  | "ICAL_URL"
  | "QUOTE"
  | "UNKNOWN";

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: ErrorCode; fieldErrors?: Record<string, string>; details?: Record<string, unknown> };

export class ActionError extends Error {
  constructor(
    public readonly code: ErrorCode,
    public readonly details?: Record<string, unknown>,
    public readonly fieldErrors?: Record<string, string>,
  ) {
    super(code);
    this.name = "ActionError";
  }
}

export function ok<T>(data: T): ActionResult<T>;
export function ok(): ActionResult<undefined>;
export function ok<T>(data?: T): ActionResult<T | undefined> {
  return { ok: true, data };
}

/** Schema-level messages that are keys of the `validation` namespace get translated. */
const CUSTOM_MESSAGE_KEYS = new Set(["dateOrder", "pastDate", "terms", "phone", "required", "invalid", "url", "email"]);

export function fieldErrorsFromZod(error: z.ZodError, t?: (key: string) => string): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    const translated = t && CUSTOM_MESSAGE_KEYS.has(issue.message) ? t(issue.message) : issue.message;
    errors[key] ??= translated;
  }
  return errors;
}

/**
 * Wraps a Server Action body: known ActionErrors become typed results; anything else is logged
 * server-side and reported as UNKNOWN so internals never leak to the browser.
 * Next.js navigation errors (redirect/notFound) are rethrown untouched.
 */
export async function runAction<T>(body: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await body() };
  } catch (error) {
    if (error instanceof ActionError) {
      return { ok: false, error: error.code, details: error.details, fieldErrors: error.fieldErrors };
    }
    const digest = (error as { digest?: unknown } | null)?.digest;
    if (typeof digest === "string" && (digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_HTTP_ERROR"))) {
      throw error;
    }
    console.error("[action] unexpected error", error);
    return { ok: false, error: "UNKNOWN" };
  }
}

type Translate = (key: string, values?: Record<string, string | number>) => string;

/** Turns Zod issues into short, human messages from the `validation` namespace. */
export function friendlyErrorMap(t: Translate): z.core.$ZodErrorMap {
  return (issue) => {
    switch (issue.code) {
      case "invalid_type":
        return issue.input === undefined || issue.input === null || issue.input === "" ? t("required") : t("invalid");
      case "too_small":
        if (issue.origin === "string") return Number(issue.minimum) <= 1 ? t("required") : t("minLength", { min: Number(issue.minimum) });
        if (issue.origin === "array") return t("minItems", { min: Number(issue.minimum) });
        return t("minValue", { min: Number(issue.minimum) });
      case "too_big":
        if (issue.origin === "string") return t("maxLength", { max: Number(issue.maximum) });
        if (issue.origin === "array") return t("maxItems", { max: Number(issue.maximum) });
        return t("maxValue", { max: Number(issue.maximum) });
      case "invalid_format":
        if (issue.format === "email") return t("email");
        if (issue.format === "url") return t("url");
        return t("invalid");
      case "invalid_value":
        return t("invalid");
      default:
        return t("invalid");
    }
  };
}

export function parseInput<S extends z.ZodType>(schema: S, input: unknown, t: Translate): z.output<S> {
  const result = schema.safeParse(input, { error: friendlyErrorMap(t) });
  if (!result.success) throw new ActionError("VALIDATION", undefined, fieldErrorsFromZod(result.error, t));
  return result.data;
}
