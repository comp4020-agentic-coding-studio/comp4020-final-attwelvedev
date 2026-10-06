const FOUR_HUNDRED_DAYS = 400 * 24 * 60 * 60;

// Fly's proxy terminates TLS, so https shows up as a forwarded header there.
export function deviceCookieOptions(url: URL, forwardedProto: string | null) {
  return {
    httpOnly: true as const,
    sameSite: "lax" as const,
    secure: url.protocol === "https:" || forwardedProto === "https",
    path: "/" as const,
    maxAge: FOUR_HUNDRED_DAYS,
  };
}
