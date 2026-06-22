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
   * Returns { score: 0-100, artistValidated: bool }. score=0 means hard reject.
   *
   * channelContext = { channelType, channelConfidence } from MetadataIntelligence.
   * Topic/VEVO channels lower the artist validation threshold (artist from channel is high-trust).
   */
  _scoreResult: function (track, queryTitle, queryArtist, channelContext) {
    channelContext = channelContext || {};
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
      // Topic/VEVO channels have pre-validated artist — lower validation threshold
      const isHighTrustChannel = channelContext.channelType === 'TOPIC_AUTO' ||
                                  channelContext.channelType === 'VEVO';
      const validationThreshold = isHighTrustChannel ? 0.2 : 0.3;

      if (artistOverlap >= 0.7) {
        score += 40;
        artistValidated = true;
      } else if (artistOverlap >= validationThreshold) {
        // High-trust channels get a slightly better score for moderate matches
        score += isHighTrustChannel ? 30 : 20;
        artistValidated = true;
      } else {
        score += 5; // Different artist — small consolation only
      }

      // Channel authority bonus: Topic/VEVO channels that also validate artist
      if (artistValidated) {
        if (channelContext.channelType === 'TOPIC_AUTO') score += 15;
        else if (channelContext.channelType === 'VEVO') score += 10;
      }
    }
    // No queryArtist → title-only search. No bonus. Artist cannot be validated.

    // Bonus for synced lyrics availability
    if (track.syncedLyrics) score += 10;

    return { score, artistValidated };
  },

  /**
   * Fetch from LRCLIB. Evaluates top-3 candidates and returns best scorer.
   * Returns null if nothing found or all candidates are hard-rejected.
   * channelContext is forwarded to _scoreResult for trust-level adjustments.
   */
  _executeSearch: async function (title, artist, channelContext) {
    channelContext = channelContext || {};
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
      const { score, artistValidated } = this._scoreResult(track, title, artist, channelContext);
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
      // Verification requires BOTH sufficient score AND confirmed artist identity.
      // Threshold raised to 70 (was 60) to prevent weak title-only matches from verifying.
      isVerified: bestScore >= 70 && bestArtistValidated,
      artistValidated: bestArtistValidated
    };
  },

  /**
   * Main search entry point.
   * Cascades through 4 attempts. Tracks the best result across all attempts.
   * Returns the highest-confidence result found (even if not verified).
   */
  searchLyrics: async function (title, artist, channelContext) {
    channelContext = channelContext || {};
    try {
      let bestResult = null;

      const evaluate = (result) => {
        if (!result) return;
        if (result.isVerified) return result; // short-circuit signal
        if (!bestResult || result.confidence > bestResult.confidence) {
          bestResult = result;
        }
      };

      // Attempt 1: Full Title + Artist (with channel context for trust-level scoring)
      if (artist) {
        YTLyricsLogger.log(`[LRCLIB] Attempt 1: "${title}" by "${artist}" [channel: ${channelContext.channelType || 'UNKNOWN'}]`);
        const r1 = await this._executeSearch(title, artist, channelContext);
        const shortCircuit = evaluate(r1);
        if (shortCircuit) return shortCircuit;
      }

      // Attempt 2: Full Title only (broaden search, drop artist)
      // NOTE: channelContext still passed so Topic/VEVO can still boost if title matches
      YTLyricsLogger.log(`[LRCLIB] Attempt 2: "${title}" (No Artist)`);
      const r2 = await this._executeSearch(title, null, channelContext);
      const sc2 = evaluate(r2);
      if (sc2) return sc2;

      // Attempt 3: Split by '|' (safeguard for any missed pipe pollution)
      if (title.includes('|')) {
        const splitTitle = title.split('|')[0].trim();
        if (splitTitle && splitTitle !== title) {
          YTLyricsLogger.log(`[LRCLIB] Attempt 3: "${splitTitle}" (Split Pipe)`);
          const r3 = await this._executeSearch(splitTitle, null, channelContext);
          const sc3 = evaluate(r3);
          if (sc3) return sc3;
        }
      }

      // Attempt 4: Split by '(' (strip trailing parentheticals)
      if (title.includes('(')) {
        const splitTitle = title.split('(')[0].trim();
        if (splitTitle && splitTitle !== title) {
          YTLyricsLogger.log(`[LRCLIB] Attempt 4: "${splitTitle}" (Split Parenthesis)`);
          const r4 = await this._executeSearch(splitTitle, null, channelContext);
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
