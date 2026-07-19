/**
 * @jest-environment jsdom
 */
// web/__tests__/components/fog-field.test.tsx
//
// The ambient canvas is mounted on EVERY route (root layout), so its two
// silent-failure modes matter platform-wide: an infinite rAF loop for
// reduced-motion users, and a leaked loop/listener set after navigation.
// These tests pin the contracts with a hand-rolled 2d-context stub — the
// component only ever touches a dozen ctx members.
import { render } from "@testing-library/react";
import { FogField } from "@/components/fog-field";

type CtxStub = {
  setTransform: jest.Mock;
  clearRect: jest.Mock;
  createRadialGradient: jest.Mock;
  fillRect: jest.Mock;
  drawImage: jest.Mock;
  fillStyle: unknown;
  globalAlpha: number;
  globalCompositeOperation: string;
};

function makeCtxStub(): CtxStub {
  return {
    setTransform: jest.fn(),
    clearRect: jest.fn(),
    createRadialGradient: jest.fn(() => ({ addColorStop: jest.fn() })),
    fillRect: jest.fn(),
    drawImage: jest.fn(),
    fillStyle: "",
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
  };
}

describe("FogField", () => {
  // Every 2d context handed out, in creation order: [0] is the mounted
  // canvas's ctx (the effect grabs it first), the rest are blob sprites.
  let ctxStubs: CtxStub[];

  // Manual rAF queue so tests step frames deterministically.
  let rafQueue: Map<number, FrameRequestCallback>;
  let rafSpy: jest.Mock;
  let cancelSpy: jest.Mock;
  function flushFrames(t: number) {
    const cbs = [...rafQueue.values()];
    rafQueue.clear();
    for (const cb of cbs) cb(t);
  }

  // Controllable prefers-reduced-motion media query.
  let mqlMatches: boolean;
  let mqlListeners: ((e: { matches: boolean }) => void)[];
  let mqlAdd: jest.Mock;
  let mqlRemove: jest.Mock;

  // Captured MutationObserver instances (theme-flip reseed path).
  let observers: { cb: () => void; observe: jest.Mock; disconnect: jest.Mock }[];

  beforeEach(() => {
    ctxStubs = [];
    jest
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockImplementation(() => {
        const stub = makeCtxStub();
        ctxStubs.push(stub);
        return stub as unknown as CanvasRenderingContext2D;
      });

    rafQueue = new Map();
    let nextRaf = 0;
    rafSpy = jest.fn((cb: FrameRequestCallback) => {
      rafQueue.set(++nextRaf, cb);
      return nextRaf;
    });
    cancelSpy = jest.fn((id: number) => {
      rafQueue.delete(id);
    });
    window.requestAnimationFrame = rafSpy as unknown as typeof window.requestAnimationFrame;
    window.cancelAnimationFrame = cancelSpy as unknown as typeof window.cancelAnimationFrame;

    mqlMatches = false;
    mqlListeners = [];
    mqlAdd = jest.fn((_: string, cb: (e: { matches: boolean }) => void) => {
      mqlListeners.push(cb);
    });
    mqlRemove = jest.fn((_: string, cb: (e: { matches: boolean }) => void) => {
      mqlListeners = mqlListeners.filter((l) => l !== cb);
    });
    window.matchMedia = jest.fn().mockImplementation(() => ({
      get matches() {
        return mqlMatches;
      },
      addEventListener: mqlAdd,
      removeEventListener: mqlRemove,
    })) as unknown as typeof window.matchMedia;

    observers = [];
    (global as { MutationObserver: unknown }).MutationObserver = class {
      observe = jest.fn();
      disconnect = jest.fn();
      constructor(cb: () => void) {
        observers.push({ cb, observe: this.observe, disconnect: this.disconnect });
      }
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
    document.documentElement.classList.remove("dark");
  });

  it("renders exactly one static frame and never reschedules under reduced motion", () => {
    mqlMatches = true;
    render(<FogField />);
    // Mount schedules the single static frame…
    expect(rafSpy).toHaveBeenCalledTimes(1);
    flushFrames(0);
    // …which paints (clear + blob sprite blits) and does NOT re-queue.
    expect(ctxStubs[0].clearRect).toHaveBeenCalledTimes(1);
    expect(ctxStubs[0].drawImage.mock.calls.length).toBeGreaterThan(0);
    expect(rafQueue.size).toBe(0);
    expect(rafSpy).toHaveBeenCalledTimes(1);
  });

  it("keeps the loop running when motion is allowed", () => {
    render(<FogField />);
    flushFrames(16);
    flushFrames(32);
    // Each frame re-queues the next.
    expect(rafQueue.size).toBe(1);
    expect(ctxStubs[0].clearRect).toHaveBeenCalledTimes(2);
  });

  it("blits pre-rendered sprites per frame instead of rasterizing gradients", () => {
    render(<FogField />);
    flushFrames(16);
    // Gradients exist only on the sprite contexts (created once at seed)…
    expect(ctxStubs[0].createRadialGradient).not.toHaveBeenCalled();
    const spriteCtxs = ctxStubs.slice(1);
    expect(spriteCtxs.length).toBeGreaterThan(0);
    for (const sprite of spriteCtxs) {
      expect(sprite.createRadialGradient).toHaveBeenCalledTimes(1);
    }
    // …and another frame blits without creating any new gradient or sprite.
    const spritesBefore = ctxStubs.length;
    flushFrames(32);
    expect(ctxStubs.length).toBe(spritesBefore);
    expect(ctxStubs[0].drawImage).toHaveBeenCalled();
  });

  it("tears down the loop and every listener on unmount", () => {
    const removeSpy = jest.spyOn(window, "removeEventListener");
    const { unmount } = render(<FogField />);
    unmount();
    expect(cancelSpy).toHaveBeenCalled();
    expect(removeSpy).toHaveBeenCalledWith("resize", expect.any(Function));
    expect(mqlRemove).toHaveBeenCalledWith("change", expect.any(Function));
    expect(observers[0].disconnect).toHaveBeenCalled();
    // Nothing left in flight: the queue is empty after teardown.
    expect(rafQueue.size).toBe(0);
  });

  it("honors a LIVE reduce-motion toggle: freezes to one frame, then resumes", () => {
    render(<FogField />);
    flushFrames(16);
    expect(rafQueue.size).toBe(1); // loop running

    // OS toggle flips reduce ON mid-session: the pending frame is canceled
    // and one static frame is painted, with no reschedule after it.
    mqlMatches = true;
    mqlListeners.forEach((l) => l({ matches: true }));
    flushFrames(48);
    expect(rafQueue.size).toBe(0);

    // Toggle back OFF: the loop resumes.
    mqlMatches = false;
    mqlListeners.forEach((l) => l({ matches: false }));
    expect(rafQueue.size).toBe(1);
    flushFrames(64);
    expect(rafQueue.size).toBe(1);
  });

  it("reseeds the palette (new sprites) when the theme class flips", () => {
    render(<FogField />);
    const spritesBefore = ctxStubs.length;
    document.documentElement.classList.add("dark");
    observers[0].cb();
    // A theme flip is the one path that rebuilds the field from scratch,
    // which mints a fresh sprite set for the new palette.
    expect(ctxStubs.length).toBeGreaterThan(spritesBefore);
  });

  it("rescales the existing field on resize instead of re-randomizing it", () => {
    // Fake only the debounce timer — rAF must stay on the manual test queue.
    jest.useFakeTimers({ doNotFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
    try {
      mqlMatches = true; // static mode isolates positions from drift
      render(<FogField />);
      flushFrames(0);
      const spritesDrawnBefore = ctxStubs[0].drawImage.mock.calls.map((c) => c[0]);

      window.dispatchEvent(new Event("resize"));
      jest.advanceTimersByTime(200); // past the 180ms debounce
      flushFrames(16);

      // The same sprite objects are drawn after the resize — the blobs were
      // kept (re-scaled), not thrown away and re-randomized (a reseed would
      // mint brand-new sprite canvases).
      const spritesDrawnAfter = ctxStubs[0].drawImage.mock.calls
        .slice(spritesDrawnBefore.length)
        .map((c) => c[0]);
      expect(spritesDrawnAfter).toEqual(spritesDrawnBefore);
    } finally {
      jest.useRealTimers();
    }
  });
});
