import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { requireFirmContext } from "@/lib/auth/firm-context";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { addCustomTool } from "./actions";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive"> = {
  approved: "default",
  under_review: "secondary",
  prohibited: "destructive",
};

export default async function ToolsPage() {
  const ctx = await requireFirmContext();
  const db = getDb();

  const tools = await db
    .select()
    .from(schema.aiToolRegister)
    .where(eq(schema.aiToolRegister.firmId, ctx.firmId))
    .orderBy(desc(schema.aiToolRegister.updatedAt));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">AI Tool Register</h1>
        <p className="text-sm text-muted-foreground">
          Every AI tool your firm uses on client work should be listed here with a status. The
          verification log&apos;s tool field only accepts tools from this register.
        </p>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Tool</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Vetting notes</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {tools.map((tool) => (
            <TableRow key={tool.id}>
              <TableCell className="font-medium">{tool.toolName}</TableCell>
              <TableCell>
                <Badge variant={STATUS_VARIANT[tool.status] ?? "secondary"}>{tool.status.replace("_", " ")}</Badge>
              </TableCell>
              <TableCell className="max-w-sm truncate text-muted-foreground">{tool.vettingNotes ?? "—"}</TableCell>
              <TableCell className="text-right">
                <Link href={`/tools/${tool.id}`} className="text-sm underline underline-offset-4">
                  Edit
                </Link>
              </TableCell>
            </TableRow>
          ))}
          {tools.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-muted-foreground">
                No tools yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle className="text-base">Add a custom tool</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={addCustomTool} className="space-y-3">
            <div className="space-y-1.5">
              <label htmlFor="toolName" className="text-sm font-medium">
                Tool name
              </label>
              <Input id="toolName" name="toolName" required maxLength={200} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="vettingNotes" className="text-sm font-medium">
                Vetting notes (optional)
              </label>
              <Textarea id="vettingNotes" name="vettingNotes" rows={3} />
            </div>
            <Button type="submit">Add tool</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
