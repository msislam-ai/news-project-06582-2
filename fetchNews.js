// backend/fetchNews.js

import dotenv from "dotenv";
// 1️⃣ Load dotenv first!
dotenv.config({ path: "./.env" }); // since we are inside backend/

import connectDB from "./config/db.js";
import { fetchAndSaveNews } from "./services/newsAPIService.js";

// 2️⃣ Connect DB
connectDB();

async function run() {
  console.log("Fetching news from API and saving to DB...");
  const savedCount = await fetchAndSaveNews({ limit: 10, lang: "en" });
  console.log(`Finished! ${savedCount} articles saved.`);
  process.exit();
}

run();
