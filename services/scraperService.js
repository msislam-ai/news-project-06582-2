import axios from "axios";
import * as cheerio from "cheerio";

export async function scrapeArticle(url) {
  try {
    const { data } = await axios.get(url, {
      timeout: 20000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        "Accept-Language": "en-US,en;q=0.9",
        Accept: "text/html"
      }
    });

    const $ = cheerio.load(data);

    /* -------------------------------
       TITLE
    --------------------------------*/
    const title =
      $("meta[property='og:title']").attr("content") ||
      $("title").text() ||
      null;

    /* -------------------------------
       CONTENT SELECTORS
    --------------------------------*/
    const selectors = [
      "article p",
      ".article-content p",
      ".entry-content p",
      ".post-content p",
      ".story-element-text",
      ".news-content p",
      ".content-details p",
      ".main-content p"
    ];

    let paragraphs = [];

    for (const selector of selectors) {
      $(selector).each((_, el) => {
        const text = $(el).text().trim();

        // Remove ads / short texts
        if (text.length > 40) {
          paragraphs.push(text);
        }
      });

      // stop when content found
      if (paragraphs.length > 5) break;
    }

    /* -------------------------------
       CLEAN CONTENT
    --------------------------------*/
    paragraphs = [...new Set(paragraphs)];

    const content = paragraphs.join("\n\n");

    /* -------------------------------
       IMAGE EXTRACTION
    --------------------------------*/
    const image =
      $("meta[property='og:image']").attr("content") ||
      $("meta[name='twitter:image']").attr("content") ||
      $("img").first().attr("data-src") ||
      $("img").first().attr("src") ||
      null;

    /* -------------------------------
       VALIDATION
    --------------------------------*/
    if (!content || content.length < 100) {
      return {
        title,
        content: null,
        image
      };
    }

    return {
      title,
      content,
      image
    };

  } catch (error) {
    console.log("❌ Scrape error:", error.message, "URL:", url);

    return {
      title: null,
      content: null,
      image: null
    };
  }
}