import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { appendVerificationEntry, computeGenesisHash } from "@/lib/verification/hash-chain";
import { emptyChecklist } from "@/lib/verification/checklist-definitions";
import { embedTexts } from "@/lib/rag/embed";
import type { QuizContent } from "@/lib/training/quiz";

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
    sourceTitle: "[SYNTHETIC] 31 CFR 10.27(a) — Fee restrictions (superseded)",
    sectionRef: "10.27(a)",
    versionLabel: "placeholder-v1",
    effectiveDate: "2026-01-01",
    expirationDate: "2026-08-18",
    chunks: [
      "[SYNTHETIC PLACEHOLDER, SUPERSEDED] A practitioner may not charge a contingent fee for preparing an original tax return, except in limited circumstances. Efficiency gains from AI-assisted drafting do not change this restriction; fee structures must still comply with §10.27 regardless of the tools used to produce the underlying work product.",
    ],
  },
  {
    sourceTitle: "[SYNTHETIC] 31 CFR 10.27(a) — Fee restrictions (unconscionable fees)",
    sectionRef: "10.27(a)",
    versionLabel: "placeholder-v2-2026",
    effectiveDate: "2026-08-19",
    chunks: [
      "[SYNTHETIC PLACEHOLDER] Under §10.27(a), a practitioner may not charge an unconscionable fee in connection with any matter before the Internal Revenue Service. This is a distinct rule from the separate restriction on contingent fees for original return preparation found elsewhere in §10.27 — the unconscionable-fee standard applies generally, without the contingent-fee provision's narrow exceptions. Where an AI-assisted tool materially reduces the time or effort required to complete a task, that efficiency gain must be reflected in the fee charged: billing a client as though work were performed manually, at pre-AI time and effort, when it was not, is inconsistent with this standard. A practitioner should be able to explain, if asked, how a bill reflects the actual work performed. Elaborate disclosure of every AI tool used is not required, but some acknowledgment that AI assistance affected the scope or pricing of an engagement is expected. Firms should periodically compare billed time against the time equivalent work would require without AI assistance, and adjust billing practices going forward wherever a consistent, unexplained gap is found.",
    ],
  },
  {
    sourceTitle: "[SYNTHETIC] 31 CFR 10.35 — Competence (superseded 2026-06)",
    sectionRef: "10.35",
    versionLabel: "placeholder-v2-2026",
    effectiveDate: "2026-06-01",
    expirationDate: "2026-08-18",
    chunks: [
      "[SYNTHETIC PLACEHOLDER, SUPERSEDED] A practitioner must possess the necessary competence to engage in practice before the IRS, including competence in the tools used to prepare that practice. Where a practitioner uses an AI tool to assist with research, drafting, or analysis, competence includes understanding the tool's known failure modes — including fabricated citations — and applying a level of review sufficient to catch them before work product is relied upon or delivered.",
    ],
  },
  {
    sourceTitle: "[SYNTHETIC] 31 CFR 10.35 — Competence (technological literacy)",
    sectionRef: "10.35",
    versionLabel: "placeholder-v3-2026",
    effectiveDate: "2026-08-19",
    chunks: [
      "[SYNTHETIC PLACEHOLDER] A practitioner must possess the necessary competence to engage in practice before the IRS. Where a practitioner's work involves an AI tool, competence requires a working-level understanding of how that tool generates output, not just the underlying tax law — including the tool's approximate training-data cutoff, its tendency to state incorrect output with unwarranted confidence, and known failure modes such as fabricated citations, invented regulation or ruling numbers, and outdated authority presented without qualification. A practitioner should be able to identify situations where an AI tool's output is unsuitable to rely on without substantial independent verification, including novel or unsettled legal questions, client-specific factual judgment calls, and any output whose underlying reasoning cannot be traced to a specific, checkable source. This competence is not static: a practitioner should keep it current as the tools in use change, the same way ongoing competence in tax law requires staying current with legal developments.",
    ],
  },
  {
    sourceTitle: "[SYNTHETIC] 31 CFR 10.35 — Competence (predates AI guidance, superseded)",
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

export type ModuleSeed = {
  title: string;
  description: string;
  contentType: "video" | "interactive" | "doc";
  contentBody: string;
  durationMinutes: number;
};

function quiz(content: QuizContent): string {
  return JSON.stringify(content);
}

const DISCLAIMER =
  "Note: this module summarizes IRS Office of Professional Responsibility Alert 2026-19 (\"Introductory Guidelines for Responsible AI Use in Federal Tax Practice,\" issued June 24, 2026) and 31 CFR Part 10. It is training material, not legal advice — confirm current requirements and firm-specific application with a Circular 230 specialist.";

export const TRAINING_MODULES: ModuleSeed[] = [
  // 1. Circular 230 basics for AI-assisted work
  {
    title: "Circular 230 basics for AI-assisted work",
    description: "How the IRS Office of Professional Responsibility's 2026 AI guidance maps onto Circular 230's core practitioner obligations.",
    contentType: "doc",
    contentBody: `# Circular 230 basics for AI-assisted work

On June 24, 2026, the IRS Office of Professional Responsibility (OPR) issued Alert 2026-19, "Introductory Guidelines for Responsible AI Use in Federal Tax Practice" — the first formal guidance on how AI use fits within existing Treasury Department Circular 230 obligations (31 CFR Part 10). It does not create new rules. It clarifies how six existing provisions apply when a practitioner's work involves AI-generated content.

## The six provisions

- **Due diligence (§10.22)** — verifying that AI-generated citations, calculations, and facts are actually correct before they reach a client or the IRS.
- **Competence (§10.35)** — understanding what your AI tools can and can't do, not just the tax law itself.
- **Fees (§10.27(a))** — billing has to reflect what AI actually saved you in time and effort.
- **Firm procedures (§10.36)** — firm leadership is responsible for AI governance: training, tool vetting, and review protocols.
- **Written advice (§10.37)** — AI-assisted advice still has to rest on independently verified facts and law.
- **Confidentiality (IRC §6713 and §7216(a))** — client data can't go into unsecured or public AI platforms.

## The core theme

OPR's framing across all six areas is the same: AI can assist the work, but it cannot substitute for the practitioner's own judgment, verification, or accountability. Every one of these obligations was already binding under Circular 230 before AI tools existed — the alert explains how they apply now, it doesn't loosen or replace them.

## Why this matters for your firm

Each of the other modules in this training program covers one of these six areas in depth — verifying citations (due diligence), fee transparency, firm procedures for tool vetting and onboarding, written-advice standards, and confidentiality/data handling. Treat this module as the map; the rest fill in the detail.

${DISCLAIMER}`,
    durationMinutes: 15,
  },
  {
    title: "Circular 230 basics for AI-assisted work: knowledge check",
    description: "Test your understanding of the six Circular 230 provisions IRS OPR Alert 2026-19 maps to AI use.",
    contentType: "interactive",
    contentBody: quiz({
      questions: [
        {
          question: "What did IRS OPR Alert 2026-19 actually do?",
          options: [
            "Created six brand-new rules specifically for AI use",
            "Clarified how six existing Circular 230 provisions apply to AI-generated content",
            "Banned the use of generative AI in federal tax practice",
            "Replaced Circular 230 with a new AI-specific regulation",
          ],
          correctIndex: 1,
          explanation: "Alert 2026-19 is explicitly introductory guidance clarifying how existing obligations apply — it doesn't create new rules or loosen old ones.",
        },
        {
          question: "Which Circular 230 section governs verifying that an AI-generated citation actually exists and says what the AI claims it says?",
          options: ["§10.27(a)", "§10.36", "§10.22", "§10.37"],
          correctIndex: 2,
          explanation: "§10.22, due diligence, is the provision requiring practitioners to verify the accuracy of facts, citations, and calculations before relying on them.",
        },
        {
          question: "Under the OPR guidance, what does 'competence' (§10.35) now require in addition to tax law knowledge?",
          options: [
            "A technology certification from the AI vendor",
            "A working understanding of how your AI tools generate content and where they fail",
            "Personally auditing the AI vendor's training data",
            "Nothing — competence only ever referred to tax law knowledge",
          ],
          correctIndex: 1,
          explanation: "OPR treats technological literacy — understanding your tools' mechanics, limitations, and failure modes — as now part of professional competence.",
        },
        {
          question: "Which two statutes did OPR cite for confidentiality risk when client data is uploaded to an AI platform?",
          options: [
            "IRC §6103 and §6110",
            "IRC §6713 (civil) and §7216(a) (criminal)",
            "31 CFR §10.29 and §10.33",
            "IRC §6662 and §6663",
          ],
          correctIndex: 1,
          explanation: "OPR flagged both civil penalties under §6713 and criminal penalties under §7216(a) for unauthorized disclosure of client tax return information.",
        },
        {
          question: "What is the overarching theme OPR uses across all six provisions?",
          options: [
            "AI tools should be avoided entirely until further guidance is issued",
            "Only senior partners are permitted to use AI tools",
            "AI can assist the work, but cannot substitute for the practitioner's own judgment and accountability",
            "AI-generated work product is presumed compliant unless a client complains",
          ],
          correctIndex: 2,
          explanation: "OPR's framing is consistent: technology augments, not replaces, professional judgment — and the practitioner remains fully accountable either way.",
        },
      ],
    }),
    durationMinutes: 8,
  },

  // 2. Spotting a hallucinated citation
  {
    title: "Spotting a hallucinated citation",
    description: "Practical verification steps for AI-generated citations, grounded in §10.22's due-diligence standard.",
    contentType: "doc",
    contentBody: `# Spotting a hallucinated citation

Under 31 CFR §10.22, a practitioner must exercise due diligence in preparing returns and other IRS-related documents, and in determining the correctness of representations made to the IRS and to clients. IRS OPR Alert 2026-19 applies this directly to AI-generated content: "Practitioners must thoroughly review all AI-created documents and language incorporated into writings before delivery to a client or submission to the IRS."

## What "reviewed" actually means

Verification isn't a skim for plausibility. OPR spells out three specific things to independently confirm:

- **Citations** — confirm the tax code provision, Treasury regulation, Revenue Ruling, or case actually exists, says what the AI claims it says, and hasn't been superseded or amended since the AI's training data cutoff.
- **Calculations** — recheck tax calculations and financial analyses against the underlying source numbers. AI arithmetic errors happen and aren't always obvious from the output alone.
- **Facts** — confirm client-specific facts stated in the output are accurate and that no material fact was silently omitted.

## Why this category of error is a live risk, not a hypothetical

OPR's alert specifically cites the Deloitte Australia incident from July 2025, where a 230-page government report was found to contain fabricated quotes attributed to a judge, references to sources that didn't exist, and books attributed to the wrong authors. The point isn't that this was an unusually bad AI — it's that no human caught it before delivery. That's the failure mode §10.22 is aimed at closing.

## Categories worth specifically watching for

- Plausible-sounding but non-existent case citations
- Invented Revenue Ruling or regulation numbers
- Superseded or modified authority cited without noting the change
- Confidently wrong client-specific facts

## Documentation

OPR expects evidence of who reviewed the output, what the review actually involved, and how its adequacy was confirmed — not just a sign-off. This is exactly what this app's Verification Log module is for; see that module for how to record it.

${DISCLAIMER}`,
    durationMinutes: 15,
  },
  {
    title: "Spotting a hallucinated citation: knowledge check",
    description: "Apply the §10.22 verification standard to AI-generated citations, calculations, and facts.",
    contentType: "interactive",
    contentBody: quiz({
      questions: [
        {
          question: "Which Circular 230 provision requires independently verifying AI-generated citations before use?",
          options: ["§10.27", "§10.22", "§10.35", "Not covered by Circular 230"],
          correctIndex: 1,
          explanation: "§10.22, diligence as to accuracy, is the basis for the citation- and fact-verification duty OPR describes.",
        },
        {
          question: "According to OPR guidance, what's the minimum acceptable check on an AI-cited Revenue Ruling?",
          options: [
            "Confirming it sounds plausible given the context",
            "Confirming it exists, says what the AI claims, and hasn't been superseded",
            "Nothing, if the AI tool has a good general reputation",
            "Asking the AI a second time to double check itself",
          ],
          correctIndex: 1,
          explanation: "OPR requires confirming existence, accurate content match, and current validity — not just plausibility or a second AI opinion.",
        },
        {
          question: "What made the Deloitte Australia incident (cited in Alert 2026-19) a compliance failure, not just a technical one?",
          options: [
            "The AI tool used was not enterprise-approved",
            "No human caught the fabricated quotes and non-existent sources before delivery",
            "The report was delivered without any AI disclosure to the client",
            "The firm didn't have a written AI-use policy at all",
          ],
          correctIndex: 1,
          explanation: "The AI's errors weren't unusual — the missed verification step before delivery is what turned it into the compliance failure OPR highlights.",
        },
        {
          question: "Besides citations, what else does §10.22 due diligence require checking in AI-generated work?",
          options: [
            "Only citations need to be checked",
            "Calculations against source numbers, and client-specific facts for accuracy and omissions",
            "Only the formatting and tone of the document",
            "Whether the AI tool's vendor is publicly traded",
          ],
          correctIndex: 1,
          explanation: "OPR names calculation accuracy and factual accuracy (including omissions) as equally required checks, not just citation existence.",
        },
        {
          question: "What documentation does OPR expect for a completed review of AI-assisted work?",
          options: [
            "None — a mental confirmation is sufficient",
            "Evidence of who reviewed the output, what the review involved, and how adequacy was confirmed",
            "A signed statement from the AI vendor",
            "A screenshot of the original AI prompt only",
          ],
          correctIndex: 1,
          explanation: "OPR expects the review itself to be documented, not just performed — which is what a firm's verification log is for.",
        },
      ],
    }),
    durationMinutes: 8,
  },

  // 3. Written advice and §10.37
  {
    title: "Written advice and §10.37",
    description: "Why AI-assisted drafts of written tax advice still have to meet §10.37's independent-verification standard.",
    contentType: "doc",
    contentBody: `# Written advice and §10.37

31 CFR §10.37 sets the standard for written tax advice: it must be based on reasonable factual and legal assumptions, reasonably consider all relevant facts the practitioner knows or should know, and connect the applicable law and authorities to the client's actual facts. The regulation applies a "reasonable practitioner standard, considering all facts and circumstances, including... the scope of the engagement and the type and specificity of the advice sought." It covers more than formal opinions — emails, letters, and any other written advisory format count.

## Where AI changes the risk profile

IRS OPR Alert 2026-19 is direct about the core risk: "Blind reliance on AI yields may constitute unreasonable reliance" when the AI's underlying reasoning is opaque — meaning you can't trace how it got to its conclusion. §10.37 already limits when a practitioner may reasonably rely on someone else's advice (only when that advice is itself reasonable, and only in good faith); OPR extends the same logic to AI output. An AI tool that can't show its reasoning doesn't meet the bar for reasonable reliance on its own.

## What independent verification means here

- Every factual assumption in the draft must be independently verified as accurate — not assumed correct because the AI stated it confidently.
- Every legal citation must be verified as existing, accurate, and actually applicable to this client's specific facts (not just topically related).
- Every projection or forecast must be checked against the source data it was supposedly built from.

## The practical takeaway

An AI draft is a draft, not a finished opinion. The practitioner's name goes on the advice, and the practitioner's obligation under §10.37 doesn't transfer to the tool that helped write it — regardless of how good the draft looks on first read.

${DISCLAIMER}`,
    durationMinutes: 12,
  },
  {
    title: "Written advice and §10.37: knowledge check",
    description: "Test your understanding of §10.37's verification standard as applied to AI-assisted written advice.",
    contentType: "interactive",
    contentBody: quiz({
      questions: [
        {
          question: "Does §10.37 only apply to formal written tax opinions?",
          options: [
            "Yes, only opinions labeled as formal tax opinions are covered",
            "No — it covers emails, letters, and any other written advisory format",
            "Yes, but only for opinions over a certain dollar threshold",
            "No, it only applies to advice delivered verbally",
          ],
          correctIndex: 1,
          explanation: "§10.37's written-advice standard applies broadly to any written format used to give tax advice, not just formal opinions.",
        },
        {
          question: "What does OPR say about relying on AI output whose reasoning can't be traced?",
          options: [
            "It's always acceptable if the AI tool is enterprise-approved",
            "It may constitute unreasonable reliance",
            "It's only a problem for opinions over $10,000 in fees",
            "OPR doesn't address this scenario",
          ],
          correctIndex: 1,
          explanation: "OPR's language is that blind reliance on opaque AI reasoning may constitute unreasonable reliance under §10.37's standard.",
        },
        {
          question: "Under §10.37, what standard does the IRS Commissioner apply when evaluating written advice?",
          options: [
            "A strict-liability standard regardless of circumstances",
            "A reasonable practitioner standard considering all facts and circumstances",
            "Whatever standard the practitioner's malpractice insurer requires",
            "An automatic pass if a licensed CPA signed the advice",
          ],
          correctIndex: 1,
          explanation: "§10.37 explicitly applies a reasonable practitioner standard, factoring in the engagement's scope and the specificity of advice sought.",
        },
        {
          question: "An AI draft states a legal citation that's topically related to the client's issue but not actually applicable to their specific facts. Is that acceptable under §10.37?",
          options: [
            "Yes, topical relevance is sufficient",
            "No — the law and authorities must be connected to the client's actual facts, not just the general topic",
            "Yes, as long as the citation is real and not hallucinated",
            "It depends on which AI tool generated it",
          ],
          correctIndex: 1,
          explanation: "§10.37 requires connecting applicable law to the client's actual facts — topical relevance alone doesn't satisfy that.",
        },
        {
          question: "Who bears the §10.37 obligation when a practitioner uses an AI tool to help draft written advice?",
          options: [
            "The AI vendor, since they built the tool",
            "The practitioner — the obligation doesn't transfer to the tool",
            "Nobody, since AI-assisted drafts aren't covered by §10.37",
            "Whoever reviews the draft last, regardless of role",
          ],
          correctIndex: 1,
          explanation: "The practitioner's name and obligation stay attached to the advice regardless of what tool assisted in drafting it.",
        },
      ],
    }),
    durationMinutes: 8,
  },

  // 4. Client data handling with third-party AI tools
  {
    title: "Client data handling with third-party AI tools",
    description: "What 'enterprise-approved' actually means, and the three-part framework for vetting an AI tool's data handling.",
    contentType: "doc",
    contentBody: `# Client data handling with third-party AI tools

IRS OPR Alert 2026-19 requires that client tax data only go into "secure, enterprise-approved AI" — not any AI tool an individual staff member happens to prefer. This module covers what that phrase actually means in practice, and ties into the AI Tool Register in this app: a tool shouldn't move from "under review" to "approved" until it clears the checks below.

## The three-part approval framework

OPR lays out three things that must be true before client data touches an AI tool:

1. **Enterprise approval** — firm IT and compliance leadership have specifically reviewed and approved this tool, not just tools "like it."
2. **Confidentiality safeguards** — the vendor has contractually committed to non-retention, non-use of client data for model training, and no staff access to submitted data (a BAA-equivalent commitment, even outside healthcare).
3. **Documented retention policy** — the firm keeps records of the tool's approval, the vendor's specific commitments, and how staff are expected to use it.

A consumer-grade product with a public processing pipeline doesn't qualify just because it's popular or well-known — absent a specific confidentiality contract, it fails part 2 regardless of parts 1 and 3.

## What's actually at risk

- **Data retention** by the AI operator beyond the single request
- **Model training** on submitted client information, which can resurface in outputs to other users
- **Staff or vendor-side access** to data that should be client-confidential

## Where this connects to firm procedure

This module covers what "enterprise-approved" means. The companion module, "Vetting a new AI tool before firm-wide approval," walks through the actual evaluation process for moving a specific tool from "under review" to "approved" in your firm's register.

${DISCLAIMER}`,
    durationMinutes: 12,
  },
  {
    title: "Client data handling with third-party AI tools: knowledge check",
    description: "Test your understanding of the three-part framework for approving an AI tool to touch client data.",
    contentType: "interactive",
    contentBody: quiz({
      questions: [
        {
          question: "What phrase does OPR use to describe the only category of AI tool client data should go into?",
          options: [
            "Free-tier AI tools with a privacy policy",
            "Secure, enterprise-approved AI",
            "Any tool with over 1 million users",
            "AI tools recommended by a professional association",
          ],
          correctIndex: 1,
          explanation: "OPR's specific phrase is \"secure, enterprise-approved AI\" — individual staff preference isn't sufficient grounds for use with client data.",
        },
        {
          question: "What does the confidentiality-safeguards part of the framework require from a vendor?",
          options: [
            "A general privacy policy posted on their website",
            "A contractual commitment to non-retention, no training use, and no staff access",
            "SOC 2 certification only, with no other commitments needed",
            "Nothing specific, as long as the tool is well-known",
          ],
          correctIndex: 1,
          explanation: "OPR requires a specific contractual commitment (non-retention, non-training-use, no staff access) — not just a general privacy policy.",
        },
        {
          question: "A popular consumer AI chatbot has no specific confidentiality contract with your firm. Does it qualify for client data use under OPR's framework?",
          options: [
            "Yes, if enough staff already use it personally",
            "No — popularity doesn't substitute for a specific confidentiality contract",
            "Yes, as long as it has a privacy policy",
            "It depends only on the firm's IT department's general trust in the vendor",
          ],
          correctIndex: 1,
          explanation: "A consumer-grade tool with a public processing pipeline fails the confidentiality-safeguards part of the framework absent a specific contract, regardless of popularity.",
        },
        {
          question: "What's one of the three specific data risks named in this module?",
          options: [
            "The AI tool's subscription cost",
            "Model training on submitted client information",
            "The AI tool's response speed",
            "Whether the AI tool has a mobile app",
          ],
          correctIndex: 1,
          explanation: "Model training on client data (which can later surface in outputs to other users) is one of the three specific risks OPR flags.",
        },
        {
          question: "What should the 'documented retention policy' part of the framework include?",
          options: [
            "Only the vendor's marketing materials",
            "Records of the tool's approval, the vendor's specific commitments, and staff usage expectations",
            "A list of every employee's personal AI subscriptions",
            "Nothing beyond the initial approval date",
          ],
          correctIndex: 1,
          explanation: "The firm needs to keep records of approval, vendor commitments, and usage procedures — not just an initial sign-off.",
        },
      ],
    }),
    durationMinutes: 8,
  },

  // 5. Using the verification log correctly
  {
    title: "Using the verification log correctly",
    description: "Why 'reviewed in full' has a specific meaning, and how to document AI-assisted work the way OPR expects.",
    contentType: "doc",
    contentBody: `# Using the verification log correctly

IRS OPR Alert 2026-19 doesn't just require that AI output be reviewed — it requires evidence of the review. In OPR's words, the expectation is documentation showing "who reviewed output, what the review involved, and how adequacy was confirmed." A verbal assurance that "someone checked it" doesn't meet that bar. This module covers what that means for entries in this app's Verification Log.

## What "reviewed in full" is not

- Skimming the output for obvious red flags
- Spot-checking one or two citations and assuming the rest are fine
- Trusting the output because the AI tool has a good general track record
- Reviewing the summary the AI provided about its own work, instead of the work itself

## What "reviewed in full" actually means

Reviewing every material claim in the output against its source: every citation checked for existence and current validity, every calculation checked against the underlying numbers, every client-specific fact checked for accuracy. The checklist in this app's verification form exists to make that concrete rather than a vague standard each reviewer interprets differently.

## Why the distinction between "flagged" and "escalated" matters

A **flagged** entry means the reviewer found something that needed a fix — a citation update, a corrected calculation — that got resolved before delivery. An **escalated** entry means the reviewer found something serious enough to require a second, more senior reviewer's sign-off before it goes out, or that already went out and needs correction. Recording the right outcome matters: it's how a firm's overall AI-risk pattern becomes visible across engagements, not just within one review.

## Why this is append-only

Once submitted, a verification entry is permanent — corrections get logged as new entries, not edits to the old one. This preserves an honest record of what was actually caught and when, which is exactly the kind of evidence OPR's documentation expectation is asking firms to be able to produce.

${DISCLAIMER}`,
    durationMinutes: 10,
  },
  {
    title: "Using the verification log correctly: knowledge check",
    description: "Test your understanding of what a complete, documented AI-output review actually requires.",
    contentType: "interactive",
    contentBody: quiz({
      questions: [
        {
          question: "According to OPR, what three things should review documentation show?",
          options: [
            "The AI tool's version number, cost, and response time",
            "Who reviewed the output, what the review involved, and how adequacy was confirmed",
            "Only the final delivery date to the client",
            "The client's name and the invoice amount",
          ],
          correctIndex: 1,
          explanation: "OPR's documentation expectation specifically covers reviewer identity, review scope, and how adequacy was confirmed — not just an outcome.",
        },
        {
          question: "Is spot-checking one or two citations and assuming the rest are correct considered 'reviewed in full'?",
          options: [
            "Yes, if the AI tool is generally reliable",
            "No — every material claim needs to be checked against its source",
            "Yes, as long as the spot-checked citations were correct",
            "It depends on the client's fee arrangement",
          ],
          correctIndex: 1,
          explanation: "\"Reviewed in full\" means every material claim is checked, not a sample used to infer the rest is probably fine.",
        },
        {
          question: "What's the difference between a 'flagged' and an 'escalated' verification outcome?",
          options: [
            "They mean the same thing, just different words",
            "Flagged means an issue was found and resolved; escalated means it needs a more senior reviewer's sign-off",
            "Escalated is only used for billing disputes",
            "Flagged means the client complained after delivery",
          ],
          correctIndex: 1,
          explanation: "Flagged entries were caught-and-fixed; escalated entries are serious enough to require additional senior review before or after delivery.",
        },
        {
          question: "Why is the verification log append-only rather than editable?",
          options: [
            "To save database storage space",
            "To preserve an honest, permanent record of what was actually caught and when",
            "Because the software doesn't support editing",
            "To make the log load faster",
          ],
          correctIndex: 1,
          explanation: "Append-only design preserves a trustworthy audit trail — corrections are new entries, not retroactive edits to what was originally recorded.",
        },
        {
          question: "Is reviewing the AI's own summary of its work an acceptable substitute for reviewing the underlying work product?",
          options: [
            "Yes, if the summary looks thorough",
            "No — the underlying claims themselves need to be checked against their sources",
            "Yes, for low-risk task categories only",
            "It depends on how the summary is formatted",
          ],
          correctIndex: 1,
          explanation: "An AI's self-summary is still AI output — it doesn't substitute for independently checking the actual citations, numbers, and facts.",
        },
      ],
    }),
    durationMinutes: 8,
  },

  // 6. Fee arrangements and §10.27(a)
  {
    title: "Fee arrangements and §10.27(a)",
    description: "Why AI-driven efficiency gains have to be reflected in client billing under the unconscionable-fee standard.",
    contentType: "doc",
    contentBody: `# Fee arrangements and §10.27(a)

31 CFR §10.27(a) prohibits a practitioner from charging "an unconscionable fee in connection with any matter before" the IRS. Historically this provision was mostly discussed in the context of excessive fees generally. IRS OPR Alert 2026-19 gives it a specific, current application: fees have to reflect what AI tools actually saved in time and effort. It is a distinct question from §10.27(b)'s separate rule restricting contingent fees on original return preparation — this module is about billing transparency, not contingent-fee structuring.

## The specific violation OPR identifies

**Double-billing**: charging a client for work as if it were done manually — at the time and effort that would have taken — when AI materially reduced the actual effort required. If a return that used to take four hours now reliably takes one hour with AI-assisted drafting, billing four hours' worth of fees for it raises a §10.27(a) problem.

## What OPR expects instead

- **Acknowledgment**: practitioners should acknowledge AI use and credit the resulting cost reduction. OPR is explicit that elaborate disclosure isn't required — but some acknowledgment is.
- **Consistent billing patterns**: a systematic pattern of billing that doesn't track actual time spent is itself evidence of a potential violation, even without a single flagrant case.

## A practical self-check

OPR's recommended action: audit recent engagements comparing billed time to the time the same work would have required without AI assistance. If there's a consistent, unexplained gap, that's a signal to revisit billing practices going forward — not just for the audited engagements, but prospectively.

## Why this is a live compliance issue, not just an ethics preference

Unlike the contingent-fee restriction, the unconscionable-fee standard under §10.27(a) doesn't have narrow carve-outs — it's a general prohibition that applies across every fee arrangement. AI efficiency doesn't create an exception to it; if anything, OPR's guidance treats AI-driven efficiency gains as something that specifically needs to flow through to the client's bill.

${DISCLAIMER}`,
    durationMinutes: 12,
  },
  {
    title: "Fee arrangements and §10.27(a): knowledge check",
    description: "Test your understanding of the unconscionable-fee standard as applied to AI-driven efficiency gains.",
    contentType: "interactive",
    contentBody: quiz({
      questions: [
        {
          question: "What does §10.27(a) specifically prohibit?",
          options: [
            "All contingent fee arrangements without exception",
            "Charging an unconscionable fee in connection with any matter before the IRS",
            "Charging for AI tool subscriptions as a line item",
            "Billing hourly rather than flat-fee",
          ],
          correctIndex: 1,
          explanation: "§10.27(a) is the general unconscionable-fee prohibition — distinct from §10.27(b)'s narrower contingent-fee restriction.",
        },
        {
          question: "What specific billing practice did OPR call out as a §10.27(a) violation?",
          options: [
            "Charging any fee at all for AI-assisted work",
            "Billing for time as if work were done manually when AI materially reduced the actual effort required",
            "Disclosing AI use to the client",
            "Rounding billed hours to the nearest quarter hour",
          ],
          correctIndex: 1,
          explanation: "Double-billing — charging manual-effort rates for work AI substantially accelerated — is the specific violation OPR names.",
        },
        {
          question: "Does OPR require elaborate, detailed disclosure of every AI tool used on an engagement?",
          options: [
            "Yes, a full technical disclosure is required for every engagement",
            "No — some acknowledgment of AI use and the resulting cost reduction is expected, not elaborate disclosure",
            "No disclosure of any kind is expected",
            "Only if the client specifically asks",
          ],
          correctIndex: 1,
          explanation: "OPR is explicit that acknowledgment is expected, but elaborate disclosure isn't required — a middle ground, not a heavy compliance burden.",
        },
        {
          question: "What self-check does OPR recommend firms run on recent engagements?",
          options: [
            "Comparing billed time to the time the same work would have taken without AI assistance",
            "Surveying clients about their satisfaction with AI-assisted work",
            "Auditing the AI vendor's own billing practices",
            "Nothing — this only applies prospectively, not retroactively",
          ],
          correctIndex: 0,
          explanation: "OPR's recommended audit compares actual billed time to what the work would have required without AI, looking for unexplained gaps.",
        },
        {
          question: "How is §10.27(a)'s unconscionable-fee standard different from the contingent-fee restriction under §10.27(b)?",
          options: [
            "They're the same rule with two different names",
            "§10.27(a) is a general prohibition with no narrow carve-outs, while §10.27(b) has specific contingent-fee exceptions",
            "§10.27(a) only applies to enrolled agents, not CPAs",
            "§10.27(b) is the one that applies to AI-driven efficiency gains, not §10.27(a)",
          ],
          correctIndex: 1,
          explanation: "§10.27(a)'s unconscionable-fee standard is general and broadly applicable; §10.27(b) is the narrower, separate contingent-fee rule with its own exceptions.",
        },
      ],
    }),
    durationMinutes: 8,
  },

  // 7. Confidentiality and IRC §7216
  {
    title: "Confidentiality and IRC §7216 for AI tools",
    description: "The consent and disclosure rules that apply before client tax return information goes into an AI tool.",
    contentType: "doc",
    contentBody: `# Confidentiality and IRC §7216 for AI tools

IRC §7216 is a criminal statute. Knowingly or recklessly disclosing tax return information without authorization, or using it outside what's permitted, is punishable as a misdemeanor — up to one year imprisonment and/or a fine, per violation. IRC §6713 is the parallel civil-penalty provision for the same underlying conduct, without the criminal intent requirement. IRS OPR Alert 2026-19 ties both directly to AI: running client tax return information through a general-purpose AI tool is very likely a disclosure under §7216, and the regulation's narrow "auxiliary service" exception does not clearly cover it.

## When consent is required

Treasury Regulation §301.7216-3 sets the consent bar: knowing, voluntary, written consent obtained *before* the disclosure happens. For individual returns, that consent has to follow the specific format and mandatory language set out in Revenue Procedure 2013-14 — a generic engagement-letter clause mentioning "third-party tools" does not satisfy this on its own.

## Where AI tools specifically create a problem

- The consent must **identify the recipient** of the disclosure. "Various AI tools" or "AI-assisted software" is not specific enough — the vendor and tool need to be identified.
- If the consent doesn't specify a duration, it's only effective for **one year** from the date the taxpayer signed it — not indefinitely.
- The last formal §7216 guidance predates the current AI landscape by well over a decade, which means firms are applying a framework not written with AI tools in mind — so err toward the more protective reading, not the more permissive one.

## What this means day to day

Before any client tax return information — not just the final output, but source documents, drafts, or client-specific facts — goes into an AI tool, two things need to be true: the tool itself has cleared the enterprise-approval framework (see the "Client data handling" module), and if the disclosure isn't clearly covered by an existing exception, specific written §7216 consent identifying that tool has been obtained.

${DISCLAIMER}`,
    durationMinutes: 15,
  },
  {
    title: "Confidentiality and IRC §7216 for AI tools: knowledge check",
    description: "Test your understanding of §7216 consent requirements as applied to AI tools.",
    contentType: "interactive",
    contentBody: quiz({
      questions: [
        {
          question: "Is IRC §7216 a civil or criminal statute?",
          options: [
            "Purely civil, with monetary penalties only",
            "Criminal — knowing or reckless unauthorized disclosure can be a misdemeanor",
            "It's an IRS internal policy, not a statute at all",
            "It only applies to publicly traded accounting firms",
          ],
          correctIndex: 1,
          explanation: "§7216 is a criminal statute; §6713 is the separate parallel civil-penalty provision for the same underlying conduct.",
        },
        {
          question: "Does running client tax return information through a general-purpose AI chatbot likely count as a §7216 disclosure?",
          options: [
            "No, AI tools are automatically covered by the auxiliary-service exception",
            "Yes — and the auxiliary-service exception does not clearly cover this use",
            "Only if the AI tool is based outside the United States",
            "No, §7216 only applies to disclosures to other tax preparers",
          ],
          correctIndex: 1,
          explanation: "OPR guidance treats this as very likely a §7216 disclosure, with no clear coverage under the narrow auxiliary-service exception.",
        },
        {
          question: "What consent standard does Treas. Reg. §301.7216-3 require?",
          options: [
            "Verbal consent is sufficient if documented in a call log",
            "Knowing, voluntary, written consent obtained before the disclosure",
            "No consent is required if the client signed a general engagement letter",
            "Consent can be obtained after the disclosure as long as it's within 30 days",
          ],
          correctIndex: 1,
          explanation: "The regulation requires prior written consent meeting a knowing-and-voluntary standard — after-the-fact consent doesn't satisfy it.",
        },
        {
          question: "Is describing the recipient as \"various AI tools\" in a consent form specific enough?",
          options: [
            "Yes, general categories are sufficient",
            "No — the consent must identify the specific recipient of the disclosure",
            "Yes, as long as the client initials next to that line",
            "It depends on the client's state of residence",
          ],
          correctIndex: 1,
          explanation: "The specific vendor/tool must be identified — a general category like \"various AI tools\" doesn't meet the identification requirement.",
        },
        {
          question: "If a §7216 consent form doesn't specify a duration, how long is it effective?",
          options: [
            "Indefinitely, until the client revokes it",
            "One year from the date the taxpayer signed it",
            "Only for the current tax filing season",
            "Consent without a duration is automatically invalid",
          ],
          correctIndex: 1,
          explanation: "Absent a specified duration, consent defaults to one year from the signature date — not an indefinite grant.",
        },
      ],
    }),
    durationMinutes: 8,
  },

  // 8. Escalating a flagged AI output
  {
    title: "Escalating a flagged AI output",
    description: "The firm-governance side of catching an AI error: when to escalate, and who signs off.",
    contentType: "doc",
    contentBody: `# Escalating a flagged AI output

Catching an AI error is only half the process — what happens next is a §10.36 firm-procedures question, not just an individual reviewer's judgment call. §10.36 requires that individuals with principal authority over a firm's tax practice "take reasonable steps to ensure that the firm has adequate procedures" for compliance, and imposes discipline on responsible individuals who, through willfulness, recklessness, or gross incompetence, fail to correct a known pattern of noncompliance. A firm without a clear escalation path is exposed here even if individual staff are diligent.

## Flagged vs. escalated, in practice

- **Flagged**: an issue was found in AI-assisted work and corrected before it went anywhere — a citation swapped for the right one, a calculation fixed. The preparer or first reviewer handled it within their own review.
- **Escalated**: the issue is serious enough that it needs a second, more senior reviewer's sign-off — either because the fix itself required judgment beyond the first reviewer's role, the error already went out and needs to be corrected after the fact, or the same kind of error is recurring across multiple engagements (which is a firm-procedure signal, not just a one-off mistake).

## What should trigger escalation specifically

- An error that reached a client or the IRS before being caught
- A pattern — the same type of AI error recurring across engagements, suggesting a tool or process problem rather than an isolated mistake
- Any case where the reviewer isn't confident their own correction fully resolved the underlying issue

## The reviewing partner's role

Sign-off on an escalated entry isn't a formality — it's the point where firm leadership's §10.36 responsibility becomes concrete. A reviewing partner confirming an escalated fix is also the moment to ask whether this is a one-off or a signal that a specific AI tool, task type, or reviewer needs closer attention going forward.

## Recording it

Both flagged and escalated outcomes get logged in the verification log as distinct entries — see "Using the verification log correctly" for what a complete record actually needs to include.

${DISCLAIMER}`,
    durationMinutes: 12,
  },
  {
    title: "Escalating a flagged AI output: knowledge check",
    description: "Test your understanding of when an AI error needs to move beyond the original reviewer.",
    contentType: "interactive",
    contentBody: quiz({
      questions: [
        {
          question: "Which Circular 230 provision makes escalation procedures a firm-governance issue, not just individual judgment?",
          options: ["§10.22", "§10.36", "§10.27(a)", "§10.35"],
          correctIndex: 1,
          explanation: "§10.36 requires firm leadership to maintain adequate procedures — an undefined or absent escalation path is a §10.36 exposure.",
        },
        {
          question: "What distinguishes a 'flagged' outcome from an 'escalated' one?",
          options: [
            "Flagged errors are always more serious than escalated ones",
            "Flagged issues were caught and resolved within the original review; escalated issues need a more senior sign-off",
            "There's no meaningful difference — the terms are interchangeable",
            "Escalated only applies to research memos, not return preparation",
          ],
          correctIndex: 1,
          explanation: "Flagged means resolved at the original review level; escalated means it needs additional, more senior review.",
        },
        {
          question: "If the same type of AI error keeps recurring across different engagements, what does that suggest?",
          options: [
            "Nothing — recurring errors are just bad luck",
            "A possible tool or process problem, which is itself an escalation-worthy signal",
            "That the reviewer should stop using the verification log for that error type",
            "That the client relationship should be terminated",
          ],
          correctIndex: 1,
          explanation: "A recurring pattern points to a systemic issue with a tool or process, which is exactly the kind of signal firm leadership needs escalated to them.",
        },
        {
          question: "What is the reviewing partner's sign-off on an escalated entry actually for?",
          options: [
            "A formality required only for insurance purposes",
            "The point where firm leadership's §10.36 responsibility becomes concrete, and a chance to check for a broader pattern",
            "Just a way to close out the entry in the software",
            "Required only when the client specifically requests it",
          ],
          correctIndex: 1,
          explanation: "The sign-off is substantive — it's where firm governance responsibility under §10.36 actually gets exercised, not just a checkbox.",
        },
        {
          question: "Should an error that already reached the client before being caught be escalated?",
          options: [
            "No, only errors caught before delivery need escalation",
            "Yes — an error that reached the client or IRS before being caught should be escalated",
            "Only if the client complains about it first",
            "No, it should just be corrected quietly without any log entry",
          ],
          correctIndex: 1,
          explanation: "An error that already went out is specifically named as a trigger for escalation, not something to quietly fix and skip logging.",
        },
      ],
    }),
    durationMinutes: 8,
  },

  // 9. AI risk by task type
  {
    title: "AI risk by task type: research memos vs. return prep",
    description: "Different task categories carry different AI failure modes — what to specifically watch for in each.",
    contentType: "doc",
    contentBody: `# AI risk by task type: research memos vs. return prep

The verification steps that matter most shift depending on what kind of task the AI is helping with. Treating every task category with the same generic "double-check it" instinct misses where each one actually tends to fail.

## Return preparation

The dominant risk is **calculation and data-entry error** — a transposed figure, a misapplied rate, a schedule that doesn't reconcile with the source documents. These errors are often mechanically simple but easy to miss on a read-through, because the output looks internally consistent even when a single input number is wrong. Verification here means checking calculations against source numbers directly, not just reviewing the narrative logic.

## Research memos

The dominant risk is **hallucinated or superseded authority** — a citation that doesn't exist, a Revenue Ruling number that's real but doesn't say what's claimed, or a position that was correct under prior law but has since changed. These errors are dangerous specifically because a confidently written memo reads the same whether the underlying citations are solid or fabricated. Verification here means checking every citation independently — see "Spotting a hallucinated citation" for the specific technique.

## Client correspondence

The dominant risk is **tone and factual overreach** — an AI draft stating something as settled that's actually uncertain, or a confidence level in the writing that isn't backed by the underlying analysis. Correspondence often gets less scrutiny than a formal memo because it feels lower-stakes, but it's still written advice under §10.37 if it gives the client a tax position to rely on.

## Written advice generally

Applies §10.37's full standard regardless of task type — see that module for the independent-verification requirement in depth.

## The practical implication

When assigning or reviewing AI-assisted work, match the review checklist to the task category's dominant failure mode, rather than applying one generic checklist everywhere. A return-prep review that skips calculation-checking because "the citations looked fine" has checked the wrong thing.

${DISCLAIMER}`,
    durationMinutes: 12,
  },
  {
    title: "AI risk by task type: research memos vs. return prep: knowledge check",
    description: "Test your understanding of how AI failure modes differ across task categories.",
    contentType: "interactive",
    contentBody: quiz({
      questions: [
        {
          question: "What is the dominant AI risk in return preparation tasks?",
          options: [
            "Hallucinated case law citations",
            "Calculation and data-entry errors that look internally consistent",
            "Overly cautious tone in client-facing language",
            "Missing engagement letter language",
          ],
          correctIndex: 1,
          explanation: "Return prep's main risk is mechanical calculation/data-entry errors that can look consistent even when a source number is wrong.",
        },
        {
          question: "Why is hallucinated authority a specific danger in AI-assisted research memos?",
          options: [
            "Because research memos are reviewed less often than return prep",
            "Because a confidently written memo reads the same whether citations are solid or fabricated",
            "Because research memos are never reviewed by a second person",
            "Because clients always read research memos in full",
          ],
          correctIndex: 1,
          explanation: "The writing quality doesn't signal citation accuracy — a fabricated citation can read exactly as confidently as a real one.",
        },
        {
          question: "Why might client correspondence get less scrutiny than a formal memo, even though it can carry the same §10.37 obligations?",
          options: [
            "Correspondence is legally exempt from §10.37",
            "It often feels lower-stakes even though it's still written advice if it gives the client a position to rely on",
            "Correspondence is always reviewed by a partner automatically",
            "AI tools are not used for correspondence",
          ],
          correctIndex: 1,
          explanation: "Correspondence can carry full §10.37 written-advice weight, but its informal feel often leads to under-scrutiny relative to that risk.",
        },
        {
          question: "What's the practical recommendation for reviewing AI-assisted work across task types?",
          options: [
            "Use one identical generic checklist for every task type",
            "Match the review checklist to each task category's dominant failure mode",
            "Only review return preparation tasks, since those are highest-volume",
            "Skip review entirely for tasks under a certain dollar value",
          ],
          correctIndex: 1,
          explanation: "The module's core recommendation is tailoring the review focus to where each task type actually tends to fail, not a one-size-fits-all checklist.",
        },
        {
          question: "A reviewer checks all citations in an AI-assisted return-prep task but skips verifying the calculations. What did they miss?",
          options: [
            "Nothing — citation-checking covers all risk categories",
            "The dominant risk in return prep, which is calculation and data-entry accuracy",
            "This is the correct approach for return prep",
            "Nothing, since return prep tasks don't need calculation checks",
          ],
          correctIndex: 1,
          explanation: "This is exactly the mismatch the module warns against — checking citations thoroughly while skipping the failure mode that actually dominates return prep.",
        },
      ],
    }),
    durationMinutes: 8,
  },

  // 10. Vetting a new AI tool before firm-wide approval
  {
    title: "Vetting a new AI tool before firm-wide approval",
    description: "The evaluation steps a tool needs to clear before moving from 'under review' to 'approved.'",
    contentType: "doc",
    contentBody: `# Vetting a new AI tool before firm-wide approval

§10.36 places responsibility for firm-wide AI governance on whoever holds principal authority over the firm's tax practice — including third-party tool vetting. IRS OPR Alert 2026-19 is specific that partners "cannot claim ignorance of staff using unsecured AI tools without oversight." That makes vetting a required firm procedure, not an optional nicety, and it's what should happen before a tool in this app's AI Tool Register moves from "under review" to "approved."

## What to evaluate before approval

- **Data retention and storage location** — where does submitted data live, for how long, and under which jurisdiction's law?
- **Access controls** — who at the vendor, if anyone, can access client data submitted through the tool?
- **Security certification** — does the vendor hold relevant, current security certifications, and are they willing to provide evidence rather than just claim it?
- **Task-specific reliability** — has the tool actually been tested against the kind of work your firm will use it for, not just general-purpose benchmarks?
- **Contractual confidentiality commitments** — see the "Client data handling" module's three-part framework: without a specific non-retention/non-training-use commitment, no other strength on this list is enough to approve the tool for client data.

## Who should be involved

OPR frames this as a firm IT and compliance leadership review, not a single practitioner's informal judgment that a tool "seems fine." A tool one staff member has used successfully on a few tasks hasn't been vetted in the sense §10.36 requires — individual experience isn't a substitute for the structured review.

## What "approved" should mean once granted

Approval isn't indefinite by default just because it happened once. Vendor terms, security posture, and even ownership can change — a tool's approval status should be revisited periodically, not treated as a permanent designation once granted.

## Where this connects

This module is the process; "Client data handling with third-party AI tools" is the specific confidentiality standard the process is checking for.

${DISCLAIMER}`,
    durationMinutes: 12,
  },
  {
    title: "Vetting a new AI tool before firm-wide approval: knowledge check",
    description: "Test your understanding of the firm-governance process for approving a new AI tool.",
    contentType: "interactive",
    contentBody: quiz({
      questions: [
        {
          question: "What did OPR say about partners' responsibility for staff using unsecured AI tools?",
          options: [
            "Partners are only responsible if they personally recommended the tool",
            "Partners cannot claim ignorance of staff using unsecured AI tools without oversight",
            "Responsibility falls solely on individual staff members, not partners",
            "OPR did not address partner responsibility for tool vetting",
          ],
          correctIndex: 1,
          explanation: "OPR places affirmative responsibility on firm leadership — ignorance of unvetted tool use isn't a defense under §10.36.",
        },
        {
          question: "Is a staff member's positive personal experience with a tool sufficient to consider it 'vetted'?",
          options: [
            "Yes, individual experience is the primary vetting method",
            "No — §10.36 requires a structured firm IT/compliance review, not just informal individual experience",
            "Yes, if at least three staff members report the same experience",
            "It depends on the staff member's seniority",
          ],
          correctIndex: 1,
          explanation: "Individual experience isn't a substitute for the structured review OPR describes — vetting needs to be a firm-level process.",
        },
        {
          question: "What should be checked regarding a vendor's security certifications during vetting?",
          options: [
            "Whether the vendor claims to be secure in their marketing materials",
            "Whether the vendor holds relevant, current certifications and can provide evidence, not just claims",
            "Nothing — certifications aren't part of the vetting process",
            "Only whether the vendor is a well-known company",
          ],
          correctIndex: 1,
          explanation: "Evidence of current, relevant certification matters — a vendor's own unverified claim of security isn't sufficient.",
        },
        {
          question: "Once a tool is approved, is that approval permanent?",
          options: [
            "Yes, approval never needs to be revisited once granted",
            "No — vendor terms, security posture, and ownership can change, so approval should be revisited periodically",
            "Approval expires automatically after exactly 90 days in all cases",
            "Only the IRS can revoke a tool's approval status",
          ],
          correctIndex: 1,
          explanation: "Approval status should be periodically reconsidered since vendor circumstances can change after the initial review.",
        },
        {
          question: "Without a specific contractual non-retention/non-training-use commitment from the vendor, can a tool still be approved for client data based on strong security certifications alone?",
          options: [
            "Yes, strong certifications alone are sufficient",
            "No — without that specific commitment, no other strength on the checklist is enough to approve the tool for client data",
            "Yes, as long as the tool is widely used by other firms",
            "It depends only on the tool's price point",
          ],
          correctIndex: 1,
          explanation: "The confidentiality commitment is a gating requirement — other strong qualities don't substitute for its absence.",
        },
      ],
    }),
    durationMinutes: 8,
  },

  // 11. New staff onboarding
  {
    title: "New staff onboarding: AI-use policy essentials",
    description: "The minimum a new hire needs to know before touching client work with an AI tool.",
    contentType: "doc",
    contentBody: `# New staff onboarding: AI-use policy essentials

IRS OPR Alert 2026-19 ties staff training directly to §10.36 firm-procedure obligations: comprehensive training on AI risks and Circular 230 requirements is a required firm procedure, and staff who don't understand these obligations expose the firm to vicarious liability. This module is the onboarding-day summary — a new hire should leave it able to answer "what do I need to know before I use AI on a client's work?"

## The five things to know before your first AI-assisted task

1. **Only enterprise-approved tools.** Check the AI Tool Register before using any AI tool on client work. "Approved" status specifically means it cleared firm IT/compliance review — not that a colleague uses it informally. See "Client data handling with third-party AI tools" for what approval requires.
2. **You are responsible for what you deliver, not the AI.** Whatever an AI tool drafts, the practitioner's name and Circular 230 obligations attach to the final work product — §10.22 (diligence), §10.35 (competence), and §10.37 (written advice) don't transfer to the tool.
3. **Every citation, calculation, and fact gets independently checked.** Not spot-checked, not skimmed for plausibility — checked against its source. See "Spotting a hallucinated citation" for the specific technique.
4. **Client tax information needs specific consent before it goes into most AI tools.** This is a criminal-statute question under IRC §7216, not just an internal policy preference. See "Confidentiality and IRC §7216 for AI tools."
5. **Log the review, and escalate when something doesn't check out.** A completed verification-log entry is what turns "I checked it" into evidence the firm can actually point to. See "Using the verification log correctly" and "Escalating a flagged AI output."

## Where to go deeper

Each of the five points above has its own full training module in this program — this page is the map, not the complete picture. Complete this module first, then work through the rest at your own pace.

${DISCLAIMER}`,
    durationMinutes: 10,
  },
  {
    title: "New staff onboarding: AI-use policy essentials: knowledge check",
    description: "Confirm you know the five essentials every new hire needs before touching client work with AI.",
    contentType: "interactive",
    contentBody: quiz({
      questions: [
        {
          question: "Before using any AI tool on client work, what should a new hire check first?",
          options: [
            "Whether a colleague already uses that tool informally",
            "The AI Tool Register, to confirm the tool has enterprise-approved status",
            "Nothing — any AI tool is fine for internal drafting",
            "Only the tool's pricing page",
          ],
          correctIndex: 1,
          explanation: "Only enterprise-approved status (cleared through firm IT/compliance review) qualifies a tool for client work — informal colleague use doesn't count as approval.",
        },
        {
          question: "If an AI tool drafts a section of a client memo with an error, who is responsible for that error under Circular 230?",
          options: [
            "The AI vendor",
            "The practitioner who delivers the work — Circular 230 obligations don't transfer to the tool",
            "No one, since the tool made the error, not a person",
            "Whichever staff member is most junior on the engagement",
          ],
          correctIndex: 1,
          explanation: "§10.22, §10.35, and §10.37 obligations attach to the practitioner delivering the work, regardless of what tool assisted in drafting it.",
        },
        {
          question: "Does client tax information require anything specific before it goes into most AI tools?",
          options: [
            "No, as long as the tool is enterprise-approved, nothing else is needed",
            "Yes — specific written §7216 consent is generally required, which is a criminal-statute question, not just internal policy",
            "Only a verbal mention to the client is needed",
            "Only if the client is a new client, not an existing one",
          ],
          correctIndex: 1,
          explanation: "§7216 consent is a distinct legal requirement (with criminal-statute stakes) separate from whether the tool itself is enterprise-approved.",
        },
        {
          question: "What does 'checking' an AI-generated citation or calculation actually require, per this training program?",
          options: [
            "A quick skim to see if it looks plausible",
            "Independently verifying it against its source — not spot-checking or skimming",
            "Asking the same AI tool to double check its own work",
            "Trusting it if the AI tool is generally well-regarded",
          ],
          correctIndex: 1,
          explanation: "The standard across this training program is independent verification against the actual source, not plausibility checks or self-verification by the same tool.",
        },
        {
          question: "Why does logging a completed review matter, beyond just doing the review itself?",
          options: [
            "It doesn't matter — doing the review is sufficient on its own",
            "A logged entry is what turns 'I checked it' into evidence the firm can actually point to",
            "Logging is only required for escalated entries, not routine ones",
            "It's only useful for the firm's marketing materials",
          ],
          correctIndex: 1,
          explanation: "OPR's documentation expectation means the review itself needs a record — an unlogged review, even if done well, isn't demonstrable after the fact.",
        },
      ],
    }),
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
