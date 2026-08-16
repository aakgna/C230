"use server";

import { redirect } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { requireFirmContext } from "@/lib/auth/firm-context";
import { policyIntakeSchema } from "@/lib/validation/schemas";
import { generatePolicyClause, type GeneratedClause } from "@/lib/rag/generate-policy";
import { REQUIRED_POLICY_SECTIONS } from "@/lib/rag/sections";
import { runEvalForPolicy } from "@/lib/rag/eval/run";
import { sleep } from "@/lib/rag/retry";
import { z } from "zod";

const POLICY_SLUG = "ai-use-policy";
// Spacing calls out avoids tripping the Gateway's per-window rate limit that
// firing them concurrently (or back-to-back) hits immediately.
const INTER_CALL_DELAY_MS = 5000;

export async function createPolicyDocument(formData: FormData) {
  const ctx = await requireFirmContext();

  const intake = policyIntakeSchema.parse({
    firmSize: formData.get("firmSize"),
    aiToolIds: formData.getAll("aiToolIds"),
    clientDataSensitivity: formData.get("clientDataSensitivity"),
    practiceMix: formData.getAll("practiceMix"),
  });

  const db = getDb();

  const [latest] = await db
    .select({ version: schema.policyDocuments.version })
    .from(schema.policyDocuments)
    .where(and(eq(schema.policyDocuments.firmId, ctx.firmId), eq(schema.policyDocuments.policySlug, POLICY_SLUG)))
    .orderBy(desc(schema.policyDocuments.version))
    .limit(1);

  const nextVersion = (latest?.version ?? 0) + 1;

  const [doc] = await db
    .insert(schema.policyDocuments)
    .values({
      firmId: ctx.firmId,
      policySlug: POLICY_SLUG,
      version: nextVersion,
      status: "draft",
      intakeAnswers: intake,
      createdBy: ctx.userId,
    })
    .returning();

  const generatedClauses: GeneratedClause[] = [];
  for (const section of REQUIRED_POLICY_SECTIONS) {
    if (generatedClauses.length > 0) {
      await sleep(INTER_CALL_DELAY_MS);
    }
    generatedClauses.push(await generatePolicyClause(section, intake));
  }

  await db.insert(schema.policyDocumentClauses).values(
    generatedClauses.map((generated, clauseOrder) => ({
      policyDocumentId: doc.id,
      clauseOrder,
      circular230Section: generated.section,
      clauseText: generated.clauseText ?? "",
      citedChunkId: generated.citedChunkId,
      isRefusal: generated.isRefusal,
      refusalReason: generated.refusalReason,
    }))
  );

  // Every generated policy gets an automatic grounding check before anyone
  // sees it — this is the single highest-leverage check in the product.
  await runEvalForPolicy(doc.id);

  redirect(`/policies/${doc.id}`);
}

const publishSchema = z.object({ policyDocumentId: z.uuid() });

export async function publishPolicyDocument(formData: FormData) {
  const ctx = await requireFirmContext();
  const { policyDocumentId } = publishSchema.parse({ policyDocumentId: formData.get("policyDocumentId") });

  const db = getDb();

  const [doc] = await db
    .select()
    .from(schema.policyDocuments)
    .where(and(eq(schema.policyDocuments.id, policyDocumentId), eq(schema.policyDocuments.firmId, ctx.firmId)))
    .limit(1);
  if (!doc) {
    throw new Error("Policy document not found for this firm");
  }

  const [previousPublished] = await db
    .select({ id: schema.policyDocuments.id })
    .from(schema.policyDocuments)
    .where(
      and(
        eq(schema.policyDocuments.firmId, ctx.firmId),
        eq(schema.policyDocuments.policySlug, doc.policySlug),
        eq(schema.policyDocuments.status, "published")
      )
    )
    .limit(1);

  if (previousPublished) {
    await db
      .update(schema.policyDocuments)
      .set({ status: "superseded", supersededById: doc.id })
      .where(eq(schema.policyDocuments.id, previousPublished.id));
  }

  await db
    .update(schema.policyDocuments)
    .set({ status: "published", effectiveDate: new Date().toISOString().slice(0, 10) })
    .where(eq(schema.policyDocuments.id, doc.id));

  redirect(`/policies/${doc.id}`);
}
