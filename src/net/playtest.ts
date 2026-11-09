// The playtest seam (ADR 0027): with PLAYTEST_AUTOPILOT=1 a person's seat can be handed to a bot,
// so the regression run (`pnpm playtest`) can drive all three seats. The deployed app never has it:
// server.ts refuses to start on a Fly machine with the flag set.
export const PLAYTEST_AUTOPILOT: boolean = process.env.PLAYTEST_AUTOPILOT === "1";

// The message to exit with when the flag is set on a Fly machine (FLY_APP_NAME), else null.
export function refuseOnFly(env: NodeJS.ProcessEnv): string | null {
  return env.PLAYTEST_AUTOPILOT === "1" &&
    typeof env.FLY_APP_NAME === "string" &&
    env.FLY_APP_NAME !== ""
    ? "PLAYTEST_AUTOPILOT is set on a Fly machine (FLY_APP_NAME). It is for local playtests only; refusing to start."
    : null;
}
