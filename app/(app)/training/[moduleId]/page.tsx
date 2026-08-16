import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { requireFirmContext } from "@/lib/auth/firm-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { recordTrainingCompletion } from "../actions";

export default async function TrainingModulePage(props: PageProps<"/training/[moduleId]">) {
  const { moduleId } = await props.params;
  const ctx = await requireFirmContext();
  const db = getDb();

  const [module] = await db
    .select()
    .from(schema.trainingModules)
    .where(and(eq(schema.trainingModules.id, moduleId), eq(schema.trainingModules.isActive, true)))
    .limit(1);
  if (!module) {
    notFound();
  }

  const [completion] = await db
    .select()
    .from(schema.trainingCompletions)
    .where(and(eq(schema.trainingCompletions.moduleId, moduleId), eq(schema.trainingCompletions.userId, ctx.userId)))
    .limit(1);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{module.title}</h1>
        {completion && <Badge>Completed {completion.completedAt.toLocaleDateString()}</Badge>}
      </div>
      <p className="text-sm text-muted-foreground">
        {module.contentType} · {module.durationMinutes} min
      </p>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Content</CardTitle>
        </CardHeader>
        <CardContent>
          {module.contentType === "video" ? (
            <p className="text-sm text-muted-foreground">
              Placeholder video: <a href={module.contentBody} className="underline">{module.contentBody}</a>
            </p>
          ) : (
            <pre className="whitespace-pre-wrap font-sans text-sm">{module.contentBody}</pre>
          )}
        </CardContent>
      </Card>

      <form action={recordTrainingCompletion}>
        <input type="hidden" name="moduleId" value={module.id} />
        <Button type="submit">{completion ? "Mark complete again" : "Mark complete"}</Button>
      </form>
    </div>
  );
}
