import { z } from "zod";
import { retrieveForSectionRef } from "./retrieve";
import { generateJsonObject } from "./structured-generate";
import type { PolicyIntake } from "@/lib/validation/schemas";

// Plain "provider/model" strings route through the Vercel AI Gateway
// automatically (OIDC-authenticated, same as embeddings — see lib/rag/embed.ts).
// A genuinely free-tier model (not just cheap): alibaba/qwen3.7-flash is
// billed per-token and still hit "Free tier requests on this model are
// rate-limited" 429s even after adding Gateway credits — those credits
// unlocked embeddings but not this model's billing category. laguna-s-2.1-free
// has no such gate. generateObject's structured-output mode was also
// separately gated from plain generateText on the free tier — see
// lib/rag/structured-generate.ts for the JSON-via-prompt workaround this
// forced. Revisit the model choice once Gateway billing covers chat models.
const GENERATION_MODEL_ID = "poolside/laguna-s-2.1-free";

const clauseGenerationSchema = z
  .object({
    isRefusal: z.boolean(),
    refusalReason: z.string().nullable(),
    clauseText: z.string().nullable(),
    // Index into the source chunks actually passed in the prompt — not a raw
    // chunk id. The model doesn't need to reproduce a UUID accurately, and we
    // never trust an out-of-range or missing index as grounded.
    citedChunkIndex: z.number().int().nullable(),
  })
  .describe(
    '{"isRefusal": boolean, "refusalReason": string|null, "clauseText": string|null, "citedChunkIndex": number|null}'
  );

export type GeneratedClause = {
  section: string;
  clauseText: string | null;
  citedChunkId: string | null;
  isRefusal: boolean;
  refusalReason: string | null;
};

const SYSTEM_PROMPT = `You are drafting one clause of a firm AI-use policy for a small tax/accounting firm, mapped to a specific Circular 230 provision.

Rules:
- Only use the provided source text. Do not use outside knowledge of Circular 230 or any other regulation.
- Source chunks may start with a bracketed label like "[SYNTHETIC PLACEHOLDER]". That label is metadata marking the corpus as illustrative content, not a statement about the text's substance — treat the text after the label as the actual source to evaluate. Never refuse solely because a source is labeled "[SYNTHETIC PLACEHOLDER]"; only refuse if the substantive content itself doesn't support a clause.
- If the provided source text does not clearly support a policy clause for this section, set isRefusal=true, explain why in refusalReason, and leave clauseText and citedChunkIndex null. Do not guess or generate a plausible-sounding clause without support.
- Otherwise, write ONE paragraph, addressed to firm staff, translating the source text into a concrete policy rule for AI-assisted work. Set citedChunkIndex to the 0-based index of the single source chunk you primarily grounded the clause in.
- Preserve the source text's actual obligation strength. If the source says a practitioner "should" or "may" do something, the clause must use should/may language too — do not upgrade a recommendation into a "must"/"shall"/"will" requirement the source doesn't state.
- Do not add specifics the source doesn't contain: no citation strings (e.g. "under 31 CFR X.XX"), enumerated sub-requirements, or concrete examples beyond what the source text itself states, even if they would make the clause read more thoroughly. If the source is general, the clause stays general.
- Never cite a chunk index outside the provided list.`;

/**
 * Generates one policy clause for a Circular 230 section, or an explicit
 * refusal if the corpus doesn't support one. Grounding is enforced twice:
 * once by prompt instruction, and once deterministically here — any clause
 * whose citedChunkIndex isn't among the chunks actually retrieved is
 * discarded as a refusal, regardless of what the model claims.
 */
export async function generatePolicyClause(section: string, intake: Pick<PolicyIntake, "practiceMix" | "clientDataSensitivity">): Promise<GeneratedClause> {
  const query = `AI-use policy clause for Circular 230 section ${section}, practice mix: ${intake.practiceMix.join(", ")}, client data sensitivity: ${intake.clientDataSensitivity}`;
  const chunks = await retrieveForSectionRef(section, query, 2);

  if (chunks.length === 0) {
    return {
      section,
      clauseText: null,
      citedChunkId: null,
      isRefusal: true,
      refusalReason: `No corpus coverage found for §${section}. Consult your state society or a Circular 230 specialist for this provision.`,
    };
  }

  const contextBlock = chunks.map((c, i) => `[chunk ${i}] (source: ${c.sourceTitle})\n${c.content}`).join("\n\n");

  let object: z.infer<typeof clauseGenerationSchema>;
  try {
    object = await generateJsonObject({
      model: GENERATION_MODEL_ID,
      schema: clauseGenerationSchema,
      system: SYSTEM_PROMPT,
      prompt: `Circular 230 section: §${section}\nFirm practice mix: ${intake.practiceMix.join(", ")}\nClient data sensitivity: ${intake.clientDataSensitivity}\n\nSource context:\n${contextBlock}`,
    });
  } catch {
    // A single section's generation call failing (exhausted retries against a
    // flaky/rate-limited provider) shouldn't take down the whole multi-section
    // batch — surface it the same way a grounding failure is surfaced, as an
    // explicit refusal, so the caller gets partial results instead of a crash.
    return {
      section,
      clauseText: null,
      citedChunkId: null,
      isRefusal: true,
      refusalReason: "Clause generation is temporarily unavailable for this section. Please try again shortly.",
    };
  }

  if (object.isRefusal || object.clauseText === null) {
    return {
      section,
      clauseText: null,
      citedChunkId: null,
      isRefusal: true,
      refusalReason: object.refusalReason ?? "Model declined to generate a grounded clause.",
    };
  }

  const citedChunk =
    object.citedChunkIndex !== null && object.citedChunkIndex >= 0 && object.citedChunkIndex < chunks.length
      ? chunks[object.citedChunkIndex]
      : undefined;

  if (!citedChunk) {
    return {
      section,
      clauseText: null,
      citedChunkId: null,
      isRefusal: true,
      refusalReason: "Generated clause did not cite a chunk that was actually retrieved for this section.",
    };
  }

  return { section, clauseText: object.clauseText, citedChunkId: citedChunk.chunkId, isRefusal: false, refusalReason: null };
}
