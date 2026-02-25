import Parser from "rss-parser";
import { RSS_SOURCES } from "../config/rssSources.js";

/* ======================
   🚀 RSS Parser Setup
====================== */
const parser = new Parser({
  timeout: 15000,
  headers: {
    "User-Agent": "Mozilla/5.0"
  },
  customFields: {
    item: [
      ["media:content", "media"],
      ["media:thumbnail", "thumbnail"],
      ["content:encoded", "contentEncoded"]
    ]
  }
});

/* ======================
   🔧 Safe Helpers
====================== */

function safeString(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") return value.toString();

  if (typeof value === "object") {
    if (value._text) return String(value._text);
    if (value.href) return String(value.href);
    return JSON.stringify(value);
  }

  return String(value);
}

function safeDate(value) {
  const d = new Date(value || Date.now());
  return isNaN(d.getTime()) ? new Date() : d;
}

/* ======================
   🖼️ Universal Image Extractor
====================== */

function extractImage(item) {
  // 1️⃣ enclosure images
  if (item.enclosure?.url) return item.enclosure.url;

  // 2️⃣ media content
  if (item.media?.$?.url) return item.media.$.url;
  if (item.media?.url) return item.media.url;

  // 3️⃣ thumbnails
  if (item.thumbnail?.$?.url) return item.thumbnail.$.url;
  if (item.thumbnail?.url) return item.thumbnail.url;

  // 4️⃣ image inside HTML content (MOST IMPORTANT)
  const content =
    item.contentEncoded ||
    item["content:encoded"] ||
    item.content ||
    item.summary ||
    item.description;

  if (content) {
    const match = content.match(/<img[^>]+src="([^">]+)"/i);
    if (match && match[1]) return match[1];
  }

  // 5️⃣ fallback
  return null;
}

/* ======================
   🚀 Fetch RSS by Category
====================== */

export async function fetchRSSByCategory(category) {
  try {
    const feeds = RSS_SOURCES[category];
    if (!feeds) return [];

    let allArticles = [];

    for (const feedSource of feeds) {
      try {
        const feed = await parser.parseURL(feedSource.url);

        const articles = feed.items.map(item => {
          const image = extractImage(item);

          return {
            title: safeString(item.title || "No Title"),

            shortDescription: safeString(
              item.contentSnippet ||
              item.content ||
              item.summary ||
              item.description ||
              ""
            ),

            link: safeString(item.link),

            publishDate: safeDate(item.pubDate),

            // ✅ IMPORTANT FIX
            image: image || null,

            category: safeString(category),

            source: safeString(feedSource.source)
          };
        });

        allArticles.push(...articles);

      } catch (err) {
        console.log(`RSS Error (${feedSource.source}):`, err.message);
      }
    }

    return allArticles;

  } catch (error) {
    console.log("RSS Category Error:", error.message);
    return [];
  }
}
