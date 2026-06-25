import { sha256Hex } from "@/lib/sha256";

// Known SHA-256 vectors. These are the EXACT bytes CloudFront's OAC recomputes
// over the request body, so getting the encoding right is load-bearing.
describe("sha256Hex", () => {
  it("hashes the empty string to the canonical SHA-256 of zero bytes", async () => {
    expect(await sha256Hex("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    );
  });

  it("hashes 'abc' to the NIST test vector", async () => {
    expect(await sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
  });

  it("hashes a realistic tutor JSON body deterministically", async () => {
    const body = JSON.stringify({ slug: "01-foundations", question: "what is a qubit?" });
    const hex = await sha256Hex(body);
    // 64 lowercase hex chars, and stable across calls (the value CloudFront checks).
    expect(hex).toMatch(/^[0-9a-f]{64}$/);
    expect(await sha256Hex(body)).toBe(hex);
  });

  it("is UTF-8 sensitive (multi-byte chars change the digest)", async () => {
    expect(await sha256Hex("é")).not.toBe(await sha256Hex("e"));
  });
});
