/* ===================================================
   UTILITY FUNCTIONS
=================================================== */
function safeString(text) {
  if (!text) return "";
  if (typeof text === "string") return text;
  return String(text);
}

function cleanHTML(text = "") {
  return safeString(text)
    .replace(/<[^>]*>?/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

function formatDate(date) {
  if (!date) return new Date().toISOString();
  try {
    return new Date(date).toISOString();
  } catch {
    return new Date().toISOString();
  }
}

function normalizeText(text = "") {
  return safeString(text)
    .toLowerCase()
    .replace(/[^\u0980-\u09FF\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/* ===================================================
   CATEGORY KEYWORDS (EXPANDED)
=================================================== */
const categoryKeywords = {
  "রাজনীতি": [
    { word: "প্রধানমন্ত্রী", weight: 3 },
    { word: "মন্ত্রী", weight: 2 },
    { word: "রাজনীতি", weight: 1 },
    { word: "সরকার", weight: 2 },
    { word: "বিএনপি", weight: 2 },
    { word: "আওয়ামী লীগ", weight: 2 },
    { word: "সংসদ", weight: 2 },
    { word: "নির্বাচন", weight: 2 },
    { word: "ভোট", weight: 1 },
    { word: "বিক্ষোভ", weight: 2 },
    { word: "আইন পাস", weight: 2 },
    { word: "সংবিধান", weight: 2 },
    { word: "ক্যাবিনেট", weight: 2 },
    { word: "মন্ত্রিসভা", weight: 2 },
    { word: "জাতীয় দল", weight: 2 },
    { word: "রাজনৈতিক দল", weight: 2 },
    { word: "নেতা", weight: 2 },
    { word: "নেত্রী", weight: 2 },
    { word: "ক্ষমতাসীন", weight: 2 },
    { word: "বিরোধী দল", weight: 2 },
    { word: "সমাবেশ", weight: 2 },
    { word: "মিছিল", weight: 2 },
    { word: "বক্তব্য", weight: 2 },
    { word: "রাজনীতিবিদ", weight: 2 },
    { word: "প্রচারাভিযান", weight: 2 },
    { word: "সাম্প্রতিক ঘটনা", weight: 1 },
    { word: "জনমত", weight: 1 },
    { word: "উপনির্বাচন", weight: 2 },
    { word: "নির্বাচনী প্রচারণা", weight: 2 },
    { word: "দলীয় সভা", weight: 2 },
    { word: "পক্ষ", weight: 1 },
    { word: "বিরোধিতা", weight: 1 }
  ],

  "জাতীয়": [
    { word: "বাংলাদেশ", weight: 3 },
    { word: "ঢাকা", weight: 2 },
    { word: "চট্টগ্রাম", weight: 2 },
    { word: "খুলনা", weight: 2 },
    { word: "রাজশাহী", weight: 2 },
    { word: "বরিশাল", weight: 2 },
    { word: "সিলেট", weight: 2 },
    { word: "রংপুর", weight: 2 },
    { word: "ময়মনসিংহ", weight: 2 },
    { word: "দেশব্যাপী", weight: 2 },
    { word: "জাতীয়", weight: 2 },
    { word: "জনগণ", weight: 2 },
    { word: "নাগরিক", weight: 2 },
    { word: "দুর্ঘটনা", weight: 2 },
    { word: "সড়ক দুর্ঘটনা", weight: 2 },
    { word: "আগুন", weight: 2 },
    { word: "অগ্নিকাণ্ড", weight: 2 },
    { word: "পুলিশ", weight: 2 },
    { word: "র‍্যাব", weight: 2 },
    { word: "আদালত", weight: 2 },
    { word: "হাইকোর্ট", weight: 2 },
    { word: "আইনশৃঙ্খলা", weight: 2 },
    { word: "গ্রেপ্তার", weight: 2 },
    { word: "মামলা", weight: 2 },
    { word: "বন্যা", weight: 2 },
    { word: "ঘূর্ণিঝড়", weight: 2 },
    { word: "ঝড়", weight: 2 },
    { word: "বৃষ্টি", weight: 1 },
    { word: "দুর্যোগ", weight: 2 },
    { word: "স্বাধীনতা", weight: 2 },
    { word: "মুক্তিযুদ্ধ", weight: 3 },
    { word: "শহীদ মিনার", weight: 2 },
    { word: "পরিবহন", weight: 2 },
    { word: "রেল", weight: 1 },
    { word: "বাস", weight: 1 },
    { word: "ফেরি", weight: 1 },
    { word: "সেতু", weight: 1 },
    { word: "মহাসড়ক", weight: 1 }
  ],

  "খেলা": [
    { word: "খেলা", weight: 2 },
    { word: "ক্রিকেট", weight: 3 },
    { word: "ফুটবল", weight: 3 },
    { word: "হকি", weight: 2 },
    { word: "ম্যাচ", weight: 2 },
    { word: "গোল", weight: 1 },
    { word: "রান", weight: 1 },
    { word: "উইকেট", weight: 2 },
    { word: "সেঞ্চুরি", weight: 2 },
    { word: "ব্যাটসম্যান", weight: 2 },
    { word: "বোলার", weight: 2 },
    { word: "ক্যাপ্টেন", weight: 2 },
    { word: "টুর্নামেন্ট", weight: 2 },
    { word: "লিগ", weight: 2 },
    { word: "ফাইনাল", weight: 2 },
    { word: "সেমিফাইনাল", weight: 2 },
    { word: "বিশ্বকাপ", weight: 3 },
    { word: "এশিয়া কাপ", weight: 2 },
    { word: "আইপিএল", weight: 2 },
    { word: "বিপিএল", weight: 2 },
    { word: "বাংলাদেশ দল", weight: 2 },
    { word: "খেলোয়াড়", weight: 2 },
    { word: "কোচ", weight: 1 },
    { word: "জয়", weight: 1 },
    { word: "পরাজয়", weight: 1 },
    { word: "ড্র", weight: 1 },
    { word: "স্কোর", weight: 1 },
    { word: "অফসাইড", weight: 1 },
    { word: "ফ্রি কিক", weight: 1 },
    { word: "পেনাল্টি", weight: 1 }
  ],

  "আন্তর্জাতিক": [
    { word: "আন্তর্জাতিক", weight: 2 },
    { word: "বিশ্ব", weight: 2 },
    { word: "গ্লোবাল", weight: 2 },
    { word: "যুক্তরাষ্ট্র", weight: 2 },
    { word: "আমেরিকা", weight: 2 },
    { word: "হোয়াইট হাউস", weight: 2 },
    { word: "চীন", weight: 2 },
    { word: "ভারত", weight: 2 },
    { word: "পাকিস্তান", weight: 2 },
    { word: "জাপান", weight: 2 },
    { word: "রাশিয়া", weight: 2 },
    { word: "ইউক্রেন", weight: 2 },
    { word: "ইসরায়েল", weight: 2 },
    { word: "ফিলিস্তিন", weight: 2 },
    { word: "ইউরোপ", weight: 1 },
    { word: "মধ্যপ্রাচ্য", weight: 1 },
    { word: "আফ্রিকা", weight: 1 },
    { word: "জাতিসংঘ", weight: 2 },
    { word: "ন্যাটো", weight: 1 },
    { word: "ইইউ", weight: 1 },
    { word: "বিদেশ", weight: 1 },
    { word: "বিদেশনীতি", weight: 1 },
    { word: "বিশ্বনেতা", weight: 1 },
    { word: "যুদ্ধ", weight: 2 },
    { word: "সংঘাত", weight: 2 },
    { word: "নিষেধাজ্ঞা", weight: 2 },
    { word: "মহাযুদ্ধ", weight: 1 },
    { word: "অন্তর্জাতিক সংস্থা", weight: 1 },
    { word: "রপ্তানি", weight: 1 },
    { word: "আমদানি", weight: 1 }
  ],

  "আরও": [
    // Entertainment
    { word: "বিনোদন", weight: 2 },
    { word: "সিনেমা", weight: 2 },
    { word: "চলচ্চিত্র", weight: 2 },
    { word: "নাটক", weight: 2 },
    { word: "তারকা", weight: 2 },
    { word: "অভিনেতা", weight: 2 },
    { word: "অভিনেত্রী", weight: 2 },
    { word: "গান", weight: 1 },
    { word: "মিউজিক", weight: 1 },
    { word: "শোবিজ", weight: 1 },
    { word: "টিভি", weight: 1 },
    { word: "ওটিটি", weight: 1 },

    // Technology
    { word: "প্রযুক্তি", weight: 2 },
    { word: "ডিজিটাল", weight: 1 },
    { word: "এআই", weight: 2 },
    { word: "কৃত্রিম বুদ্ধিমত্তা", weight: 2 },
    { word: "ইন্টারনেট", weight: 2 },
    { word: "মোবাইল", weight: 1 },
    { word: "স্মার্টফোন", weight: 1 },
    { word: "অ্যাপ", weight: 1 },
    { word: "সফটওয়্যার", weight: 1 },
    { word: "স্টার্টআপ", weight: 2 },
    { word: "সাইবার", weight: 1 },
    { word: "রোবট", weight: 1 },
    { word: "ডেটা", weight: 1 },
    { word: "টেক", weight: 1 },

    // Economy
    { word: "অর্থনীতি", weight: 2 },
    { word: "ব্যাংক", weight: 1 },
    { word: "ডলার", weight: 1 },
    { word: "টাকা", weight: 1 },
    { word: "মুদ্রাস্ফীতি", weight: 1 },
    { word: "বাজার", weight: 2 },
    { word: "শেয়ারবাজার", weight: 2 },
    { word: "বাণিজ্য", weight: 1 },
    { word: "বাজেট", weight: 1 },
    { word: "রপ্তানি", weight: 1 },
    { word: "আমদানি", weight: 1 },

    // Education
    { word: "শিক্ষা", weight: 2 },
    { word: "বিশ্ববিদ্যালয়", weight: 1 },
    { word: "স্কুল", weight: 1 },
    { word: "কলেজ", weight: 1 },
    { word: "শিক্ষার্থী", weight: 1 },
    { word: "পরীক্ষা", weight: 1 },
    { word: "এইচএসসি", weight: 1 },
    { word: "এসএসসি", weight: 1 },
    { word: "ভর্তি", weight: 1 },
    { word: "রেজাল্ট", weight: 1 },
    { word: "ক্লাস", weight: 1 },

    // Health
    { word: "স্বাস্থ্য", weight: 2 },
    { word: "হাসপাতাল", weight: 1 },
    { word: "ডাক্তার", weight: 1 },
    { word: "রোগী", weight: 1 },
    { word: "চিকিৎসা", weight: 1 },
    { word: "ডেঙ্গু", weight: 1 },
    { word: "করোনা", weight: 1 },
    { word: "ভাইরাস", weight: 1 },
    { word: "টিকা", weight: 1 },
    { word: "স্বাস্থ্যসেবা", weight: 1 },

    // Lifestyle
    { word: "লাইফস্টাইল", weight: 1 },
    { word: "ভ্রমণ", weight: 1 },
    { word: "ফ্যাশন", weight: 1 },
    { word: "খাবার", weight: 1 },
    { word: "রেসিপি", weight: 1 },
    { word: "জীবনযাপন", weight: 1 },
    { word: "ফিটনেস", weight: 1 },
    { word: "ডায়েট", weight: 1 },
    { word: "পৌরসেবা", weight: 1 }
  ]
};

/* ===================================================
   CATEGORY DETECTION WITH WEIGHTS & CONFIDENCE
=================================================== */
function categorizeArticle(article) {
  const text = normalizeText(`${article.title} ${article.description}`);
  let bestCategory = "আরও";
  let bestScore = 0;
  let totalScore = 0;

  for (const [category, keywords] of Object.entries(categoryKeywords)) {
    let score = 0;

    keywords.forEach(({ word, weight = 1 }) => {
      const regex = new RegExp(`\\b${normalizeText(word)}\\b`, "g");
      const matches = text.match(regex);
      if (matches) score += matches.length * weight;
    });

    totalScore += score;

    if (score > bestScore) {
      bestScore = score;
      bestCategory = category;
    }
  }

  const confidence = totalScore ? (bestScore / totalScore).toFixed(2) : 0;

  console.log(`🧠 Categorized: ${article.title} → ${bestCategory} (Confidence: ${confidence})`);

  return { name: bestCategory, confidence: Number(confidence) };
}

/* ===================================================
   DUPLICATE CHECK
=================================================== */
function isSimilar(title1, title2) {
  const t1 = normalizeText(title1);
  const t2 = normalizeText(title2);
  if (t1 === t2) return true;
  if (t1.includes(t2) || t2.includes(t1)) return true;
  return false;
}

function removeDuplicates(newsArray) {
  const unique = [];
  newsArray.forEach(article => {
    const exists = unique.some(item => isSimilar(item.title, article.title));
    if (!exists) unique.push(article);
  });
  return unique;
}

/* ===================================================
   CLEAN SINGLE ARTICLE
=================================================== */
function cleanArticle(article = {}) {
  const cleaned = {
    title: cleanHTML(article.title || "No Title"),
    description: cleanHTML(article.description || article.contentSnippet || ""),
    content: cleanHTML(article.content || ""),
    image: article.image || "https://via.placeholder.com/300",
    source: safeString(article.source || "Unknown"),
    url: safeString(article.url || article.link || ""),
    publishedAt: formatDate(article.pubDate || article.publishedAt)
  };

  cleaned.category = categorizeArticle(cleaned);

  return cleaned;
}

/* ===================================================
   MAIN PIPELINE
=================================================== */
function cleanNewsData(rawNews = []) {
  console.log(`🧹 Cleaning ${rawNews.length} news articles...\n`);
  if (!Array.isArray(rawNews)) return [];

  let cleaned = rawNews.map(cleanArticle);

  cleaned = cleaned.filter(article => article.description.length > 40);

  cleaned = removeDuplicates(cleaned);

  cleaned.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));

  console.log(`\n✅ Finished processing ${cleaned.length} articles`);

  return cleaned;
}

export default cleanNewsData;
