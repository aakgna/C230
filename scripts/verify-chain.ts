import { getDb, schema } from "@/lib/db";
import { verifyChain } from "@/lib/verification/hash-chain";

function parseArgs() {
  const args = process.argv.slice(2);
  const firmIdx = args.indexOf("--firm");
  const firmId = firmIdx >= 0 ? args[firmIdx + 1] : undefined;
  const allIdx = args.indexOf("--all");
  return { firmId, all: allIdx >= 0 };
}

async function verifyOne(firmId: string) {
  const result = await verifyChain(firmId);
  if (result.valid) {
    console.log(`VALID, ${result.entryCount} entries, tip=${result.tipHash} (firm=${firmId})`);
  } else {
    console.error(`INVALID at sequence_no=${result.failedAtSequenceNo}: ${result.reason} (firm=${firmId})`);
    process.exitCode = 1;
  }
}

async function main() {
  const { firmId, all } = parseArgs();

  if (all) {
    const db = getDb();
    const firms = await db.select().from(schema.firms);
    for (const firm of firms) {
      await verifyOne(firm.id);
    }
    return;
  }

  if (!firmId) {
    console.error("Usage: verify-chain.ts --firm <firmId> | --all");
    process.exit(1);
  }

  await verifyOne(firmId);
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
