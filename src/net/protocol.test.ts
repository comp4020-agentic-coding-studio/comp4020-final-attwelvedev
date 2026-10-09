import { describe, expect, it } from "vitest";
import { parseClientMsg } from "./protocol.ts";

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
  });

  it.each([
    '{"t":"lobby.create"}',
    '{"t":"lobby.create","nickname":5}',
    '{"t":"lobby.join","code":"KMQZ","nickname":"Bo"}',
    '{"t":"lobby.join","code":"KMQZ","nickname":"Bo","as":"boss"}',
    '{"t":"lobby.team","name":null}',
  ])("rejects %s", (raw) => {
    expect(parseClientMsg(raw)).toBeNull();
  });
});

describe("parseClientMsg game messages", () => {
  it("accepts start, ready and a well-typed input", () => {
    expect(parseClientMsg('{"t":"lobby.start"}')).toEqual({ t: "lobby.start" });
    expect(parseClientMsg('{"t":"ready"}')).toEqual({ t: "ready" });
    expect(parseClientMsg('{"t":"room.restart"}')).toEqual({ t: "room.restart" });
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

describe("parseClientMsg: channels", () => {
  it("parses a callout, text, a sound, a face and a stamp", () => {
    expect(parseClientMsg('{"t":"say","kind":"callout","callout":"left"}')).toEqual({
      t: "say",
      kind: "callout",
      callout: "left",
    });
    expect(parseClientMsg('{"t":"say","kind":"text","text":"door is east"}')).toEqual({
      t: "say",
      kind: "text",
      text: "door is east",
    });
    expect(parseClientMsg('{"t":"sound","clip":"airhorn"}')).toEqual({
      t: "sound",
      clip: "airhorn",
    });
    expect(parseClientMsg('{"t":"show","kind":"face","id":"f07"}')).toEqual({
      t: "show",
      kind: "face",
      id: "f07",
    });
    expect(parseClientMsg('{"t":"show","kind":"stamp","id":"key"}')).toEqual({
      t: "show",
      kind: "stamp",
      id: "key",
    });
  });

  it.each([
    ["an unknown callout", '{"t":"say","kind":"callout","callout":"dance"}'],
    ["non-string text", '{"t":"say","kind":"text","text":5}'],
    ["an unknown say kind", '{"t":"say","kind":"shout","text":"x"}'],
    ["a non-string clip", '{"t":"sound","clip":3}'],
    ["a clip id with a path in it", '{"t":"sound","clip":"../x"}'],
    ["a well-formed clip that is not on the soundboard", '{"t":"sound","clip":"not-a-clip"}'],
    ["a face out of range", '{"t":"show","kind":"face","id":"f13"}'],
    ["a face not an id", '{"t":"show","kind":"face","id":"smile"}'],
    ["an unknown stamp", '{"t":"show","kind":"stamp","id":"skull"}'],
  ])("returns null for %s", (_name, raw) => {
    expect(parseClientMsg(raw)).toBeNull();
  });

  it("never reads a stamp position from the client", () => {
    const raw = '{"t":"show","kind":"stamp","id":"x","at":{"x":1,"y":1}}';
    expect(parseClientMsg(raw)).toEqual({ t: "show", kind: "stamp", id: "x" });
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

  it("drops anything else", () => {
    expect(parseClientMsg('{"t":"host.choice","choice":"wait"}')).toBeNull();
    expect(parseClientMsg('{"t":"host.choice"}')).toBeNull();
  });
});
