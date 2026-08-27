import { matchDomain } from "./domains.js";
import {
  getAppBaseUrl,
  getSnoozeUntil,
  setSnoozeUntil,
  getLastClosedDomain,
  getLastClosedUrl,
  getLastClosedAt,
} from "./storage.js";

export const NOTIFICATION_ID = "circular230-verification-reminder";

// Live check, not "is the tab that triggered this still open" — the trigger can now be either a
// close/navigate-away or just switching focus away, so what actually matters at fire time is
// whether the user is *currently* looking at a watched tab, in any window, regardless of how
// this alarm got scheduled.
async function isCurrentlyOnWatchedTab() {
  const activeTabs = await chrome.tabs.query({ active: true });
  return activeTabs.some((tab) => matchDomain(tab.url) !== null);
}

export async function maybeShowReminder() {
  console.log("[C230] alarm fired — evaluating whether to notify");

  if (await isCurrentlyOnWatchedTab()) {
    console.log("[C230] skip: currently focused on a watched tab");
    return;
  }

  const snoozeUntil = await getSnoozeUntil();
  if (snoozeUntil && Date.now() < snoozeUntil) {
    console.log("[C230] skip: snoozed until", new Date(snoozeUntil).toString());
    return;
  }

  const appBaseUrl = await getAppBaseUrl();
  if (!appBaseUrl) {
    console.log("[C230] skip: no appBaseUrl configured — set one on the options page");
    return;
  }

  const domain = await getLastClosedDomain();
  console.log("[C230] all checks passed — showing notification", { appBaseUrl, domain });

  await chrome.notifications.create(NOTIFICATION_ID, {
    type: "basic",
    iconUrl: "icons/icon128.png",
    title: domain ? `Done with ${domain} for now?` : "Done with this AI session for now?",
    message:
      "If this was your last use of it for this tax matter, log it now — you'll want the record if this return is ever audited.",
    buttons: [{ title: "Log entry" }, { title: "Snooze today" }],
    priority: 1,
  });
}

export async function handleNotificationButtonClicked(notificationId, buttonIndex) {
  if (notificationId !== NOTIFICATION_ID) return;
  chrome.notifications.clear(notificationId);

  if (buttonIndex === 0) {
    await openVerificationForm();
  } else if (buttonIndex === 1) {
    await setSnoozeUntil(nextLocalMidnight());
  }
}

async function openVerificationForm() {
  const appBaseUrl = await getAppBaseUrl();
  if (!appBaseUrl) return;

  const domain = await getLastClosedDomain();
  const evidenceUrl = await getLastClosedUrl();
  const closedAt = await getLastClosedAt();
  const url = new URL("/verification/new", appBaseUrl);
  url.searchParams.set("source", "extension");
  if (domain) url.searchParams.set("domain", domain);
  if (evidenceUrl) url.searchParams.set("evidenceUrl", evidenceUrl);
  if (closedAt) url.searchParams.set("leftAt", new Date(closedAt).toISOString());

  await chrome.tabs.create({ url: url.toString() });
}

function nextLocalMidnight() {
  const midnight = new Date();
  midnight.setHours(24, 0, 0, 0);
  return midnight.getTime();
}
