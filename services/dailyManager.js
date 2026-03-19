import cron from "node-cron";
import { manageData } from "../utils/manageData.js";

export function startDailyManager() {

  // Run immediately on server start
  runManager();

  // Run every 3 minutes (for testing)
  cron.schedule("*/3 * * * *", async () => {
    await runManager();
  });

  console.log("📅 Daily manager scheduled (every 3 minutes for testing)");
}

async function runManager() {
  console.log("🧠 Running daily DB manager...");

  try {
    const count = await manageData();
    console.log(`✅ DB management completed, ${count} news processed`);
  } catch (err) {
    console.error("❌ Daily manager error:", err);
  }
}
