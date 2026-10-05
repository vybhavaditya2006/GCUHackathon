const flow = ["Contribution", "Verification", "Attribution", "Credit / Payment"];

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-6 px-6 py-16">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <span className="size-3 rounded-[3px] bg-accent" aria-hidden />
        Executable Charter
      </div>
      <h1 className="text-4xl font-bold tracking-tight">
        Terms that run as code. Every rupee has a receipt.
      </h1>
      <p className="text-muted-foreground">
        Sponsors, experts, students and AI agents work on research projects together. Every
        contribution lands in a tamper-evident ledger, and a charter engine splits money and credit.
      </p>
      <ol className="flex flex-wrap items-center gap-2 text-sm font-medium">
        {flow.map((step, i) => (
          <li key={step} className="flex items-center gap-2">
            {i > 0 && <span className="text-accent" aria-hidden>→</span>}
            <span className="rounded-full border border-border bg-card px-3 py-1">{step}</span>
          </li>
        ))}
      </ol>
      <p className="text-xs text-muted-foreground">
        Scaffold only. Prototype for Gardenia 2K26: all users, projects and payments are synthetic.
      </p>
    </main>
  );
}
