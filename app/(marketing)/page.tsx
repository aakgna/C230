import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function MarketingHome() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-24 text-center">
      <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
        Circular 230 AI Compliance Kit
      </p>
      <h1 className="mt-4 max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">
        Document your firm&apos;s AI use before OPR asks you to.
      </h1>
      <p className="mt-6 max-w-xl text-lg text-muted-foreground">
        Generate a Circular 230-mapped AI-use policy, track staff training,
        vet your AI tools, and keep a structured, tamper-evident log of every
        AI-assisted work product your firm reviews.
      </p>
      <div className="mt-10 flex gap-4">
        <Button size="lg" render={<Link href="/policy-generator" />}>
          Try the policy generator
        </Button>
        <Button size="lg" variant="outline" render={<Link href="/sign-up" />}>
          Sign up
        </Button>
      </div>
    </div>
  );
}
