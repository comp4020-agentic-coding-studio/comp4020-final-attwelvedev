// What the regression run records (FR7) and the report reads.
export interface Finding {
  invariant: string; // "input:move", "frame:unsent-drawn", "room-end:loot", "run:timeout", ...
  room: string;
  role: string;
  width: number;
  tick: number;
  detail: string;
  screenshot: string | null; // path relative to the run directory
  viewJson: string | null;
}

export interface RunSummary {
  run: string; // the run directory's name
  rooms: string[];
  widths: number[];
  findings: Finding[];
  shots: { room: string; file: string }[]; // beat screenshots, relative to the run directory
}
