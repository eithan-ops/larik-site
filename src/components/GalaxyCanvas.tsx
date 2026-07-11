"use client";
import { useEffect, useRef } from "react";

interface Planet { ring: 1 | 2 | 3; ang: number; sp: number; c: string; l: string; r: number; }

const PLANETS: Planet[] = [
  { ring: 1, ang: 0.4, sp: 0.3, c: "#7c5cff", l: "ד", r: 13 },
  { ring: 1, ang: 2.5, sp: 0.3, c: "#2dd4bf", l: "ר", r: 13 },
  { ring: 1, ang: 4.6, sp: 0.3, c: "#ffce3c", l: "ש", r: 12 },
  { ring: 2, ang: 1.2, sp: 0.17, c: "#ff5c8a", l: "נ", r: 10 },
  { ring: 2, ang: 3.1, sp: 0.17, c: "#5c8aff", l: "ת", r: 10 },
  { ring: 2, ang: 5.3, sp: 0.17, c: "#b26bff", l: "מ", r: 10 },
  { ring: 2, ang: 0.2, sp: 0.17, c: "#ff9d5c", l: "ג", r: 9 },
  { ring: 3, ang: 2.0, sp: 0.09, c: "#4ade80", l: "", r: 6 },
  { ring: 3, ang: 3.9, sp: 0.09, c: "#8b93b5", l: "", r: 6 },
  { ring: 3, ang: 5.8, sp: 0.09, c: "#7dd8ff", l: "", r: 6 },
];
const RING = [0, 52, 90, 128];
const AMOUNTS = [353, 177, 88, 210, 44];

export default function GalaxyCanvas({ onEarn }: { onEarn?: (agorot: number) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current!;
    const ctx = cv.getContext("2d")!;
    const DPR = Math.min(2, window.devicePixelRatio || 1);
    let W = 0, H = 360, CX = 0, CY = 0;
    let raf = 0;

    const stars = Array.from({ length: 90 }, () => ({
      x: Math.random(), y: Math.random(), r: Math.random() * 1.3 + 0.3,
      ph: Math.random() * 6.28, sp: 0.5 + Math.random() * 1.5,
    }));
    let parts: { p: Planet; t: number; amt: number }[] = [];
    let labels: { x: number; y: number; t: number; txt: string }[] = [];

    function resize() {
      W = cv.clientWidth || 368;
      cv.width = W * DPR; cv.height = H * DPR;
      cv.style.height = H + "px";
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      CX = W / 2; CY = H / 2;
    }
    resize();
    window.addEventListener("resize", resize);

    const spawn = () => {
      const p = PLANETS[Math.floor(Math.random() * PLANETS.length)];
      parts.push({ p, t: 0, amt: AMOUNTS[Math.floor(Math.random() * AMOUNTS.length)] });
    };
    const iv = setInterval(spawn, 2200);
    const first = setTimeout(spawn, 600);

    const planetPos = (p: Planet, t: number) => {
      const R = RING[p.ring];
      const a = p.ang + t * p.sp;
      return { x: CX + Math.cos(a) * R, y: CY + Math.sin(a) * R * 0.86 + Math.sin(t * 0.7 + p.ang) * 2 };
    };

    const t0 = performance.now();
    function draw(now: number) {
      const t = (now - t0) / 1000;
      ctx.clearRect(0, 0, W, H);

      const g = ctx.createRadialGradient(CX, CY, 10, CX, CY, W * 0.7);
      g.addColorStop(0, "rgba(0,230,118,.10)");
      g.addColorStop(0.4, "rgba(124,92,255,.05)");
      g.addColorStop(1, "rgba(4,5,13,0)");
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

      stars.forEach((s) => {
        ctx.globalAlpha = 0.25 + 0.6 * Math.abs(Math.sin(t * s.sp + s.ph));
        ctx.fillStyle = "#cdd6ff";
        ctx.beginPath(); ctx.arc(s.x * W, s.y * H, s.r, 0, 6.28); ctx.fill();
      });
      ctx.globalAlpha = 1;

      for (let i = 1; i <= 3; i++) {
        ctx.strokeStyle = `rgba(124,92,255,${0.28 - i * 0.06})`;
        ctx.setLineDash([3, 7]); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.ellipse(CX, CY, RING[i], RING[i] * 0.86, 0, 0, 6.28); ctx.stroke();
      }
      ctx.setLineDash([]);

      parts = parts.filter((pt) => pt.t < 1);
      parts.forEach((pt) => {
        pt.t += 0.012;
        const e = 1 - Math.pow(1 - pt.t, 3);
        const pp = planetPos(pt.p, t);
        const x = pp.x + (CX - pp.x) * e, y = pp.y + (CY - pp.y) * e;
        ctx.shadowColor = "#00E676"; ctx.shadowBlur = 12;
        ctx.fillStyle = "#00E676";
        ctx.beginPath(); ctx.arc(x, y, 3.5 - pt.t * 1.5, 0, 6.28); ctx.fill();
        ctx.shadowBlur = 0;
        if (pt.t >= 1) {
          labels.push({ x: CX, y: CY - 34, t: 0, txt: "+₪" + (pt.amt / 100).toFixed(2) });
          onEarn?.(pt.amt);
        }
      });

      const pulse = 1 + Math.sin(t * 2.2) * 0.05;
      const sg = ctx.createRadialGradient(CX, CY, 2, CX, CY, 34 * pulse);
      sg.addColorStop(0, "#aaffd0"); sg.addColorStop(0.5, "#00E676"); sg.addColorStop(1, "rgba(0,230,118,0)");
      ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(CX, CY, 34 * pulse, 0, 6.28); ctx.fill();
      ctx.fillStyle = "#052012"; ctx.font = "900 15px Rubik,Arial";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("אתה", CX, CY + 1);

      PLANETS.forEach((p) => {
        const pos = planetPos(p, t);
        ctx.shadowColor = p.c; ctx.shadowBlur = 10;
        ctx.fillStyle = p.c;
        ctx.beginPath(); ctx.arc(pos.x, pos.y, p.r, 0, 6.28); ctx.fill();
        ctx.shadowBlur = 0;
        if (p.l) { ctx.fillStyle = "#fff"; ctx.font = "800 11px Rubik,Arial"; ctx.fillText(p.l, pos.x, pos.y + 1); }
      });

      labels = labels.filter((l) => l.t < 1);
      labels.forEach((l) => {
        l.t += 0.014;
        ctx.globalAlpha = 1 - l.t;
        ctx.fillStyle = "#00E676"; ctx.font = "900 15px Rubik,Arial";
        ctx.fillText(l.txt, l.x, l.y - l.t * 28);
        ctx.globalAlpha = 1;
      });

      raf = requestAnimationFrame(draw);
    }
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      clearInterval(iv);
      clearTimeout(first);
      window.removeEventListener("resize", resize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <canvas ref={ref} height={360} />;
}
