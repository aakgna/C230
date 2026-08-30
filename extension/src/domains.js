// Only genuinely AI-dedicated domains — deliberately excludes general-purpose sites that merely
// have an AI feature bolted on (e.g. notion.so, github.com), since matching on hostname alone
// would flag *any* visit to those sites, not just AI use. See docs/chrome-extension-verification-reminder-plan.md.
export const AI_CHAT_DOMAINS = [
  { domain: "chatgpt.com", name: "ChatGPT" },
  { domain: "claude.ai", name: "Claude" },
  { domain: "gemini.google.com", name: "Gemini" },
  { domain: "copilot.microsoft.com", name: "Copilot" },
  { domain: "perplexity.ai", name: "Perplexity" },
  { domain: "grok.com", name: "Grok" },
  { domain: "poe.com", name: "Poe" },
  { domain: "you.com", name: "You.com" },
  { domain: "chat.mistral.ai", name: "Le Chat" },
  { domain: "chat.deepseek.com", name: "DeepSeek" },
  { domain: "meta.ai", name: "Meta AI" },
  { domain: "character.ai", name: "Character.AI" },
];

export function matchDomain(url) {
  if (!url) return null;
  try {
    const host = new URL(url).hostname;
    const match = AI_CHAT_DOMAINS.find((entry) => host === entry.domain || host.endsWith(`.${entry.domain}`));
    return match?.domain ?? null;
  } catch {
    return null;
  }
}

// Friendly display name for a domain matchDomain() already returned — used to pre-fill the
// verification form's "AI tool used" field. Always a hit in practice since it's the reverse
// lookup of the same list, but returns null defensively rather than throwing.
export function getToolName(domain) {
  return AI_CHAT_DOMAINS.find((entry) => entry.domain === domain)?.name ?? null;
}
