// backend/services/newsAggregator.js

import { fetchRSSByCategory } from "../services/rssService.js";
import { RSS_SOURCES } from "../config/rssSources.js";
import { scrapeArticle } from "./scraperService.js";
import { fetchAndSaveNews as fetchNewsAPI } from "./newsAPIService.js";
import cleanNewsData from "../utils/newsCleaner.js";
import News from "../models/News.js";

/* ===================================================
   🔧 Normalize Article Data
   - Ensures category is always string
   - Adds updatedAt for tracking
=================================================== */
function normalizeArticle(item, scrapedContent, image) {
  return {
    title: String(item?.title || ""),
    description: String(item?.shortDescription || ""),
    content: String(scrapedContent || item?.shortDescription || item?.title || ""),
    image: image || item?.image || null,
    source: String(item?.source || "RSS Feed"),
    url: item?.link?.href || item?.link?._text || String(item?.link || ""),
    pubDate: new Date(item?.publishDate || Date.now()),
    category:
      typeof item?.category === "string"
        ? item.category
        : item?.category?.name || "General",
    updatedAt: new Date()
  };
}

/* ===================================================
   🚀 MAIN FUNCTION TO FETCH AND SAVE ALL NEWS
=================================================== */
export async function fetchAndSaveAllNews() {
  try {
    console.log("\n======================================");
    console.log("📰 Starting news aggregation at:", new Date().toISOString());

    /* ===================================================
       1️⃣ FETCH RSS NEWS CATEGORY WISE
    ==================================================== */
    console.log("📡 Fetching RSS news by category...");

    const results = await Promise.all(
      Object.keys(RSS_SOURCES).map(category => fetchRSSByCategory(category))
    );

    const rssItems = results.flat();
    console.log(`📰 Total RSS items fetched from RSS: ${rssItems.length}`);

    /* ===================================================
       2️⃣ SCRAPE ARTICLES
    ==================================================== */
    console.log("🔍 Scraping RSS articles...");

    const rssArticles = await Promise.all(
      rssItems.map(async (item) => {
        try {
          if (!item?.link) return null;

          let scrapedContent = null;
          let image = null;

          try {
            const scraped = await scrapeArticle(
              item?.link?.href || item?.link?._text || String(item?.link)
            );
            scrapedContent = scraped?.content || null;
            image = scraped?.image || null;
          } catch (scrapeErr) {
            console.log("⚠️ Scraper failed for URL:", item?.link, scrapeErr.message);
          }

          return normalizeArticle(item, scrapedContent, image);

        } catch (err) {
          console.log("❌ RSS processing error:", err.message);
          return null;
        }
      })
    );

    /* ===================================================
       3️⃣ FILTER + CLEAN ARTICLES
    ==================================================== */
    console.log("🧹 Filtering and cleaning articles...");
    const validRSS = rssArticles.filter(a => a && a.url && typeof a.url === "string");
    const cleanedRSS = cleanNewsData(validRSS);
    console.log(`✅ Articles after cleaning: ${cleanedRSS.length}`);

    /* ===================================================
       4️⃣ BULK UPSERT RSS ARTICLES TO MONGODB
    ==================================================== */
    console.log("💾 Saving/updating articles to MongoDB...");

    let addedCount = 0;
    let updatedCount = 0;

    if (cleanedRSS.length > 0) {
      const bulkOps = cleanedRSS.map(article => ({
        updateOne: {
          filter: { url: article.url },
          update: { $set: article },
          upsert: true
        }
      }));

      const result = await News.bulkWrite(bulkOps);

      addedCount = result.upsertedCount || 0;
      updatedCount = result.modifiedCount || 0;

      console.log(`✅ ${addedCount} new RSS articles added`);
      console.log(`🔄 ${updatedCount} existing RSS articles updated`);

      // 🔥 Show first 5 sample articles
      const sampleArticles = cleanedRSS.slice(0, 5);
      console.log("\n📰 Sample updated articles:");
      sampleArticles.forEach((a, i) => {
        console.log(
          `${i + 1}. ${a.title}\n   🔗 ${a.url}\n   🏷 Category: ${a.category}\n   ⏱ UpdatedAt: ${a.updatedAt.toISOString()}\n`
        );
      });
    } else {
      console.log("⚠️ No RSS articles to save/update");
    }

    /* ===================================================
       5️⃣ FETCH NEWS API
    ==================================================== */
    console.log("🌐 Fetching news from News API...");
    let apiSavedCount = 0;
    try {
      apiSavedCount = await fetchNewsAPI({ limit: 10, lang: "en" });
      console.log(`✅ ${apiSavedCount} News API articles saved`);
    } catch (apiErr) {
      console.log("❌ News API fetch error:", apiErr.message);
    }

    /* ===================================================
       6️⃣ SHOW TOTAL ARTICLES IN DB
    ==================================================== */
    const totalArticles = await News.countDocuments();
    console.log("\n📊 SUMMARY THIS RUN:");
    console.log(`   New RSS added:        ${addedCount}`);
    console.log(`   Existing RSS updated: ${updatedCount}`);
    console.log(`   News API saved:       ${apiSavedCount}`);
    console.log(`   Total articles in DB: ${totalArticles}`);
    console.log("======================================\n");

  } catch (error) {
    console.log("❌ Aggregator error:", error.message);
  }
}
