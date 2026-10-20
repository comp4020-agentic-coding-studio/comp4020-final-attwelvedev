import { describe, expect, it } from "vitest";
import { getsOf, sendsOf } from "./reveal.ts";

describe("what a role sends and gets, by wheel page", () => {
  it("Can't see sends talk and faces, and gets talk and clips", () => {
    expect(sendsOf("blind")).toEqual(["talk", "faces"]);
    expect(getsOf("blind")).toEqual(["talk", "clips"]);
  });
  it("Can't hear sends everything and gets faces and marks", () => {
    expect(sendsOf("deaf")).toEqual(["talk", "faces", "clips", "marks"]);
    expect(getsOf("deaf")).toEqual(["faces", "marks"]);
  });
  it("Can't speak sends clips, faces and marks and gets everything", () => {
    expect(sendsOf("mute")).toEqual(["faces", "clips", "marks"]);
    expect(getsOf("mute")).toEqual(["talk", "faces", "clips", "marks"]);
  });
});

import type { CrewMember } from "../net/protocol.ts";
import { crewRows, readyStatus, receiverNames, swapPrompt } from "./reveal.ts";

const crew: CrewMember[] = [
  { seat: 0, nickname: "Ana", role: "blind", bot: false },
  { seat: 1, nickname: "Bo", role: "deaf", bot: false },
  { seat: 2, nickname: "Cy", role: "mute", bot: false },
];

describe("receiverNames", () => {
  it("names who hears each of Can't see's pages, by name", () => {
    // Can't see sends talk: Can't hear can't get it, Can't speak can
    expect(receiverNames("talk", crew, 0)).toEqual({ hear: ["Cy"], cant: ["Bo"] });
    // faces: Can't hear sees them, Can't speak sees them
    expect(receiverNames("faces", crew, 0)).toEqual({ hear: ["Bo", "Cy"], cant: [] });
  });
});

describe("crewRows: watchers", () => {
  it("lists a spectator after those sitting out, watching, with no role and not swappable state", () => {
    const rows = crewRows({
      crew,
      ready: [],
      sittingOut: ["Di"],
      played: {},
      me: 0,
      watching: ["Wes"],
    });
    expect(rows.map((r) => r.name)).toEqual(["Ana", "Bo", "Cy", "Di", "Wes"]);
    expect(rows[4]).toMatchObject({ role: null, watching: true, ready: false, left: false });
    expect(rows[3]?.watching).toBeUndefined();
  });
});

describe("crewRows", () => {
  it("lists the crew then those sitting out, with ready, bot and left states and roles played", () => {
    const rows = crewRows({
      crew: [
        { ...crew[0], left: true } as CrewMember,
        crew[1] as CrewMember,
        { ...crew[2], bot: true } as CrewMember,
      ],
      ready: [1, 2], // the server counts a bot as ready
      sittingOut: ["Di"],
      played: { Ana: ["blind"], Bo: [], Cy: ["mute", "deaf"], Di: ["deaf"] },
      me: 1,
    });
    expect(rows).toEqual([
      {
        key: "seat0",
        name: "Ana",
        role: "blind",
        ready: false,
        bot: false,
        left: true,
        you: false,
        played: ["blind"],
      },
      {
        key: "seat1",
        name: "Bo",
        role: "deaf",
        ready: true,
        bot: false,
        left: false,
        you: true,
        played: [],
      },
      {
        key: "seat2",
        name: "Cy",
        role: "mute",
        ready: true,
        bot: true,
        left: false,
        you: false,
        played: ["mute", "deaf"],
      },
      {
        key: "out:Di",
        name: "Di",
        role: null,
        ready: false,
        bot: false,
        left: false,
        you: false,
        played: ["deaf"],
      },
    ]);
  });
});

describe("swapPrompt", () => {
  it("says the swap resets everyone to not ready", () => {
    expect(swapPrompt("Ana", "Bo")).toBe("Swap Ana and Bo? Swapping resets everyone to not ready.");
  });
});

describe("readyStatus", () => {
  it("before you press: just the count", () => {
    expect(readyStatus({ you: false, ready: 0, total: 3 })).toEqual({
      text: "0 of 3 ready",
      waiting: false,
    });
    expect(readyStatus({ you: false, ready: 2, total: 3 })).toEqual({
      text: "2 of 3 ready",
      waiting: false,
    });
  });
  it("after you press: says you are ready and waiting, with the count", () => {
    expect(readyStatus({ you: true, ready: 1, total: 3 })).toEqual({
      text: "You're ready. Waiting for the others · 1 of 3",
      waiting: true,
    });
  });
  it("is not waiting once everyone is ready", () => {
    expect(readyStatus({ you: true, ready: 3, total: 3 })).toEqual({
      text: "Everyone is ready",
      waiting: false,
    });
  });
});
