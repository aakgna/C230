import Link from "next/link";
import { Button } from "@/components/ui/button";

export function MarketingHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--c230-hairline)] bg-[var(--c230-paper)]/90 backdrop-blur-sm">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="flex size-7 items-center justify-center rounded-[4px] border border-[var(--c230-citation)]/40 font-mono text-[10px] font-medium tracking-tight text-[var(--c230-citation)]">
            §230
          </span>
          <span className="font-[family-name:var(--font-display)] text-[17px] font-medium tracking-tight">
            Circular 230 Kit
          </span>
        </Link>
        <nav className="flex items-center gap-2">
          <Button
            variant="ghost"
            className="text-[var(--c230-ink)] hover:bg-[var(--c230-ink)]/5"
            render={<Link href="/sign-in" />}
          >
            Sign in
          </Button>
          <Button
            className="bg-[var(--c230-ink)] text-[var(--c230-paper)] hover:bg-[var(--c230-ink)]/85"
            render={<Link href="/get-started" />}
          >
            Get started
          </Button>
        </nav>
      </div>
    </header>
  );
}
