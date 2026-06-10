/**
 * Phase 6: Lyrics Service
 * Interacts with the LRCLIB API to fetch lyrics.
 */
const LyricsService = {
  _executeSearch: async function (title, artist) {
    const url = new URL('https://lrclib.net/api/search');
    url.searchParams.append('track_name', title);
    if (artist) {
      url.searchParams.append('artist_name', artist);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(url.toString(), { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      if (response.status === 404) {
        return null; // Not found
      }
      throw new Error(`API returned status: ${response.status}`);
    }

    const data = await response.json();
    if (!data || data.length === 0) {
      return null; // Not found
    }

    const track = data[0];
    return {
      title: track.trackName,
      artist: track.artistName,
      syncedLyrics: track.syncedLyrics,
      plainLyrics: track.plainLyrics
    };
  },

  searchLyrics: async function (title, artist) {
    try {
      let result = null;

      // Attempt 1: Full Title + Artist
      if (artist) {
        YTLyricsLogger.log(`[LRCLIB] Attempt 1: "${title}" by "${artist}"`);
        result = await this._executeSearch(title, artist);
        if (result) return result;
      }

      // Attempt 2: Full Title only
      YTLyricsLogger.log(`[LRCLIB] Attempt 2: "${title}" (No Artist)`);
      result = await this._executeSearch(title, null);
      if (result) return result;

      // Attempt 3: Split Title by '|'
      if (title.includes('|')) {
        const splitTitle = title.split('|')[0].trim();
        YTLyricsLogger.log(`[LRCLIB] Attempt 3: "${splitTitle}" (Split Pipe)`);
        result = await this._executeSearch(splitTitle, null);
        if (result) return result;
      }

      // Attempt 4: Split Title by '('
      if (title.includes('(')) {
        const splitTitle = title.split('(')[0].trim();
        YTLyricsLogger.log(`[LRCLIB] Attempt 4: "${splitTitle}" (Split Parenthesis)`);
        result = await this._executeSearch(splitTitle, null);
        if (result) return result;
      }

      throw new Error('Lyrics not found after all attempts.');

    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error('Network timeout while fetching lyrics.');
      }
      throw error;
    }
  }
};

window.YTLyricsService = LyricsService;
