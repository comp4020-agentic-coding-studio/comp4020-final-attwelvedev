import qrcode from "qrcode-generator";

// An inline, scalable SVG: the link is drawn on the server, so no image
// request carries the token anywhere and the client needs no QR code.
export function qrSvg(text: string): string {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
}
