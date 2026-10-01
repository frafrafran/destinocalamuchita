import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { hashPassword, verifyPassword } from "@/lib/password";

export { hashPassword, verifyPassword };

/** A hash computed for unknown emails so login timing does not reveal which accounts exist. */
let dummyHash: Promise<string> | undefined;
export async function burnPasswordCheck(password: string): Promise<void> {
  dummyHash ??= hashPassword("destinocalamuchita-timing-equaliser");
  await verifyPassword(await dummyHash, password);
}

/** 256-bit random token, URL safe. */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}
