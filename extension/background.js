import {
  handleTabUpdated,
  handleTabRemoved,
  handleTabActivated,
  reconcileOpenTabs,
  REMINDER_ALARM,
} from "./src/tab-tracker.js";
import { maybeShowReminder, handleNotificationButtonClicked } from "./src/notifier.js";
import {
  getAppBaseUrl,
  getLastSeenOpenTab,
  clearLastSeenOpenTab,
  setLastClosedDomain,
  setLastClosedUrl,
  setLastClosedAt,
  setSnoozeUntil,
} from "./src/storage.js";

console.log("[C230] background.js loaded, listeners registering", new Date().toString());

const USAGE_FLUSH_SCRIPT_ID = "c230-usage-flush";

// Registers (or re-registers, if appBaseUrl changed) a content script on the app's own origin
// that flushes queued usage events — see extension/content-flush.js. Dynamic, not a static
// manifest.json entry, because the app's origin is only known once configured on the options
// page. Requires optional_host_permissions to have been granted for that origin already (see
// options.js's Save handler); silently no-ops until that's true.
async function registerUsageFlushContentScript() {
  const appBaseUrl = await getAppBaseUrl();
  if (!appBaseUrl) return;

  let origin;
  try {
    origin = new URL(appBaseUrl).origin;
  } catch {
    return;
  }
  const matches = [`${origin}/*`];

  const hasPermission = await chrome.permissions.contains({ origins: matches });
  if (!hasPermission) {
    console.log("[C230] usage-event flush not registered — missing host permission for", origin);
    return;
  }

  const [existing] = await chrome.scripting.getRegisteredContentScripts({ ids: [USAGE_FLUSH_SCRIPT_ID] });
  if (existing && existing.matches.length === 1 && existing.matches[0] === matches[0]) {
    return; // already registered for the current origin
  }

  const definition = {
    id: USAGE_FLUSH_SCRIPT_ID,
    matches,
    js: ["content-flush.js"],
    runAt: "document_idle",
  };

  if (existing) {
    await chrome.scripting.updateContentScripts([definition]);
  } else {
    await chrome.scripting.registerContentScripts([definition]);
  }
  console.log("[C230] usage-event flush content script registered for", origin);
}

// options.js can't reach background.js directly after saving a new URL — this message is how it
// asks for re-registration without waiting for the next onInstalled/onStartup.
chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "c230-app-base-url-updated") {
    registerUsageFlushContentScript().catch(console.error);
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  handleTabUpdated(tabId, changeInfo).catch(console.error);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  handleTabRemoved(tabId).catch(console.error);
});

chrome.tabs.onActivated.addListener((activeInfo) => {
  handleTabActivated(activeInfo).catch(console.error);
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === REMINDER_ALARM) {
    maybeShowReminder().catch(console.error);
  }
});

chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
  handleNotificationButtonClicked(notificationId, buttonIndex).catch(console.error);
});

chrome.action.onClicked.addListener(async () => {
  // TEMPORARY test trigger — clears any active snooze and runs the real reminder check
  // immediately. Remove once the full flow is confirmed working.
  console.log("[C230] toolbar icon clicked — clearing snooze and re-checking");
  await setSnoozeUntil(0);
  await maybeShowReminder();
  chrome.runtime.openOptionsPage();
});

chrome.runtime.onInstalled.addListener(async () => {
  await reconcileOpenTabs();
  await registerUsageFlushContentScript();

  const appBaseUrl = await getAppBaseUrl();
  if (!appBaseUrl) {
    chrome.runtime.openOptionsPage();
  }
});

// chrome.storage.session (and the openAiTabs it holds) is wiped on browser restart, so this is
// the only surviving signal for "a watched tab was still open when the browser quit" — a
// best-effort catch-up, not a guarantee (see docs/chrome-extension-verification-reminder-plan.md).
chrome.runtime.onStartup.addListener(async () => {
  await reconcileOpenTabs();
  await registerUsageFlushContentScript();

  const lastSeen = await getLastSeenOpenTab();
  if (!lastSeen) return;

  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  if (Date.now() - lastSeen.at > ONE_DAY_MS) {
    await clearLastSeenOpenTab();
    return;
  }

  await setLastClosedDomain(lastSeen.domain);
  await setLastClosedUrl(lastSeen.url);
  await setLastClosedAt(lastSeen.at);
  await clearLastSeenOpenTab();
  await maybeShowReminder();
});
