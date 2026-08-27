import { CheckIcon, FlagIcon } from "lucide-react";

type Line = {
  text: string;
} & (
  | { status: "grounded"; citation: string }
  | { status: "refused"; reason: string }
);

const LINES: Line[] = [
  {
    text: "Staff may use approved AI tools to draft return workpapers, provided every citation is independently verified before delivery.",
    status: "grounded",
    citation: "§10.22",
  },
  {
    text: "AI-assisted written advice must rest on facts and authorities the preparer has personally confirmed, not on the model's stated confidence.",
    status: "grounded",
    citation: "§10.37",
  },
  {
    text: "Billing must reflect actual time spent — efficiency gained from AI tools is credited back to the client.",
    status: "grounded",
    citation: "§10.27(a)",
  },
  {
    text: "Client data may be used to further train the vendor's model.",
    status: "refused",
    reason: "No source in your firm's approved-tool register",
  },
];

export function AnnotatedDocument() {
  return (
    <div className="rounded-lg border border-[var(--c230-hairline-strong)] bg-[var(--c230-paper-raised)] shadow-[0_1px_2px_rgba(28,36,48,0.04),0_12px_32px_-16px_rgba(28,36,48,0.18)]">
      <div className="flex items-center justify-between border-b border-[var(--c230-hairline)] px-5 py-3">
        <span className="font-mono text-[11px] tracking-wide text-[var(--c230-ink-soft)] uppercase">
          Draft — AI-use policy, §3 Client data &amp; work product
        </span>
        <span className="font-mono text-[11px] text-[var(--c230-ink-soft)]">v0.4</span>
      </div>
      <ol className="divide-y divide-[var(--c230-hairline)]">
        {LINES.map((line, i) => (
          <li key={i} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start sm:gap-6">
            <p className="flex-1 font-[family-name:var(--font-display)] text-[15px] leading-relaxed italic text-[var(--c230-ink)]">
              {line.text}
            </p>
            <div
              className="c230-annotate flex shrink-0 items-start gap-1.5 self-start sm:w-48"
              style={{ animationDelay: `${300 + i * 160}ms` }}
            >
              {line.status === "grounded" ? (
                <>
                  <span className="mt-0.5 flex size-4.5 shrink-0 items-center justify-center rounded-full bg-[var(--c230-ledger-soft)] text-[var(--c230-ledger)]">
                    <CheckIcon className="size-3" strokeWidth={3} />
                  </span>
                  <span className="font-mono text-[11px] leading-snug text-[var(--c230-ledger)]">
                    {line.citation} — grounded
                  </span>
                </>
              ) : (
                <>
                  <span className="mt-0.5 flex size-4.5 shrink-0 items-center justify-center rounded-full bg-[var(--c230-flag-soft)] text-[var(--c230-flag)]">
                    <FlagIcon className="size-3" strokeWidth={3} />
                  </span>
                  <span className="font-mono text-[11px] leading-snug text-[var(--c230-flag)]">{line.reason}</span>
                </>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
