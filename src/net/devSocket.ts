import type { AstroIntegration } from "astro";

// In `pnpm dev` there is no server.ts, so this attaches the same upgrade
// handler to Vite's HTTP server. Loading it through Vite keeps one upgrade path
// for dev and prod.
export default function devSocket(): AstroIntegration {
  return {
    name: "dev-socket",
    hooks: {
      "astro:server:setup": async ({ server }) => {
        const { handleUpgrade } = (await server.ssrLoadModule(
          "/src/net/attach.ts",
        )) as typeof import("./attach.ts");
        server.httpServer?.on("upgrade", handleUpgrade);
      },
    },
  };
}
