// Dynamically registered by background.js's registerUsageFlushContentScript() to run on the
// app's own origin — not listed in manifest.json's static content_scripts, since that origin is
// only known once configured on the options page. Not an ES module: dynamically registered
// content scripts don't support static `import`, so the outbox storage key below is a plain
// literal that must stay in sync with extension/src/storage.js's LOCAL_KEYS.USAGE_EVENT_OUTBOX.
//
// Runs in the page's own context — a genuine same-origin fetch(), so Clerk's SameSite=Lax
// session cookie attaches normally. This is the whole reason this file exists instead of the
// background service worker just POSTing directly: see lib/db/schema/usage-events.ts.
(async () => {
  const OUTBOX_KEY = "usageEventOutbox";
  const BATCH_SIZE = 100; // matches app/api/ai-tool-usage-events/route.ts's zod max

  const { [OUTBOX_KEY]: outbox } = await chrome.storage.local.get(OUTBOX_KEY);
  const pending = outbox ?? [];
  if (pending.length === 0) return;

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    const payload = batch.map(({ clientEventId, domain, detectedAt }) => ({
      clientEventId,
      domain,
      detectedAt: new Date(detectedAt).toISOString(),
    }));

    let ok = false;
    try {
      const response = await fetch("/api/ai-tool-usage-events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ events: payload }),
      });
      ok = response.ok;
    } catch {
      ok = false; // offline / network error — leave queued, retry next visit
    }

    if (!ok) break; // stop here; later batches retry alongside this one next time

    const flushedIds = new Set(batch.map((event) => event.clientEventId));
    const { [OUTBOX_KEY]: current } = await chrome.storage.local.get(OUTBOX_KEY);
    const remaining = (current ?? []).filter((event) => !flushedIds.has(event.clientEventId));
    await chrome.storage.local.set({ [OUTBOX_KEY]: remaining });
  }
})();
