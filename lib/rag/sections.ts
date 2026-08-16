// The Circular 230 sections the policy generator must produce a clause (or an
// explicit refusal) for. Shared between corpus seeding, retrieval, and
// generation so they can't drift out of sync.
export const REQUIRED_POLICY_SECTIONS = ["10.22", "10.27(a)", "10.35", "10.36", "10.37"] as const;

export type RequiredPolicySection = (typeof REQUIRED_POLICY_SECTIONS)[number];
