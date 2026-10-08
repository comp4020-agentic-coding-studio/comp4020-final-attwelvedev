import { createHash } from "node:crypto";
import { describe, expect, inject, it } from "vitest";
import WebSocket from "ws";
import { connect, wsUrl } from "./ws.ts";

const baseUrl = inject("baseUrl");

describe("the /ws endpoint", () => {
  it("refuses an upgrade without the device cookie", async () => {
    const status = await new Promise<number>((resolve, reject) => {
      const socket = new WebSocket(wsUrl(baseUrl));
      socket.once("open", () => reject(new Error("upgrade was accepted")));
      socket.once("unexpected-response", (_req, res) => resolve(res.statusCode ?? 0));
      socket.once("error", reject);
    });
    expect(status).toBe(401);
  });

  it("welcomes a connection that has a cookie with 8 hex who, the same as the request log's", async () => {
    const res = await fetch(new URL("/", baseUrl));
    const pair = res.headers.getSetCookie()[0]?.split(";")[0] ?? "";
    const token = decodeURIComponent(pair.split("=")[1] ?? "");
    const socket = await connect(baseUrl, pair);
    const welcome = await socket.next<{ t: string; who: string }>("welcome");
    expect(welcome.who).toMatch(/^[0-9a-f]{8}$/);
    expect(welcome.who).toBe(createHash("sha256").update(token).digest("hex").slice(0, 8));
    await socket.close();
  });

  it("answers ping with pong carrying the same at within 1 s", async () => {
    const socket = await connect(baseUrl);
    const sent = Date.now();
    socket.send({ t: "ping", at: 12345 });
    const pong = await socket.next<{ t: string; at: number }>("pong", 1000);
    expect(pong.at).toBe(12345);
    expect(Date.now() - sent).toBeLessThan(1000);
    await socket.close();
  });

  it("keeps the socket open after a malformed frame", async () => {
    const socket = await connect(baseUrl);
    socket.send("this is not an object");
    socket.send({ t: "no-such-message" });
    socket.send({ t: "ping", at: 7 });
    const pong = await socket.next<{ t: string; at: number }>("pong");
    expect(pong.at).toBe(7);
    await socket.close();
  });
});
