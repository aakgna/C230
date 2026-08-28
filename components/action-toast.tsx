"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Celebration } from "@/components/celebration";

type Outcome = {
  param: string;
  message: string;
  description?: string;
  tone?: "success" | "info" | "warning" | "error";
  // A confetti-burst moment on top of the toast — reserved for actions actually worth
  // rewarding (finishing a review, completing a module, an approval landing), not every
  // success. Independent of `tone`: submitting a review, for instance, stays an "info" toast
  // (it's not yet approved, still accurate) while still celebrating the fact that the
  // practitioner did the thing this whole app exists to get people to do promptly.
  celebrate?: boolean;
};

// Mounted once per destination page. These are Server Action -> redirect() flows, not
// client-side form submissions, so the standard way to signal "that action just succeeded" to
// the page you land on is a query param the redirect carries. This reads it, fires a toast (and
// optionally a celebration), then strips the param after a short delay — long enough for a
// server-rendered row/card highlight keyed off the same param (see e.g.
// app/(app)/tools/page.tsx's `createdId`) to be visible before the param (and the highlight
// along with it) disappears on the next request.
export function ActionToast({ outcomes }: { outcomes: Outcome[] }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const fired = useRef(false);

  // useSearchParams() resolves synchronously even on the first client render, so this reflects
  // the real query param from the start — computed directly, not via an effect+setState
  // round-trip (avoids react-hooks/set-state-in-effect, and skips an extra render besides).
  const matched = outcomes.find((o) => searchParams.has(o.param));
  const [celebrating, setCelebrating] = useState<string | null>(() => (matched?.celebrate ? matched.message : null));

  useEffect(() => {
    if (fired.current) return;
    if (!matched) return;
    fired.current = true;

    const toastFn = { success: toast.success, info: toast.info, warning: toast.warning, error: toast.error }[
      matched.tone ?? "success"
    ];
    toastFn(matched.message, { description: matched.description });

    const timer = setTimeout(() => {
      const next = new URLSearchParams(searchParams);
      next.delete(matched.param);
      router.replace(next.size > 0 ? `${pathname}?${next.toString()}` : pathname, { scroll: false });
    }, 2000);

    return () => clearTimeout(timer);
    // Intentionally run once on mount only — re-running on every searchParams change would
    // re-fire the toast during the very replace() this effect schedules.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <Celebration show={celebrating !== null} message={celebrating ?? ""} onDone={() => setCelebrating(null)} />;
}
