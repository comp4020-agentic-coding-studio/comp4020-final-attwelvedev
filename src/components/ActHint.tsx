// What Space (or the Act button) would do where you stand, in the view's own words (`view.act`):
// "Cut the blue wire" for the sighted, "Cut wire 2" for Can't see. Never phrased here, so it can only
// say what the server says this role perceives. Nothing to do: nothing shown.
export function ActHint({ act }: { act: string | undefined }) {
  if (!act) return null;
  return (
    <p class="act-hint" role="status">
      <kbd>Space</kbd> {act}
    </p>
  );
}
