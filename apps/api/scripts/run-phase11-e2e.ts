import { config } from "../src/config/config-manager";
import { phase11CommercialVerify } from "../src/services/projects/phase-11-commercial-verify";

(async () => {
  try {
    const results = await phase11CommercialVerify.runFullSuite();
    console.log("\n=== PHASE 11 RESULTS ===");
    console.log(JSON.stringify(results, null, 2));

    const failed = results.filter((r) => r.status === "FAIL");

    if (failed.length > 0) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error("\n=== PHASE 11 CRASH ===");
    console.error(error);
    process.exitCode = 1;
  }
})();
