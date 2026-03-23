/**
 * Lightweight Bengali Stemmer (Rule-based Fallback)
 * No external dependencies - works out of the box
 */

// Common Bengali suffixes to remove (ordered by length, longest first)
const BENGALI_SUFFIXES = [
  'গুলি', 'গুলো', 'দেরকে', 'দের', 'েরা', 'ের', 'েরই', 'েই', 'টি', 'টা',
  'কে', 'তে', 'তেই', 'রা', 'য়', 'ও', 'ই', 'এ', 'ে', 'া', 'ী', 'ু', 'ূ', 'ৃ', 'ৈ', 'ৌ'
];

// Words that should never be stemmed (protected list)
const PROTECTED_WORDS = new Set([
  'বাংলাদেশ', 'ঢাকা', 'ক্রিকেট', 'ফুটবল', 'প্রধানমন্ত্রী', 'সরকার',
  'আওয়ামী', 'বিএনপি', 'নির্বাচন', 'সংসদ'
]);

/**
 * Stem a single Bengali word
 * @param {string} word - The word to stem
 * @returns {string} - The stemmed word
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
      break; // Only remove one suffix
    }
  }
  
  // Remove duplicate consecutive characters (common in Bengali inflection)
  stemmed = stemmed.replace(/([\u0980-\u09FF])\1+/g, '$1');
  
  return stemmed || original;
}

/**
 * Stem a full Bengali sentence
 * @param {string} text - The text to stem
 * @returns {string} - Stemmed text
 */
export function stemBengaliSentence(text) {
  if (!text) return '';
  
  // Split while preserving spaces and punctuation
  return text
    .split(/(\s+|[^\u0980-\u09FF\w])/)
    .map(token => {
      // Preserve non-word tokens (spaces, punctuation)
      if (/^[\s\W]+$/.test(token)) return token;
      return stemBengaliWord(token);
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Check if text contains Bengali characters
 * @param {string} text 
 * @returns {boolean}
 */
export function isBengaliText(text) {
  return /[\u0980-\u09FF]/.test(text);
}

// Export for both ESM and CommonJS
export default {
  stemBengaliWord,
  stemBengaliSentence,
  isBengaliText
};
