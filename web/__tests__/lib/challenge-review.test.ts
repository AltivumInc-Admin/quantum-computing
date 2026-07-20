import {
  cardIdFor,
  challengeCardId,
  ratingForSolve,
  challengeReviewAnswer,
  ratingForPrediction,
} from "@/lib/challenge-review";
import { KIND_LABELS, type CardKind } from "@/lib/review-store";

describe("challenge-review adapter", () => {
  describe("cardIdFor", () => {
    it("namespaces every kind under its own prefix", () => {
      expect(cardIdFor("challenge", "cabc")).toBe("challenge:cabc");
      expect(cardIdFor("predict", "x")).toBe("predict:x");
      expect(cardIdFor("bloch", "x")).toBe("bloch:x");
      expect(cardIdFor("cost", "x")).toBe("cost:x");
      expect(cardIdFor("debug", "x")).toBe("debug:x");
      expect(cardIdFor("expect", "x")).toBe("expect:x");
    });

    it("cannot collide with a bare qcard id of the same name", () => {
      expect(cardIdFor("challenge", "found-superposition-1")).not.toBe(
        "found-superposition-1"
      );
    });

    it("gives every kind a distinct id for one shared source id", () => {
      const kinds = Object.keys(KIND_LABELS) as CardKind[];
      const ids = kinds.map((k) => cardIdFor(k, "x"));
      expect(new Set(ids).size).toBe(kinds.length);
    });

    it("covers the whole CardKind vocabulary — a new kind cannot half-land", () => {
      // The prefix vocabulary IS CardKind, so adding a kind to KIND_LABELS
      // without a card id is now impossible rather than silently unnoticed.
      for (const kind of Object.keys(KIND_LABELS) as CardKind[]) {
        expect(cardIdFor(kind, "x")).toBe(`${kind}:x`);
      }
    });
  });

  describe("challengeCardId (alias pending challenge.tsx migration)", () => {
    it("is exactly cardIdFor(\"challenge\", id)", () => {
      expect(challengeCardId("cabc")).toBe(cardIdFor("challenge", "cabc"));
    });
  });

  describe("ratingForSolve", () => {
    it("rates a clean first solve as good", () => {
      expect(ratingForSolve(0)).toBe("good");
    });

    it("rates a solve after any wrong attempt as hard", () => {
      expect(ratingForSolve(1)).toBe("hard");
      expect(ratingForSolve(5)).toBe("hard");
    });

    it("treats a degenerate negative count as good (defensive)", () => {
      expect(ratingForSolve(-1)).toBe("good");
    });
  });

  describe("challengeReviewAnswer", () => {
    it("joins multi-line target gates into one inline-code line", () => {
      expect(challengeReviewAnswer("H 0\nCNOT 0 1")).toBe(
        "One correct circuit: `H 0; CNOT 0 1`"
      );
    });

    it("trims blank lines and surrounding whitespace", () => {
      expect(challengeReviewAnswer("  H 0 \n\n  CNOT 0 1  \n")).toBe(
        "One correct circuit: `H 0; CNOT 0 1`"
      );
    });

    it("falls back when the program is empty", () => {
      expect(challengeReviewAnswer("   \n  ")).toBe(
        "See the lesson for the target circuit."
      );
    });
  });

  describe("ratingForPrediction", () => {
    it("maps a correct commit to good and a miss to an again lapse", () => {
      expect(ratingForPrediction(true)).toBe("good");
      expect(ratingForPrediction(false)).toBe("again");
    });
  });

});
