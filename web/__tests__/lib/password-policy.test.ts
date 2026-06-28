import { passwordCriteria, allCriteriaMet, PASSWORD_CRITERIA } from "@/lib/password-policy";

describe("password-policy", () => {
  it("PASSWORD_CRITERIA lists the four rules, in order, with the exact labels", () => {
    expect(PASSWORD_CRITERIA.map((c) => c.key)).toEqual(["length", "upper", "lower", "number"]);
    expect(PASSWORD_CRITERIA.map((c) => c.label)).toEqual([
      "At least 8 characters",
      "An uppercase letter",
      "A lowercase letter",
      "A number",
    ]);
  });

  it("passwordCriteria flags each rule independently", () => {
    expect(passwordCriteria("")).toEqual({ length: false, upper: false, lower: false, number: false });
    expect(passwordCriteria("abcdefgh")).toEqual({ length: true, upper: false, lower: true, number: false });
    expect(passwordCriteria("ABCDEFG1")).toEqual({ length: true, upper: true, lower: false, number: true });
    expect(passwordCriteria("Ab1")).toEqual({ length: false, upper: true, lower: true, number: true });
  });

  it("length boundary is exactly 8", () => {
    expect(passwordCriteria("Aa1xxxx").length).toBe(false); // 7 chars
    expect(passwordCriteria("Aa1xxxxx").length).toBe(true); // 8 chars
  });

  it("allCriteriaMet is true only when every rule holds", () => {
    expect(allCriteriaMet("Password1")).toBe(true);
    expect(allCriteriaMet("password1")).toBe(false); // no upper
    expect(allCriteriaMet("PASSWORD1")).toBe(false); // no lower
    expect(allCriteriaMet("Passwords")).toBe(false); // no number
    expect(allCriteriaMet("Pass1")).toBe(false); // too short
  });
});
