export const AI_CHAT_DOMAINS = ["chatgpt.com", "claude.ai", "gemini.google.com", "copilot.microsoft.com", "perplexity.ai"];

export function matchDomain(url) {
  if (!url) return null;
  try {
    const host = new URL(url).hostname;
    return AI_CHAT_DOMAINS.find((domain) => host === domain || host.endsWith(`.${domain}`)) ?? null;
  } catch {
    return null;
  }
}
