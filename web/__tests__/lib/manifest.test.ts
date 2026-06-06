import {
  getManifestSections,
  isNotebookRunnable,
  getRepoUrl,
} from "@/lib/manifest";

describe("manifest", () => {
  it("exposes every section from the generated content manifest", () => {
    const sections = getManifestSections();
    expect(sections).toHaveLength(7);
    expect(sections[0].slug).toBe("00-prereqs");
    expect(sections[6].slug).toBe("06-hybrid-jobs");
  });

  it("marks a contract-passing notebook runnable", () => {
    expect(isNotebookRunnable("00-prereqs", "01-python-numpy-warmup.ipynb")).toBe(
      true
    );
  });

  it("does NOT mark a non-runnable section's notebook runnable", () => {
    // 02-hardware notebooks are not browser-runnable (no marker / hardware APIs).
    expect(isNotebookRunnable("02-hardware", "01-device-discovery.ipynb")).toBe(
      false
    );
  });

  it("returns false for an unknown notebook", () => {
    expect(isNotebookRunnable("00-prereqs", "does-not-exist.ipynb")).toBe(false);
  });

  it("exposes the canonical repo URL", () => {
    expect(getRepoUrl()).toBe(
      "https://github.com/AltivumInc-Admin/quantum-computing"
    );
  });
});
