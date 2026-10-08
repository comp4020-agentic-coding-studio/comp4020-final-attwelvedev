// One request in flight per key, and a newer value replaces the one waiting, so
// pressing + five times sends one or two requests, in order, instead of five
// racing. Time and the network are the caller's: `send` is any async function,
// and one that fails neither blocks the next nor makes `run` reject (the
// caller's own send already handles its failure).
interface Waiting {
  send(): Promise<void>;
  resolve(): void;
}

export function createWriteQueue() {
  const slots = new Map<string, { waiting?: Waiting }>();

  async function drain(key: string, slot: { waiting?: Waiting }, first: Waiting) {
    let job: Waiting | undefined = first;
    while (job) {
      try {
        await job.send();
      } catch {
        // the send reports its own failure
      }
      job.resolve();
      job = slot.waiting;
      slot.waiting = undefined;
    }
    slots.delete(key);
  }

  return {
    run(key: string, send: () => Promise<void>): Promise<void> {
      return new Promise<void>((resolve) => {
        const job = { send, resolve };
        const slot = slots.get(key);
        if (slot) {
          // superseded: it will never send, so whoever waits on it is released
          slot.waiting?.resolve();
          slot.waiting = job;
          return;
        }
        const fresh: { waiting?: Waiting } = {};
        slots.set(key, fresh);
        void drain(key, fresh, job);
      });
    },
  };
}
