import node from "@astrojs/node";
import preact from "@astrojs/preact";
import type { AstroIntegration } from "astro";
import { defineConfig } from "astro/config";
import devSocket from "./src/net/devSocket.ts";

// Server-rendered output. Standalone mode (not middleware) because its exported
// handler also serves dist/client; server.ts turns off the adapter's own
// listener and mounts that handler beside the WebSocket endpoint. devSocket
// does the same attach in dev.
// The frame bench (scripts/bench-frame.ts) is a page only in a build made with BENCH=1. Its script
// imports whole rooms, and Astro bundles a page's script whatever the page returns at request time,
// so a production build must not see the page at all (ADR 0007). That build goes to dist-bench/, so a
// later `pnpm start` never serves it.
const BENCH = process.env.BENCH === "1";
const bench = (): AstroIntegration => ({
  name: "bench",
  hooks: {
    "astro:config:setup": ({ injectRoute }) => {
      if (BENCH) injectRoute({ pattern: "/bench", entrypoint: "./src/bench/bench.astro" });
    },
  },
});

export default defineConfig({
  output: "server",
  ...(BENCH ? { outDir: "dist-bench" } : {}),
  adapter: node({ mode: "standalone" }),
  integrations: [preact(), devSocket(), bench()],
  server: { port: 8080 },
  security: {
    // Fly's proxy terminates TLS, so naming the deploy domain is what lets
    // Astro trust x-forwarded-proto and accept same-origin form POSTs.
    allowedDomains: [{ hostname: "**.fly.dev", protocol: "https" }],
  },
});
