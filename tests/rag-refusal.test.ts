import { describe, it, expect } from "vitest";
import { retrieveForSectionRef } from "@/lib/rag/retrieve";
import { generatePolicyClause } from "@/lib/rag/generate-policy";

describe("RAG retrieval and generation grounding", () => {
  it("excludes a superseded chunk from retrieval by effective-date filter", async () => {
    const results = await retrieveForSectionRef("10.35", "competence requirements for AI-assisted work", 5);
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r.content).not.toMatch(/SUPERSEDED/);
    }
  });

  it("returns no results for a section with zero corpus coverage (the refusal trigger)", async () => {
    const results = await retrieveForSectionRef("10.51", "some topic with no corpus coverage at all", 5);
    expect(results).toEqual([]);
  });

  it("generates a grounded clause for a covered section, citing an actually-retrieved chunk", async () => {
    const clause = await generatePolicyClause("10.36", { practiceMix: ["business"], clientDataSensitivity: "high" });
    expect(clause.isRefusal).toBe(false);
    expect(clause.clauseText).toBeTruthy();
    expect(clause.citedChunkId).toBeTruthy();
  }, 180000);

  it("refuses rather than fabricates a clause for an uncovered section", async () => {
    const clause = await generatePolicyClause("10.51", { practiceMix: ["business"], clientDataSensitivity: "high" });
    expect(clause.isRefusal).toBe(true);
    expect(clause.clauseText).toBeNull();
    expect(clause.refusalReason).toBeTruthy();
  }, 180000);
});
