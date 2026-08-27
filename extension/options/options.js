import { getAppBaseUrl, setAppBaseUrl } from "../src/storage.js";

const input = document.getElementById("appBaseUrl");
const status = document.getElementById("status");

async function load() {
  const value = await getAppBaseUrl();
  if (value) input.value = value;
}

function showStatus(text, kind) {
  status.textContent = text;
  status.className = `status ${kind}`;
  if (kind === "ok") {
    setTimeout(() => {
      status.textContent = "";
      status.className = "status";
    }, 2000);
  }
}

document.getElementById("save").addEventListener("click", async () => {
  const value = input.value.trim().replace(/\/+$/, "");

  if (!value) {
    showStatus("Enter a URL first.", "error");
    return;
  }

  let origin;
  try {
    origin = new URL(value).origin;
  } catch {
    showStatus("That doesn't look like a valid URL.", "error");
    return;
  }

  // Needed so the usage-event flush content script (background.js) can run on the app's own
  // origin — MV3 removed content scripts' implicit host access, so this has to be requested
  // explicitly. Enterprise-managed installs pre-grant this via Chrome's runtime_allowed_hosts
  // policy alongside the managed appBaseUrl (see storage.js's getAppBaseUrl()) and never see
  // this prompt; unmanaged installs see it once, here, from this click.
  const granted = await chrome.permissions.request({ origins: [`${origin}/*`] }).catch(() => false);

  await setAppBaseUrl(value);
  chrome.runtime.sendMessage({ type: "c230-app-base-url-updated" }).catch(() => {});

  if (!granted) {
    showStatus("Saved, but usage-event logging needs permission for that site — click Save again to grant it.", "error");
    return;
  }

  showStatus("Saved.", "ok");
});

load();
