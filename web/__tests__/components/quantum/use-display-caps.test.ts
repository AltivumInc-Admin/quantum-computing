/**
 * @jest-environment jsdom
 */
import { detectWebGL } from "@/components/quantum/use-display-caps";

describe("detectWebGL", () => {
  it("returns a boolean and does not throw when canvas has no WebGL context", () => {
    const result = detectWebGL();
    expect(typeof result).toBe("boolean");
    expect(result).toBe(false);
  });
});
