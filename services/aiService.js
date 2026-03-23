import { puter } from "@heyputer/puter.js";

class PuterAIService {
  constructor() {
    this.isAvailable = true;
    this.initialize();
  }

  initialize() {
    console.log("✅ Puter.js initialized for frontend AI");
  }

  // 🔁 Retry system
  async callAIWithRetry(payload, retries = 2) {
    try {
      const response = await puter.ai.chat(payload);

      // ❗ Detect HTML error (502 etc.)
      if (typeof response === "string" && response.includes("<html")) {
        throw new Error("Invalid HTML response (502 Bad Gateway)");
      }

      return response;
    } catch (err) {
      console.warn(`⚠️ AI call failed: ${err.message}`);

      if (retries > 0) {
        console.log(`🔁 Retrying... (${retries})`);
        return this.callAIWithRetry(payload, retries - 1);
      }

      throw err;
    }
  }

  // 📰 Rewrite Article
  async rewriteArticle(articleText) {
    if (!articleText || articleText.length < 10) {
      return articleText;
    }

    try {
      console.log("🧠 Starting AI rewrite...");

      const textToProcess =
        articleText.length > 3000
          ? articleText.substring(0, 3000) + "..."
          : articleText;

      const prompt = `
You are a professional Bangla news writer. Rewrite the following news article in Bangla:
1. Keep all facts accurate
2. Make it engaging and structured
3. Use professional tone
4. Output only Bangla text

${textToProcess}
`;

      const response = await this.callAIWithRetry({
        messages: [{ role: "user", content: prompt }],
        model: "gpt-3.5-turbo",
        max_tokens: 1500,
        temperature: 0.7,
      });

      // ✅ Validate response
      if (!response || typeof response !== "object") {
        console.error("❌ Invalid AI response:", response);
        return articleText;
      }

      let rewrittenText = articleText;

      // ✅ Extract safely
      if (response.choices && Array.isArray(response.choices)) {
        rewrittenText = response.choices[0]?.message?.content;
      } else if (typeof response.content === "string") {
        rewrittenText = response.content;
      }

      // ❗ Final validation
      if (!rewrittenText || typeof rewrittenText !== "string") {
        return articleText;
      }

      console.log(`✅ Rewrite success (${rewrittenText.length} chars)`);

      return rewrittenText;

    } catch (error) {
      console.error("❌ AI Rewrite Error:", error.message);
      return articleText;
    }
  }

  // ✂️ Summarize Article
  async summarizeArticle(articleText, maxLength = 200) {
    if (!articleText) return "";

    try {
      const prompt = `Summarize this in ${maxLength} characters in Bangla:\n${articleText.substring(0, 1000)}`;

      const response = await this.callAIWithRetry({
        messages: [{ role: "user", content: prompt }],
        model: "gpt-3.5-turbo",
        max_tokens: 300,
        temperature: 0.3,
      });

      // ✅ Validate response
      if (!response || typeof response !== "object") {
        return articleText.substring(0, maxLength);
      }

      let summary = articleText.substring(0, maxLength);

      if (response.choices && Array.isArray(response.choices)) {
        summary = response.choices[0]?.message?.content;
      } else if (typeof response.content === "string") {
        summary = response.content;
      }

      if (!summary || typeof summary !== "string") {
        return articleText.substring(0, maxLength);
      }

      return summary;

    } catch (error) {
      console.error("❌ Summarization error:", error.message);
      return articleText.substring(0, maxLength);
    }
  }
}

// ✅ Singleton export
const puterAIService = new PuterAIService();
export default puterAIService;
