"use client";
import { useEffect, useRef } from "react";

/**
 * Soft, breathing waveform. Reads amplitude from an AnalyserNode if available,
 * otherwise breathes gently on its own. Purely decorative (aria-hidden).
 */
export function Waveform({ analyser }: { analyser: React.MutableRefObject<AnalyserNode | null> }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const color = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#b5643c";
    let raf = 0;
    let level = 0;
    const data = new Uint8Array(256);

    const draw = (t: number) => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== w * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const an = analyser.current;
      let target = 0.08;
      if (an) {
        an.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i]! - 128) / 128;
          sum += v * v;
        }
        target = Math.min(1, Math.sqrt(sum / data.length) * 4.5) + 0.06;
      }
      level += (target - level) * 0.12;
      const breathe = reduce ? 1 : 0.85 + 0.15 * Math.sin(t / 1100);

      for (let k = 0; k < 3; k++) {
        ctx.beginPath();
        const amp = (h / 2.4) * level * breathe * (1 - k * 0.28);
        const freq = 1.6 + k * 0.7;
        const phase = reduce ? 0 : t / (900 + k * 300);
        for (let x = 0; x <= w; x += 2) {
          const n = x / w;
          const env = Math.sin(Math.PI * n); // taper at both ends
          const y = h / 2 + Math.sin(n * Math.PI * 2 * freq + phase + k) * amp * env;
          x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.85 - k * 0.28;
        ctx.lineWidth = 2.2 - k * 0.5;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [analyser]);

  return <canvas ref={ref} className="wave" aria-hidden="true" />;
}
