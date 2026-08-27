# Chrome extension: end-of-AI-session reminder to log a verification entry

Status: **idea, not yet implemented.** A plan to pick up when ready, not a commitment.

## Why

Firm staff use AI tools (ChatGPT, Claude, Gemini, etc.) for client work, and this app already has
a working, tamper-evident place to record that: `/verification/new`, which appends to a per-firm
hash chain via `appendVerificationEntry()` in `lib/verification/hash-chain.ts`. The gap isn't the
recording mechanism — it's that nothing prompts a practitioner to actually go log an entry right
after they've used an AI tool, so entries likely get forgotten or backfilled inaccurately later
(and less accurately). A Chrome extension that notices when someone leaves a known AI-chat site
and nudges them toward `/verification/new` closes that gap without changing the app itself.

**Scope**: this targets **firm staff/practitioners**, not clients. A separate, not-yet-built
client-submission flow is covered by [`client-ai-chat-evidence-plan.md`](./client-ai-chat-evidence-plan.md)
and is out of scope here. The trigger is **tab closed / navigated away** from a known AI-chat
domain — not an idle timeout, not a manual-only button.

**Note on existing scope docs**: `README.md` currently lists "browser/email integrations" as
explicitly out of scope for this Phase 0 MVP. This extension is exactly that category. Worth
updating that line alongside implementation so the README doesn't quietly go stale once this
exists.

## Repo placement

New top-level `extension/` directory, sibling to `app/`/`lib/`. Manifest V3 extensions are static
manifest+JS with no bundler required for a v1 this size, so there's no build-tool conflict with
Next.js, and it keeps the extension's release lifecycle (Chrome Web Store review, its own
versioning) decoupled from the app's Vercel deploys.

```
extension/
  manifest.json
  background.js        # MV3 service worker ("type": "module")
  src/
    domains.js          # AI_CHAT_DOMAINS — single source of truth for the watch list
    tab-tracker.js       # per-tab state machine (below)
    notifier.js           # chrome.notifications wrapper + click/button handling
    storage.js              # typed get/set over options + snooze + session state
  options/
    options.html
    options.js               # one-time prompt for the firm's app base URL
  icons/{16,48,128}.png
  README.md
```

**Domain list** (`src/domains.js`, mirrored into `manifest.json`'s `host_permissions` since MV3
manifests can't import JS at build time): `chatgpt.com`, `claude.ai`, `gemini.google.com`,
`copilot.microsoft.com`, `perplexity.ai`. Deliberately **not** `<all_urls>` — keeps the permission
footprint minimal, which matters both for Chrome Web Store review and for user trust when IT
rolls this out.

## Detection algorithm

State lives in `chrome.storage.session` — not plain in-memory — because MV3 service workers are
ephemeral and get suspended/woken unpredictably; in-memory state wouldn't survive that.

```
openAiTabs: Map<tabId, domain>   # currently-open AI tabs, kept in chrome.storage.session

tabs.onUpdated(tabId, changeInfo):
  if changeInfo.url matches a watched domain → openAiTabs.set(tabId, domain)
  else if tabId was tracked → openAiTabs.delete(tabId)   # navigated away in the same tab
  if a tab was just removed and openAiTabs is now empty → scheduleTrigger()

tabs.onRemoved(tabId):
  if openAiTabs.delete(tabId) and openAiTabs is now empty → scheduleTrigger()

scheduleTrigger():
  chrome.alarms.create("reminder-check", { delayInMinutes: 1 })   # alarms, not setTimeout —
                                                                    # survives SW suspension

alarms.onAlarm("reminder-check"):
  if openAiTabs is non-empty → cancel (user reopened an AI tab)
  if within the cooldown/snooze window → cancel
  else → show the notification
```

This covers the obvious edge cases: multiple AI tabs open at once only triggers when the *last*
one closes (count-to-zero, not one notification per tab); a quick reopen within the 1-minute
debounce window cancels the pending trigger; a cooldown (4h suggested as a default — a product
call, not an architectural one) prevents repeat notifications for the same short work session.

**Known, accepted gap**: a full browser quit with an AI tab still open may not reliably fire
`tabs.onRemoved` before the service worker is killed. Best-effort mitigation: check the last-seen
timestamp in `chrome.storage.local` on `runtime.onStartup` and fire a catch-up reminder if
appropriate. Not airtight — worth stating plainly rather than implying full coverage.

## Notification UX

- Title: "Log this AI-assisted review?"
- Body: "You just left {domain}. Record a Circular 230 verification entry."
- Two actions via `chrome.notifications.create({ buttons: [...] })`:
  - **"Log entry"** → `chrome.tabs.create({ url: appBaseUrl + "/verification/new?source=extension&domain=" + domain })`
  - **"Snooze today"** → sets a local snooze-until-midnight flag
- Plain dismissal (the X) just respects the normal cooldown — no extra snooze penalty or bonus.

`/verification/new` doesn't read query params today, so `?source=&domain=` is inert for now —
harmless to send, and a natural small follow-up (prefilling the AI-tool field from `domain`)
rather than something v1 depends on.

## App base URL

Nothing in this repo currently exposes the app's own origin — no `NEXT_PUBLIC_APP_URL`, no
`vercel.json`, confirmed by checking rather than assumed. Since a firm may run its own
deployment, don't hardcode a URL: prompt for it once via the extension's options page on
`runtime.onInstalled`, store it in `chrome.storage.sync`. An enterprise/managed install (see
Distribution below) could later override this via `chrome.storage.managed` — worth designing
`storage.js` to check managed storage first and fall back to `sync`, but not a v1 requirement.

## Auth

No `@clerk/chrome-extension` SDK needed for v1. `chrome.tabs.create` to
`{appBaseUrl}/verification/new` relies on the Clerk session cookie already present in the same
Chrome profile — `requireFirmContext()`'s normal `auth.protect()` handles the rest exactly like
any other navigation into the app. The Clerk extension SDK would only earn its complexity if the
extension's own popup/options UI needed to show authenticated state or call APIs directly, which
this design doesn't require.

## Permissions (Manifest V3, minimum set)

| Permission | Why |
|---|---|
| `tabs` | Read tab URLs to detect navigation-away and closure |
| `notifications` | Show the reminder |
| `storage` | `sync` for the app-URL option, `local` for cooldown/snooze, `session` for per-tab tracking |
| `alarms` | Debounce that survives service-worker suspension |
| `host_permissions` | The 5 AI-chat domains only — not `<all_urls>` |

## Distribution

Dev-mode "load unpacked" for internal testing first. For an actual firm rollout, either a normal
Chrome Web Store listing or — likely preferable for pushing to a firm's own staff — an
enterprise policy (`ExtensionInstallForcelist`) that IT pairs with `chrome.storage.managed` to
centrally set the app base URL. Chrome Web Store review mechanics aren't solved here, just noted
as a real step rather than a v1 blocker.

## Open decisions (resolve before implementing)

1. **Cooldown window** — 4h suggested as a default; confirm or adjust, and decide whether snooze
   is strictly per-day or should be configurable.
2. **README scope line** — update `README.md`'s "out of scope" list to remove "browser/email
   integrations" once this is underway, so the doc doesn't silently go stale.
3. **Query-param prefill** — is wiring `/verification/new` to read `?domain=` (and prefill the AI
   tool field) worth doing alongside this, or staying a pure follow-up ticket?

## Critical files

- `extension/manifest.json`, `extension/background.js`, `extension/src/tab-tracker.js`,
  `extension/src/notifier.js`, `extension/src/storage.js`, `extension/options/options.{html,js}` — all new.
- `app/(app)/verification/new/page.tsx` — deep-link target; no changes required for v1 unless
  decision #3 above says otherwise.
- `lib/auth/firm-context.ts` — confirms the existing cookie-session auth is sufficient as-is.
- `README.md` — scope line update per decision #2.

## Verification (once built)

1. Load the extension unpacked (`chrome://extensions` → Developer mode → Load unpacked →
   `extension/`) against a locally running `npm run dev` instance, with the options page pointed
   at `http://localhost:3000`.
2. Open a watched domain (e.g. `claude.ai`) in one tab while logged into the app in another, then
   close the AI tab — confirm a notification appears within ~1 minute, not immediately (debounce
   working).
3. Click "Log entry" — confirm it opens `/verification/new` in a new tab, already authenticated
   (no login prompt, since the Clerk session cookie carries over).
4. Reopen an AI-chat tab within the debounce window after closing one — confirm the notification
   does *not* fire (cancel-on-reopen working).
5. Trigger a notification, let it pass, then immediately close another AI tab — confirm the
   cooldown suppresses a second notification.
6. Click "Snooze today," close another AI tab the same day — confirm no notification; the next
   day, confirm it fires again.
