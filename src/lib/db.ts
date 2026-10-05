import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var ${name}. Copy .env.example to .env.local and fill it in.`);
  return value;
}

/**
 * Service-role client. Bypasses RLS, so it is server-only and used by lib/*
 * modules to call the SQL functions that write a change plus its ledger entry.
 */
export function adminDb(): SupabaseClient {
  return createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SECRET_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Client bound to the signed-in user's session cookies. RLS applies, so use
 * this for reads that must respect "who can see what" (e.g. the locked brief).
 */
export async function userDb(): Promise<SupabaseClient> {
  const cookieStore = await cookies();
  return createServerClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          try {
            for (const { name, value, options } of toSet) cookieStore.set(name, value, options);
          } catch {
            // Called from a Server Component, where cookies are read-only.
          }
        },
      },
    },
  );
}
