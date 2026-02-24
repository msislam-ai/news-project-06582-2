import cron from "node-cron";
import { manageData } from "../utils/manageData.js";

/*
0 0 * * *
│ │ │ │ │
│ │ │ │ └ day of week
│ │ │ └── month
│ │ └──── day
│ └────── hour
└──────── minute

Runs every day at 12:00 AM
*/

export function startDailyManager() {

  cron.schedule(
    "0 0 * * *",
    async () => {
      console.log("🕛 Daily DB management started...");

      try {
        await manageData();
        console.log("✅ Daily DB management finished");
      } catch (err) {
        console.error("❌ Daily manager error:", err);
      }
    },
    {
      timezone: "Asia/Dhaka"
    }
  );

  console.log("📅 Daily manager scheduled (12 AM)");
}