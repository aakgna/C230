import { runEvalForPolicy } from "@/lib/rag/eval/run";

function parseArgs() {
  const args = process.argv.slice(2);
  const idx = args.indexOf("--policy");
  return { policyId: idx >= 0 ? args[idx + 1] : undefined };
}

async function main() {
  const { policyId } = parseArgs();
  if (!policyId) {
    console.error("Usage: run-eval.ts --policy <policyDocumentId>");
    process.exit(1);
  }

  const result = await runEvalForPolicy(policyId, "patient");
  console.log(`Eval run ${result.evalRunId}: ${result.passed ? "PASSED" : "FAILED"} (${result.findingCount} findings)`);
  if (!result.passed) {
    process.exitCode = 1;
  }
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
