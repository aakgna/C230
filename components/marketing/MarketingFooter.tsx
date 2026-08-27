import Link from "next/link";

export function MarketingFooter() {
  return (
    <footer className="border-t border-[var(--c230-hairline)]">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-10 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <span className="flex size-6 items-center justify-center rounded-[4px] border border-[var(--c230-citation)]/40 font-mono text-[9px] font-medium text-[var(--c230-citation)]">
            §230
          </span>
          <span className="font-[family-name:var(--font-display)] text-sm font-medium">Circular 230 Kit</span>
        </div>
        <p className="max-w-md text-xs leading-relaxed text-[var(--c230-ink-soft)]">
          Reference to IRS OPR Alert 2026-19 and 31 CFR Part 10 is provided for context, not legal advice. Confirm
          current requirements with a Circular 230 specialist.
        </p>
        <nav className="flex items-center gap-5 text-xs text-[var(--c230-ink-soft)]">
          <Link href="/policy-generator" className="hover:text-[var(--c230-ink)]">
            Policy generator
          </Link>
          <Link href="/sign-in" className="hover:text-[var(--c230-ink)]">
            Sign in
          </Link>
        </nav>
      </div>
    </footer>
  );
}
