// backend/services/autoNewsUpdater.js

import cron from "node-cron";
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
  if (!category) return "General"; // null/undefined
  if (typeof category === "string") return category;
  if (typeof category === "object") {
    if (category.name) return String(category.name);
    // fallback for any other object
    return JSON.stringify(category).slice(0, 50); // limit length
  }
  return String(category);
}

export function startAutoNewsUpdater() {
  console.log("📰 Auto updater started");

  // Run every 10 minutes
  cron.schedule("* * * * *", async () => {
    const startTime = new Date();
    console.log("\n======================================");
    console.log("🔄 Auto updating news at:", startTime.toISOString());

    try {
      let allArticles = [];

      /* ======================
         1️⃣ FETCH RSS CATEGORY WISE
      ====================== */
      const results = await Promise.all(
        Object.keys(RSS_SOURCES).map((cat) => fetchRSSByCategory(cat))
      );
      const rssItems = results.flat();
      console.log(`📰 RSS fetched: ${rssItems.length}`);

      /* ======================
         2️⃣ SCRAPE RSS ARTICLES
      ====================== */
      const rssArticles = await Promise.all(
        rssItems.map(async (item) => {
          try {
            if (!item?.link) return null;

            let content = null;
            let image = null;
            try {
              const scraped = await scrapeArticle(item.link);
              content = scraped?.content || null;
              image = scraped?.image || null;
            } catch (scrapeErr) {
              console.log("⚠️ Scraper failed:", scrapeErr.message);
            }

            return {
              title: item.title,
              description: item.shortDescription,
              content: content || item.shortDescription || item.title,
              image: image || item.image || null,
              source: item.source || "RSS",
              url: item.link,
              pubDate: item.publishDate || new Date(),
              category: normalizeCategory(item.category), // 🔥 fixed
              referenceType: "rss",
              updatedAt: new Date(),
            };
          } catch (err) {
            console.log("❌ RSS article error:", err.message);
            return null;
          }
        })
      );

      allArticles.push(...rssArticles.filter(Boolean));

      /* ======================
         3️⃣ FETCH NEWS API
      ====================== */
      try {
        const apiSaved = await fetchAndSaveNews({ limit: 10 });
        console.log(`✅ NewsAPI fetched ${apiSaved} articles`);
      } catch (apiErr) {
        console.log("⚠️ News API fetch error:", apiErr.message);
      }

      /* ======================
         4️⃣ CLEAN DATA
      ====================== */
      const cleanedArticles = cleanNewsData(allArticles);
      console.log(`🧹 Cleaned articles: ${cleanedArticles.length}`);

      /* ======================
         5️⃣ BULK UPSERT DB
      ====================== */
      if (cleanedArticles.length > 0) {
        const operations = cleanedArticles.map((article) => ({
          updateOne: {
            filter: { url: article.url },
            update: { $set: { ...article, updatedAt: new Date() } },
            upsert: true,
          },
        }));

        const result = await News.bulkWrite(operations);

        console.log(`✅ New inserted: ${result.upsertedCount}`);
        console.log(`♻️ Updated existing: ${result.modifiedCount}`);
      } else {
        console.log("⚠️ No cleaned articles to save");
      }

      const endTime = new Date();
      console.log("⏱ Last update finished at:", endTime.toISOString());
      console.log("======================================\n");
    } catch (error) {
      console.log("❌ Auto updater error:", error.message);
    }
  });
}
