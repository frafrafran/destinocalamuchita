/**
 * Builds the Cloudflare Worker (OpenNext) without leaking local secrets.
 *
 * OpenNext copies the values of .env files into the Worker bundle. Local .env files hold development
 * secrets, so they are set aside (renamed in place to *.cf-hidden) for the duration of the build and
 * always restored. Production values live in Cloudflare (wrangler vars and secrets).
 *
 *   npm run cf:build
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, renameSync } from "node:fs";

const SUFFIX = ".cf-hidden";
const ENV_FILE = /^\.env(\..+)?$/;

function restore() {
  for (const name of readdirSync(".")) {
    if (name.endsWith(SUFFIX)) renameSync(name, name.slice(0, -SUFFIX.length));
  }
}

// A previous build that was killed may have left files aside.
restore();

const hidden = readdirSync(".").filter((name) => ENV_FILE.test(name) && name !== ".env.example");
for (const name of hidden) renameSync(name, name + SUFFIX);
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    restore();
    process.exit(1);
  });
}

let status = 1;
try {
  const run = (command) => spawnSync(command, { stdio: "inherit", shell: true, env: { ...process.env, CF_BUILD: "1" } }).status ?? 1;
  status = run("npx prisma generate");
  if (status === 0) status = run("npx opennextjs-cloudflare build");
} finally {
  restore();
}
if (hidden.length && !hidden.every((name) => existsSync(name))) {
  console.error("Some .env files could not be restored; look for *.cf-hidden files.");
  status = 1;
}
process.exit(status);
