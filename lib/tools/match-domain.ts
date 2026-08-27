// Subdomain-inclusive domain matching against a firm's registered tools — mirrors
// extension/src/domains.js's matchDomain() logic (host === d || host.endsWith(`.${d}`)), just
// applied against a firm's aiToolRegister.domains lists instead of the extension's fixed
// 5-domain watchlist. Shared so ingestion (app/api/ai-tool-usage-events) and the verification
// form's tool auto-select don't quietly diverge on what counts as a match.
export function findToolByDomain<T extends { domains: string[] | null }>(domain: string, tools: T[]): T | undefined {
  const host = domain.trim().toLowerCase();
  if (!host) return undefined;
  return tools.find((tool) => tool.domains?.some((d) => host === d || host.endsWith(`.${d}`)));
}
