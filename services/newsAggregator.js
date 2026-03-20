// backend/services/newsAggregator.js

import { fetchRSSByCategory } from "../services/rssService.js";
import { RSS_SOURCES } from "../config/rssSources.js";
import { scrapeArticle } from "./scraperService.js";
import { fetchAndSaveNews as fetchNewsAPI } from "./newsAPIService.js";
import cleanNewsData from "../utils/newsCleaner.js";
import News from "../models/News.js";

/* ===================================================
   🔧 FUNCTION TO NORMALIZE EACH ARTICLE
=================================================== */
function normalizeArticle(item, scrapedContent, image) {
  return {
    title: String(item?.title || ""),
    description: String(item?.shortDescription || ""),
    content: String(
      scrapedContent ||
      item?.shortDescription ||
      item?.title ||
      ""
    ),

    image: image || item?.image || null,
    source: String(item?.source || "RSS Feed"),

    // Handle links that could be objects or strings
    url: item?.link?.href || item?.link?._text || String(item?.link || ""),

    pubDate: new Date(item?.publishDate || Date.now()),

    // Make sure category is string
    category:
      typeof item?.category === "string"
        ? item.category
        : item?.category?.name || "General",

    // Track last updated time
    updatedAt: new Date()
  };
}

/* ===================================================
   🚀 MAIN FUNCTION TO FETCH AND SAVE ALL NEWS
=================================================== */
export async function fetchAndSaveAllNews() {
  try {

    /* ===================================================
       1️⃣ FETCH RSS NEWS CATEGORY WISE
    ==================================================== */
    console.log("\n======================================");
    console.log("📰 Fetching RSS news category-wise...");

    const results = await Promise.all(
      Object.keys(RSS_SOURCES).map(category =>
        fetchRSSByCategory(category)
      )
    );

    const rssItems = results.flat();
    console.log(`📰 Total RSS items fetched: ${rssItems.length}`);

    /* ===================================================
       2️⃣ SCRAPE EACH RSS ARTICLE
    ==================================================== */
    console.log("🔍 Scraping articles...");

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
            console.log("❌ Scraper failed for URL:", item?.link, scrapeErr.message);
          }

          return normalizeArticle(item, scrapedContent, image);

        } catch (err) {
          console.log("❌ RSS processing error:", err.message);
          return null;
        }
      })
    );

    /* ===================================================
       3️⃣ FILTER AND CLEAN ARTICLES
    ==================================================== */
    console.log("🧹 Filtering and cleaning articles...");

    const validRSS = rssArticles.filter(
      a => a && a.url && typeof a.url === "string"
    );

    const cleanedRSS = cleanNewsData(validRSS);
    console.log(`✅ Articles after cleaning: ${cleanedRSS.length}`);

    /* ===================================================
       4️⃣ BULK UPSERT RSS ARTICLES TO MONGODB
    ==================================================== */
    console.log("💾 Saving/updating articles to MongoDB...");

    if (cleanedRSS.length > 0) {

      const bulkOps = cleanedRSS.map(article => ({
        updateOne: {
          filter: { url: article.url },
          update: { $set: article },
          upsert: true
        }
      }));

      const result = await News.bulkWrite(bulkOps);

      console.log(`✅ ${result.upsertedCount} new RSS articles added`);
      console.log(`🔄 ${result.modifiedCount} existing RSS articles updated`);
    } else {
      console.log("⚠️ No RSS articles to save/update");
    }

    /* ===================================================
       5️⃣ FETCH AND SAVE NEWS FROM NEWS API
    ==================================================== */
    console.log("🌐 Fetching news from News API...");

    try {
      const apiSaved = await fetchNewsAPI({ limit: 10, lang: "en" });
      console.log(`✅ ${apiSaved} News API articles saved`);
    } catch (apiErr) {
      console.log("❌ News API fetch error:", apiErr.message);
    }

    console.log("======================================\n");

  } catch (error) {
    console.log("❌ Aggregator error:", error.message);
  }
}
