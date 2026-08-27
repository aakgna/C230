import { matchDomain } from "./domains.js";
import {
  getOpenAiTabs,
  setOpenAiTabs,
  setLastClosedDomain,
  setLastClosedUrl,
  setLastClosedAt,
  setLastSeenOpenTab,
  clearLastSeenOpenTab,
  getLastActiveTabId,
  setLastActiveTabId,
  enqueueUsageEvent,
  hasLoggedDomainThisSession,
  markDomainLoggedThisSession,
} from "./storage.js";

// Queues a persisted usage-event the first time a covered domain is detected this session —
// independent of the reminder/verification-log flow below, and independent of whether a
// verification entry ever follows. See lib/db/schema/usage-events.ts.
async function noteDomainDetected(domain) {
  if (await hasLoggedDomainThisSession(domain)) return;
  await markDomainLoggedThisSession(domain);
  await enqueueUsageEvent(domain, Date.now());
  console.log("[C230] usage event queued", { domain });
}

export const REMINDER_ALARM = "reminder-check";
// Short debounce, not a full cancel window: since switching tabs (not just closing) now
// triggers this, a longer delay would mean routine tab-hopping (checking email, then coming
// right back) constantly schedules alarms. The 4h cooldown in notifier.js is what actually
// prevents spam; this just avoids firing mid-navigation. Chrome clamps sub-minute alarm delays
// to 1 minute for *published* Chrome Web Store extensions — fine for this unpacked/dev build,
// worth revisiting before any store listing.
const DEBOUNCE_MINUTES = 8 / 60;

// The extension only learns about watched tabs via onUpdated/onRemoved events going forward —
// it never sees tabs that were already open before the service worker started (e.g. right after
// install/reload, or a full browser restart). Run this once on those triggers to seed tracking
// state from whatever's already open, so a pre-existing tab isn't invisible to the tracker.
export async function reconcileOpenTabs() {
  const tabs = await chrome.tabs.query({});
  const openTabs = await getOpenAiTabs();
  let changed = false;

  for (const tab of tabs) {
    if (tab.id == null || !tab.url) continue;
    const domain = matchDomain(tab.url);
    if (domain && !openTabs.has(tab.id)) {
      openTabs.set(tab.id, { domain, url: tab.url });
      changed = true;
      await noteDomainDetected(domain);
    }
  }

  if (changed) {
    await setOpenAiTabs(openTabs);
  }
  console.log("[C230] reconciled already-open tabs", { tracked: [...openTabs.entries()] });
}

export async function handleTabUpdated(tabId, changeInfo) {
  if (!("url" in changeInfo)) return;

  const domain = matchDomain(changeInfo.url);
  const openTabs = await getOpenAiTabs();
  console.log("[C230] onUpdated", { tabId, url: changeInfo.url, domain, trackedBefore: [...openTabs.keys()] });

  if (domain) {
    openTabs.set(tabId, { domain, url: changeInfo.url });
    await setOpenAiTabs(openTabs);
    await setLastSeenOpenTab(domain, changeInfo.url);
    await noteDomainDetected(domain);
    console.log("[C230] now tracking", { tabId, domain, tracked: [...openTabs.keys()] });
    return;
  }

  await removeTrackedTab(tabId, openTabs);
}

export async function handleTabRemoved(tabId) {
  const openTabs = await getOpenAiTabs();
  console.log("[C230] onRemoved", { tabId, trackedBefore: [...openTabs.keys()] });
  await removeTrackedTab(tabId, openTabs);
}

// Fires on every tab-focus change, in any window — this is what makes "switched away from
// ChatGPT to check something else" trigger a reminder, not just closing the tab outright.
export async function handleTabActivated({ tabId }) {
  const previousTabId = await getLastActiveTabId();
  await setLastActiveTabId(tabId);

  const openTabs = await getOpenAiTabs();
  const previousEntry = previousTabId != null ? openTabs.get(previousTabId) : undefined;

  let newDomain = null;
  try {
    const tab = await chrome.tabs.get(tabId);
    newDomain = matchDomain(tab.url);
  } catch {
    // Tab may already be gone (activated right before being closed) — treat as "not watched".
  }

  console.log("[C230] onActivated", { tabId, previousTabId, previousDomain: previousEntry?.domain, newDomain });

  if (previousEntry?.domain && !newDomain) {
    await setLastClosedDomain(previousEntry.domain);
    await setLastClosedUrl(previousEntry.url);
    await setLastClosedAt(Date.now());
    await chrome.alarms.create(REMINDER_ALARM, { delayInMinutes: DEBOUNCE_MINUTES });
    console.log("[C230] switched away from a watched tab — alarm scheduled");
  }
}

async function removeTrackedTab(tabId, openTabs) {
  if (!openTabs.has(tabId)) {
    console.log("[C230] removeTrackedTab: tab wasn't tracked, nothing to do", { tabId });
    return;
  }

  const closedEntry = openTabs.get(tabId);
  openTabs.delete(tabId);
  await setOpenAiTabs(openTabs);
  await setLastClosedDomain(closedEntry.domain);
  await setLastClosedUrl(closedEntry.url);
  await setLastClosedAt(Date.now());
  await clearLastSeenOpenTab();
  await chrome.alarms.create(REMINDER_ALARM, { delayInMinutes: DEBOUNCE_MINUTES });
  console.log("[C230] removed tracked tab — alarm scheduled", {
    tabId,
    closedDomain: closedEntry.domain,
    remaining: [...openTabs.keys()],
  });
}
