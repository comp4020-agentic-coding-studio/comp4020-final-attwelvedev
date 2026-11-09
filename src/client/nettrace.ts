// What the page sent beside what the server last said, as one line for `data-net` on the canvas.
// A spec that sees a figure stall reads it: `ack` stuck below `seq` means inputs are not arriving or
// are dropped; `ack` keeping up with `seq` and `srv` short of `data-self` means the drawn position is
// wrong; `srv` ahead of it, the same. Nothing reads it in play.
export interface Sent {
  count: number; // inputs sent while moving or changing
  seq: number; // the seq of the last one
}

interface ViewBits {
  tick: number;
  ack: number;
  you: { pos?: { x: number; y: number } | null };
}

export function netTrace(sent: Sent, view: ViewBits | null): string {
  const srv = view?.you.pos ? `${view.you.pos.x.toFixed(3)},${view.you.pos.y.toFixed(3)}` : "-";
  return `sent=${sent.count} seq=${sent.seq} ack=${view ? view.ack : "-"} tick=${view ? view.tick : "-"} srv=${srv}`;
}
