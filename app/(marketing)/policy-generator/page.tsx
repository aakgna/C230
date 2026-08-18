import { PolicyPreviewForm } from "./PolicyPreviewForm";

// previewPolicyClauses (./actions.ts) makes 5 sequential LLM calls spaced by
// INTER_CALL_DELAY_MS=5000 to avoid the Gateway's rate limit — see
// app/(app)/policies/new/page.tsx for the same pattern at larger scale. That
// alone is ~20s of sleep before any generation time, past the platform
// default timeout.
export const maxDuration = 120;

export default function PolicyGeneratorPreviewPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-8 px-6 py-16">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Preview your AI-use policy</h1>
        <p className="mt-2 text-muted-foreground">
          Every clause is grounded in a specific cited source — sections we can&apos;t ground are shown as explicit
          refusals, not a plausible-sounding guess. This preview isn&apos;t saved; sign up to persist and export it.
        </p>
      </div>
      <PolicyPreviewForm />
    </div>
  );
}
