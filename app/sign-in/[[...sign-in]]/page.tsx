import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="flex flex-1 items-center justify-center py-16">
      {/* See app/sign-up/[[...sign-up]]/page.tsx for why this is needed. */}
      <SignIn fallbackRedirectUrl="/dashboard" />
    </div>
  );
}
