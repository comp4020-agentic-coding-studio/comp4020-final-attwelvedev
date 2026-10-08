// Who set a value and how long ago ("Sam's estimate, 2 h ago"), "Guessed" if no
// one has, and "Saving…" while a write is on its way.
export function EstimateAttribution({ text, saving }: { text: string; saving: boolean }) {
  return <p class="attribution">{saving ? "Saving…" : text}</p>;
}
