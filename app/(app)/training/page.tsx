import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { requireFirmContext } from "@/lib/auth/firm-context";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CheckIcon } from "lucide-react";
import { ActionToast } from "@/components/action-toast";
import { cn } from "@/lib/utils";

export default async function TrainingPage(props: PageProps<"/training">) {
  const ctx = await requireFirmContext();
  const searchParams = await props.searchParams;
  const db = getDb();

  const modules = await db.select().from(schema.trainingModules).where(eq(schema.trainingModules.isActive, true));

  const myCompletions = await db
    .select({ moduleId: schema.trainingCompletions.moduleId, completedAt: schema.trainingCompletions.completedAt })
    .from(schema.trainingCompletions)
    .where(and(eq(schema.trainingCompletions.userId, ctx.userId), eq(schema.trainingCompletions.firmId, ctx.firmId)));
  const myCompletedIds = new Set(myCompletions.map((c) => c.moduleId));

  let matrix: { users: (typeof schema.users.$inferSelect)[]; completions: Set<string> } | null = null;
  if (ctx.appRole === "firm_admin") {
    const users = await db.select().from(schema.users).where(eq(schema.users.firmId, ctx.firmId));
    const completions = await db
      .select({ userId: schema.trainingCompletions.userId, moduleId: schema.trainingCompletions.moduleId })
      .from(schema.trainingCompletions)
      .where(eq(schema.trainingCompletions.firmId, ctx.firmId));
    matrix = { users, completions: new Set(completions.map((c) => `${c.userId}:${c.moduleId}`)) };
  }

  const justCompletedId = typeof searchParams.completed === "string" ? searchParams.completed : undefined;

  return (
    <div className="space-y-8">
      <ActionToast outcomes={[{ param: "completed", message: "Module completed", tone: "success", celebrate: true }]} />
      <div>
        <h1 className="text-2xl font-semibold">Training</h1>
        <p className="text-sm text-muted-foreground">AI-literacy modules mapped to §10.35 competence obligations.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {modules.map((mod, i) => {
          const completed = myCompletedIds.has(mod.id);
          const justCompleted = mod.id === justCompletedId;
          return (
            <Card
              key={mod.id}
              style={{ animationDelay: `${i * 40}ms` }}
              className={cn(justCompleted ? "animate-row-settle-glow ring-1 ring-success/40" : "animate-row-settle")}
            >
              <CardHeader className="flex-row items-start justify-between space-y-0">
                <CardTitle className="text-base">
                  <Link href={`/training/${mod.id}`} className="underline underline-offset-4">
                    {mod.title}
                  </Link>
                </CardTitle>
                {completed && (
                  <Badge variant="success" className="gap-1">
                    <CheckIcon className={cn("size-3", justCompleted && "animate-check-pop")} /> Done
                  </Badge>
                )}
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                {mod.description}
                <div className="mt-2 text-xs">
                  {mod.contentType} · {mod.durationMinutes} min
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {matrix && (
        <div className="space-y-2">
          <h2 className="text-lg font-medium">Firm-wide completion</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Staff</TableHead>
                {modules.map((mod) => (
                  <TableHead key={mod.id} className="text-center">
                    {mod.title.length > 20 ? `${mod.title.slice(0, 20)}…` : mod.title}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {matrix.users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.fullName ?? user.email}</TableCell>
                  {modules.map((mod) => (
                    <TableCell key={mod.id} className="text-center">
                      {matrix!.completions.has(`${user.id}:${mod.id}`) ? (
                        <CheckIcon className="mx-auto size-4 text-primary" />
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
