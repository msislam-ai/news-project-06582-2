import cron from "node-cron";
import { manageData } from "../utils/manageData.js";

export function startDailyManager() {

  // run immediately when server starts
  runManager();

  // run once every 24 hours
  cron.schedule("0 */24 * * *", async () => {
    await runManager();
  });

  console.log("📅 Daily manager scheduled (every 24 hours)");
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
