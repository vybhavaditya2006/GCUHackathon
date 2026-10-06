import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { sha256Hex, similarity, SIMILARITY_THRESHOLD } from "./integrity";

const demo = (name: string) =>
  readFileSync(fileURLToPath(new URL(`../../docs/demo/${name}`, import.meta.url)), "utf8");

describe("integrity", () => {
  it("fingerprints bytes with SHA-256", () => {
    expect(sha256Hex(new TextEncoder().encode("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("flags the copied demo file", () => {
    const result = similarity(demo("copied_cnn_notes.md"));
    expect(result.score).toBeGreaterThanOrEqual(SIMILARITY_THRESHOLD);
    expect(result.matched).toBe("a public repository");
  });

  it("does not flag the original demo file", () => {
    expect(similarity(demo("quantisation_notes.md")).score).toBeLessThan(0.2);
  });

  it("scores empty or tiny uploads as 0", () => {
    expect(similarity("")).toEqual({ score: 0, matched: null });
    expect(similarity("two words")).toEqual({ score: 0, matched: null });
  });
});
