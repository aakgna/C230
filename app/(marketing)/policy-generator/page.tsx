import { PolicyPreviewForm } from "./PolicyPreviewForm";

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
