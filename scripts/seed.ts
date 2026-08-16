import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { appendVerificationEntry, computeGenesisHash } from "@/lib/verification/hash-chain";
import { emptyChecklist } from "@/lib/verification/checklist-definitions";
import { embedTexts } from "@/lib/rag/embed";

type CorpusDocSeed = {
  sourceTitle: string;
  sectionRef: string;
  versionLabel: string;
  effectiveDate: string; // YYYY-MM-DD
  expirationDate?: string; // YYYY-MM-DD
  chunks: string[];
};

// [SYNTHETIC PLACEHOLDER CONTENT] — not real Circular 230 text. Written to be
// plausible enough to exercise retrieval/generation/eval, and always
// persisted with is_synthetic=true. Real legal text sourcing is separate
// follow-up work, not part of this scaffold.
const CORPUS_DOCUMENTS: CorpusDocSeed[] = [
  {
    sourceTitle: "[SYNTHETIC] 31 CFR 10.22 — Diligence as to accuracy",
    sectionRef: "10.22",
    versionLabel: "placeholder-v1",
    effectiveDate: "2026-01-01",
    chunks: [
      "[SYNTHETIC PLACEHOLDER] A practitioner must exercise due diligence in preparing, approving, and filing tax returns and other documents, and in determining the correctness of representations made to the IRS and to clients. Reliance on an AI-generated draft does not relieve the practitioner of this obligation — the practitioner must independently verify factual and legal claims before relying on them.",
    ],
  },
  {
    sourceTitle: "[SYNTHETIC] 31 CFR 10.27(a) — Fee restrictions",
    sectionRef: "10.27(a)",
    versionLabel: "placeholder-v1",
    effectiveDate: "2026-01-01",
    chunks: [
      "[SYNTHETIC PLACEHOLDER] A practitioner may not charge a contingent fee for preparing an original tax return, except in limited circumstances. Efficiency gains from AI-assisted drafting do not change this restriction; fee structures must still comply with §10.27 regardless of the tools used to produce the underlying work product.",
    ],
  },
  {
    sourceTitle: "[SYNTHETIC] 31 CFR 10.35 — Competence",
    sectionRef: "10.35",
    versionLabel: "placeholder-v2-2026",
    effectiveDate: "2026-06-01",
    chunks: [
      "[SYNTHETIC PLACEHOLDER] A practitioner must possess the necessary competence to engage in practice before the IRS, including competence in the tools used to prepare that practice. Where a practitioner uses an AI tool to assist with research, drafting, or analysis, competence includes understanding the tool's known failure modes — including fabricated citations — and applying a level of review sufficient to catch them before work product is relied upon or delivered.",
    ],
  },
  {
    sourceTitle: "[SYNTHETIC] 31 CFR 10.35 — Competence (superseded)",
    sectionRef: "10.35",
    versionLabel: "placeholder-v1-2023",
    effectiveDate: "2023-01-01",
    expirationDate: "2026-05-31",
    chunks: [
      "[SYNTHETIC PLACEHOLDER, SUPERSEDED] A practitioner must possess the necessary competence to engage in practice before the IRS. [This earlier version predates AI-specific guidance and is retained only to exercise the effective-date filter in retrieval — it must never be surfaced by retrieveForSection.]",
    ],
  },
  {
    sourceTitle: "[SYNTHETIC] 31 CFR 10.36 — Procedures to ensure compliance",
    sectionRef: "10.36",
    versionLabel: "placeholder-v1",
    effectiveDate: "2026-01-01",
    chunks: [
      "[SYNTHETIC PLACEHOLDER] A practitioner with principal authority for overseeing a firm's tax practice must take reasonable steps to ensure the firm has adequate procedures for all members, associates, and employees to comply with Circular 230. Firm-wide use of AI tools on client work is a supervisory matter: the firm must maintain a written AI-use policy, an inventory of approved tools, and a record of review of AI-assisted work product, or the responsible practitioner may be subject to discipline for the firm's supervisory failure.",
    ],
  },
  {
    sourceTitle: "[SYNTHETIC] 31 CFR 10.37 — Requirements for written advice",
    sectionRef: "10.37",
    versionLabel: "placeholder-v1",
    effectiveDate: "2026-01-01",
    chunks: [
      "[SYNTHETIC PLACEHOLDER] A practitioner giving written advice must base that advice on reasonable factual and legal assumptions, reasonably consider all relevant facts the practitioner knows or should know, and not rely on unreasonable representations. Written advice drafted with AI assistance is held to the same standard: every factual and legal assertion, including citations, must be independently verified before the advice is delivered to a client.",
    ],
  },
];

const TOOL_CATALOG: Array<{ name: string; vendor: string; description: string }> = [
  { name: "ChatGPT", vendor: "OpenAI", description: "General-purpose conversational AI; commonly used for drafting and research." },
  { name: "CoCounsel", vendor: "Thomson Reuters", description: "Legal/tax-specific AI assistant with citation-aware research features." },
  { name: "Microsoft Copilot", vendor: "Microsoft", description: "AI assistant embedded across Microsoft 365 (Word, Excel, Outlook)." },
  { name: "Bloomberg Tax", vendor: "Bloomberg Industry Group", description: "Tax research platform with AI-assisted search and analysis." },
  { name: "CCH Axcess", vendor: "Wolters Kluwer", description: "Tax preparation and workflow platform with AI-assisted features." },
];

const TRAINING_MODULES: Array<{
  title: string;
  description: string;
  contentType: "video" | "interactive" | "doc";
  contentBody: string;
  durationMinutes: number;
}> = [
  {
    title: "Circular 230 basics for AI-assisted work",
    description: "What §§10.22, 10.35, and 10.36 require when AI tools touch client work product.",
    contentType: "doc",
    contentBody: "# Circular 230 basics\n\n[SYNTHETIC PLACEHOLDER CONTENT]\n\nThis module covers the competence, diligence, and firm-supervision obligations that apply when staff use AI tools.",
    durationMinutes: 15,
  },
  {
    title: "Spotting a hallucinated citation",
    description: "Practical techniques for verifying AI-generated citations before they reach a client.",
    contentType: "interactive",
    contentBody: "[SYNTHETIC PLACEHOLDER CONTENT] Interactive exercise: given 5 AI-generated citations, identify which ones don't check out against primary sources.",
    durationMinutes: 12,
  },
  {
    title: "Written advice and §10.37",
    description: "Extra care required when AI assists with formal written tax advice.",
    contentType: "video",
    contentBody: "https://example.com/placeholder-video/written-advice-10-37",
    durationMinutes: 10,
  },
  {
    title: "Client data handling with third-party AI tools",
    description: "Confidentiality and data-sensitivity considerations before using an AI tool on client data.",
    contentType: "doc",
    contentBody: "# Client data handling\n\n[SYNTHETIC PLACEHOLDER CONTENT]\n\nCovers what to check in a vendor's data-handling terms before approving a tool in the register.",
    durationMinutes: 10,
  },
  {
    title: "Using the verification log correctly",
    description: "Why the checklist matters and what 'reviewed in full' actually means in practice.",
    contentType: "interactive",
    contentBody: "[SYNTHETIC PLACEHOLDER CONTENT] Walkthrough of logging a verification event end to end.",
    durationMinutes: 8,
  },
];

const DEMO_CLERK_ORG_ID = "demo-org-backend-iteration";

async function seedToolCatalog() {
  const db = getDb();
  for (const tool of TOOL_CATALOG) {
    const [existing] = await db.select().from(schema.aiToolCatalog).where(eq(schema.aiToolCatalog.name, tool.name)).limit(1);
    if (!existing) {
      await db.insert(schema.aiToolCatalog).values(tool);
      console.log(`Seeded catalog tool: ${tool.name}`);
    }
  }
}

async function seedTrainingModules() {
  const db = getDb();
  for (const mod of TRAINING_MODULES) {
    const [existing] = await db.select().from(schema.trainingModules).where(eq(schema.trainingModules.title, mod.title)).limit(1);
    if (!existing) {
      await db.insert(schema.trainingModules).values(mod);
      console.log(`Seeded training module: ${mod.title}`);
    }
  }
}

/**
 * Seeds the synthetic RAG corpus, including two deliberate edge cases used to
 * exercise retrieveForSection: a superseded §10.35 chunk (expired, must never
 * be retrieved) and — by omission — a section with zero coverage (nothing
 * seeds "10.51", used elsewhere to exercise the refusal path).
 */
function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function seedCorpus() {
  const db = getDb();

  for (const doc of CORPUS_DOCUMENTS) {
    const [existing] = await db
      .select()
      .from(schema.corpusDocuments)
      .where(eq(schema.corpusDocuments.sourceTitle, doc.sourceTitle))
      .limit(1);
    if (existing) continue;

    // Embed before inserting anything — if this throws (e.g. rate limit),
    // nothing gets written, so a retry doesn't have to distinguish a fully
    // seeded doc from an orphaned one with no chunks. "patient" mode is fine
    // here: this is a one-time background script, not a live request.
    const embeddings = await embedTexts(doc.chunks, "patient");

    const [inserted] = await db
      .insert(schema.corpusDocuments)
      .values({
        sourceTitle: doc.sourceTitle,
        sectionRef: doc.sectionRef,
        versionLabel: doc.versionLabel,
        effectiveDate: doc.effectiveDate,
        expirationDate: doc.expirationDate ?? null,
        isSynthetic: true,
      })
      .returning();

    await db.insert(schema.corpusChunks).values(
      doc.chunks.map((content, i) => ({
        documentId: inserted.id,
        chunkIndex: i,
        content,
        tokenCount: Math.ceil(content.length / 4),
        embedding: embeddings[i],
      }))
    );

    console.log(`Seeded corpus doc: ${doc.sourceTitle}`);
    // Spread requests out to stay under the AI Gateway free-tier rate limit
    // for embedding calls during a bursty seed run.
    await sleep(15000);
  }
}

/**
 * Seeds a demo firm via a direct DB insert with a fake clerk_org_id, for fast
 * backend-only iteration without needing a real Clerk org + webhook round
 * trip. Once signed in through a real Clerk org, the webhook path
 * (app/api/webhooks/clerk/route.ts) is what creates production firms.
 */
async function seedDemoFirm() {
  const db = getDb();

  const [existingFirm] = await db.select().from(schema.firms).where(eq(schema.firms.clerkOrgId, DEMO_CLERK_ORG_ID)).limit(1);
  if (existingFirm) {
    console.log("Demo firm already seeded, skipping.");
    return;
  }

  const createdAtIso = new Date().toISOString();
  const genesisHash = computeGenesisHash(DEMO_CLERK_ORG_ID, createdAtIso);

  const [firm] = await db
    .insert(schema.firms)
    .values({ clerkOrgId: DEMO_CLERK_ORG_ID, name: "Demo Firm LLP", chainGenesisHash: genesisHash })
    .returning();
  console.log(`Seeded demo firm: ${firm.id}`);

  await db.insert(schema.firmChainState).values({ firmId: firm.id, lastSequenceNo: 0, lastHash: genesisHash });

  const [admin] = await db
    .insert(schema.users)
    .values({
      firmId: firm.id,
      clerkUserId: "demo-user-admin",
      email: "partner@demofirm.example",
      fullName: "Alex Partner",
      title: "Managing Partner",
      appRole: "firm_admin",
    })
    .returning();

  const [preparer] = await db
    .insert(schema.users)
    .values({
      firmId: firm.id,
      clerkUserId: "demo-user-preparer",
      email: "preparer@demofirm.example",
      fullName: "Sam Preparer",
      title: "EA",
      appRole: "practitioner",
    })
    .returning();

  const catalog = await db.select().from(schema.aiToolCatalog);
  const toolRows = await db
    .insert(schema.aiToolRegister)
    .values(
      catalog.map((tool, i) => ({
        firmId: firm.id,
        catalogId: tool.id,
        toolName: tool.name,
        status: i === 0 ? ("approved" as const) : i === catalog.length - 1 ? ("prohibited" as const) : ("under_review" as const),
      }))
    )
    .returning();

  const primaryTool = toolRows[0];
  const now = new Date();

  await appendVerificationEntry({
    firmId: firm.id,
    practitionerId: preparer.id,
    aiToolId: primaryTool.id,
    taskCategory: "return_prep",
    checklistItemsReviewed: { ...emptyChecklist(), citations_verified: true, output_reviewed_in_full: true },
    outcome: "approved",
    aiOutputGeneratedAt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000),
    reviewCompletedAt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000 + 8 * 60 * 1000),
    deliveredToClientAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
    reviewerRole: "preparer",
    createdBy: preparer.id,
  });

  await appendVerificationEntry({
    firmId: firm.id,
    practitionerId: admin.id,
    aiToolId: primaryTool.id,
    taskCategory: "written_advice",
    checklistItemsReviewed: { ...emptyChecklist(), citations_verified: false, superseded_law_check: true },
    outcome: "flagged",
    flagReason: "Cited Revenue Ruling could not be located in primary source; likely fabricated.",
    aiOutputGeneratedAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000),
    reviewCompletedAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000 + 25 * 60 * 1000),
    reviewerRole: "reviewing_partner",
    createdBy: admin.id,
  });

  await appendVerificationEntry({
    firmId: firm.id,
    practitionerId: preparer.id,
    aiToolId: primaryTool.id,
    taskCategory: "client_correspondence",
    checklistItemsReviewed: emptyChecklist(),
    outcome: "approved",
    aiOutputGeneratedAt: now,
    reviewCompletedAt: new Date(now.getTime() + 30 * 1000),
    reviewerRole: "preparer",
    createdBy: preparer.id,
  });

  await db.insert(schema.trainingCompletions).values([
    { firmId: firm.id, userId: admin.id, moduleId: (await db.select().from(schema.trainingModules).limit(1))[0].id, completedAt: now },
  ]);

  console.log(`Demo firm ready: firmId=${firm.id}, admin clerkUserId=demo-user-admin, preparer clerkUserId=demo-user-preparer`);
}

async function main() {
  await seedToolCatalog();
  await seedTrainingModules();
  await seedCorpus();
  await seedDemoFirm();
  console.log("Seed complete.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
