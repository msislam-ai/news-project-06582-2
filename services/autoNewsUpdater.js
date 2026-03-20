// backend/services/autoNewsUpdater.js

import cron from "node-cron";
import pLimit from "p-limit";
import { fetchRSSByCategory } from "../services/rssService.js";
import { RSS_SOURCES } from "../config/rssSources.js";
import { scrapeArticle } from "./scraperService.js";
import { fetchAndSaveNews } from "./newsAPIService.js";
import News from "../models/News.js";
import cleanNewsData from "../utils/newsCleaner.js";

/* ======================
   🔧 Normalize category safely
====================== */
function normalizeCategory(category) {
  if (!category) return "General";
  if (typeof category === "string") return category;
  if (typeof category === "object") {
    if (category.name) return String(category.name);
    return JSON.stringify(category).slice(0, 50);
  }
  return String(category);
}

/* ======================
   🚀 Start Auto News Updater
====================== */
export function startAutoNewsUpdater() {
  console.log("📰 Auto updater started");

  let jobRunning = false;

  // Run every 5 minutes
  cron.schedule("*/5 * * * *", async () => {
    if (jobRunning) {
      console.log("⚠️ Previous job still running, skipping...");
      return;
    }

    jobRunning = true;

    const startTime = new Date();
    console.log("\n======================================");
    console.log("🔄 Auto updating news at:", startTime.toISOString());

    try {
      let allArticles = [];

      /* ======================
         1️⃣ FETCH RSS
      ====================== */
      const results = await Promise.all(
        Object.keys(RSS_SOURCES).map(cat => fetchRSSByCategory(cat))
      );

      let rssItems = results.flat().filter(i => i?.link);

      // 🔥 Only latest 50 (avoid old duplicates)
      rssItems = rssItems.slice(0, 50);

      console.log(`📰 RSS fetched: ${rssItems.length}`);

      /* ======================
         2️⃣ SCRAPE (LIMITED)
      ====================== */
      const limit = pLimit(5);

      const rssArticles = await Promise.all(
        rssItems.map(item =>
          limit(async () => {
            try {
              let content = null;
              let image = null;

              try {
                const scraped = await scrapeArticle(item.link);
                content = scraped?.content || null;
                image = scraped?.image || null;
              } catch (err) {
                console.log("⚠️ Scraper failed:", err.message);
              }

              return {
                title: item.title,
                description: item.shortDescription,
                content: content || item.shortDescription || item.title,
                image: image || item.image || null,
                source: item.source || "RSS",
                url: item.link,
                pubDate: item.publishDate || new Date(),
                category: normalizeCategory(item.category),
                referenceType: "rss",
                updatedAt: new Date(),
              };
            } catch {
              return null;
            }
          })
        )
      );

      allArticles.push(...rssArticles.filter(Boolean));

      /* ======================
         3️⃣ NEWS API
      ====================== */
      try {
        const apiSaved = await fetchAndSaveNews({ limit: 10 });
        console.log(`✅ NewsAPI saved: ${apiSaved}`);
      } catch (err) {
        console.log("⚠️ News API error:", err.message);
      }

      /* ======================
         4️⃣ CLEAN
      ====================== */
      console.log("Before clean:", allArticles.length);

      const cleanedArticles = cleanNewsData(allArticles);

      console.log("After clean:", cleanedArticles.length);

      /* ======================
         5️⃣ CHECK NEW VS EXISTING
      ====================== */
      const existingDocs = await News.find({
        url: { $in: cleanedArticles.map(a => a.url) }
      }).select("url");

      const existingSet = new Set(existingDocs.map(d => d.url));

      const newArticles = cleanedArticles.filter(
        a => !existingSet.has(a.url)
      );

      console.log(`🆕 New articles detected: ${newArticles.length}`);

      /* ======================
         6️⃣ BULK UPSERT
      ====================== */
      if (cleanedArticles.length > 0) {
        const operations = cleanedArticles.map(article => ({
          updateOne: {
            filter: {
              $or: [
                { url: article.url },
                { title: article.title }
              ]
            },
            update: { $set: { ...article, updatedAt: new Date() } },
            upsert: true,
          },
        }));

        const result = await News.bulkWrite(operations);

        console.log(`✅ Inserted: ${result.upsertedCount}`);
        console.log(`♻️ Updated: ${result.modifiedCount}`);

        // Sample log
        cleanedArticles.slice(0, 3).forEach((a, i) => {
          console.log(
            `${i + 1}. ${a.title} | ${a.category} | ${a.updatedAt.toISOString()}`
          );
        });
      } else {
        console.log("⚠️ No articles to save");
      }

      const endTime = new Date();
      console.log("⏱ Finished at:", endTime.toISOString());
      console.log("======================================\n");

    } catch (error) {
      console.log("❌ Auto updater error:", error.message);
    } finally {
      jobRunning = false;
    }
  });
}
