import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { OrganizationList, CreateOrganization } from "@clerk/nextjs";

export default async function OrganizationSettingsPage() {
  const { orgId } = await auth();

  if (!orgId) {
    return (
      <div className="mx-auto max-w-xl space-y-8">
        <div>
          <h1 className="text-xl font-semibold">Select or create your firm</h1>
          <p className="text-sm text-muted-foreground">
            Every user belongs to a firm (a Clerk organization). Pick an existing one or create a new one to continue.
          </p>
        </div>
        <OrganizationList hidePersonal afterSelectOrganizationUrl="/dashboard" afterCreateOrganizationUrl="/dashboard" />
        <CreateOrganization afterCreateOrganizationUrl="/dashboard" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-xl font-semibold">Organization settings</h1>
      <p className="text-sm text-muted-foreground">
        Invite or remove people from the organization switcher in the header. To manage roles and reviewer
        permissions once someone has joined, see{" "}
        <Link href="/settings/members" className="underline underline-offset-4">
          Members
        </Link>
        .
      </p>
    </div>
  );
}
