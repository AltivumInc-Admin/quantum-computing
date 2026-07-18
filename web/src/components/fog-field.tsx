"use client";

import { useEffect, useRef } from "react";

/**
 * Ambient "smoke field" — the signature atmosphere of the Instrument design.
 * A full-viewport canvas of slow-drifting soft glows plus faint twinkling
 * specks, painted BEHIND all content (negative z-index over the body's smoke
 * gradient). Purely decorative: `aria-hidden`, `pointer-events:none`.
 *
 * Theme-aware: on the dark primary theme the glows are warm/cool white + a
 * faint olive, composited additively ("lighter") over near-black. On the light
 * theme they collapse to a whisper of cool haze so the field never muddies a
 * bright surface. Honors `prefers-reduced-motion`: renders a single static
 * frame and never animates.
 */
export function FogField() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    // Palettes are [r,g,b] for additive "lighter" compositing (dark theme).
    const DARK = [
      [236, 235, 228], // warm white
      [224, 227, 231], // cool white
      [206, 210, 176], // faint olive
    ];
    const LIGHT = [
      [190, 200, 214], // cool haze
      [206, 210, 190], // pale olive
    ];

    let isDark = document.documentElement.classList.contains("dark");
    let W = 0;
    let H = 0;
    let blobs: {
      x: number; y: number; r: number; vx: number; vy: number;
      a: number; ph: number; tw: number; c: number[];
    }[] = [];
    let specks: { x: number; y: number; a: number; ph: number; tw: number }[] = [];
    let raf = 0;

    function seed() {
      const cols = isDark ? DARK : LIGHT;
      W = window.innerWidth;
      H = window.innerHeight;
      canvas!.width = W * dpr;
      canvas!.height = H * dpr;
      canvas!.style.width = W + "px";
      canvas!.style.height = H + "px";
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      const scale = isDark ? 1 : 0.45; // lighter theme = fainter field
      const nb = Math.max(5, Math.min(10, Math.round((W * H) / 170000)));
      blobs = [];
      for (let i = 0; i < nb; i++) {
        blobs.push({
          x: Math.random() * W,
          y: Math.random() * H,
          r: 220 + Math.random() * 360,
          vx: 0.03 + Math.random() * 0.09,
          vy: -0.02 - Math.random() * 0.07,
          a: (0.03 + Math.random() * 0.05) * scale,
          ph: Math.random() * 6.28,
          tw: 0.3 + Math.random() * 0.7,
          c: cols[i % cols.length],
        });
      }
      const ns = isDark ? Math.min(64, Math.round((W * H) / 26000)) : 0;
      specks = [];
      for (let j = 0; j < ns; j++) {
        specks.push({
          x: Math.random() * W,
          y: Math.random() * H,
          a: 0.1 + Math.random() * 0.3,
          ph: Math.random() * 6.28,
          tw: 0.6 + Math.random() * 1.2,
        });
      }
    }

    function draw(t: number) {
      ctx!.clearRect(0, 0, W, H);
      ctx!.globalCompositeOperation = isDark ? "lighter" : "source-over";
      for (const p of blobs) {
        if (!reduce) {
          p.x += p.vx;
          p.y += p.vy;
          if (p.y < -p.r) p.y = H + p.r;
          if (p.x > W + p.r) p.x = -p.r;
        }
        const a = p.a * (reduce ? 1 : 0.6 + 0.4 * Math.sin(t * 0.0009 * p.tw + p.ph));
        const g = ctx!.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
        g.addColorStop(0, `rgba(${p.c[0]},${p.c[1]},${p.c[2]},${Math.max(0, a)})`);
        g.addColorStop(1, `rgba(${p.c[0]},${p.c[1]},${p.c[2]},0)`);
        ctx!.fillStyle = g;
        ctx!.beginPath();
        ctx!.arc(p.x, p.y, p.r, 0, 6.2832);
        ctx!.fill();
      }
      for (const s of specks) {
        const sa = s.a * (reduce ? 1 : 0.4 + 0.6 * Math.sin(t * 0.0016 * s.tw + s.ph));
        ctx!.fillStyle = `rgba(255,255,255,${Math.max(0, sa)})`;
        ctx!.fillRect(s.x, s.y, 1, 1);
      }
      ctx!.globalCompositeOperation = "source-over";
      if (!reduce) raf = requestAnimationFrame(draw);
    }

    seed();
    raf = requestAnimationFrame(draw);

    let rt: ReturnType<typeof setTimeout>;
    const onResize = () => {
      clearTimeout(rt);
      rt = setTimeout(() => {
        seed();
        if (reduce) raf = requestAnimationFrame(draw);
      }, 180);
    };
    window.addEventListener("resize", onResize);

    // Reseed the palette when the theme flips.
    const obs = new MutationObserver(() => {
      const nowDark = document.documentElement.classList.contains("dark");
      if (nowDark !== isDark) {
        isDark = nowDark;
        seed();
        if (reduce) raf = requestAnimationFrame(draw);
      }
    });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(rt);
      window.removeEventListener("resize", onResize);
      obs.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10"
    />
  );
}
