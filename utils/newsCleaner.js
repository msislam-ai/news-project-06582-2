/* ===================================================
   SAFE STRING
=================================================== */
function safeString(text) {
  if (!text) return "";
  if (typeof text === "string") return text;
  return String(text);
}


/* ===================================================
   CLEAN HTML
=================================================== */
function cleanHTML(text = "") {
  return safeString(text)
    .replace(/<[^>]*>?/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}


/* ===================================================
   FORMAT DATE
=================================================== */
function formatDate(date) {
  if (!date) return new Date().toISOString();

  try {
    return new Date(date).toISOString();
  } catch {
    return new Date().toISOString();
  }
}


/* ===================================================
   NORMALIZE TEXT
=================================================== */
function normalizeText(text = "") {
  return safeString(text)
    .toLowerCase()
    .replace(/[^\u0980-\u09FF\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}


/* ===================================================
   CATEGORY KEYWORDS
=================================================== */

const categoryKeywords = {

  "রাজনীতি": [
    "রাজনীতি","রাজনৈতিক","সরকার","মন্ত্রী","প্রধানমন্ত্রী",
    "রাষ্ট্রপতি","সংসদ","নির্বাচন","ভোট","উপনির্বাচন",
    "বিএনপি","আওয়ামী লীগ","জাতীয় পার্টি","জামায়াত",
    "দল","রাজনৈতিক দল","সমাবেশ","মিছিল","বিক্ষোভ",
    "বক্তব্য","ক্ষমতাসীন","বিরোধী দল","নেতা","নেত্রী",
    "আইন পাস","সংবিধান","ক্যাবিনেট","মন্ত্রিসভা"
  ],

  "জাতীয়": [
    "বাংলাদেশ","ঢাকা","চট্টগ্রাম","খুলনা","রাজশাহী",
    "বরিশাল","সিলেট","রংপুর","ময়মনসিংহ",
    "দেশব্যাপী","জাতীয়","জনগণ","নাগরিক",
    "দুর্ঘটনা","সড়ক দুর্ঘটনা","আগুন","অগ্নিকাণ্ড",
    "পুলিশ","র‍্যাব","আদালত","হাইকোর্ট",
    "আইনশৃঙ্খলা","গ্রেপ্তার","মামলা",
    "বন্যা","ঘূর্ণিঝড়","ঝড়","বৃষ্টি","দুর্যোগ",
    "স্বাধীনতা","মুক্তিযুদ্ধ","শহীদ মিনার",
    "পরিবহন","রেল","বাস","ফেরি"
  ],

  "খেলা": [
    "খেলা","ক্রীড়া","ক্রিকেট","ফুটবল","হকি",
    "ম্যাচ","গোল","রান","উইকেট","সেঞ্চুরি",
    "ব্যাটসম্যান","বোলার","ক্যাপ্টেন",
    "টুর্নামেন্ট","লিগ","ফাইনাল","সেমিফাইনাল",
    "বিশ্বকাপ","এশিয়া কাপ","আইপিএল","বিপিএল",
    "বাংলাদেশ দল","খেলোয়াড়","কোচ",
    "জয়","পরাজয়","ড্র","স্কোর"
  ],

  "আন্তর্জাতিক": [
    "আন্তর্জাতিক","বিশ্ব","গ্লোবাল",
    "যুক্তরাষ্ট্র","আমেরিকা","হোয়াইট হাউস",
    "চীন","ভারত","পাকিস্তান","জাপান",
    "রাশিয়া","ইউক্রেন","ইসরায়েল","ফিলিস্তিন",
    "ইউরোপ","মধ্যপ্রাচ্য","আফ্রিকা",
    "জাতিসংঘ","ন্যাটো","ইইউ",
    "বিদেশ","বিদেশনীতি","বিশ্বনেতা",
    "যুদ্ধ","সংঘাত","নিষেধাজ্ঞা"
  ],

  "আরও": [
    // Entertainment
    "বিনোদন","সিনেমা","চলচ্চিত্র","নাটক",
    "তারকা","অভিনেতা","অভিনেত্রী","গান",
    "মিউজিক","শোবিজ","টিভি","ওটিটি",

    // Technology
    "প্রযুক্তি","ডিজিটাল","এআই","কৃত্রিম বুদ্ধিমত্তা",
    "ইন্টারনেট","মোবাইল","স্মার্টফোন",
    "অ্যাপ","সফটওয়্যার","স্টার্টআপ",
    "সাইবার","রোবট","ডেটা","টেক",

    // Economy
    "অর্থনীতি","ব্যাংক","ডলার","টাকা",
    "মুদ্রাস্ফীতি","বাজার","শেয়ারবাজার",
    "বাণিজ্য","বাজেট","রপ্তানি","আমদানি",

    // Education
    "শিক্ষা","বিশ্ববিদ্যালয়","স্কুল","কলেজ",
    "শিক্ষার্থী","পরীক্ষা","এইচএসসি","এসএসসি",
    "ভর্তি","রেজাল্ট","ক্লাস",

    // Health
    "স্বাস্থ্য","হাসপাতাল","ডাক্তার","রোগী",
    "চিকিৎসা","ডেঙ্গু","করোনা","ভাইরাস",
    "টিকা","স্বাস্থ্যসেবা",

    // Lifestyle
    "লাইফস্টাইল","ভ্রমণ","ফ্যাশন",
    "খাবার","রেসিপি","জীবনযাপন"
  ]
};


/* ===================================================
   CATEGORY DETECTOR + TERMINAL LOG
=================================================== */
function categorizeArticle(article) {

  const text = normalizeText(
    `${article.title} ${article.description}`
  );

  let bestCategory = "আরও";
  let bestScore = 0;

  for (const [category, keywords] of Object.entries(categoryKeywords)) {

    let score = 0;

    keywords.forEach(keyword => {
      if (text.includes(normalizeText(keyword))) {
        score++;
      }
    });

    if (score > bestScore) {
      bestScore = score;
      bestCategory = category;
    }
  }

  // ⭐ TERMINAL OUTPUT
  console.log(`🧠 Categorized: ${article.title} → ${bestCategory}`);

  return bestCategory;
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

    const exists = unique.some(item =>
      isSimilar(item.title, article.title)
    );

    if (!exists) unique.push(article);
  });

  return unique;
}


/* ===================================================
   CLEAN ARTICLE
=================================================== */
function cleanArticle(article = {}) {

  const cleaned = {
    title: cleanHTML(article.title || "No Title"),

    description: cleanHTML(
      article.description ||
      article.contentSnippet ||
      ""
    ),

    content: cleanHTML(article.content || ""),

    image:
      article.image ||
      "https://via.placeholder.com/300",

    source: safeString(article.source || "Unknown"),

    url: safeString(article.url || article.link || ""),

    publishedAt: formatDate(
      article.pubDate || article.publishedAt
    )
  };

  // ⭐ CATEGORY ADDED
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

  cleaned = cleaned.filter(article =>
    article.description.length > 40
  );

  cleaned = removeDuplicates(cleaned);

  cleaned.sort(
    (a, b) => new Date(b.publishedAt) - new Date(a.publishedAt)
  );

  console.log(`\n✅ Finished processing ${cleaned.length} articles`);

  return cleaned;
}

export default cleanNewsData;