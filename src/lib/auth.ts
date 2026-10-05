import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { userDb } from "@/lib/db";

export type UserRole = "student" | "expert" | "sponsor" | "admin";

export interface CurrentUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  organisation: string | null;
}

/** The signed-in user and their profile, or null. Verified with Supabase Auth on every request. */
export const currentUser = cache(async (): Promise<CurrentUser | null> => {
  const db = await userDb();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return null;

  const { data: profile } = await db
    .from("profiles")
    .select("full_name, role, organisation")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile) return null;

  return {
    id: user.id,
    email: user.email ?? "",
    fullName: profile.full_name,
    role: profile.role,
    organisation: profile.organisation,
  };
});

export async function requireUser(): Promise<CurrentUser> {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}
