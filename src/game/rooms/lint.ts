import type { Room } from "./format.ts";

export interface LintIssue {
  room: string;
  message: string;
}

export function lintRoom(room: Room): LintIssue[] {
  const issues: LintIssue[] = [];
  const issue = (message: string) => issues.push({ room: room.id, message });

  for (let y = 0; y < room.grid.length; y++) {
    if (room.grid[y]?.length !== room.width) {
      issue(
        `grid is not rectangular: row ${y + 1} is ${room.grid[y]?.length} wide, expected ${room.width}`,
      );
    }
  }

  const spawns = room.objects.filter((o) => o.kind === "spawn");
  for (const n of ["1", "2", "3"]) {
    const count = spawns.filter((o) => o.id === `s${n}`).length;
    if (count === 0) issue(`spawn ${n} is missing`);
    if (count > 1) issue(`spawn ${n} appears more than once`);
  }

  const exits = room.objects.filter((o) => o.kind === "exit");
  if (exits.length === 0) issue("room has no exit (E)");

  const plateIds = new Set(room.objects.filter((o) => o.kind === "plate").map((o) => o.id));
  const doors = room.objects.filter((o) => o.kind === "door");
  for (const door of doors) {
    if (!door.opensWhen || door.opensWhen.length === 0) {
      issue(`door ${door.id} has no opensWhen`);
      continue;
    }
    for (const id of door.opensWhen) {
      if (!plateIds.has(id)) issue(`door ${door.id} opensWhen names unknown plate ${id}`);
    }
  }

  // FR10: some beat has a door that needs three plates held at once
  const threePlate = doors.some(
    (d) =>
      new Set(d.opensWhen ?? []).size >= 3 &&
      room.beats.some((b) => d.tiles.some((t) => t.x >= b.x[0] && t.x <= b.x[1])),
  );
  if (!threePlate) issue("no beat has a door that needs three plates (three-plate beat, FR10)");

  // every exit tile must be reachable from every spawn, treating doors as open
  if (exits.length > 0 && spawns.length > 0) {
    for (const spawn of spawns) {
      const start = spawn.tiles[0];
      if (!start) continue;
      const seen = new Set<string>([`${start.x},${start.y}`]);
      const queue = [start];
      while (queue.length > 0) {
        const t = queue.shift() as { x: number; y: number };
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const n = { x: t.x + dx, y: t.y + dy };
          const key = `${n.x},${n.y}`;
          const ch = room.grid[n.y]?.[n.x];
          if (ch === undefined || ch === "#" || seen.has(key)) continue;
          seen.add(key);
          queue.push(n);
        }
      }
      for (const exit of exits) {
        if (exit.tiles.some((t) => !seen.has(`${t.x},${t.y}`))) {
          issue(
            `exit ${exit.id} is not reachable from spawn ${spawn.id.slice(1)} even with every door open`,
          );
          break;
        }
      }
    }
  }
  return issues;
}
