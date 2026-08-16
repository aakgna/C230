import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <div className="flex flex-1 items-center justify-center py-16">
      {/* Without this, Clerk falls back to "/" after sign-up — a static
          marketing page with no signed-in UI, so a freshly authenticated
          user looks logged out. /dashboard runs requireFirmContext(), which
          correctly routes to org creation if the user has no firm yet. */}
      <SignUp fallbackRedirectUrl="/dashboard" />
    </div>
  );
}
