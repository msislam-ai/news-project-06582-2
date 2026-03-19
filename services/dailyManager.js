import cron from "node-cron";
import { manageData } from "../utils/manageData.js";

export function startDailyManager() {

  // run immediately when server starts
  runManager();

  // 🔥 run every 3 minutes (TEST MODE)
  cron.schedule("*/3 * * * *", async () => {
    await runManager();
  });

  console.log("⏱️ Test manager scheduled (every 3 minutes)");
}

async function runManager() {
  console.log("🧠 Running DB manager...");

  try {
    await manageData();
    console.log("✅ DB management completed");
  } catch (err) {
    console.error("❌ Manager error:", err);
  }
}
