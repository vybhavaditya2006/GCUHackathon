// Integrity checks on uploaded artefacts. The SHA-256 fingerprint is real. The
// similarity score is a MOCK: it compares the upload with a tiny built-in
// "public corpus" instead of a real plagiarism / AI-content service.
import { createHash } from "node:crypto";

/** Uploads scoring at or above this are flagged for human review (same threshold as add_contribution). */
export const SIMILARITY_THRESHOLD = 0.8;

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

const PUBLIC_CORPUS = [
  {
    source: "a public repository",
    text: `Baseline CNN for diabetic retinopathy grading. We fine-tune a ResNet-50 pretrained on ImageNet using
      fundus images resized to 512 by 512 pixels. Preprocessing applies contrast limited adaptive histogram
      equalisation to the green channel, then normalises each image to zero mean and unit variance. Training
      uses the Adam optimiser with a learning rate of 0.0001, a batch size of 32 and early stopping on the
      validation quadratic weighted kappa. Class imbalance is handled with a weighted cross entropy loss, and
      augmentation includes random rotation, horizontal flips and small brightness shifts. The model reaches
      a sensitivity of 0.88 at grade two or above on the public test split.`,
  },
];

const SHINGLE = 3;

function shingles(text: string): Set<string> {
  const words = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  const out = new Set<string>();
  for (let i = 0; i + SHINGLE <= words.length; i++) out.add(words.slice(i, i + SHINGLE).join(" "));
  return out;
}

const corpus = PUBLIC_CORPUS.map((doc) => ({ source: doc.source, shingles: shingles(doc.text) }));

export interface SimilarityResult {
  /** 0..1: the share of the upload's three-word phrases that also appear in a known public text. */
  score: number;
  matched: string | null;
}

export function similarity(text: string): SimilarityResult {
  const mine = shingles(text);
  if (mine.size === 0) return { score: 0, matched: null };

  let best: SimilarityResult = { score: 0, matched: null };
  for (const doc of corpus) {
    let shared = 0;
    for (const s of mine) if (doc.shingles.has(s)) shared++;
    const score = Math.round((shared / mine.size) * 1000) / 1000;
    if (score > best.score) best = { score, matched: doc.source };
  }
  return best;
}
