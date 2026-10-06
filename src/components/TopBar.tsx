import Link from "next/link";
import type { CurrentUser } from "@/lib/auth";
import { Pill } from "@/components/Pill";

/** Global top bar: product name, project title (when inside a project) and the role badge. */
export function TopBar({
  user,
  projectTitle,
  roleLabel,
}: {
  user: CurrentUser;
  projectTitle?: string;
  /** The viewer's role on this project; defaults to their platform role. */
  roleLabel?: string;
}) {
  return (
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-4 px-6 py-3">
        <Link href="/dashboard" className="flex shrink-0 items-center gap-2 text-sm font-semibold">
          <span className="size-3 rounded-[3px] bg-accent" aria-hidden />
          Executable Charter
        </Link>
        {projectTitle && (
          <span className="min-w-0 flex-1 truncate border-l border-border pl-4 text-sm text-muted-foreground">
            {projectTitle}
          </span>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-3 text-sm">
          <span className="hidden sm:inline">{user.fullName}</span>
          <Pill tone="ai" className="capitalize">
            {roleLabel ?? user.role}
          </Pill>
          <form action="/api/auth/logout" method="post">
            <button type="submit" className="text-muted-foreground underline-offset-4 hover:underline">
              Sign out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
