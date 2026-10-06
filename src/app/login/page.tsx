import { redirect } from "next/navigation";
import { LoginForm } from "@/components/LoginForm";
import { currentUser } from "@/lib/auth";

export const metadata = { title: "Sign in · Executable Charter" };

export default async function LoginPage() {
  if (await currentUser()) redirect("/dashboard");

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-6 py-16">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <span className="size-3 rounded-[3px] bg-accent" aria-hidden />
        Executable Charter
      </div>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Sign in</h1>
        <p className="mt-1 text-sm text-muted-foreground">Terms that run as code. Every rupee has a receipt.</p>
      </div>
      <LoginForm />
      <p className="text-xs text-muted-foreground">
        Hackathon prototype: all users, projects and payments are synthetic.
      </p>
    </main>
  );
}
