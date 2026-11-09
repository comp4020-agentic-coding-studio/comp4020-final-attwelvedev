// The start of a room (FR14): once all three are ready the server holds its first tick this long
// while every client plays the staged start. Pure, so the server (the hold) and the client (the
// timeline) share one number.
export const INTRO = { hold: 300, tilt: 900, swoop: 900, land: 300 } as const;
export const INTRO_TOTAL = INTRO.hold + INTRO.tilt + INTRO.swoop + INTRO.land; // 2400
