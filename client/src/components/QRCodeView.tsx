import { useEffect, useRef } from "react";
import QRCode from "qrcode";

export default function QRCodeView({ url }: { url: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) {
      QRCode.toCanvas(ref.current, url, { width: 200, margin: 1, color: { dark: "#0B0C11", light: "#ffffff" } });
    }
  }, [url]);
  return (
    <div className="qr-box">
      <canvas ref={ref} />
    </div>
  );
}
