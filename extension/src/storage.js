const SYNC_KEYS = { APP_BASE_URL: "appBaseUrl" };
const LOCAL_KEYS = {
  SNOOZE_UNTIL: "snoozeUntil",
  LAST_CLOSED_DOMAIN: "lastClosedDomain",
  LAST_CLOSED_URL: "lastClosedUrl",
  LAST_CLOSED_AT: "lastClosedAt",
  LAST_SEEN_OPEN_TAB: "lastSeenOpenTab",
  // Kept in sync with extension/content-flush.js's own copy of this key name (that file can't
  // import this module — dynamically registered content scripts aren't loaded as ES modules).
  USAGE_EVENT_OUTBOX: "usageEventOutbox",
};
const SESSION_KEYS = {
  OPEN_AI_TABS: "openAiTabs",
  LAST_ACTIVE_TAB_ID: "lastActiveTabId",
  USAGE_LOGGED_DOMAINS: "usageLoggedDomains",
};

// Options set here can be centrally pushed by IT via Chrome's managed storage policy
// (ExtensionInstallForcelist + policy JSON); managed values win over the user's own setting.
export async function getAppBaseUrl() {
  const managed = await chrome.storage.managed.get(SYNC_KEYS.APP_BASE_URL).catch(() => ({}));
  if (managed[SYNC_KEYS.APP_BASE_URL]) return managed[SYNC_KEYS.APP_BASE_URL];
  const { [SYNC_KEYS.APP_BASE_URL]: value } = await chrome.storage.sync.get(SYNC_KEYS.APP_BASE_URL);
  return value ?? null;
}

export async function setAppBaseUrl(url) {
  await chrome.storage.sync.set({ [SYNC_KEYS.APP_BASE_URL]: url });
}

// chrome.storage.session is cleared automatically on browser restart, which is what we want —
// tabs from a previous browser run no longer exist.
export async function getOpenAiTabs() {
  const { [SESSION_KEYS.OPEN_AI_TABS]: entries } = await chrome.storage.session.get(SESSION_KEYS.OPEN_AI_TABS);
  return new Map(entries ?? []);
}

export async function setOpenAiTabs(map) {
  await chrome.storage.session.set({ [SESSION_KEYS.OPEN_AI_TABS]: Array.from(map.entries()) });
}

export async function getLastActiveTabId() {
  const { [SESSION_KEYS.LAST_ACTIVE_TAB_ID]: value } = await chrome.storage.session.get(SESSION_KEYS.LAST_ACTIVE_TAB_ID);
  return value ?? null;
}

export async function setLastActiveTabId(tabId) {
  await chrome.storage.session.set({ [SESSION_KEYS.LAST_ACTIVE_TAB_ID]: tabId });
}

export async function getSnoozeUntil() {
  const { [LOCAL_KEYS.SNOOZE_UNTIL]: value } = await chrome.storage.local.get(LOCAL_KEYS.SNOOZE_UNTIL);
  return value ?? null;
}

export async function setSnoozeUntil(timestamp) {
  await chrome.storage.local.set({ [LOCAL_KEYS.SNOOZE_UNTIL]: timestamp });
}

export async function getLastClosedDomain() {
  const { [LOCAL_KEYS.LAST_CLOSED_DOMAIN]: value } = await chrome.storage.local.get(LOCAL_KEYS.LAST_CLOSED_DOMAIN);
  return value ?? null;
}

export async function setLastClosedDomain(domain) {
  await chrome.storage.local.set({ [LOCAL_KEYS.LAST_CLOSED_DOMAIN]: domain });
}

// The exact tab URL (not just the domain) at the moment it was last seen open — lets the
// verification form prefill "evidence location" with the specific chat, not just the site.
export async function getLastClosedUrl() {
  const { [LOCAL_KEYS.LAST_CLOSED_URL]: value } = await chrome.storage.local.get(LOCAL_KEYS.LAST_CLOSED_URL);
  return value ?? null;
}

export async function setLastClosedUrl(url) {
  await chrome.storage.local.set({ [LOCAL_KEYS.LAST_CLOSED_URL]: url ?? null });
}

// When the watched tab was actually left (closed/navigated/switched away) — a closer proxy for
// "AI output generated at" than whenever the reviewer eventually gets around to opening the
// form, which could be minutes later if they don't click the notification right away.
export async function getLastClosedAt() {
  const { [LOCAL_KEYS.LAST_CLOSED_AT]: value } = await chrome.storage.local.get(LOCAL_KEYS.LAST_CLOSED_AT);
  return value ?? null;
}

export async function setLastClosedAt(timestamp) {
  await chrome.storage.local.set({ [LOCAL_KEYS.LAST_CLOSED_AT]: timestamp });
}

// Heartbeat used only to catch the "browser quit with an AI tab still open" gap: session
// storage (and its openAiTabs map) is gone by the time onStartup runs, so this local-storage
// timestamp is the only surviving signal that a watched tab was open when the browser closed.
export async function getLastSeenOpenTab() {
  const { [LOCAL_KEYS.LAST_SEEN_OPEN_TAB]: value } = await chrome.storage.local.get(LOCAL_KEYS.LAST_SEEN_OPEN_TAB);
  return value ?? null;
}

export async function setLastSeenOpenTab(domain, url) {
  await chrome.storage.local.set({ [LOCAL_KEYS.LAST_SEEN_OPEN_TAB]: { domain, url, at: Date.now() } });
}

export async function clearLastSeenOpenTab() {
  await chrome.storage.local.remove(LOCAL_KEYS.LAST_SEEN_OPEN_TAB);
}

// Capped so a long stretch without visiting the app (the only place these ever flush — see
// extension/content-flush.js) can't grow this file unboundedly.
const USAGE_EVENT_OUTBOX_MAX = 500;

// domain + detection timestamp only — never page content, prompts, or anything typed. See
// lib/db/schema/usage-events.ts for the privacy line this deliberately stays behind.
export async function enqueueUsageEvent(domain, detectedAt) {
  const { [LOCAL_KEYS.USAGE_EVENT_OUTBOX]: existing } = await chrome.storage.local.get(LOCAL_KEYS.USAGE_EVENT_OUTBOX);
  const outbox = existing ?? [];
  outbox.push({ clientEventId: crypto.randomUUID(), domain, detectedAt });
  // Newest-first eviction, not a stop: if the cap is ever hit (extension installed but the app
  // URL never configured, so content-flush.js never runs — see README's "Usage-event capture"
  // section), the oldest queued events are silently dropped rather than blocking new capture.
  // That's a real, if unlikely, gap in the shadow-usage signal for that stretch — logged here so
  // it's at least visible in the service worker console (chrome://extensions → service worker),
  // not just a number quietly shrinking.
  const trimmed = outbox.length > USAGE_EVENT_OUTBOX_MAX ? outbox.slice(outbox.length - USAGE_EVENT_OUTBOX_MAX) : outbox;
  if (trimmed.length !== outbox.length) {
    console.warn("[C230] usage-event outbox full — dropped", outbox.length - trimmed.length, "oldest unflushed event(s)");
  }
  await chrome.storage.local.set({ [LOCAL_KEYS.USAGE_EVENT_OUTBOX]: trimmed });
}

export async function getPendingUsageEvents() {
  const { [LOCAL_KEYS.USAGE_EVENT_OUTBOX]: existing } = await chrome.storage.local.get(LOCAL_KEYS.USAGE_EVENT_OUTBOX);
  return existing ?? [];
}

// Removes only the given ids, not the whole outbox — new events may have queued between the
// flush's read and this call.
export async function clearFlushedUsageEvents(clientEventIds) {
  const { [LOCAL_KEYS.USAGE_EVENT_OUTBOX]: existing } = await chrome.storage.local.get(LOCAL_KEYS.USAGE_EVENT_OUTBOX);
  const outbox = existing ?? [];
  const flushed = new Set(clientEventIds);
  const remaining = outbox.filter((event) => !flushed.has(event.clientEventId));
  await chrome.storage.local.set({ [LOCAL_KEYS.USAGE_EVENT_OUTBOX]: remaining });
}

// Per-domain, not per-tab: openAiTabs is keyed by tabId, so two tabs on the same domain (or the
// same domain revisited later the same session) would otherwise double-queue. Session storage
// clears on browser restart, which is the right boundary for "first detection."
export async function hasLoggedDomainThisSession(domain) {
  const { [SESSION_KEYS.USAGE_LOGGED_DOMAINS]: entries } = await chrome.storage.session.get(SESSION_KEYS.USAGE_LOGGED_DOMAINS);
  return (entries ?? []).includes(domain);
}

export async function markDomainLoggedThisSession(domain) {
  const { [SESSION_KEYS.USAGE_LOGGED_DOMAINS]: entries } = await chrome.storage.session.get(SESSION_KEYS.USAGE_LOGGED_DOMAINS);
  const set = new Set(entries ?? []);
  set.add(domain);
  await chrome.storage.session.set({ [SESSION_KEYS.USAGE_LOGGED_DOMAINS]: [...set] });
}
