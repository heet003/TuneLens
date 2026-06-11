/**
 * Phase 6: Lyrics Service
 * Interacts with the LRCLIB API to fetch lyrics.
 *
 * Confidence Model:
 *   - Each LRCLIB result is scored against our query before acceptance.
 *   - Top-3 results are evaluated. The highest scorer wins.
 *   - isVerified = confidence >= 60 (metadata overwrites session).
 *   - isVerified = false (lyrics shown in overlay, metadata NOT overwritten).
 */
const LyricsService = {
  /**
   * Word-set intersection ratio between two strings.
   * Fast, no external deps. Returns 0.0–1.0.
   */
  _wordOverlap: function (a, b) {
    if (!a || !b) return 0;
    const normalize = s => s.toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 1);
    const setA = new Set(normalize(a));
    const setB = new Set(normalize(b));
    if (setA.size === 0 || setB.size === 0) return 0;
    let intersection = 0;
    for (const word of setA) { if (setB.has(word)) intersection++; }
    return intersection / Math.max(setA.size, setB.size);
  },

  /**
   * Score a candidate LRCLIB track against our query.
   * Returns 0-100 confidence score. 0 means hard reject.
   */
  _scoreResult: function (track, queryTitle, queryArtist) {
    if (!track || !track.trackName) return { score: 0, artistValidated: false };

    let score = 0;
    let artistValidated = false;

    // Title similarity (critical gate)
    const titleOverlap = this._wordOverlap(track.trackName, queryTitle);
    if (titleOverlap >= 0.8) score += 50;
    else if (titleOverlap >= 0.5) score += 25;
    else return { score: 0, artistValidated: false }; // Title too dissimilar — hard reject

    // Artist cross-validation
    if (queryArtist) {
      const artistOverlap = this._wordOverlap(track.artistName, queryArtist);
      if (artistOverlap >= 0.7) {
        score += 40;
        artistValidated = true;
      }
      else if (artistOverlap >= 0.3) {
        score += 20;
        artistValidated = true;
      }
      else score += 5; // Different artist — small consolation
    } else {
      score += 10; // No artist to validate against
    }

    // Bonus for synced lyrics availability
    if (track.syncedLyrics) score += 10;

    return { score, artistValidated };
  },

  /**
   * Fetch from LRCLIB. Evaluates top-3 candidates and returns best scorer.
   * Returns null if nothing found or all candidates are hard-rejected.
   */
  _executeSearch: async function (title, artist) {
    const url = new URL('https://lrclib.net/api/search');
    url.searchParams.append('track_name', title);
    if (artist) url.searchParams.append('artist_name', artist);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(url.toString(), { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error(`API returned status: ${response.status}`);
    }

    const data = await response.json();
    if (!data || data.length === 0) return null;

    // Evaluate top-3 candidates, pick highest scorer
    const candidates = data.slice(0, 3);
    let bestTrack = null;
    let bestScore = 0;
    let bestArtistValidated = false;
    for (const track of candidates) {
      const { score, artistValidated } = this._scoreResult(track, title, artist);
      if (score > bestScore) {
        bestScore = score;
        bestTrack = track;
        bestArtistValidated = artistValidated;
      }
    }

    if (!bestTrack || bestScore === 0) return null;

    return {
      title: bestTrack.trackName,
      artist: bestTrack.artistName,
      syncedLyrics: bestTrack.syncedLyrics,
      plainLyrics: bestTrack.plainLyrics,
      confidence: bestScore,
      isVerified: bestScore >= 60 && bestArtistValidated,
      artistValidated: bestArtistValidated
    };
  },

  /**
   * Main search entry point.
   * Cascades through 4 attempts. Tracks the best result across all attempts.
   * Returns the highest-confidence result found (even if not verified).
   */
  searchLyrics: async function (title, artist) {
    try {
      let bestResult = null;

      const evaluate = (result) => {
        if (!result) return;
        if (result.isVerified) return result; // short-circuit signal
        if (!bestResult || result.confidence > bestResult.confidence) {
          bestResult = result;
        }
      };

      // Attempt 1: Full Title + Artist
      if (artist) {
        YTLyricsLogger.log(`[LRCLIB] Attempt 1: "${title}" by "${artist}"`);
        const r1 = await this._executeSearch(title, artist);
        const shortCircuit = evaluate(r1);
        if (shortCircuit) return shortCircuit;
      }

      // Attempt 2: Full Title only (broaden search, drop artist)
      YTLyricsLogger.log(`[LRCLIB] Attempt 2: "${title}" (No Artist)`);
      const r2 = await this._executeSearch(title, null);
      const sc2 = evaluate(r2);
      if (sc2) return sc2;

      // Attempt 3: Split by '|' (safeguard for any missed pipe pollution)
      if (title.includes('|')) {
        const splitTitle = title.split('|')[0].trim();
        if (splitTitle && splitTitle !== title) {
          YTLyricsLogger.log(`[LRCLIB] Attempt 3: "${splitTitle}" (Split Pipe)`);
          const r3 = await this._executeSearch(splitTitle, null);
          const sc3 = evaluate(r3);
          if (sc3) return sc3;
        }
      }

      // Attempt 4: Split by '(' (strip trailing parentheticals)
      if (title.includes('(')) {
        const splitTitle = title.split('(')[0].trim();
        if (splitTitle && splitTitle !== title) {
          YTLyricsLogger.log(`[LRCLIB] Attempt 4: "${splitTitle}" (Split Parenthesis)`);
          const r4 = await this._executeSearch(splitTitle, null);
          const sc4 = evaluate(r4);
          if (sc4) return sc4;
        }
      }

      // Return best unverified result if any attempt produced lyrics
      if (bestResult) {
        YTLyricsLogger.log(`[LRCLIB] Best result is AMBIGUOUS (confidence: ${bestResult.confidence}). Lyrics shown but metadata NOT updated.`);
        return bestResult;
      }

      throw new Error('Lyrics not found after all attempts.');

    } catch (error) {
      if (error.name === 'AbortError') throw new Error('Network timeout while fetching lyrics.');
      throw error;
    }
  }
};

window.YTLyricsService = LyricsService;
