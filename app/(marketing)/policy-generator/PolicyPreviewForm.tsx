"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { AlertTriangleIcon } from "lucide-react";
import { clientDataSensitivityValues, practiceMixValues } from "@/lib/validation/schemas";
import { previewPolicyClauses, type PreviewState } from "./actions";

const initialState: PreviewState = { clauses: null, error: null };

export function PolicyPreviewForm() {
  const [state, formAction, isPending] = useActionState(previewPolicyClauses, initialState);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Quick preview</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="space-y-4">
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

            <Button type="submit" disabled={isPending}>
              {isPending ? "Generating…" : "Preview policy clauses"}
            </Button>
            {state.error && <p className="text-sm text-destructive">{state.error}</p>}
          </form>
        </CardContent>
      </Card>

      {state.clauses && (
        <div className="space-y-4">
          <div className="space-y-3">
            {state.clauses.map((clause) => (
              <Card key={clause.section} className={clause.isRefusal ? "border-destructive/50" : undefined}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    §{clause.section}
                    {clause.isRefusal && (
                      <Badge variant="destructive" className="gap-1">
                        <AlertTriangleIcon className="size-3" /> No grounded clause
                      </Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {clause.isRefusal ? clause.refusalReason : clause.clauseText}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
          <Card className="border-primary/50 bg-primary/5">
            <CardContent className="flex items-center justify-between py-4">
              <p className="text-sm">Sign up to save, version, and export this policy as PDF/DOCX.</p>
              <Button render={<Link href="/sign-up" />}>Sign up</Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
