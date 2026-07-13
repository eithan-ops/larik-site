/**
 * סורק QR בתוך האפליקציה — מצלמה אחורית + BarcodeDetector (מובנה בדפדפן),
 * עם נפילה חכמה ל-jsQR בדפדפנים בלי תמיכה (ספריה קטנה, נטענת רק בצורך).
 */
import { useEffect, useRef, useState } from "react";

export default function QRScanner({ onScan, onClose }: {
  onScan: (text: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [err, setErr] = useState("");
  const doneRef = useRef(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let stop = false;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    const finish = (text: string) => {
      if (doneRef.current) return;
      doneRef.current = true;
      onScan(text);
    };

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
        const v = videoRef.current;
        if (!v) return;
        v.srcObject = stream;
        await v.play();

        const W = window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => { detect(v: HTMLVideoElement): Promise<{ rawValue: string }[]> } };
        const detector = W.BarcodeDetector ? new W.BarcodeDetector({ formats: ["qr_code"] }) : null;
        type JsQrFn = (d: Uint8ClampedArray, w: number, h: number) => { data: string } | null;
        let jsqr: JsQrFn | null = null;
        if (!detector) jsqr = (await import("jsqr")).default as unknown as JsQrFn;

        const tick = async () => {
          if (stop || doneRef.current) return;
          const vid = videoRef.current;
          if (vid && vid.readyState >= 2 && vid.videoWidth) {
            try {
              if (detector) {
                const codes = await detector.detect(vid);
                if (codes.length && codes[0].rawValue) return finish(codes[0].rawValue);
              } else if (jsqr && ctx) {
                canvas.width = vid.videoWidth;
                canvas.height = vid.videoHeight;
                ctx.drawImage(vid, 0, 0);
                const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const q = jsqr(img.data, img.width, img.height);
                if (q?.data) return finish(q.data);
              }
            } catch { /* ממשיכים לסרוק */ }
          }
          raf = requestAnimationFrame(tick);
        };
        tick();
      } catch {
        setErr("אין גישה למצלמה 😕 אפשר לסרוק עם אפליקציית המצלמה הרגילה של הטלפון, או להקליד את קוד החדר.");
      }
    }
    start();

    return () => {
      stop = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="scan-overlay">
      <video ref={videoRef} playsInline muted className="scan-video" />
      <div className="scan-frame" />
      <div className="scan-bottom">
        <p className="sub" style={{ textAlign: "center" }}>
          {err || "כוונו למסך של המארח 📷"}
        </p>
        <button className="btn ghost" style={{ marginTop: 10 }} onClick={onClose}>סגור ✕</button>
      </div>
    </div>
  );
}
