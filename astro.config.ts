import node from "@astrojs/node";
import preact from "@astrojs/preact";
import { defineConfig } from "astro/config";
import devSocket from "./src/net/devSocket.ts";

// Server-rendered output. Standalone mode (not middleware) because its exported
// handler also serves dist/client; server.ts turns off the adapter's own
// listener and mounts that handler beside the WebSocket endpoint. devSocket
// does the same attach in dev.
export default defineConfig({
  output: "server",
  adapter: node({ mode: "standalone" }),
  integrations: [preact(), devSocket()],
  server: { port: 8080 },
  security: {
    // Fly's proxy terminates TLS, so naming the deploy domain is what lets
    // Astro trust x-forwarded-proto and accept same-origin form POSTs.
    allowedDomains: [{ hostname: "**.fly.dev", protocol: "https" }],
  },
});
