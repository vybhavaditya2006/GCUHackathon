"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { browserDb } from "@/lib/db.browser";

// Synthetic demo accounts from supabase/seed.sql. All share the demo password.
const DEMO_PASSWORD = "demo1234";
const demoAccounts = [
  { email: "anjali@charter.test", name: "Dr. Anjali Rao", note: "Sponsor" },
  { email: "kiran@charter.test", name: "Dr. Kiran Shetty", note: "Expert" },
  { email: "priya@charter.test", name: "Priya Nair", note: "Student (lead)" },
  { email: "ananya@charter.test", name: "Ananya Gupta", note: "Student, invited" },
  { email: "rohan@charter.test", name: "Rohan Das", note: "Student, not a member" },
  { email: "admin@charter.test", name: "Ms. Fernandes", note: "Admin" },
];

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: signInError } = await browserDb().auth.signInWithPassword({ email, password });
    if (signInError) {
      setError(signInError.message);
      setBusy(false);
      return;
    }
    router.replace("/dashboard");
    router.refresh();
  }

  const input = "rounded-md border border-input bg-card px-3 py-2 text-sm outline-none focus:border-accent";

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Email
          <input
            type="email"
            required
            autoComplete="email"
            className={input}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Password
          <input
            type="password"
            required
            autoComplete="current-password"
            className={input}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="mt-1 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground disabled:opacity-50"
        >
          {busy ? "Signing in..." : "Sign in"}
        </button>
        {error && (
          <p role="alert" className="text-sm text-alert">
            {error}
          </p>
        )}
      </form>

      <div>
        <p className="text-xs font-medium text-muted-foreground">Demo accounts (synthetic users; click to fill)</p>
        <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
          {demoAccounts.map((account) => (
            <li key={account.email}>
              <button
                type="button"
                onClick={() => {
                  setEmail(account.email);
                  setPassword(DEMO_PASSWORD);
                }}
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-left text-sm hover:border-accent"
              >
                <span className="block font-medium">{account.name}</span>
                <span className="block text-xs text-muted-foreground">{account.note}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
