/**
 * Mood Engine
 * Performs lightweight keyword-based mood analysis on lyrics text.
 */
const MoodEngine = {
  dictionaries: {
    energetic: ['fire', 'run', 'fight', 'rise', 'power', 'fast', 'jump', 'wild', 'burn', 'loud', 'crash', 'go', 'up', 'break', 'strong', 'push', 'alive'],
    happy: ['happy', 'smile', 'joy', 'sun', 'shine', 'dance', 'laugh', 'good', 'day', 'light', 'beautiful', 'glad', 'fun', 'celebrate', 'cheer', 'bright'],
    reflective: ['think', 'time', 'change', 'past', 'future', 'mind', 'look', 'world', 'see', 'life', 'wonder', 'grow', 'learn', 'memory', 'truth', 'question'],
    melancholic: ['alone', 'miss', 'cry', 'pain', 'broken', 'sad', 'tear', 'dark', 'fall', 'lose', 'lost', 'empty', 'cold', 'sorrow', 'hurt', 'goodbye', 'die'],
    romantic: ['love', 'kiss', 'heart', 'baby', 'together', 'hold', 'touch', 'sweet', 'forever', 'darling', 'feel', 'mine', 'yours', 'eyes', 'soul', 'want'],
    aggressive: ['hate', 'kill', 'destroy', 'blood', 'rage', 'anger', 'mad', 'enemy', 'war', 'punch', 'strike', 'smash', 'beat', 'sick', 'dead']
  },

  analyzeLyrics: function (lyricsText) {
    const scores = {
      energetic: 0,
      happy: 0,
      reflective: 0,
      melancholic: 0,
      romantic: 0,
      aggressive: 0
    };

    if (!lyricsText || typeof lyricsText !== 'string') {
      return scores;
    }

    const words = lyricsText.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/);

    // Create a frequency map for performance
    const wordFreq = {};
    for (const word of words) {
      if (word.length > 2) { // Ignore very short words
        wordFreq[word] = (wordFreq[word] || 0) + 1;
      }
    }

    // Score based on dictionary matches
    for (const [mood, keywords] of Object.entries(this.dictionaries)) {
      for (const keyword of keywords) {
        if (wordFreq[keyword]) {
          scores[mood] += wordFreq[keyword];
        }
      }
    }

    // Normalize scores so they represent a percentage/distribution of found keywords
    let totalScore = 0;
    for (const score of Object.values(scores)) {
      totalScore += score;
    }

    if (totalScore > 0) {
      for (const mood in scores) {
        scores[mood] = Math.round((scores[mood] / totalScore) * 100);
      }
    }

    return scores;
  }
};

window.YTLyricsMoodEngine = MoodEngine;
