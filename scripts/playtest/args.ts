// The flags of `pnpm playtest` (FR8), parsed apart from the run so they can be tested.
export type Width = 375 | 1280;
export type Widths = [Width, Width, Width];

export interface Args {
  rooms: string[] | "all"; // room ids; "all" is every room in ./rooms
  widths: Widths; // by seat
  rotations: 1 | 2 | 3;
}

export const MIXED: Widths = [1280, 375, 1280]; // as spec/playUi.ts playRoom seats them

export function parseArgs(argv: string[], available: string[]): Args {
  const out: Args = { rooms: "all", widths: [...MIXED], rotations: 1 };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === "--room") {
      const id = available.find((r) => r.startsWith(`${value}-`));
      if (!id) throw new Error(`--room ${value}: no such room. Rooms: ${available.join(", ")}`);
      out.rooms = [id];
      i++;
    } else if (flag === "--width") {
      if (value !== "1280" && value !== "375") throw new Error("--width takes 1280 or 375");
      const w = Number(value) as Width;
      out.widths = [w, w, w];
      i++;
    } else if (flag === "--rotations") {
      if (value !== "all") throw new Error('--rotations takes "all"');
      out.rotations = 3;
      i++;
    } else {
      throw new Error(`unknown flag ${flag}. Flags: --room NN, --width 1280|375, --rotations all`);
    }
  }
  return out;
}

// The table for rotation r: the phone sits at seat r, so over three rotations it plays every role.
// A table of one width is the same every time.
export function rotatedWidths(widths: Widths, r: number): Widths {
  if (widths.every((w) => w === widths[0])) return widths;
  return [0, 1, 2].map((s) => (s === r ? 375 : 1280)) as Widths;
}
