import { describe, expect, inject, it } from "vitest";
import { clearRoomOne } from "./heistPlay.ts";
import { text } from "./http.ts";
import { closeAll, ready, startedGame } from "./play.ts";

const baseUrl = inject("baseUrl");

describe("the leaderboard", () => {
  it("answers 200 with a tab for the full heist and each room", async () => {
    const res = await fetch(new URL("/leaderboard", baseUrl));
    expect(res.status).toBe(200);
    const body = text(await res.text());
    expect(body).toContain("Full heist");
    expect(body).toContain("Room 1");
    expect(body).toContain("Room 2");
    expect(body).toContain("Room 3");
  });

  it("shows the empty state for a board nothing has been saved to yet", async () => {
    // nothing in this suite plays a heist through to its third room, so the
    // full-heist board stays empty however many room runs other specs save
    const res = await fetch(new URL("/leaderboard?tab=heist", baseUrl));
    const body = text(await res.text());
    expect(body).toContain("No runs yet. Be first.");
  });

  it("selects a tab from `?tab=` alone, without scripts", async () => {
    const res = await fetch(new URL("/leaderboard?tab=room-2", baseUrl));
    const dom = await res.text();
    expect(dom).toMatch(/href="\/leaderboard\?tab=room-2"[^>]*aria-current="page"/);
  });

  it("lists a real run once a room is cleared, with its team and crew, never a device hash", async () => {
    const { players, code } = await startedGame(baseUrl);
    ready(players);
    const cleared = await clearRoomOne(players);
    expect(cleared.room).toBe("01-loading-dock");
    await closeAll(players);

    const res = await fetch(new URL("/leaderboard?tab=room-1", baseUrl));
    const raw = await res.text();
    const body = text(raw);
    expect(body).toContain(`Team ${code}`);
    expect(body).toContain("Ana");
    expect(body).toContain("Bo");
    expect(body).toContain("Cy");
    expect(raw).not.toMatch(/\b[0-9a-f]{8}\b/);
  });
});
