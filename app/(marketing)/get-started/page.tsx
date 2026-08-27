"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import {
  ScaleIcon,
  FileTextIcon,
  GraduationCapIcon,
  ShieldCheckIcon,
  ClipboardCheckIcon,
  CheckIcon,
  FlagIcon,
  ArrowRightIcon,
  ArrowLeftIcon,
  XIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Slide = {
  eyebrow: string;
  headline: React.ReactNode;
  body: React.ReactNode;
  visual: React.ReactNode;
};

const PILLARS = [
  { icon: FileTextIcon, label: "Policy generator", note: "§10.37 · §10.35" },
  { icon: GraduationCapIcon, label: "Staff training", note: "§10.36" },
  { icon: ShieldCheckIcon, label: "AI tool register", note: "§10.36 · §7216" },
  { icon: ClipboardCheckIcon, label: "Verification log", note: "§10.22" },
];

const SLIDES: Slide[] = [
  {
    eyebrow: "Why this exists",
    headline: "AI is already part of your practice. Is it part of your policy?",
    body: "In June 2026, the IRS issued its first formal guidance on AI use under Circular 230 — six existing practitioner obligations now apply to whatever an AI tool touched before it reached a client or the IRS.",
    visual: (
      <div className="flex size-full items-center justify-center">
        <span className="flex size-28 items-center justify-center rounded-full border-2 border-[var(--c230-citation)]/30 font-mono text-2xl font-medium text-[var(--c230-citation)]">
          §230
        </span>
      </div>
    ),
  },
  {
    eyebrow: "This isn't hypothetical",
    headline: "1,600+",
    body: (
      <>
        Documented court cases worldwide where a party&apos;s AI-generated content — fake citations, hallucinated
        sources — was caught by a judge. That&apos;s across the legal profession broadly, not tax practice
        specifically, but the failure mode is the same one Circular 230 now asks firms to guard against.{" "}
        <span className="text-[var(--c230-ink-soft)]/70">
          (Source: Damien Charlotin&apos;s AI Hallucination Cases database, ~1,600 cases as of mid-2026, growing daily.)
        </span>
      </>
    ),
    visual: (
      <div className="flex size-full items-center justify-center">
        <ScaleIcon className="size-24 text-[var(--c230-flag)]" strokeWidth={1.25} />
      </div>
    ),
  },
  {
    eyebrow: "How it fits together",
    headline: "Four pieces, one obligation each",
    body: "Not one tool that hand-waves at everything — a dedicated piece for each of the practitioner obligations OPR's guidance maps onto AI use.",
    visual: (
      <div className="grid w-full max-w-xs grid-cols-2 gap-3">
        {PILLARS.map((p) => (
          <div
            key={p.label}
            className="flex flex-col items-start gap-2 rounded-lg border border-[var(--c230-hairline)] bg-[var(--c230-paper-raised)] p-3"
          >
            <p.icon className="size-4.5 text-[var(--c230-citation)]" />
            <span className="text-xs leading-tight font-medium">{p.label}</span>
            <span className="font-mono text-[10px] text-[var(--c230-ink-soft)]">{p.note}</span>
          </div>
        ))}
      </div>
    ),
  },
  {
    eyebrow: "Grounded, not guessed",
    headline: "Every clause is cited. Or it's refused.",
    body: "We don't let AI invent policy language. Every clause is grounded in a specific retrieved source — sections we can't ground come back as an explicit refusal, never a plausible-sounding guess.",
    visual: (
      <div className="w-full max-w-xs space-y-2">
        <div className="flex items-center gap-2 rounded-lg border border-[var(--c230-hairline)] bg-[var(--c230-paper-raised)] px-3 py-2.5">
          <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-[var(--c230-ledger-soft)] text-[var(--c230-ledger)]">
            <CheckIcon className="size-3" strokeWidth={3} />
          </span>
          <span className="text-xs text-[var(--c230-ink)]">§10.22 — grounded</span>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-[var(--c230-hairline)] bg-[var(--c230-paper-raised)] px-3 py-2.5">
          <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-[var(--c230-flag-soft)] text-[var(--c230-flag)]">
            <FlagIcon className="size-3" strokeWidth={3} />
          </span>
          <span className="text-xs text-[var(--c230-ink)]">No source — refused</span>
        </div>
      </div>
    ),
  },
];

const SWIPE_THRESHOLD_PX = 60;

export default function GetStartedPage() {
  const [index, setIndex] = useState(0);
  const [dragOffset, setDragOffset] = useState(0);
  const dragState = useRef<{ startX: number; dragging: boolean } | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  const totalSteps = SLIDES.length + 1; // + final CTA "slide"
  const isLastSlide = index === totalSteps - 1;

  function goTo(next: number) {
    setIndex(Math.max(0, Math.min(totalSteps - 1, next)));
  }

  function onPointerDown(e: React.PointerEvent) {
    // Don't hijack pointer capture when the press starts on an interactive
    // element (the Sign up button, preview link, etc.) — capturing there
    // suppresses the element's own click. Only genuine background/slide-area
    // presses start a drag.
    if ((e.target as HTMLElement).closest("button, a")) return;
    dragState.current = { startX: e.clientX, dragging: true };
    trackRef.current?.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!dragState.current?.dragging) return;
    setDragOffset(e.clientX - dragState.current.startX);
  }
  function endDrag() {
    if (!dragState.current) return;
    if (dragOffset < -SWIPE_THRESHOLD_PX) goTo(index + 1);
    else if (dragOffset > SWIPE_THRESHOLD_PX) goTo(index - 1);
    dragState.current = null;
    setDragOffset(0);
  }

  return (
    <div
      className="flex flex-1 flex-col items-center justify-center px-6 py-10"
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") goTo(index + 1);
        if (e.key === "ArrowLeft") goTo(index - 1);
      }}
      tabIndex={-1}
    >
      <div className="flex w-full max-w-lg items-center justify-between pb-6">
        <div className="flex gap-1.5">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <button
              key={i}
              aria-label={`Go to step ${i + 1}`}
              onClick={() => goTo(i)}
              className={cn(
                "h-1.5 rounded-full transition-all duration-300",
                i === index ? "w-6 bg-[var(--c230-ink)]" : "w-1.5 bg-[var(--c230-hairline-strong)]"
              )}
            />
          ))}
        </div>
        <Link
          href="/sign-up"
          className="flex items-center gap-1 text-xs text-[var(--c230-ink-soft)] hover:text-[var(--c230-ink)]"
        >
          Skip <XIcon className="size-3" />
        </Link>
      </div>

      <div className="w-full max-w-lg overflow-hidden">
        <div
          ref={trackRef}
          className={cn("flex touch-pan-y", !dragState.current && "transition-transform duration-300 ease-out")}
          style={{ transform: `translateX(calc(${-index * 100}% + ${dragOffset}px))` }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          {SLIDES.map((slide, i) => (
            <div key={i} className="w-full shrink-0 select-none px-1">
              <div className="flex h-56 items-center justify-center">{slide.visual}</div>
              <p className="text-center font-mono text-[11px] font-medium tracking-widest text-[var(--c230-citation)] uppercase">
                {slide.eyebrow}
              </p>
              <h1
                className={cn(
                  "mt-3 text-center font-[family-name:var(--font-display)] font-medium tracking-tight",
                  i === 1 ? "text-6xl text-[var(--c230-ink)]" : "text-2xl"
                )}
              >
                {slide.headline}
              </h1>
              <p className="mt-4 text-center text-sm leading-relaxed text-[var(--c230-ink-soft)]">{slide.body}</p>
            </div>
          ))}

          <div className="w-full shrink-0 select-none px-1">
            <div className="flex h-56 items-center justify-center">
              <span className="flex size-24 items-center justify-center rounded-full bg-[var(--c230-ink)]">
                <ArrowRightIcon className="size-9 text-[var(--c230-paper)]" />
              </span>
            </div>
            <h1 className="text-center font-[family-name:var(--font-display)] text-2xl font-medium tracking-tight">
              Ready to see your firm&apos;s policy?
            </h1>
            <p className="mt-4 text-center text-sm leading-relaxed text-[var(--c230-ink-soft)]">
              Sign up to generate, save, and export it — or try the preview first, no account needed.
            </p>
            <div className="mt-6 flex flex-col items-center gap-3">
              <Button
                size="lg"
                className="w-full max-w-56 bg-[var(--c230-ink)] text-[var(--c230-paper)] hover:bg-[var(--c230-ink)]/85"
                render={<Link href="/sign-up" />}
              >
                Sign up
              </Button>
              <Link
                href="/policy-generator"
                className="text-sm text-[var(--c230-ink-soft)] underline underline-offset-4 hover:text-[var(--c230-ink)]"
              >
                Try the free preview first
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8 flex w-full max-w-lg items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          disabled={index === 0}
          onClick={() => goTo(index - 1)}
          className="text-[var(--c230-ink)] hover:bg-[var(--c230-ink)]/5 disabled:opacity-0"
        >
          <ArrowLeftIcon /> Back
        </Button>
        {!isLastSlide && (
          <Button
            onClick={() => goTo(index + 1)}
            className="bg-[var(--c230-ink)] text-[var(--c230-paper)] hover:bg-[var(--c230-ink)]/85"
          >
            Next <ArrowRightIcon />
          </Button>
        )}
      </div>
    </div>
  );
}
