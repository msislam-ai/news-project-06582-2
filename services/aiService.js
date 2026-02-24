import { puter } from "@heyputer/puter.js";

class PuterAIService {
  constructor() {
    this.isAvailable = true;
    this.initialize();
  }

  initialize() {
    console.log('✅ Puter.js initialized for frontend AI');
  }

  async rewriteArticle(articleText) {
    if (!articleText || articleText.length < 10) {
      return articleText;
    }

    try {
      console.log('Starting AI rewrite in frontend...');
      
      // Limit text length
      const textToProcess = articleText.length > 3000 
        ? articleText.substring(0, 3000) + "..."
        : articleText;

      const prompt = `
You are a professional Bangla news writer. Rewrite the following news article in Bangla:
1. Keep all facts and figures accurate
2. Make it engaging and well-structured
3. Use professional journalistic tone
4. Output only the rewritten Bangla text

Original article:
${textToProcess}

Rewritten Bangla article:
`;

      const response = await puter.ai.chat({
        messages: [
          {
            role: "user",
            content: prompt
          }
        ],
        model: "gpt-3.5-turbo",
        max_tokens: 1500,
        temperature: 0.7,
      });

      // Extract response
      const rewrittenText = response?.choices?.[0]?.message?.content || 
                           response?.content || 
                           articleText;

      if (rewrittenText && rewrittenText !== articleText) {
        console.log(`✅ AI rewrite successful (${rewrittenText.length} chars)`);
        return rewrittenText;
      }

      return articleText;

    } catch (error) {
      console.error('AI Rewrite Error:', error.message);
      return articleText;
    }
  }

  async summarizeArticle(articleText, maxLength = 200) {
    try {
      const prompt = `Summarize this in ${maxLength} characters in Bangla: ${articleText.substring(0, 1000)}`;
      
      const response = await puter.ai.chat({
        messages: [{ role: "user", content: prompt }],
        model: "gpt-3.5-turbo",
        max_tokens: 300,
        temperature: 0.3,
      });

      return response?.choices?.[0]?.message?.content || 
             response?.content || 
             articleText.substring(0, maxLength);
    } catch (error) {
      console.error('Summarization error:', error.message);
      return articleText.substring(0, maxLength);
    }
  }
}

// Export singleton instance
const puterAIService = new PuterAIService();
export default puterAIService;