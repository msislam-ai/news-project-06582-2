// services/dailyManager.js
import cron from "node-cron";
import { manageData } from "../utils/manageData.js";

export function startDailyManager() {

  // run immediately
  runManager();

  // run every 3 minutes (for testing)
  cron.schedule("*/3 * * * *", async () => {
    await runManager();
  });

  console.log("📅 Daily manager scheduled (every 3 minutes)");
}

async function runManager() {
  console.log("🧠 Running daily DB manager...");

  try {
    await manageData();
    console.log("✅ DB management completed");
  } catch (err) {
    console.error("❌ Daily manager error:", err);
  }
}
