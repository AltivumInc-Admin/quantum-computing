import {
  parseScrolly,
  stateForBeat,
  stateForAngles,
  interpolateState,
  activeBeatIndex,
  type Beat,
} from "@/components/quantum/scrolly";
import { blochVector, statesApproxEqual } from "@/components/quantum/math";

const BEATS: Beat[] = [
  { caption: "Ground state |0>", theta: 0 },
  { caption: "Equal superposition", theta: Math.PI / 2 },
  { caption: "Excited state |1>", theta: Math.PI },
];

describe("scrolly parsing", () => {
  it("accepts a well-formed beat list", () => {
    const r = parseScrolly(JSON.stringify({ beats: BEATS }));
    expect(r.error).toBeUndefined();
    expect(r.spec?.beats).toHaveLength(3);
  });

  it("rejects fewer than two beats", () => {
    const r = parseScrolly(JSON.stringify({ beats: [{ caption: "x", theta: 0 }] }));
    expect(r.error).toMatch(/at least two beats/);
  });

  it("rejects a non-numeric theta", () => {
    const r = parseScrolly(JSON.stringify({ beats: [{ caption: "a", theta: 0 }, { caption: "b", theta: "x" }] }));
    expect(r.error).toMatch(/numeric "theta"/);
  });

  it("rejects a non-numeric phi", () => {
    const r = parseScrolly(
      JSON.stringify({ beats: [{ caption: "a", theta: 0 }, { caption: "b", theta: 1, phi: "x" }] })
    );
    expect(r.error).toMatch(/"phi" must be a number/);
  });

  it("rejects a non-finite phi (JSON maps 1e999 to Infinity, which is typeof number)", () => {
    // Without the finiteness half of the guard this parsed cleanly, then
    // Math.cos(Infinity) made the whole state NaN: the sticky sphere's vector
    // silently vanished and the sr readout announced "x NaN, y NaN, z NaN".
    const r = parseScrolly('{"beats":[{"caption":"a","theta":0},{"caption":"b","theta":1,"phi":1e999}]}');
    expect(r.error).toMatch(/"phi" must be a number/);
  });

  it("still accepts an omitted phi (it is optional)", () => {
    expect(parseScrolly(JSON.stringify({ beats: BEATS })).error).toBeUndefined();
  });

  it("rejects malformed JSON", () => {
    expect(parseScrolly("{ not json").error).toBeTruthy();
  });
});

describe("scrolly state interpolation", () => {
  it("theta sets the Bloch z-component: 0 -> north, PI -> south", () => {
    expect(blochVector(stateForAngles(0)).z).toBeCloseTo(1, 6);
    expect(blochVector(stateForAngles(Math.PI / 2)).z).toBeCloseTo(0, 6);
    expect(blochVector(stateForAngles(Math.PI)).z).toBeCloseTo(-1, 6);
  });

  it("progress 0 yields the first beat, progress 1 the last", () => {
    expect(statesApproxEqual(interpolateState(BEATS, 0), stateForBeat(BEATS[0]))).toBe(true);
    expect(statesApproxEqual(interpolateState(BEATS, 1), stateForBeat(BEATS[2]))).toBe(true);
  });

  it("the state vector sweeps monotonically down as progress increases", () => {
    let prevZ = Infinity;
    for (let p = 0; p <= 1.0001; p += 0.1) {
      const z = blochVector(interpolateState(BEATS, Math.min(1, p))).z;
      expect(z).toBeLessThanOrEqual(prevZ + 1e-9);
      prevZ = z;
    }
  });

  it("clamps out-of-range progress instead of throwing", () => {
    expect(statesApproxEqual(interpolateState(BEATS, -5), stateForBeat(BEATS[0]))).toBe(true);
    expect(statesApproxEqual(interpolateState(BEATS, 5), stateForBeat(BEATS[2]))).toBe(true);
  });

  it("highlights the nearest beat by progress", () => {
    expect(activeBeatIndex(BEATS, 0)).toBe(0);
    expect(activeBeatIndex(BEATS, 0.5)).toBe(1);
    expect(activeBeatIndex(BEATS, 1)).toBe(2);
  });
});
