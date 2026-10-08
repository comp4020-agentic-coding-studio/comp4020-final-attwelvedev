// A QR code as an inline SVG drawn from the design tokens: dark modules on the
// paper token, with a 4-module quiet zone so phone cameras can read it.
export async function qrSvg(text: string): Promise<string> {
  const { default: qrcode } = await import("qrcode-generator");
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const quiet = 4;
  let path = "";
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      if (qr.isDark(row, col)) path += `M${col + quiet} ${row + quiet}h1v1h-1z`;
    }
  }
  const size = n + quiet * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges" aria-hidden="true" focusable="false"><rect width="${size}" height="${size}" fill="var(--paper)"/><path d="${path}" fill="var(--ink)"/></svg>`;
}
