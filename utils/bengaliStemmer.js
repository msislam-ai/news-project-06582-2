/**
 * 🇧🇩 Lightweight Bengali Stemmer (Rule-based)
 * No external dependencies - works out of the box
 */

// Common Bengali suffixes to remove (longest first)
const BENGALI_SUFFIXES = [
  'গুলি', 'গুলো', 'দেরকে', 'দের', 'েরা', 'ের', 'েরই', 'েই', 'টি', 'টা',
  'কে', 'তে', 'তেই', 'রা', 'য়', 'ও', 'ই', 'এ', 'ে', 'া', 'ী', 'ু', 'ূ', 'ৃ', 'ৈ', 'ৌ'
];

// Protected words (never stem these)
const PROTECTED_WORDS = new Set([
  'বাংলাদেশ', 'ঢাকা', 'ক্রিকেট', 'ফুটবল', 'প্রধানমন্ত্রী', 'সরকার',
  'আওয়ামী', 'বিএনপি', 'নির্বাচন', 'সংসদ', 'খুলনা', 'রাজশাহী',
  'বরিশাল', 'সিলেট', 'রংপুর', 'ময়মনসিংহ', 'পদ্মা', 'সুন্দরবন'
]);

/**
 * Stem a single Bengali word
 */
export function stemBengaliWord(word) {
  if (!word || typeof word !== 'string') return '';
  
  const original = word.toLowerCase().trim();
  
  // Protect short words and proper nouns
  if (original.length <= 3 || PROTECTED_WORDS.has(original)) {
    return original;
  }
  
  let stemmed = original;
  
  // Try removing suffixes
  for (const suffix of BENGALI_SUFFIXES) {
    if (stemmed.endsWith(suffix) && stemmed.length - suffix.length >= 2) {
      stemmed = stemmed.slice(0, -suffix.length);
      break;
    }
  }
  
  // Remove duplicate consecutive characters
  stemmed = stemmed.replace(/([\u0980-\u09FF])\1+/g, '$1');
  
  return stemmed || original;
}

/**
 * Stem a full Bengali sentence
 */
export function stemBengaliSentence(text) {
  if (!text) return '';
  
  return text
    .split(/(\s+|[^\u0980-\u09FF\w])/)
    .map(token => {
      if (/^[\s\W]+$/.test(token)) return token;
      return stemBengaliWord(token);
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Check if text contains Bengali characters
 */
export function isBengaliText(text) {
  return /[\u0980-\u09FF]/.test(text);
}

export default {
  stemBengaliWord,
  stemBengaliSentence,
  isBengaliText
};
