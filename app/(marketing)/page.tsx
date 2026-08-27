import Link from "next/link";
import { Button } from "@/components/ui/button";
import { AnnotatedDocument } from "@/components/marketing/AnnotatedDocument";
import { FileTextIcon, GraduationCapIcon, ShieldCheckIcon, ClipboardCheckIcon, ArrowRightIcon } from "lucide-react";

const PILLARS = [
  {
    icon: FileTextIcon,
    citation: "§10.37 · §10.35",
    title: "Policy generator",
    body: "Firm AI-use policy clauses grounded in a cited source per section — sections without support come back as an explicit refusal, never a guess.",
  },
  {
    icon: GraduationCapIcon,
    citation: "§10.36",
    title: "Staff training",
    body: "AI-literacy modules mapped to the competence and firm-procedure obligations OPR Alert 2026-19 lays out, with a completion record per staff member.",
  },
  {
    icon: ShieldCheckIcon,
    citation: "§10.36 · §7216",
    title: "AI tool register",
    body: "Every tool your firm uses gets vetted for data handling and approval status before staff touch client work with it — not left to individual judgment.",
  },
  {
    icon: ClipboardCheckIcon,
    citation: "§10.22",
    title: "Verification log",
    body: "A tamper-evident, append-only record of who reviewed AI-assisted work, what they checked, and how — the documentation OPR now expects on request.",
  },
];

const PROVISIONS = [
  { ref: "§10.22", name: "Due diligence", note: "Verify AI-cited authority and calculations before they reach a client or the IRS." },
  { ref: "§10.35", name: "Competence", note: "Understand what your AI tools can and can't do, not just the tax law itself." },
  { ref: "§10.27(a)", name: "Fees", note: "Billing has to reflect what AI actually saved in time and effort." },
  { ref: "§10.36", name: "Firm procedures", note: "Leadership is responsible for staff training, tool vetting, and review protocol." },
  { ref: "§10.37", name: "Written advice", note: "AI-assisted advice still needs independently verified facts and law." },
  { ref: "IRC §7216 / §6713", name: "Confidentiality", note: "Client data can't go into unsecured or public AI platforms." },
];

export default function MarketingHome() {
  return (
    <>
      {/* Hero */}
      <section className="mx-auto grid max-w-6xl gap-14 px-6 pt-16 pb-20 lg:grid-cols-[1fr_1fr] lg:items-center lg:pt-24">
        <div className="min-w-0">
          <p className="font-mono text-[11px] font-medium tracking-widest text-[var(--c230-citation)] uppercase">
            IRS OPR Alert 2026-19 · 31 CFR Part 10
          </p>
          <h1 className="mt-4 font-[family-name:var(--font-display)] text-[2.75rem] leading-[1.08] font-medium tracking-tight sm:text-[3.25rem]">
            Your firm&apos;s AI use is now a <span className="italic text-[var(--c230-citation)]">Circular 230</span>{" "}
            question.
          </h1>
          <p className="mt-6 max-w-lg text-lg leading-relaxed text-[var(--c230-ink-soft)]">
            OPR&apos;s 2026 guidance maps six existing practitioner obligations onto AI-assisted work. This kit turns
            each one into something you can actually produce: a grounded policy, a training record, a vetted tool
            list, a documented review trail.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Button
              size="lg"
              className="bg-[var(--c230-ink)] text-[var(--c230-paper)] hover:bg-[var(--c230-ink)]/85"
              render={<Link href="/policy-generator" />}
            >
              Try the policy generator
              <ArrowRightIcon />
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="border-[var(--c230-hairline-strong)] text-[var(--c230-ink)] hover:bg-[var(--c230-ink)]/5"
              render={<Link href="/sign-up" />}
            >
              Sign up
            </Button>
          </div>
        </div>
        <AnnotatedDocument />
      </section>

      {/* Problem */}
      <section className="border-t border-[var(--c230-hairline)]">
        <div className="mx-auto grid max-w-6xl gap-10 px-6 py-20 lg:grid-cols-[minmax(0,320px)_1fr] lg:gap-16">
          <div>
            <p className="font-mono text-[11px] font-medium tracking-widest text-[var(--c230-ink-soft)] uppercase">
              The problem
            </p>
            <h2 className="mt-3 font-[family-name:var(--font-display)] text-3xl font-medium tracking-tight">
              &ldquo;Reviewed it&rdquo; isn&apos;t evidence.
            </h2>
          </div>
          <div className="space-y-5 text-[15px] leading-relaxed text-[var(--c230-ink-soft)]">
            <p>
              On June 24, 2026, IRS OPR issued Alert 2026-19 — the first formal guidance on how AI use fits within
              Circular 230. It didn&apos;t create new rules. It clarified that six obligations your firm already had —
              diligence, competence, fees, firm procedures, written advice, confidentiality — now apply to whatever an
              AI tool touched before it reached a client or the IRS.
            </p>
            <p>
              Most firms have no structured way to show that happened. A verbal &ldquo;someone checked it&rdquo; isn&apos;t what
              OPR is asking for — the alert specifically calls for evidence of who reviewed AI output, what the
              review involved, and how adequacy was confirmed.
            </p>
            <blockquote className="border-l-2 border-[var(--c230-citation)]/40 py-1 pl-5 font-[family-name:var(--font-display)] text-lg italic text-[var(--c230-ink)]">
              &ldquo;Technology serves as a powerful tool, not a substitute for professional judgment.&rdquo;
              <footer className="mt-2 font-sans text-xs font-normal not-italic text-[var(--c230-ink-soft)]">
                — IRS OPR Alert 2026-19
              </footer>
            </blockquote>
          </div>
        </div>
      </section>

      {/* Solution: four pillars */}
      <section className="border-t border-[var(--c230-hairline)] bg-[var(--c230-paper-raised)]">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <div className="max-w-xl">
            <p className="font-mono text-[11px] font-medium tracking-widest text-[var(--c230-ink-soft)] uppercase">
              How it fits together
            </p>
            <h2 className="mt-3 font-[family-name:var(--font-display)] text-3xl font-medium tracking-tight">
              One tool per obligation, not one tool that hand-waves at all of them.
            </h2>
          </div>
          <div className="mt-12 grid gap-px overflow-hidden rounded-lg border border-[var(--c230-hairline)] bg-[var(--c230-hairline)] sm:grid-cols-2">
            {PILLARS.map((pillar) => (
              <div key={pillar.title} className="bg-[var(--c230-paper-raised)] p-7">
                <div className="flex items-center justify-between">
                  <span className="flex size-9 items-center justify-center rounded-md bg-[var(--c230-citation-soft)] text-[var(--c230-citation)]">
                    <pillar.icon className="size-4.5" />
                  </span>
                  <span className="font-mono text-[11px] text-[var(--c230-ink-soft)]">{pillar.citation}</span>
                </div>
                <h3 className="mt-4 font-[family-name:var(--font-display)] text-lg font-medium">{pillar.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--c230-ink-soft)]">{pillar.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Six-provision index */}
      <section className="border-t border-[var(--c230-hairline)]">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <div className="max-w-xl">
            <p className="font-mono text-[11px] font-medium tracking-widest text-[var(--c230-ink-soft)] uppercase">
              The index
            </p>
            <h2 className="mt-3 font-[family-name:var(--font-display)] text-3xl font-medium tracking-tight">
              The six provisions OPR Alert 2026-19 applies to AI.
            </h2>
          </div>
          <dl className="mt-10 divide-y divide-[var(--c230-hairline)] border-y border-[var(--c230-hairline)]">
            {PROVISIONS.map((p) => (
              <div key={p.ref} className="grid grid-cols-1 gap-1.5 py-5 sm:grid-cols-[140px_180px_1fr] sm:items-baseline sm:gap-6">
                <dt className="font-mono text-sm text-[var(--c230-citation)]">{p.ref}</dt>
                <dt className="font-[family-name:var(--font-display)] text-base font-medium">{p.name}</dt>
                <dd className="text-sm text-[var(--c230-ink-soft)]">{p.note}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* Final CTA */}
      <section className="border-t border-[var(--c230-hairline)] bg-[var(--c230-ink)]">
        <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-6 py-20 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-[family-name:var(--font-display)] text-3xl font-medium tracking-tight text-[var(--c230-paper)]">
              Start with one clause. See how it&apos;s grounded.
            </h2>
            <p className="mt-3 max-w-md text-[15px] text-[var(--c230-paper)]/70">
              The preview generator runs against your firm&apos;s practice mix — no sign-up needed to see it work.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-3">
            <Button
              size="lg"
              className="bg-[var(--c230-paper)] text-[var(--c230-ink)] hover:bg-[var(--c230-paper)]/90"
              render={<Link href="/policy-generator" />}
            >
              Try the policy generator
              <ArrowRightIcon />
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="border-[var(--c230-paper)]/30 bg-transparent text-[var(--c230-paper)] hover:bg-[var(--c230-paper)]/10"
              render={<Link href="/sign-up" />}
            >
              Sign up
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
