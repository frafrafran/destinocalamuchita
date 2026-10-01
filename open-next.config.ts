import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Every page renders on request (live availability and prices), so no incremental cache is configured.
export default defineCloudflareConfig({});
