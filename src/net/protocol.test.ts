import { describe, expect, it } from "vitest";
import { parseClientMsg, type ServerMsg } from "./protocol.ts";

describe("parseClientMsg", () => {
  it("returns the message for a ping", () => {
    expect(parseClientMsg('{"t":"ping","at":1}')).toEqual({ t: "ping", at: 1 });
  });

  it.each([
    ["non-JSON", "not json"],
    ["a JSON string", '"ping"'],
    ["a JSON number", "7"],
    ["null", "null"],
    ["an array", '[{"t":"ping","at":1}]'],
    ["an unknown t", '{"t":"nope"}'],
    ["a missing t", '{"at":1}'],
    ["a ping without a numeric at", '{"t":"ping","at":"1"}'],
  ])("returns null for %s", (_name, raw) => {
    expect(parseClientMsg(raw)).toBeNull();
  });

  it("returns null for a frame over 8 KB even when it is valid", () => {
    const raw = JSON.stringify({ t: "ping", at: 1, pad: "x".repeat(8 * 1024) });
    expect(raw.length).toBeGreaterThan(8 * 1024);
    expect(parseClientMsg(raw)).toBeNull();
  });
});

describe("parseClientMsg lobby messages", () => {
  it("accepts the lobby messages with well-typed bodies", () => {
    expect(parseClientMsg('{"t":"lobbies.watch"}')).toEqual({ t: "lobbies.watch" });
    expect(parseClientMsg('{"t":"lobby.create","nickname":"Ana"}')).toEqual({
      t: "lobby.create",
      nickname: "Ana",
    });
    expect(
      parseClientMsg('{"t":"lobby.join","code":"KMQZ","nickname":"Bo","as":"spectator"}'),
    ).toEqual({ t: "lobby.join", code: "KMQZ", nickname: "Bo", as: "spectator" });
    expect(parseClientMsg('{"t":"lobby.leave"}')).toEqual({ t: "lobby.leave" });
    expect(parseClientMsg('{"t":"lobby.team","name":"Owls"}')).toEqual({
      t: "lobby.team",
      name: "Owls",
    });
    const setup = {
      headphones: false,
      inRoom: true,
      captions: false,
      earplugs: true,
      mask: false,
      done: true,
    };
    expect(parseClientMsg(JSON.stringify({ t: "lobby.setup", setup }))).toEqual({
      t: "lobby.setup",
      setup,
    });
  });

  it.each([
    '{"t":"lobby.create"}',
    '{"t":"lobby.create","nickname":5}',
    '{"t":"lobby.join","code":"KMQZ","nickname":"Bo"}',
    '{"t":"lobby.join","code":"KMQZ","nickname":"Bo","as":"boss"}',
    '{"t":"lobby.team","name":null}',
    '{"t":"lobby.setup"}',
    '{"t":"lobby.setup","setup":{"inRoom":true}}',
    '{"t":"lobby.setup","setup":"nope"}',
    '{"t":"lobby.setup","setup":{"headphones":1,"inRoom":true,"captions":false,"earplugs":false,"mask":false,"done":true}}',
    '{"t":"lobby.settings","settings":{"inPerson":true,"maskNoise":true,"othersSoundOff":false,"voice":false}}',
  ])("rejects %s", (raw) => {
    expect(parseClientMsg(raw)).toBeNull();
  });
});

describe("parseClientMsg game messages", () => {
  it("accepts start, ready and a well-typed input", () => {
    expect(parseClientMsg('{"t":"lobby.start"}')).toEqual({ t: "lobby.start" });
    expect(parseClientMsg('{"t":"ready"}')).toEqual({ t: "ready" });
    expect(parseClientMsg('{"t":"ready","on":false}')).toEqual({ t: "ready", on: false });
    expect(parseClientMsg('{"t":"ready","on":true}')).toEqual({ t: "ready", on: true });
    expect(parseClientMsg('{"t":"ready","on":"no"}')).toBeNull();
    expect(parseClientMsg('{"t":"next"}')).toEqual({ t: "next" });
    expect(parseClientMsg('{"t":"input","seq":3,"move":{"x":1,"y":-0.5},"act":true}')).toEqual({
      t: "input",
      seq: 3,
      move: { x: 1, y: -0.5 },
      act: true,
    });
  });

  it("clamps move components to [-1, 1]", () => {
    expect(parseClientMsg('{"t":"input","seq":1,"move":{"x":9,"y":-9},"act":false}')).toEqual({
      t: "input",
      seq: 1,
      move: { x: 1, y: -1 },
      act: false,
    });
  });

  it.each([
    ["a missing move", '{"t":"input","seq":1,"act":false}'],
    ["a string seq", '{"t":"input","seq":"1","move":{"x":0,"y":0},"act":false}'],
    ["a negative seq", '{"t":"input","seq":-1,"move":{"x":0,"y":0},"act":false}'],
    ["a non-boolean act", '{"t":"input","seq":1,"move":{"x":0,"y":0},"act":1}'],
    ["a non-numeric move", '{"t":"input","seq":1,"move":{"x":"1","y":0},"act":false}'],
  ])("returns null for an input with %s", (_name, raw) => {
    expect(parseClientMsg(raw)).toBeNull();
  });
});

describe("parseClientMsg: send", () => {
  const send = (msg: unknown) => parseClientMsg(JSON.stringify({ t: "send", msg }));

  it("parses a callout, text, a clip, a face and a mark", () => {
    for (const msg of [
      { method: "callout", callout: "left" },
      { method: "text", text: "door is east" },
      { method: "clip", clip: "airhorn" },
      { method: "face", id: "f07" },
      { method: "mark", id: "key", at: { x: 3.5, y: 4.5 } },
    ]) {
      expect(send(msg)).toEqual({ t: "send", msg });
    }
  });

  it.each([
    ["an unknown method", { method: "shout", text: "x" }],
    ["voice, which is a binary stream", { method: "voice" }],
    ["an unknown callout", { method: "callout", callout: "dance" }],
    ["non-string text", { method: "text", text: 5 }],
    ["a non-string clip", { method: "clip", clip: 3 }],
    ["a clip id with a path in it", { method: "clip", clip: "../x" }],
    ["a clip that is not on the soundboard", { method: "clip", clip: "not-a-clip" }],
    ["a face out of range", { method: "face", id: "f13" }],
    ["a face not an id", { method: "face", id: "smile" }],
    ["an unknown mark", { method: "mark", id: "skull", at: { x: 1, y: 1 } }],
    ["a mark with no position", { method: "mark", id: "x" }],
    ["a mark with a non-numeric position", { method: "mark", id: "x", at: { x: "1", y: 1 } }],
    ["a mark at infinity", { method: "mark", id: "x", at: { x: Number.POSITIVE_INFINITY, y: 1 } }],
  ])("returns null for %s", (_name, msg) => {
    expect(send(msg)).toBeNull();
  });

  it("returns null for a send with no msg", () => {
    expect(parseClientMsg('{"t":"send"}')).toBeNull();
  });

  it.each(["say", "sound", "show"])("no longer accepts %s", (t) => {
    expect(parseClientMsg(JSON.stringify({ t, kind: "callout", callout: "go" }))).toBeNull();
    expect(parseClientMsg(JSON.stringify({ t, clip: "airhorn" }))).toBeNull();
  });
});

describe("parseClientMsg: host.choice", () => {
  it("accepts a bot or the lobby", () => {
    expect(parseClientMsg('{"t":"host.choice","choice":"bot"}')).toEqual({
      t: "host.choice",
      choice: "bot",
    });
    expect(parseClientMsg('{"t":"host.choice","choice":"lobby"}')).toEqual({
      t: "host.choice",
      choice: "lobby",
    });
  });

  it("accepts pulling in a sitting-out person, by their index in the lobby", () => {
    expect(parseClientMsg('{"t":"host.choice","choice":"pull","person":3}')).toEqual({
      t: "host.choice",
      choice: "pull",
      person: 3,
    });
  });

  it("drops anything else", () => {
    expect(parseClientMsg('{"t":"host.choice","choice":"pull","person":-4}')).toEqual({
      t: "host.choice",
      choice: "pull",
      person: -4, // a watcher: -4 - n for the nth
    });
    expect(parseClientMsg('{"t":"host.choice","choice":"pull","person":-65}')).toBeNull();
    expect(parseClientMsg('{"t":"host.choice","choice":"pull","person":-2}')).toBeNull(); // a bot
    expect(parseClientMsg('{"t":"host.choice","choice":"wait"}')).toBeNull();
    expect(parseClientMsg('{"t":"host.choice"}')).toBeNull();
    expect(parseClientMsg('{"t":"host.choice","choice":"pull"}')).toBeNull(); // pull whom?
    expect(parseClientMsg('{"t":"host.choice","choice":"pull","person":"3"}')).toBeNull();
    expect(parseClientMsg('{"t":"host.choice","choice":"pull","person":-1}')).toBeNull();
    expect(parseClientMsg('{"t":"host.choice","choice":"pull","person":1.5}')).toBeNull();
  });
});

describe("parseClientMsg: spectate", () => {
  it("accepts a seat 0, 1 or 2", () => {
    for (const seat of [0, 1, 2]) {
      expect(parseClientMsg(`{"t":"spectate","seat":${seat}}`)).toEqual({ t: "spectate", seat });
    }
  });

  it("accepts null: the whole room, following nobody", () => {
    expect(parseClientMsg('{"t":"spectate","seat":null}')).toEqual({ t: "spectate", seat: null });
  });

  it("drops anything else", () => {
    expect(parseClientMsg('{"t":"spectate","seat":3}')).toBeNull();
    expect(parseClientMsg('{"t":"spectate","seat":"0"}')).toBeNull();
    expect(parseClientMsg('{"t":"spectate"}')).toBeNull();
  });
});

describe("parseClientMsg: bye", () => {
  it("accepts a bye: a page saying it is going away", () => {
    expect(parseClientMsg('{"t":"bye"}')).toEqual({ t: "bye" });
  });
});

describe("parseClientMsg: lobby.nickname, lobby.private and lobby.order", () => {
  it("accepts a well-typed body of each", () => {
    expect(parseClientMsg('{"t":"lobby.nickname","nickname":"Ana"}')).toEqual({
      t: "lobby.nickname",
      nickname: "Ana",
    });
    expect(parseClientMsg('{"t":"lobby.private","on":true}')).toEqual({
      t: "lobby.private",
      on: true,
    });
    expect(parseClientMsg('{"t":"lobby.order","order":[2,0,1]}')).toEqual({
      t: "lobby.order",
      order: [2, 0, 1],
    });
  });

  it.each([
    '{"t":"lobby.nickname"}',
    '{"t":"lobby.nickname","nickname":5}',
    '{"t":"lobby.private"}',
    '{"t":"lobby.private","on":"yes"}',
    '{"t":"lobby.order"}',
    '{"t":"lobby.order","order":"0,1"}',
    '{"t":"lobby.order","order":[0,"1"]}',
    '{"t":"lobby.order","order":[0,1.5]}',
    '{"t":"lobby.order","order":[0,1,2,3,4,5,6]}',
  ])("drops %s", (raw) => {
    expect(parseClientMsg(raw)).toBeNull();
  });
});

describe("parseClientMsg: crew.swap", () => {
  it("accepts a bot as -1 - seat", () => {
    expect(parseClientMsg('{"t":"crew.swap","a":-3,"b":1}')).toEqual({
      t: "crew.swap",
      a: -3,
      b: 1,
    });
  });

  it("accepts two person indexes", () => {
    expect(parseClientMsg('{"t":"crew.swap","a":0,"b":4}')).toEqual({ t: "crew.swap", a: 0, b: 4 });
  });

  it.each([
    '{"t":"crew.swap"}',
    '{"t":"crew.swap","a":0}',
    '{"t":"crew.swap","a":"0","b":1}',
    '{"t":"crew.swap","a":0.5,"b":1}',
    '{"t":"crew.swap","a":-65,"b":1}',
  ])("drops %s", (raw) => {
    expect(parseClientMsg(raw)).toBeNull();
  });
});

describe("parseClientMsg: votes", () => {
  it("accepts a proposal of a room or a heist restart, and an answer", () => {
    expect(parseClientMsg('{"t":"vote.propose","kind":"room"}')).toEqual({
      t: "vote.propose",
      kind: "room",
    });
    expect(parseClientMsg('{"t":"vote.propose","kind":"heist"}')).toEqual({
      t: "vote.propose",
      kind: "heist",
    });
    expect(parseClientMsg('{"t":"vote.cast","yes":false}')).toEqual({ t: "vote.cast", yes: false });
  });

  it.each([
    '{"t":"vote.propose"}',
    '{"t":"vote.propose","kind":"lobby"}',
    '{"t":"vote.cast"}',
    '{"t":"vote.cast","yes":"yes"}',
  ])("drops %s", (raw) => {
    expect(parseClientMsg(raw)).toBeNull();
  });

  it("no longer parses room.restart: a restart is a vote now", () => {
    expect(parseClientMsg('{"t":"room.restart"}')).toBeNull();
  });
});

describe("parseClientMsg: spec.say", () => {
  it("accepts text", () => {
    expect(parseClientMsg('{"t":"spec.say","text":"nice"}')).toEqual({
      t: "spec.say",
      text: "nice",
    });
  });

  it.each(['{"t":"spec.say"}', '{"t":"spec.say","text":5}', '{"t":"spec.say","text":null}'])(
    "drops %s",
    (raw) => {
      expect(parseClientMsg(raw)).toBeNull();
    },
  );
});

describe("the reveal's server messages", () => {
  it("ready names the seats that pressed I'm ready, and survives the wire", () => {
    const m: ServerMsg = { t: "ready", seats: [0, 2] };
    expect(JSON.parse(JSON.stringify(m))).toEqual({ t: "ready", seats: [0, 2] });
  });

  it("reveal carries the sounds to learn, so Can't see's briefing needs no room data on the client", () => {
    const m: Extract<ServerMsg, { t: "reveal" }>["cues"] = ["hum", "door"];
    expect(m).toEqual(["hum", "door"]);
  });
});
