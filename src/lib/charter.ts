import "server-only";
import { z } from "zod";
import { adminDb } from "@/lib/db";

const acceptResult = z.object({
  charter_version: z.number().int(),
  seq: z.number().int(),
  hash: z.string(),
});

export interface CharterAcceptance {
  charterVersion: number;
  seq: number;
  hash: string;
}

/** A rule in the SQL function said no (not invited, already accepted, ...). Safe to show the user. */
export class CharterError extends Error {}

/**
 * The member accepts the latest charter. accept_charter updates the membership
 * and writes CHARTER_ACCEPTED to the ledger in one transaction.
 */
export async function accept(
  projectId: string,
  userId: string,
  modelAcknowledged: boolean,
): Promise<CharterAcceptance> {
  const { data, error } = await adminDb().rpc("accept_charter", {
    p_project_id: projectId,
    p_user_id: userId,
    p_model_acknowledged: modelAcknowledged,
  });
  if (error) throw new CharterError(error.message.replace(/^accept_charter:\s*/, ""));

  const result = acceptResult.parse(data);
  return { charterVersion: result.charter_version, seq: result.seq, hash: result.hash };
}
