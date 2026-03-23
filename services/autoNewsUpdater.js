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
   🔧 Configuration
====================== */
const CONFIG = {
  cronSchedule: "*/5 * * * *",           // Run every 5 minutes
  maxRssItems: 50,                        // Limit RSS items to process
  maxConcurrentScrapes: 5,                // Concurrent scraping limit
  newsApiLimit: 10,                       // News API fetch limit
  maxRetries: 3,                          // Retry attempts for failures
  retryDelayMs: 1000,                     // Base retry delay
  logSampleSize: 3,                       // Number of articles to log as sample
};

/* ======================
   🔧 Utilities
====================== */

/**
 * Safe date formatter - prevents toISOString() errors
 */
const safeDateISO = (date) => {
  if (!date) return new Date().toISOString();
  const d = date instanceof Date ? date : new Date(date);
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
};

/**
 * Normalize category safely with fallback
 */
function normalizeCategory(category) {
  if (!category) return "General";
  if (typeof category === "string") {
    const trimmed = category.trim();
    return trimmed || "General";
  }
  if (typeof category === "object") {
    if (category?.name) return String(category.name).trim() || "General";
    if (category?.slug) return String(category.slug).trim() || "General";
  }
  return "General";
}

/**
 * Retry wrapper with exponential backoff
 */
async function withRetry(fn, label, retries = CONFIG.maxRetries) {
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      console.warn(`⚠️ ${label} attempt ${attempt}/${retries} failed: ${err.message}`);
      if (attempt < retries) {
        const delay = CONFIG.retryDelayMs * Math.pow(2, attempt - 1);
        await new Promise(res => setTimeout(res, delay));
      }
    }
  }
  throw lastError;
}

/**
 * Validate article has minimum required fields
 */
function isValidArticle(article) {
  return (
    article?.title?.trim() &&
    article?.url?.trim() &&
    typeof article.url === "string" &&
    article.url.startsWith("http")
  );
}

/* ======================
   🚀 Start Auto News Updater
====================== */
export function startAutoNewsUpdater() {
  console.log("📰 Auto updater service initialized");

  let jobRunning = false;
  let lastRunStats = null;
  let isShuttingDown = false;

  // Handle graceful shutdown
  const shutdownHandler = () => {
    console.log("🛑 Auto updater: shutting down gracefully...");
    isShuttingDown = true;
  };
  
  process.on("SIGTERM", shutdownHandler);
  process.on("SIGINT", shutdownHandler);

  const job = cron.schedule(CONFIG.cronSchedule, async () => {
    // Skip if shutting down or already running
    if (isShuttingDown) {
      console.log("⚠️ Auto updater: skipping run (shutting down)");
      return;
    }
    
    if (jobRunning) {
      console.log("⚠️ Auto updater: previous job still running, skipping...");
      return;
    }

    jobRunning = true;
    const runId = Date.now();
    const startTime = new Date();
    
    console.log(`\n🔄 [Run #${runId}] Starting at ${safeDateISO(startTime)}`);
    console.log("=".repeat(50));

    const stats = {
      runId,
      startTime: safeDateISO(startTime),
      rssFetched: 0,
      scraped: 0,
      apiSaved: 0,
      cleaned: 0,
      newArticles: 0,
      inserted: 0,
      updated: 0,
      errors: [],
    };

    try {
      let allArticles = [];

      /* ======================
         1️⃣ FETCH RSS (with retry)
      ====================== */
      try {
        const results = await Promise.allSettled(
          Object.keys(RSS_SOURCES).map(cat => 
            withRetry(() => fetchRSSByCategory(cat), `RSS fetch: ${cat}`)
          )
        );

        const rssItems = results
          .filter(r => r.status === "fulfilled" && Array.isArray(r.value))
          .flatMap(r => r.value)
          .filter(i => i?.link?.trim());

        // Dedupe by URL early + take latest
        const seenUrls = new Set();
        const uniqueItems = rssItems.filter(item => {
          if (!item.link || seenUrls.has(item.link)) return false;
          seenUrls.add(item.link);
          return true;
        });

        stats.rssFetched = uniqueItems.slice(0, CONFIG.maxRssItems).length;
        console.log(`📰 RSS fetched: ${stats.rssFetched} unique items`);
        
        allArticles.push(...uniqueItems.slice(0, CONFIG.maxRssItems));
      } catch (err) {
        stats.errors.push(`RSS fetch failed: ${err.message}`);
        console.error("❌ RSS fetch error:", err.message);
      }

      /* ======================
         2️⃣ SCRAPE CONTENT (rate-limited + safe)
      ====================== */
      const limit = pLimit(CONFIG.maxConcurrentScrapes);
      const scrapePromises = allArticles.map(item =>
        limit(async () => {
          try {
            let content = null;
            let image = null;

            if (item.link) {
              try {
                const scraped = await withRetry(
                  () => scrapeArticle(item.link),
                  `Scrape: ${item.link}`,
                  2 // Fewer retries for scraping
                );
                content = scraped?.content?.trim() || null;
                image = scraped?.image || null;
              } catch (scraperErr) {
                // Non-fatal: continue with RSS data
                console.debug(`⚠️ Scraper skipped for ${item.link}: ${scraperErr.message}`);
              }
            }

            const article = {
              title: item.title?.trim() || "Untitled",
              description: item.shortDescription?.trim() || "",
              content: content || item.shortDescription || item.title || "",
              image: image || item.image || null,
              source: item.source || "RSS",
              url: item.link.trim(),
              pubDate: item.publishDate ? new Date(item.publishDate) : new Date(),
              category: normalizeCategory(item.category),
              referenceType: "rss",
              updatedAt: new Date(),
              scrapedAt: content ? new Date() : null,
            };

            return isValidArticle(article) ? article : null;
          } catch {
            return null;
          }
        })
      );

      const scrapedResults = await Promise.all(scrapePromises);
      const validScraped = scrapedResults.filter(Boolean);
      stats.scraped = validScraped.length;
      console.log(`🔍 Scraped successfully: ${stats.scraped}`);
      
      allArticles = validScraped;

      /* ======================
         3️⃣ NEWS API INTEGRATION
      ====================== */
      try {
        const apiSaved = await withRetry(
          () => fetchAndSaveNews({ limit: CONFIG.newsApiLimit }),
          "NewsAPI fetch"
        );
        stats.apiSaved = typeof apiSaved === "number" ? apiSaved : 0;
        console.log(`✅ NewsAPI saved: ${stats.apiSaved}`);
      } catch (err) {
        stats.errors.push(`NewsAPI failed: ${err.message}`);
        console.warn("⚠️ News API error (non-fatal):", err.message);
      }

      /* ======================
         4️⃣ CLEAN & VALIDATE
      ====================== */
      console.log(`🧹 Cleaning articles (before: ${allArticles.length})`);
      
      const cleanedArticles = cleanNewsData(allArticles)
        .filter(isValidArticle)
        .map(article => ({
          ...article,
          title: article.title.trim(),
          url: article.url.trim(),
          updatedAt: new Date(),
        }));

      stats.cleaned = cleanedArticles.length;
      console.log(`✨ After cleaning: ${stats.cleaned} valid articles`);

      /* ======================
         5️⃣ DEDUPE AGAINST DATABASE
      ====================== */
      const existingDocs = await News.find(
        { url: { $in: cleanedArticles.map(a => a.url) } },
        { url: 1, _id: 0 }
      ).lean();

      const existingSet = new Set(existingDocs.map(d => d.url));
      const newArticles = cleanedArticles.filter(a => !existingSet.has(a.url));

      stats.newArticles = newArticles.length;
      console.log(`🆕 New articles to insert: ${stats.newArticles}`);

      /* ======================
         6️⃣ BULK UPSERT (with error isolation)
      ====================== */
      if (cleanedArticles.length > 0) {
        const operations = cleanedArticles.map(article => ({
          updateOne: {
            filter: { url: article.url }, // Only match by URL to avoid false positives
            update: { $set: { ...article, updatedAt: new Date() } },
            upsert: true,
          },
        }));

        try {
          const result = await News.bulkWrite(operations, { 
            ordered: false, // Continue on error
            writeConcern: { w: 1 }
          });

          stats.inserted = result.upsertedCount || 0;
          stats.updated = result.modifiedCount || 0;
          
          console.log(`✅ Database: ${stats.inserted} inserted, ${stats.updated} updated`);

          // Safe sample logging (FIXES THE BUG!)
          if (cleanedArticles.length > 0) {
            console.log("\n📋 Sample processed articles:");
            cleanedArticles
              .slice(0, CONFIG.logSampleSize)
              .forEach((a, i) => {
                console.log(
                  `  ${i + 1}. "${a.title.substring(0, 60)}${a.title.length > 60 ? '...' : ''}"` +
                  ` | ${a.category}` +
                  ` | Updated: ${safeDateISO(a.updatedAt)}`
                );
              });
          }
        } catch (dbErr) {
          stats.errors.push(`Bulk write failed: ${dbErr.message}`);
          console.error("❌ Database bulk write error:", dbErr.message);
          
          // Fallback: try saving one by one
          console.log("🔄 Falling back to individual saves...");
          let fallbackSaved = 0;
          for (const article of cleanedArticles) {
            try {
              await News.findOneAndUpdate(
                { url: article.url },
                { $set: { ...article, updatedAt: new Date() } },
                { upsert: true, new: true }
              );
              fallbackSaved++;
            } catch (singleErr) {
              console.warn(`⚠️ Failed to save ${article.url}: ${singleErr.message}`);
            }
          }
          console.log(`✅ Fallback saved: ${fallbackSaved} articles`);
        }
      } else {
        console.log("ℹ️ No valid articles to save this run");
      }

      /* ======================
         7️⃣ RUN COMPLETE
      ====================== */
      const endTime = new Date();
      const duration = endTime - startTime;
      
      stats.endTime = safeDateISO(endTime);
      stats.durationMs = duration;
      lastRunStats = stats;

      console.log("\n" + "=".repeat(50));
      console.log(`✅ [Run #${runId}] Completed in ${duration}ms`);
      console.log(`📊 Summary: ${stats.rssFetched} RSS → ${stats.scraped} scraped → ${stats.cleaned} cleaned → ${stats.inserted} new`);
      if (stats.errors.length > 0) {
        console.warn(`⚠️ Warnings: ${stats.errors.join("; ")}`);
      }
      console.log("=".repeat(50) + "\n");

    } catch (error) {
      stats.errors.push(`Critical error: ${error.message}`);
      console.error(`❌ [Run #${runId}] Auto updater critical error:`, {
        message: error.message,
        stack: error.stack,
      });
    } finally {
      jobRunning = false;
    }
  });

  // Expose status for health checks
  return {
    job,
    getStatus: () => ({
      running: jobRunning,
      shuttingDown: isShuttingDown,
      lastRun: lastRunStats,
      nextScheduled: job.nextDates ? job.nextDates(1)[0] : null,
    }),
    stop: () => {
      console.log("🛑 Stopping auto updater cron job...");
      job.stop();
      isShuttingDown = true;
    },
  };
}
