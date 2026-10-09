import { describe, expect, inject, it } from "vitest";
import type { LobbySettings, LobbyState } from "../src/net/protocol.ts";
import { connect, type Socket } from "./ws.ts";

const baseUrl = inject("baseUrl");

interface LobbyMsg {
  lobby: LobbyState;
}

describe("the host's settings reach every open session", () => {
  it("reaches all three sockets within 1 s", async () => {
    const cookies = await Promise.all(
      [0, 1, 2].map(async () => {
        const res = await fetch(new URL("/", baseUrl));
        return res.headers.getSetCookie()[0]?.split(";")[0] ?? "";
      }),
    );
    const sockets = (await Promise.all(cookies.map((c) => connect(baseUrl, c)))) as [
      Socket,
      Socket,
      Socket,
    ];
    const [host, b, c] = sockets;
    host.send({ t: "lobby.create", nickname: "Ana" });
    const { lobby } = await host.next<LobbyMsg>("lobby");
    for (const [s, name] of [
      [b, "Bo"],
      [c, "Cy"],
    ] as const) {
      s.send({ t: "lobby.join", code: lobby.code, nickname: name, as: "player" });
      await s.next("lobby");
    }

    const settings: LobbySettings = {
      inPerson: true,
      maskNoise: true,
      othersSoundOff: true,
      voice: false,
    };
    // each socket may still have an older `lobby` (another seat's join) queued
    // ahead of the one carrying these settings, so take the first that matches
    const waitForSettings = async (s: Socket): Promise<void> => {
      const deadline = Date.now() + 1000;
      for (;;) {
        const left = deadline - Date.now();
        if (left <= 0) throw new Error("settings never arrived within 1 s");
        const got = await s.next<LobbyMsg>("lobby", left);
        if (JSON.stringify(got.lobby.settings) === JSON.stringify(settings)) return;
      }
    };
    const start = Date.now();
    host.send({ t: "lobby.settings", settings });
    await Promise.all(sockets.map(waitForSettings));
    expect(Date.now() - start).toBeLessThan(1000);

    await Promise.all(sockets.map((s) => s.close()));
  });

  it("a non-host lobby.settings is refused with not-host", async () => {
    const cookies = await Promise.all(
      [0, 1].map(async () => {
        const res = await fetch(new URL("/", baseUrl));
        return res.headers.getSetCookie()[0]?.split(";")[0] ?? "";
      }),
    );
    const [host, guest] = (await Promise.all(cookies.map((c) => connect(baseUrl, c)))) as [
      Socket,
      Socket,
    ];
    host.send({ t: "lobby.create", nickname: "Ana" });
    const { lobby } = await host.next<LobbyMsg>("lobby");
    guest.send({ t: "lobby.join", code: lobby.code, nickname: "Bo", as: "player" });
    await guest.next("lobby");

    guest.send({
      t: "lobby.settings",
      settings: { inPerson: true, maskNoise: false, othersSoundOff: false, voice: false },
    });
    const err = await guest.next<{ code: string }>("error");
    expect(err.code).toBe("not-host");

    await Promise.all([host, guest].map((s) => s.close()));
  });
});
