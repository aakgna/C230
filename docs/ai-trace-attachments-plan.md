# AI trace attachments for the verification log — execution plan

Status: **idea, not yet implemented.** This is a plan to pick up when ready, not a commitment.

## Why

IRS OPR Alert 2026-19 (§10.22 due diligence) expects evidence of *who reviewed AI output, what the review involved, and how adequacy was confirmed* — not just a checklist tick. Letting a reviewer attach the actual AI trace (e.g. a PDF export of the chat/prompt history) as supporting evidence for a verification entry is much stronger documentation than the structured fields alone.

## Non-negotiable constraint: confidentiality

A trace PDF will very likely contain real client tax data (the prompts and outputs it's capturing). It needs the same handling rigor as anything else touching client information — see the "Confidentiality and IRC §7216 for AI tools" and "Client data handling" training modules already in this app. Concretely:

- Store as **private** blob storage, never public URLs.
- Access must go through `requireFirmContext()` + a firm-scoped ownership check on every read, the same pattern `verification/actions.ts` already uses for `practitionerId`/`aiToolId`.
- Decide a retention policy before shipping this (indefinite, matching the append-only log? time-boxed? user firm's own call — flag this as an open decision, not something to default silently).

## Tamper-evidence: fold it into the hash chain

The verification log's whole value is the hash chain in `lib/verification/hash-chain.ts` (`canonicalize()` + `sha256Hex()`, chained via `firmChainState`). An attachment that isn't part of that chain is just a loose file next to tamper-evident data — undermines the append-only guarantee.

**Approach**: hash the uploaded PDF bytes (`sha256Hex`), store that digest as a new field on the entry, and include it in `canonicalize()`'s input alongside the existing fields. This makes the attachment's integrity provable the same way every other field already is — a swapped-out PDF after the fact would break the chain, exactly like a tampered `flagReason` would today.

## Privacy implementation details

This is the part worth getting right before writing any code — the trace file is the single most sensitive artifact this app would ever store (raw client tax data, not just metadata about it).

**1. Storage mode**
Vercel Blob supports both public and private access. Use **private** — never `access: 'public'`. A private blob isn't fetchable by a bare URL; every read has to go through your own server code, which is what makes access control possible at all. Confirm the current API shape in `@vercel/blob`'s docs at implementation time rather than assuming.

**2. Never expose a permanent URL**
Don't store a long-lived public/signed URL in the database or render it into page HTML. Generate a short-lived, single-purpose download URL (or stream the bytes through a route handler) on each request, after `requireFirmContext()` confirms the requester's `firmId` matches the entry's `firmId` — same ownership check every other query in this app already does. If the blob SDK's signed URLs are used, keep the expiry short (e.g. 60s) so a leaked link doesn't stay useful.

**3. Upload server-side, not client-direct**
Route the upload through the Server Action, not a client-side direct-to-blob token. That keeps MIME/magic-byte validation, size limits, and the firm-context check in the critical path *before* anything touches storage — a client-direct upload would let those checks be bypassed entirely.

**4. Don't let the file touch any other service**
Don't run the PDF through OCR, summarization, virus scanning, or any other third-party API unless that specific service is vetted through the same AI Tool Register process this app already builds for every other AI tool. Piping client data to an unvetted service here would recreate the exact §7216 problem the app exists to help firms avoid — including inside their own feature.

**5. Keep identifying info out of logs, filenames, and blob keys**
Never log PDF contents or extracted text. The original filename may contain a client's name — store it only in the access-controlled DB row, not as part of the blob's storage key/path (which can leak through CDN caches, error messages, or infra logs). Generate the blob key from the entry's UUID instead.

**6. Least privilege within the firm**
Decide whether every firm member should be able to download attachments, or only `firm_admin` — worth treating this as more restricted than the structured log fields, since it's the one place raw client data lives in this feature. `lib/auth/firm-context.ts`'s existing `appRole` check is the natural place to enforce this.

**7. Retention and deletion**
Decide a retention window and actually enforce it (Vercel Blob's `del()`), not just a soft-delete flag. Because the attachment's SHA-256 digest — not the file itself — is what's folded into the hash chain, you can delete the blob after the retention window while keeping the log entry fully verifiable: the chain proves a review happened and a specific file existed, without requiring the file to exist forever. This also gives you a clean answer if a client ever requests deletion of their data: purge the blob, keep the (already-hashed) entry.

**8. Consider logging access itself**
Given the whole product's premise is auditability, consider recording who downloaded an attachment and when — not required for v1, but a natural fit if a firm ever needs to answer "who has seen this client's data."

**9. Open legal question, not an implementation one**
Whether storing a trace PDF internally (never disclosed outside the firm) counts as a new §7216 disclosure event of its own, separate from whatever consent covered the original AI tool use, is worth confirming with counsel rather than assuming either way — flag it the same way the rest of this app's compliance content is flagged as training material, not legal advice.

## Schema changes

`lib/db/schema/verification.ts` — add to `verificationLog`:

```ts
traceAttachmentBlobUrl: text("trace_attachment_blob_url"), // nullable — attachment is optional
traceAttachmentSha256: text("trace_attachment_sha256"),    // nullable, paired with the above
traceAttachmentFilename: text("trace_attachment_filename"),
```

Keep it optional (nullable) — don't force every entry to have a trace file; not every reviewed task will have one worth attaching, and retrofitting a NOT NULL constraint onto an append-only table with existing rows is painful.

Add a `check()` constraint mirroring the existing ones: attachment fields are all-null or all-non-null together (no partial state).

## Hash chain changes

`lib/verification/hash-chain.ts`:

- `canonicalize()`: add `fields.traceAttachmentSha256 ?? ""` to the joined string (empty string when no attachment, consistent with how `flagReason` is already handled).
- `appendVerificationEntry()`: accept an optional `traceAttachmentSha256`/`traceAttachmentBlobUrl`/`traceAttachmentFilename` in `NewVerificationEntryInput`, thread through to both the hash computation and the inserted row.
- `verifyChain()`: recomputation already iterates stored fields generically — just needs the new field added to its own `canonicalize()` call so re-verification checks the attachment digest too.

## Storage

Use **Vercel Blob** (already the platform-native option, per this project's other infra choices) in **private** mode:

- New dependency: `@vercel/blob` (not yet installed — check current version/API before wiring up, don't assume the API shape from memory).
- Upload happens server-side inside the Server Action (not client-direct-to-blob), so the file passes through the same firm-context/validation path as everything else in `verification/actions.ts` before anything is persisted.
- Validate: PDF only (check MIME type and/or magic bytes, don't trust the client-supplied content-type alone), reasonable max size (e.g. 10–20 MB — decide based on realistic trace-export sizes).

## Upload flow

`app/(app)/verification/new/page.tsx`:

- Add a file input (`<input type="file" name="traceAttachment" accept="application/pdf">`) to the existing form, marked optional.

`app/(app)/verification/actions.ts` (`createVerificationEntry`):

- If a file is present: validate type/size, read bytes, compute `sha256Hex(bytes)`, upload to Blob, capture the resulting URL.
- Pass the three new fields into `appendVerificationEntry()`.
- If no file: pass all three as `null`, exactly like the existing `flagReason` optional-field pattern.

## Display

`app/(app)/verification/[id]/page.tsx`:

- If `traceAttachmentBlobUrl` is set, show a download link/button plus the filename and a short note that its SHA-256 is part of the entry's hash — i.e. visibly connect the attachment to the tamper-evidence story, not just "here's a file."
- `lib/verification/hash-chain.ts`'s `verifyChain()` result page (wherever that's surfaced) should make clear whether the attachment digest matched, if verification ever fails.

## Open decisions (resolve before implementing)

1. **Retention** — keep forever alongside the log, or time-box and purge the blob (while keeping the digest, so the chain stays valid even after the file itself is gone)?
2. **Required vs. optional** — should certain outcomes (e.g. `escalated`) require an attachment, or is it always reviewer's discretion?
3. **Max file size / page count** — realistic bound for a chat-export PDF.
4. **Multiple attachments per entry** — v1 assumes one; is that enough, or do multi-step reviews need more than one trace file?
5. **Existing rows** — no backfill needed (nullable field), but worth deciding whether to communicate the new capability to firms already using the log.

## Rough sequencing

1. Schema migration (nullable fields + check constraint) — no data backfill needed.
2. Hash chain changes (`canonicalize`, `appendVerificationEntry`, `verifyChain`) — get this right and tested before touching UI, since it's the part that's hard to change later without breaking existing entries' verifiability.
3. `@vercel/blob` wiring in the Server Action (upload, validate, hash).
4. Form + display UI.
5. Manual test: submit an entry with an attachment, confirm `verifyChain()` still reports valid; submit one without, confirm no regression; try swapping a blob's bytes out-of-band and confirm the chain now reports tampered (proves the tamper-evidence actually works end to end).
