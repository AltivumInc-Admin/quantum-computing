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
 * bright surface.
 *
 * Performance: each blob's radial gradient is rasterized ONCE into an
 * offscreen sprite at seed time; the frame loop only blits cached bitmaps
 * (drawImage + globalAlpha twinkle) instead of re-creating 5-10 full-viewport
 * gradients per frame. Motion is delta-time based, so drift speed is the same
 * on 60 Hz and 120 Hz displays. Resize re-scales the existing field to the
 * new viewport (mobile URL-bar jitter never pops a new random sky); only
 * mount and theme flips re-randomize.
 *
 * Honors `prefers-reduced-motion` LIVE: reduced means a single static frame
 * and no loop, and a mid-session OS toggle freezes or resumes immediately —
 * mirroring how the design system's CSS @media blocks re-evaluate.
 */
export function FogField() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reduce = mql.matches;
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
    interface FogBlob {
      x: number; y: number; r: number; vx: number; vy: number;
      a: number; ph: number; tw: number; sprite: HTMLCanvasElement;
    }
    interface Speck { x: number; y: number; a: number; ph: number; tw: number }
    let blobs: FogBlob[] = [];
    let specks: Speck[] = [];
    let raf = 0;
    let last: number | null = null; // previous rAF timestamp, for delta-time

    // Pre-render one blob gradient at full core alpha; the per-frame twinkle
    // is applied through ctx.globalAlpha when the sprite is blitted, so the
    // cached bitmap composites exactly like the old per-frame gradient fill.
    function makeSprite(r: number, c: number[]): HTMLCanvasElement {
      const sprite = document.createElement("canvas");
      const size = Math.max(2, Math.ceil(r * 2));
      sprite.width = size;
      sprite.height = size;
      const sctx = sprite.getContext("2d");
      if (sctx) {
        const g = sctx.createRadialGradient(r, r, 0, r, r, r);
        g.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},1)`);
        g.addColorStop(1, `rgba(${c[0]},${c[1]},${c[2]},0)`);
        sctx.fillStyle = g;
        sctx.fillRect(0, 0, size, size);
      }
      return sprite;
    }

    function makeBlob(cols: number[][], scale: number, i: number): FogBlob {
      const r = 220 + Math.random() * 360;
      const c = cols[i % cols.length];
      return {
        x: Math.random() * W,
        y: Math.random() * H,
        r,
        vx: 0.03 + Math.random() * 0.09,
        vy: -0.02 - Math.random() * 0.07,
        a: (0.03 + Math.random() * 0.05) * scale,
        ph: Math.random() * 6.28,
        tw: 0.3 + Math.random() * 0.7,
        sprite: makeSprite(r, c),
      };
    }

    function makeSpeck(): Speck {
      return {
        x: Math.random() * W,
        y: Math.random() * H,
        a: 0.1 + Math.random() * 0.3,
        ph: Math.random() * 6.28,
        tw: 0.6 + Math.random() * 1.2,
      };
    }

    function sizeCanvas() {
      W = window.innerWidth;
      H = window.innerHeight;
      canvas!.width = W * dpr;
      canvas!.height = H * dpr;
      canvas!.style.width = W + "px";
      canvas!.style.height = H + "px";
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function targetCounts() {
      return {
        nb: Math.max(5, Math.min(10, Math.round((W * H) / 170000))),
        ns: isDark ? Math.min(64, Math.round((W * H) / 26000)) : 0,
      };
    }

    // Full re-randomization — initial mount and theme flips only (palette and
    // speck presence are theme-keyed). Resize goes through rescale() below.
    function seed() {
      sizeCanvas();
      const cols = isDark ? DARK : LIGHT;
      const scale = isDark ? 1 : 0.45; // lighter theme = fainter field
      const { nb, ns } = targetCounts();
      blobs = [];
      for (let i = 0; i < nb; i++) blobs.push(makeBlob(cols, scale, i));
      specks = [];
      for (let j = 0; j < ns; j++) specks.push(makeSpeck());
    }

    // Resize keeps the field continuous: existing positions re-scale to the
    // new viewport (mobile URL-bar collapse fires resize on every scroll
    // direction change — the sky must not visibly pop), and only the density
    // delta is added or trimmed.
    function rescale() {
      const oldW = W;
      const oldH = H;
      sizeCanvas();
      const fx = oldW > 0 ? W / oldW : 1;
      const fy = oldH > 0 ? H / oldH : 1;
      for (const p of blobs) {
        p.x *= fx;
        p.y *= fy;
      }
      for (const s of specks) {
        s.x *= fx;
        s.y *= fy;
      }
      const cols = isDark ? DARK : LIGHT;
      const scale = isDark ? 1 : 0.45;
      const { nb, ns } = targetCounts();
      while (blobs.length > nb) blobs.pop();
      while (blobs.length < nb) blobs.push(makeBlob(cols, scale, blobs.length));
      while (specks.length > ns) specks.pop();
      while (specks.length < ns) specks.push(makeSpeck());
    }

    function paint(t: number, dt: number) {
      ctx!.clearRect(0, 0, W, H);
      ctx!.globalCompositeOperation = isDark ? "lighter" : "source-over";
      // Velocities are tuned in px per 60 Hz frame; dt normalizes them so a
      // 120 Hz display drifts at the same speed (and pays the same energy).
      const step = dt / (1000 / 60);
      for (const p of blobs) {
        if (!reduce && step > 0) {
          p.x += p.vx * step;
          p.y += p.vy * step;
          if (p.y < -p.r) p.y = H + p.r;
          if (p.x > W + p.r) p.x = -p.r;
        }
        const a = p.a * (reduce ? 1 : 0.6 + 0.4 * Math.sin(t * 0.0009 * p.tw + p.ph));
        ctx!.globalAlpha = Math.max(0, a);
        ctx!.drawImage(p.sprite, p.x - p.r, p.y - p.r);
      }
      ctx!.globalAlpha = 1;
      for (const s of specks) {
        const sa = s.a * (reduce ? 1 : 0.4 + 0.6 * Math.sin(t * 0.0016 * s.tw + s.ph));
        ctx!.fillStyle = `rgba(255,255,255,${Math.max(0, sa)})`;
        ctx!.fillRect(s.x, s.y, 1, 1);
      }
      ctx!.globalCompositeOperation = "source-over";
    }

    function frame(t: number) {
      // Clamp the step so a background-tab return doesn't teleport the fog.
      const dt = last === null ? 0 : Math.min(t - last, 100);
      last = t;
      paint(t, dt);
      if (!reduce) raf = requestAnimationFrame(frame);
    }

    // One motionless frame — the field's entire life under reduced motion.
    function paintStatic() {
      cancelAnimationFrame(raf);
      last = null;
      raf = requestAnimationFrame((t) => paint(t, 0));
    }

    function start() {
      cancelAnimationFrame(raf);
      last = null;
      raf = requestAnimationFrame(frame);
    }

    seed();
    if (reduce) paintStatic();
    else start();

    let rt: ReturnType<typeof setTimeout>;
    const onResize = () => {
      clearTimeout(rt);
      rt = setTimeout(() => {
        rescale();
        // The bitmap reset cleared the canvas; the running loop repaints on
        // the next frame, but the static (reduced) frame must be re-issued.
        if (reduce) paintStatic();
      }, 180);
    };
    window.addEventListener("resize", onResize);

    // Reseed the palette when the theme flips.
    const obs = new MutationObserver(() => {
      const nowDark = document.documentElement.classList.contains("dark");
      if (nowDark !== isDark) {
        isDark = nowDark;
        seed();
        if (reduce) paintStatic();
      }
    });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    // Honor a mid-session OS reduce-motion toggle live, exactly like the CSS
    // @media blocks: reduce freezes onto one static frame, un-reduce resumes.
    const onReduceChange = (e: MediaQueryListEvent) => {
      reduce = e.matches;
      if (reduce) paintStatic();
      else start();
    };
    mql.addEventListener("change", onReduceChange);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(rt);
      window.removeEventListener("resize", onResize);
      mql.removeEventListener("change", onReduceChange);
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
