import { fetchRSSByCategory } from "../services/rssService.js";
import { RSS_SOURCES } from "../config/rssSources.js";
import { scrapeArticle } from "./scraperService.js";
import { fetchAndSaveNews as fetchNewsAPI } from "./newsAPIService.js";
import cleanNewsData from "../utils/newsCleaner.js";
import News from "../models/News.js";

/* ======================
   🔧 Normalize Article Data
====================== */

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

    // ⭐ VERY IMPORTANT FIX
    url:
      item?.link?.href ||
      item?.link?._text ||
      String(item?.link || ""),

    pubDate: new Date(item?.publishDate || Date.now()),

    category: String(item?.category || "General")
  };
}


/* ======================
   🚀 MAIN AGGREGATOR
====================== */

export async function fetchAndSaveAllNews() {

  try {

    /* ======================
       1️⃣ FETCH RSS CATEGORY WISE
    ====================== */

    const results = await Promise.all(
      Object.keys(RSS_SOURCES).map(category =>
        fetchRSSByCategory(category)
      )
    );

    const rssItems = results.flat();

    console.log("📰 Total RSS items fetched:", rssItems.length);


    /* ======================
       2️⃣ SCRAPE ARTICLES
    ====================== */

    const rssArticles = await Promise.all(
      rssItems.map(async (item) => {

        try {

          if (!item?.link) return null;

          let scrapedContent = null;
          let image = null;

          try {
            const scraped = await scrapeArticle(
              item?.link?.href ||
              item?.link?._text ||
              String(item?.link)
            );

            scrapedContent = scraped?.content || null;
            image = scraped?.image || null;

          } catch (scrapeErr) {
            console.log("Scraper failed:", scrapeErr.message);
          }

          return normalizeArticle(item, scrapedContent, image);

        } catch (err) {
          console.log("RSS processing error:", err.message);
          return null;
        }

      })
    );


    /* ======================
       3️⃣ FILTER + CLEAN
    ====================== */

    const validRSS = rssArticles.filter(
      a => a && a.url && typeof a.url === "string"
    );

    const cleanedRSS = cleanNewsData(validRSS);


    /* ======================
       4️⃣ BULK UPSERT RSS
    ====================== */

    if (cleanedRSS.length > 0) {

      const bulkOps = cleanedRSS.map(article => ({
        updateOne: {
          filter: { url: article.url },
          update: { $set: article },
          upsert: true
        }
      }));

      const result = await News.bulkWrite(bulkOps);

      console.log(
        `✅ ${result.upsertedCount} new RSS articles added`
      );
    }


    /* ======================
       5️⃣ FETCH NEWS API
    ====================== */

    try {

      const apiSaved = await fetchNewsAPI({
        limit: 10,
        lang: "en"
      });

      console.log(`✅ ${apiSaved} News API articles saved`);

    } catch (apiErr) {
      console.log("News API error:", apiErr.message);
    }


  } catch (error) {
    console.log("Aggregator error:", error.message);
  }

}
