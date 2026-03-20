// backend/services/dailyManager.js

import cron from "node-cron";
import { manageData } from "../utils/manageData.js";

export function startDailyManager() {

  // ✅ Run immediately when server starts
  runManager();

  // ✅ Run every 3 minutes
  cron.schedule("*/3 * * * *", async () => {
    await runManager();
  });

  console.log("📅 Daily manager scheduled (every 3 minutes)");
}

async function runManager() {
  const startTime = new Date();
  console.log("\n======================================");
  console.log(`🧠 Running DB manager at: ${startTime.toISOString()}`);

  try {
    const result = await manageData();

    // 🔥 Show result in log
    console.log("📊 DB manager result:", result);

    const endTime = new Date();
    console.log(`✅ DB management completed at: ${endTime.toISOString()}`);
    console.log("======================================\n");

  } catch (err) {
    console.error("❌ Daily manager error:", err);
  }
}
