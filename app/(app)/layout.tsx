import Link from "next/link";
import { UserButton, OrganizationSwitcher } from "@clerk/nextjs";
import { requireFirmContext } from "@/lib/auth/firm-context";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/policies", label: "Policies" },
  { href: "/training", label: "Training" },
  { href: "/tools", label: "AI Tools" },
  { href: "/verification", label: "Verification Log" },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Resolves the Clerk session to a firm-scoped context. If the user has no
  // active organization, this redirects to /settings/organization.
  await requireFirmContext();

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b px-6 py-3">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="font-semibold">
            Circular 230 Kit
          </Link>
          <nav className="flex gap-4 text-sm text-muted-foreground">
            {NAV_ITEMS.map((item) => (
              <Link key={item.href} href={item.href} className="hover:text-foreground">
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <OrganizationSwitcher hidePersonal />
          <UserButton />
        </div>
      </header>
      <main className="flex-1 px-6 py-8">{children}</main>
    </div>
  );
}
