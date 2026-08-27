# Circular 230 Verification Reminder (Chrome extension)

Reminds firm staff to log a verification entry after leaving a known AI-chat site. See
[`docs/chrome-extension-verification-reminder-plan.md`](../docs/chrome-extension-verification-reminder-plan.md)
for the design rationale.

## Load for development

1. `chrome://extensions` → enable **Developer mode** → **Load unpacked** → select this `extension/` folder.
2. On first install it opens the options page — enter the app's base URL (e.g. `http://localhost:3000` for local dev), then click Save. A one-time Chrome permission prompt appears (grants the extension access to that origin, needed for usage-event capture below) — accept it. You must already be logged in to that app in the same browser profile.
3. Open a watched site (`chatgpt.com`, `claude.ai`, `gemini.google.com`, `copilot.microsoft.com`, `perplexity.ai`), then close the tab or navigate away. A reminder notification should appear within about a minute.

## Usage-event capture

Independent of the reminder above and of whether a verification entry ever follows, the extension records that a covered domain was used (domain, staff identity, timestamp only — never page content or prompts) and queues it locally. Because the app's session cookie is `SameSite=Lax`, the background service worker can't POST this directly — see `lib/db/schema/usage-events.ts` in the main app for why. Instead, a content script the extension registers on the app's own origin (`content-flush.js`) flushes the queue using the page's own `fetch()` the next time you visit the app in a normal tab. To verify: visit a watched site, close the tab, then open the app — check `ai_tool_usage_events` in the database, or the two "no matching log entry" / "not in your firm's tool register" flags on `/dashboard`.

## Notes

- Icons in `icons/` are flat placeholder squares, not final branding — swap before any Chrome Web Store listing.
- No bundler/build step — plain ES modules loaded directly by the MV3 service worker and options page (`content-flush.js` is the one exception — dynamically registered content scripts can't be ES modules, so it's a plain script; its outbox storage key is duplicated from `src/storage.js` and must be kept in sync).
- `chrome.storage.managed` is checked before the user's own saved URL, so IT can centrally pin the app URL via enterprise policy without needing this options page at all — pair it with the `ExtensionSettings` policy's `runtime_allowed_hosts` to also pre-grant the host permission and skip the one-time prompt in step 2.
