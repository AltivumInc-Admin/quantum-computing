import {
  challengeCardId,
  ratingForSolve,
  challengeReviewAnswer,
  predictCardId,
  ratingForPrediction,
} from "@/lib/challenge-review";

describe("challenge-review adapter", () => {
  describe("challengeCardId", () => {
    it("namespaces the challenge id under challenge:", () => {
      expect(challengeCardId("cabc")).toBe("challenge:cabc");
    });

    it("cannot collide with a bare qcard id of the same name", () => {
      expect(challengeCardId("found-superposition-1")).not.toBe(
        "found-superposition-1"
      );
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

  describe("predictCardId", () => {
    it("namespaces under predict: and never collides with a challenge card", () => {
      expect(predictCardId("x")).toBe("predict:x");
      expect(predictCardId("x")).not.toBe(challengeCardId("x"));
    });
  });

  describe("ratingForPrediction", () => {
    it("maps a correct commit to good and a miss to an again lapse", () => {
      expect(ratingForPrediction(true)).toBe("good");
      expect(ratingForPrediction(false)).toBe("again");
    });
  });
});
