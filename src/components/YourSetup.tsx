import type { Setup } from "../net/protocol.ts";

// A person's own answers about real life, as the lobby and /preferences both ask them. Where is
// first: it is the answer most likely to be stale. Each change is reported as it is made.
export function YourSetup({
  setup,
  onChange,
  heading = "Your setup",
}: {
  setup: Setup;
  onChange: (next: Setup) => void;
  heading?: string | null; // null: the page already has a heading for this
}) {
  const set = (patch: Partial<Setup>) => onChange({ ...setup, ...patch });
  const segment = (name: string, label: string, checked: boolean, pick: () => void) => (
    <label class="seg">
      <input type="radio" name={name} checked={checked} onChange={pick} />
      <span>{label}</span>
    </label>
  );
  const check = (label: string, key: "captions" | "earplugs" | "mask") => (
    <label class="tick">
      <input
        type="checkbox"
        checked={setup[key]}
        onChange={(e) => set({ [key]: e.currentTarget.checked })}
      />
      {label}
    </label>
  );
  return (
    <form
      class="setup"
      aria-labelledby={heading ? "setup-title" : undefined}
      onSubmit={(e) => e.preventDefault()}
    >
      {heading && <h2 id="setup-title">{heading}</h2>}
      <fieldset>
        <legend>Where</legend>
        <div class="segmented">
          {segment("where", "In the room", setup.inRoom, () => set({ inRoom: true }))}
          {segment("where", "Remote", !setup.inRoom, () => set({ inRoom: false }))}
        </div>
      </fieldset>
      <fieldset>
        <legend>Headphones</legend>
        <div class="segmented">
          {segment("phones", "Yes", setup.headphones, () => set({ headphones: true }))}
          {segment("phones", "No", !setup.headphones, () => set({ headphones: false }))}
        </div>
      </fieldset>
      {check("Always show captions", "captions")}
      {check("Earplugs or earmuffs", "earplugs")}
      {check("Sleep mask or blindfold", "mask")}
    </form>
  );
}
