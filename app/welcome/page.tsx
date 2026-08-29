import { requireFirmContext } from "@/lib/auth/firm-context";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { completeProfile } from "./actions";

// Everyone else at the firm sees this person by name, not email — Members lists, the
// verification-log reviewer picker, review history, etc. all prefer fullName over email
// (see lib/verification/review-chain.ts). Clerk doesn't always collect a name at sign-up,
// so this is a one-time gate (app/(app)/layout.tsx redirects here while fullName is null)
// before someone can reach the rest of the app.
export default async function WelcomePage() {
  const ctx = await requireFirmContext();

  if (ctx.fullName) {
    redirect("/dashboard");
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 py-24">
      <div className="text-center">
        <h1 className="text-xl font-semibold">Welcome to Circular 230 Kit</h1>
        <p className="text-sm text-muted-foreground">
          One last thing — what should your team see instead of your email?
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your name</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={completeProfile} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="fullName">Full name</Label>
              <Input id="fullName" name="fullName" required autoFocus placeholder="Jane Doe" />
            </div>
            <Button type="submit" className="w-full">
              Continue
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
