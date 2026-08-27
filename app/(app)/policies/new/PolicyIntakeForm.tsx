"use client";

import { useActionState, useEffect, useState } from "react";
import { CheckIcon, Loader2Icon } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { clientDataSensitivityValues, practiceMixValues } from "@/lib/validation/schemas";
import { REQUIRED_POLICY_SECTIONS } from "@/lib/rag/sections";
import { cn } from "@/lib/utils";
import { createPolicyDocument } from "../actions";

const SECTION_LABELS: Record<string, string> = {
  "10.22": "Due diligence",
  "10.27(a)": "Fees",
  "10.35": "Competence",
  "10.36": "Firm procedures",
  "10.37": "Written advice",
};

// This can't reflect true server-side progress — createPolicyDocument is a
// single request/response with no streaming — so it's a plausibly-paced
// approximation of the real sequential-with-delay pipeline (see actions.ts),
// not a literal progress readout. It loops (with a "still working" note)
// rather than stalling if the real call runs long.
const STEPS = [
  ...REQUIRED_POLICY_SECTIONS.map((section) => ({
    key: section,
    label: `§${section} — ${SECTION_LABELS[section]}`,
  })),
  { key: "eval", label: "Running grounding check" },
];

const STEP_DURATION_MS = 9000;

export function PolicyIntakeForm({ tools }: { tools: { id: string; toolName: string }[] }) {
  const [, formAction, isPending] = useActionState(createPolicyDocument, undefined);
  const [stepIndex, setStepIndex] = useState(0);
  const [cycled, setCycled] = useState(false);

  useEffect(() => {
    if (!isPending) {
      setStepIndex(0);
      setCycled(false);
      return;
    }
    const timer = setInterval(() => {
      setStepIndex((prev) => {
        const next = prev + 1;
        if (next >= STEPS.length) {
          setCycled(true);
          return 0;
        }
        return next;
      });
    }, STEP_DURATION_MS);
    return () => clearInterval(timer);
  }, [isPending]);

  if (isPending) {
    return (
      <div className="space-y-5 py-1">
        <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-700 ease-out"
            style={{ width: `${((stepIndex + 1) / STEPS.length) * 100}%` }}
          />
        </div>
        <ul className="space-y-1">
          {STEPS.map((step, i) => {
            const isDone = i < stepIndex;
            const isActive = i === stepIndex;
            return (
              <li
                key={step.key}
                className={cn(
                  "animate-row-settle flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors",
                  isActive && "bg-muted"
                )}
              >
                <span className="flex size-5 shrink-0 items-center justify-center">
                  {isDone ? (
                    <CheckIcon className="animate-check-pop size-4 text-primary" strokeWidth={3} />
                  ) : isActive ? (
                    <Loader2Icon className="size-4 animate-spin text-primary" />
                  ) : (
                    <span className="size-1.5 rounded-full bg-border" />
                  )}
                </span>
                <span
                  className={cn(
                    "text-sm",
                    isActive ? "font-medium text-foreground" : isDone ? "text-foreground" : "text-muted-foreground"
                  )}
                >
                  {step.label}
                </span>
              </li>
            );
          })}
        </ul>
        {cycled && (
          <p className="text-center text-xs text-muted-foreground">
            Still working — this can take a couple of minutes.
          </p>
        )}
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="firmSize">Number of practitioners</Label>
        <Input type="number" id="firmSize" name="firmSize" min={1} max={500} defaultValue={2} required />
      </div>

      <div className="space-y-2">
        <Label>AI tools currently in use</Label>
        <div className="space-y-2 rounded-lg border p-3">
          {tools.map((tool) => (
            <label key={tool.id} className="flex items-center gap-2 text-sm">
              <Checkbox name="aiToolIds" value={tool.id} />
              {tool.toolName}
            </label>
          ))}
          {tools.length === 0 && <p className="text-sm text-muted-foreground">No tools registered yet.</p>}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="clientDataSensitivity">Client data sensitivity</Label>
        <Select name="clientDataSensitivity" required defaultValue="moderate">
          <SelectTrigger id="clientDataSensitivity" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {clientDataSensitivityValues.map((v) => (
              <SelectItem key={v} value={v}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Practice mix</Label>
        <div className="space-y-2 rounded-lg border p-3">
          {practiceMixValues.map((v) => (
            <label key={v} className="flex items-center gap-2 text-sm">
              <Checkbox name="practiceMix" value={v} defaultChecked={v === "individual"} />
              {v}
            </label>
          ))}
        </div>
      </div>

      <Button type="submit">Generate policy</Button>
    </form>
  );
}
