import { useState } from "preact/hooks";

// Your private side job (phase 05 fills it): a chip with the job, ticked when done. On a phone the
// chip is short, and a tap shows the whole line.
export function SideJob({ job }: { job: { id: string; text: string; done: boolean } | undefined }) {
  const [open, setOpen] = useState(false);
  if (!job) return null;
  return (
    <button
      type="button"
      class={job.done ? "side-job is-done" : "side-job"}
      aria-expanded={open}
      onClick={() => setOpen(!open)}
    >
      <span class="side-job-label">Side job{job.done ? ", done" : ""}</span>
      <span class={open ? "side-job-text is-open" : "side-job-text"}>{job.text}</span>
    </button>
  );
}
