import { type ChildProcess, execSync, spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

// A throwaway app for the run: the autopilot flag on (ADR 0027), its own port, database and, when
// asked, only some rooms. Never the shared app.
export interface PlaytestServer {
  url: string;
  stop(): Promise<void>;
}

const freePort = (): Promise<number> =>
  new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const port = (probe.address() as { port: number }).port;
      probe.close(() => resolve(port));
    });
  });

export async function startServer(options: { rooms?: string[] } = {}): Promise<PlaytestServer> {
  if (!existsSync("dist/server/entry.mjs")) execSync("pnpm build", { stdio: "inherit" });
  const dir = mkdtempSync(join(tmpdir(), "playtest-"));
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PORT: String(await freePort()),
    DATABASE_PATH: join(dir, "app.db"),
    PLAYTEST_AUTOPILOT: "1",
  };
  delete env.FLY_APP_NAME;
  if (options.rooms) {
    const roomsDir = join(dir, "rooms");
    mkdirSync(roomsDir);
    for (const id of options.rooms) {
      const file = readdirSync("rooms").find((f) => f === `${id}.room`);
      if (!file) throw new Error(`no room file for ${id}`);
      copyFileSync(join("rooms", file), join(roomsDir, file));
    }
    env.ROOMS_DIR = roomsDir;
  }
  const url = `http://127.0.0.1:${env.PORT}`;
  const app: ChildProcess = spawn("node", ["server.ts"], {
    env,
    stdio: "ignore",
  });
  const stop = async (): Promise<void> => {
    app.kill();
    rmSync(dir, { recursive: true, force: true });
  };
  for (let attempt = 0; attempt < 150; attempt++) {
    if (app.exitCode !== null) throw new Error("the playtest server exited before it came up");
    try {
      await fetch(url);
      return { url, stop };
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  await stop();
  throw new Error(`the playtest server never came up on ${url}`);
}
