# Circular 230 AI Compliance Kit — Phase 0 MVP

A compliance-and-workflow app for small tax/accounting firms to document AI use under Treasury Circular 230 (IRS OPR Alert 2026-19): a Circular 230-mapped AI-use policy generator, staff training tracking, an AI tool register, and a structured, tamper-evident verification log of AI-assisted work.

This is the Phase 0 scaffold — see [`docs/plan.md`](#) history for the full build plan. Out of scope for this phase: CPE accreditation, cross-firm benchmarking, browser/email integrations, production cloud infra hardening, fine-tuning.

## Stack

- **Framework**: Next.js 16 (App Router) + TypeScript. Note: Next 16 renamed `middleware.ts` to `proxy.ts` — see [`proxy.ts`](./proxy.ts).
- **Database**: Neon Postgres (pgvector enabled) via Vercel Marketplace, accessed through Drizzle ORM.
  - Reads/most writes use the HTTP driver (`lib/db/index.ts`).
  - The verification log's hash-chain append uses the WebSocket/Pool driver (`lib/db/pool.ts`) because it needs a real transaction with row locking — the HTTP driver can't do that.
- **Auth/tenancy**: Clerk (Organizations = firms) via Vercel Marketplace.
- **AI**: Vercel AI SDK + AI Gateway. Plain `"provider/model"` strings route through the Gateway automatically, authenticated via OIDC (`VERCEL_OIDC_TOKEN`, provisioned by `vercel env pull`) — no separate API keys needed for generation *or* embeddings (`gateway.embeddingModel(...)` from `@ai-sdk/gateway`, re-exported by `ai`).
- **UI**: shadcn/ui (Base UI primitives, not Radix — components use a `render` prop for polymorphism, not `asChild`) + Tailwind v4.
- **Exports**: `@react-pdf/renderer` (PDF), `docx` (DOCX).

## Setup

1. **Install dependencies**: `npm install`
2. **Link to Vercel** (if not already): `vercel link`
3. **Provision Neon**: `vercel integration add neon` — enables pgvector automatically isn't guaranteed; if needed, connect via `psql "$DATABASE_URL" -c "CREATE EXTENSION IF NOT EXISTS vector;"`
4. **Provision Clerk**: `vercel integration add clerk` — this requires accepting Clerk's marketplace terms in a browser first (the CLI will print a link); retry the command after accepting.
5. **Pull env vars**: `vercel env pull .env.local --yes`
6. **Generate the audit report signing secret** (one-time, if not already set):
   ```bash
   SECRET="$(node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))")"
   vercel env add AUDIT_REPORT_SIGNING_SECRET development --value "$SECRET"
   vercel env add AUDIT_REPORT_SIGNING_SECRET preview --sensitive --value "$SECRET"
   vercel env add AUDIT_REPORT_SIGNING_SECRET production --sensitive --value "$SECRET"
   vercel env pull .env.local --yes
   ```
7. **Push the schema**: `npm run db:push` (or `-- --force` non-interactively)
8. **Apply custom SQL migrations** (append-only trigger on `verification_log` — not expressible in the Drizzle schema DSL): `npm run db:migrate`
9. **Seed**: `npm run db:seed` — seeds the AI tool catalog, training modules, the synthetic RAG corpus (makes live embedding calls — see note below), and a demo firm.
10. **Run**: `npm run dev`

### AI Gateway billing note

`npm run db:seed` and any policy-generation flow make live calls through the Vercel AI Gateway (embeddings for corpus seeding/retrieval, generation for policy clauses and the eval judge). **The Gateway's free tier is heavily rate-limited and restricts some models entirely (403, not just 429)** — as of this scaffold, `db:seed`'s corpus step needed real AI Gateway credits/a payment method added (Team settings → AI Gateway → top up) before embedding calls succeeded reliably. `lib/rag/retry.ts` backs off hard on 429s, but a 403 "free tier users do not have access to this model" is not retryable — if you hit that, the model itself needs a paid tier, not just patience.

If you're iterating without Clerk fully set up yet, `scripts/seed.ts` seeds a demo firm via a direct DB insert with a fake `clerk_org_id` (`demo-org-backend-iteration`) rather than a real Clerk org — useful for backend-only iteration. Real firms are created via the `organization.created` Clerk webhook (`app/api/webhooks/clerk/route.ts`).

## Repo structure

```
app/
  (marketing)/            public routes — landing page, policy-generator preview (no auth, no persistence)
  (app)/                  authenticated, firm-scoped routes — layout resolves Clerk org -> firm_id
  api/webhooks/clerk/     syncs Clerk orgs/memberships -> firms/users tables
lib/
  db/                     Drizzle schema, HTTP client (index.ts), Pool client for transactions (pool.ts)
  auth/                   firm-context.ts (session -> {firmId, userId, appRole}), rbac.ts
  verification/           hash-chain.ts (core object), checklist-definitions.ts, audit-report.tsx
  rag/                    embed.ts, retrieve.ts, generate-policy.ts, sections.ts, retry.ts, eval/
  pdf/                    policy-export.tsx (PDF), policy-export-docx.ts (DOCX)
scripts/                  seed.ts, verify-chain.ts, run-eval.ts, apply-custom-migrations.sh
tests/                    hash-chain.test.ts, tenant-isolation.test.ts, rag-refusal.test.ts
```

## The verification log (core object)

Append-only, hash-chained: each entry's `entry_hash` incorporates the previous entry's hash (`prior_hash`), seeded from a per-firm genesis hash. Mutation is blocked at the database layer by a trigger on `verification_log` (`lib/db/migrations/0001_verification_log_append_only.sql`) — not `REVOKE`, because Neon's connection role owns the table and owners bypass grant checks; triggers fire regardless of ownership.

- Append: `lib/verification/hash-chain.ts: appendVerificationEntry()` — locks the firm's `firm_chain_state` row (`SELECT ... FOR UPDATE`) inside a real transaction via the Pool driver, so concurrent writers for the same firm can't race.
- Verify: `verifyChain(firmId)` recomputes every entry's hash from stored fields and confirms the chain links back to genesis. Tamper-*evident*, not tamper-proof against raw DB superuser access — see `tests/hash-chain.test.ts` for a test that disables the trigger to simulate exactly that, and confirms `verifyChain` still catches it.
- CLI: `npm run verify-chain -- --firm <id>` or `--all`.

## Verification / testing

```bash
npm run db:push          # sync schema (or drizzle-kit push --force non-interactively)
npm run db:migrate       # apply the append-only trigger + any future custom SQL migrations
npm run db:seed          # catalog, training modules, synthetic corpus, demo firm + sample log entries
npm run verify-chain -- --all
npm run test             # hash-chain, tenant-isolation, rag-refusal (rag-refusal makes live AI Gateway calls — see note below)
npm run lint
npx tsc --noEmit
```

Smoke-test checklist (also codified in `tests/`):
1. Log a `flagged` verification entry with no `flag_reason` — DB constraint should reject it.
2. `verify-chain` reports `VALID`; a raw-SQL tamper (with the trigger disabled) makes it report `INVALID` at the right `sequence_no`.
3. Generate a policy doc — every clause has a `cited_chunk_id` or is a recorded refusal; the eval harness (`run-eval.ts`) flags any clause that doesn't hold up.
4. As one firm's session, fetch another firm's verification entry/tool/policy by ID directly — expect 404, not an empty list (see `tests/tenant-isolation.test.ts`).
5. Export the audit report PDF and a policy PDF/DOCX — confirm they open and the hash-chain verdict/HMAC signature render.

## AI Gateway model choice and test flakiness

`GENERATION_MODEL_ID`/`JUDGE_MODEL_ID` (`lib/rag/generate-policy.ts`, `lib/rag/eval/judge.ts`) are set to `alibaba/qwen3.7-flash`, not a flagship model. As built, the AI Gateway's free tier didn't grant access to OpenAI/Anthropic/Google chat models at all (403 `no_providers_available`), and even on models it did allow, `generateObject`'s structured-output mode was separately gated from plain `generateText` on the same model. `lib/rag/structured-generate.ts` works around this: it asks for raw JSON in the prompt via `generateText` and validates the parsed result with the same Zod schema `generateObject` would have used. Revisit both the model choice and this workaround once the project has real (non-free-tier) Gateway billing — `generateObject` is the more robust primitive if it's available.

`tests/rag-refusal.test.ts` makes live Gateway calls and is subject to that free tier's rate limiting — `lib/rag/retry.ts` backs off hard (up to ~150s across 6 attempts) on 429s, which is why those tests carry a 180s timeout. Expect occasional single-test flakiness under sustained free-tier use (a different test in the file may time out on any given run) — this reflects the shared rate limit, not a code defect: every test in the file has passed individually across repeated runs. If several tests in this file fail in the same run, wait a few minutes before retrying (a burst of requests, e.g. from repeated manual testing, appears to trigger a longer cooldown than a simple per-minute cap).

## Known gaps at end of this scaffold pass

- Clerk marketplace terms acceptance was pending at last check — `app/api/webhooks/clerk/route.ts` and the `(app)` layout are written and typechecked but not yet live-verified against a real signed-in session.
