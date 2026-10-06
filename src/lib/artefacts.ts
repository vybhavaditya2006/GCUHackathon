import "server-only";
import { adminDb } from "@/lib/db";
import { sha256Hex } from "@/lib/integrity";

// Uploaded files live in a PRIVATE Supabase Storage bucket, one object per
// project + fingerprint. Nobody reads the bucket directly: the download route
// checks access with RLS first, then fetches the file with the service role.

const BUCKET = "artefacts";
const pathOf = (projectId: string, hash: string) => `${projectId}/${hash}`;

/** Stores a file under its SHA-256. Returns true if it was newly stored, false if that exact file was already there. */
export async function storeArtefact(projectId: string, hash: string, bytes: Uint8Array): Promise<boolean> {
  const storage = adminDb().storage;
  const put = () =>
    storage.from(BUCKET).upload(pathOf(projectId, hash), bytes, { contentType: "application/octet-stream", upsert: false });

  let { error } = await put();
  if (error && /bucket not found/i.test(error.message)) {
    // First upload on this Supabase project: create the private bucket, then try again.
    const made = await storage.createBucket(BUCKET, { public: false });
    if (made.error && !/already exists/i.test(made.error.message)) throw new Error(`Storage: ${made.error.message}`);
    ({ error } = await put());
  }
  if (!error) return true;
  if (/already exists|duplicate/i.test(error.message)) return false;
  throw new Error(`Storage: ${error.message}`);
}

/** Undo for a file whose contribution was refused. */
export async function removeArtefact(projectId: string, hash: string): Promise<void> {
  await adminDb().storage.from(BUCKET).remove([pathOf(projectId, hash)]);
}

export type OpenedArtefact = { ok: true; bytes: Uint8Array } | { ok: false; reason: "missing" | "tampered" };

/** Fetches a stored file and re-checks it against the fingerprint the ledger recorded. */
export async function openArtefact(projectId: string, hash: string): Promise<OpenedArtefact> {
  const { data, error } = await adminDb().storage.from(BUCKET).download(pathOf(projectId, hash));
  if (error || !data) return { ok: false, reason: "missing" };
  const bytes = new Uint8Array(await data.arrayBuffer());
  return sha256Hex(bytes) === hash ? { ok: true, bytes } : { ok: false, reason: "tampered" };
}

/** Fingerprints of the files this project has in storage (seeded history has none). */
export async function storedArtefacts(projectId: string): Promise<Set<string>> {
  const { data } = await adminDb().storage.from(BUCKET).list(projectId, { limit: 1000 });
  return new Set((data ?? []).map((f) => f.name));
}
