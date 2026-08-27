"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

// requireFirmContext() sends users here when the Clerk webhook that syncs
// their firm/user row (see app/api/webhooks/clerk/route.ts) hasn't landed
// yet. Poll by re-attempting /dashboard — once the sync lands, that redirect
// stops firing and the user proceeds normally.
//
// Each poll is a full server redirect (/dashboard -> back here on failure),
// which remounts this component — so the count can't live in React state,
// it has to survive across that remount. sessionStorage does; it's cleared
// once we give up so a later, unrelated visit to this page starts fresh.
const POLL_INTERVAL_MS = 2000;
const MAX_POLLS = 5;
const STORAGE_KEY = "onboarding-pending-poll-count";

function readPollCount(): number {
  if (typeof window === "undefined") return 0;
  return Number(window.sessionStorage.getItem(STORAGE_KEY) ?? "0");
}

export default function OnboardingPendingPage() {
  const router = useRouter();
  const [pollCount] = useState(readPollCount);
  const gaveUp = pollCount >= MAX_POLLS;

  useEffect(() => {
    if (gaveUp) {
      window.sessionStorage.removeItem(STORAGE_KEY);
      return;
    }
    const timer = setTimeout(() => {
      window.sessionStorage.setItem(STORAGE_KEY, String(pollCount + 1));
      router.replace("/dashboard");
    }, POLL_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [gaveUp, pollCount, router]);

  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-3 py-24 text-center">
      <h1 className="text-xl font-semibold">Setting up your workspace</h1>
      {gaveUp ? (
        <>
          <p className="text-sm text-muted-foreground">
            This is taking longer than expected. Try again, or check back in a minute.
          </p>
          <Button
            variant="outline"
            onClick={() => {
              window.sessionStorage.removeItem(STORAGE_KEY);
              router.replace("/dashboard");
            }}
          >
            Try again
          </Button>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          We&apos;re syncing your new organization — this usually takes just a few seconds. This page will refresh
          automatically.
        </p>
      )}
    </div>
  );
}
