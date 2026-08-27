# Client AI chat history as compliance evidence — research + design

Status: **idea, not yet implemented.** This extends [`ai-trace-attachments-plan.md`](./ai-trace-attachments-plan.md)
(reviewer-attached AI trace PDFs) to cover the client-facing case: a client submitting their own
AI chat history so the firm has a tamper-evident record that it happened. Read that doc first —
this one only covers what's genuinely different.

## Why

IRS OPR Alert 2026-19 (§10.22 due diligence) expects evidence of who reviewed AI output and how.
The trace-attachments plan covers the *reviewer's* side of that. But there's a second, distinct
fact pattern worth its own record: **that a client used AI in a matter at all** — independent of
whether/how a practitioner later reviewed it. A firm may want a client to submit their chat
history (e.g. "I asked ChatGPT to estimate my deductible expenses") as a disclosure record, so
the firm has documented, tamper-evident proof of what the client did, separate from and prior to
any practitioner review.

## Context: how Apple protects passwords, and why it's the wrong model here

This section exists because the original ask for this doc was "research how Apple's Passwords
app hashes passwords so Apple doesn't get in trouble." It's worth understanding *why* that
doesn't transfer directly, because the instinct — "hash it like Apple hashes passwords" — leads
to the wrong tool if followed literally.

Apple's Passwords app doesn't hash stored credentials the way a server hashes login passwords
(bcrypt/Argon2/PBKDF2). Credentials are end-to-end encrypted with AES-256, and the decryption
keys never leave the user's devices. For account recovery — the one place a password-like secret
(the iCloud Security Code) has to be checked against something — Apple uses the **Secure Remote
Password (SRP) protocol**: a cluster of Apple's own Hardware Security Modules (HSMs) verifies
that the user knows the code via a zero-knowledge proof. The code itself is never transmitted to,
or derivable by, Apple. The escrow record holding the actual keychain is wrapped with both the
user's code and the HSM cluster's public key, and after only **10 failed attempts the HSM cluster
permanently destroys the escrow record** — brute-force protection by irreversible self-destruction,
not just rate-limiting. Apple also states the administrative access cards that could have altered
HSM firmware have been physically destroyed, making this an architectural guarantee, not a policy
promise.

The throughline: this is an architecture for **proving knowledge of a secret without the verifier
ever holding it.** That's the opposite of what a compliance record needs. The firm *wants* to
retain the client's transcript — the whole point is having the content on file — not prove it
never saw it. So SRP, and password-hashing algorithms generally, are the wrong primitive here:
they're built to resist offline guessing of a **low-entropy** secret (a password), whereas a chat
transcript is **high-entropy** data where the goal is fingerprinting and tamper-detection, not
secrecy-of-a-guessable-value.

The closer analog is **RFC 3161 trusted timestamping**: a Time-Stamping Authority signs a hash of
some content plus a timestamp, without ever seeing the content itself, giving cryptographic proof
that content existed at a point in time. That's the actual shape of the problem — "prove this
exact thing existed, unaltered, as of this time" — and the answer to that shape of problem is a
plain cryptographic hash (SHA-256), not a password-hashing algorithm.

**Conclusion: use SHA-256 (HMAC'd — see below), not bcrypt/Argon2/PBKDF2/SRP.**

## What gets hashed

Hash a **canonicalized JSON serialization of the transcript** — a role/content/timestamp array
with sorted keys and stable formatting — not the raw bytes of whatever the client exports/pastes.
This mirrors `canonicalizeChecklist()` in `lib/verification/hash-chain.ts`: hashing raw export
bytes means a cosmetic re-export (different whitespace, reordered JSON keys, a different export
tool) looks like tampering when it isn't.

Hash the **whole transcript as one blob**, not a per-message Merkle tree. A Merkle tree buys
partial-disclosure — proving one message existed without revealing the rest — which matters for
litigation evidence but not for this app's use case (a compliance record whose only question is
"did this exact transcript change since submission"). Calling this out explicitly: it's scope
being deliberately left out, not overlooked.

## HMAC, not a bare hash

Use **HMAC-SHA256 with the firm's existing signing secret**, following the pattern already
implemented in `lib/verification/audit-report.tsx` (`computeAuditSignature()`, which does
`createHmac("sha256", signingSecret()).update(canonicalizeSummary(summary)).digest("hex")`, with
`signingSecret()` reading `process.env.AUDIT_REPORT_SIGNING_SECRET`).

A bare SHA-256 digest only proves *some* content matches — anyone who later obtains a leaked copy
of the transcript can compute the identical hash themselves. HMAC-signing with a secret only the
firm's server holds proves *the firm's own system* computed and attested to this digest at
submission time, which is the actual claim a compliance record needs to make.

**Caveat worth fixing, not repeating:** the existing `computeAuditSignature()` is only ever
*produced* in this codebase — there's no `verifySignature` counterpart anywhere, so the HMAC is
currently write-only. This new feature should implement an actual verify path (recompute the
HMAC from stored inputs and compare) rather than carry that gap forward.

## Fold into the existing hash chain — don't build a second one

`lib/verification/hash-chain.ts` already implements one hash chain per firm: `sha256Hex()`,
`canonicalize()` (deterministic pipe-joined fields), `appendVerificationEntry()` (transactional,
row-locked on `firmChainState` so concurrent writers can't race the sequence number), and
`verifyChain()` (full recompute from genesis). The trace-attachments plan already specifies
adding a nullable `traceAttachmentSha256`-style field to `canonicalize()`'s input for reviewer
PDFs. Do the same here: add the client transcript's HMAC digest as another nullable field folded
into the same `canonicalize()` call, appended to the same per-firm chain. Two parallel chains
would undermine the single-source-of-truth property that makes the chain worth having.

## Client submission mechanism (sketch, not a build-ready spec)

There is currently **no `client` entity anywhere in `lib/db/schema/`** — clients only appear as
free text (e.g. a `deliveredToClientAt` timestamp). A full client portal (accounts, login,
multi-matter history) is a separate, larger prerequisite problem this doc isn't solving. What
follows is a minimal primitive sized to just this feature:

1. A firm user generates a **single-use, matter-scoped upload token** — a random token, stored
   server-side with an expiry and a pointer to the target `verificationLog` entry (or a
   lightweight `matterId` if no entry exists yet).
2. The firm hands the link to the client out-of-band (email, portal message — delivery mechanism
   is the firm's existing process, not something this feature needs to own).
3. Visiting the link lets the client paste or upload their transcript once. No account, login, or
   session — the token itself is the authorization, and it's single-use.
4. On submission, server-side: validate size/format, canonicalize the transcript, compute the
   HMAC-SHA256 digest, store the transcript in **private** Blob storage — reusing every
   constraint from `ai-trace-attachments-plan.md`'s "Privacy implementation details" section by
   reference (private access only, short-lived signed download URLs generated per-request, all
   handling server-side, blob storage key derived from the entry UUID rather than any
   client-supplied filename). Fold the digest into the hash chain. Invalidate the token
   immediately so it can't be reused or shared further.

## Explicit warnings

- **Hashing is not a §7216/confidentiality substitute.** The firm still fully "handles" the
  transcript's actual content under normal confidentiality rules the moment it's submitted. A
  hash never launders the sensitivity of what it points to — it's metadata about the content, not
  a replacement for treating the content carefully.
- **A matching hash proves *a* blob existed — not that anyone read or understood it correctly.**
  Don't let any future UI copy imply that a verified hash means the content was reviewed or
  acted on appropriately; that's a separate fact the reviewer-side trace-attachments feature is
  meant to capture.
- **Re-verification isn't free.** If the firm ever needs to confirm a hash by re-hashing a
  client-supplied transcript, that transcript is passing through firm systems again and triggers
  the same handling/confidentiality obligations as the original submission — it's not a
  lightweight "just check a hash" operation from a data-handling standpoint.

## Open decisions (resolve before implementing)

1. **Shared schema or separate fields?** Should one `verificationLog` entry's attachment fields
   be generic enough to hold either a reviewer trace PDF or a client transcript, or should they
   stay as distinct field sets? Affects both migrations.
2. **Retention window for client transcripts specifically** — same window as reviewer trace PDFs,
   or shorter, given this is the client's own unreviewed data rather than something the firm
   generated? As with the trace-attachments plan, the digest can outlive the blob once folded
   into the chain, so retention and verifiability aren't in tension.
3. **External timestamping** — is the in-house HMAC sufficient, or does counsel want an
   additional RFC 3161 timestamp from a third-party TSA for extra evidentiary weight? Real added
   complexity; treat as belt-and-suspenders, not a default.
4. **Signature verification path** — build it for this feature only, or use this as the occasion
   to also add the missing verify path for the existing `audit-report.tsx` HMAC?
5. **§7216 question, not an implementation one** — same as the trace-attachments plan: whether
   storing a client transcript internally counts as a new disclosure event separate from
   whatever consent covered the original AI use is worth confirming with counsel, not assumed
   either way here.

## Sources (Apple / RFC 3161 research)

- [iCloud Keychain security overview](https://support.apple.com/guide/security/icloud-keychain-security-overview-sec1c89c6f3b/web)
- [Secure keychain syncing](https://support.apple.com/guide/security/secure-keychain-syncing-sec0a319b35f/web)
- [Escrow security for iCloud Keychain](https://support.apple.com/guide/security/escrow-security-for-icloud-keychain-sec3e341e75d/web)
- [RFC 3161 timestamping protocol and reliable digital evidence](https://evidency.io/en/rfc-3161-timestamping/)
