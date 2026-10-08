// Production entry (Node type stripping): the Astro handler for pages, plus
// the WebSocket endpoint at /ws. See ADR 0007.
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { attachSockets } from "./src/net/attach.ts";

// The adapter's entry starts its own listener on import unless told not to;
// we want only its handler (pages and static assets) on our server.
process.env.ASTRO_NODE_AUTOSTART = "disabled";

// Imported by a variable path so `pnpm typecheck` passes before the first
// build (CI typechecks on a checkout that has no dist/ yet).
const entry = "./dist/server/entry.mjs";
const { handler } = (await import(entry)) as {
  handler: (req: IncomingMessage, res: ServerResponse) => void;
};

const server = createServer((req, res) => handler(req, res));
attachSockets(server);
server.listen(Number(process.env.PORT ?? 8080), process.env.HOST ?? "0.0.0.0");
