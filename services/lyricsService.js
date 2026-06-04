/**
 * Phase 6: Lyrics Service
 * Interacts with the LRCLIB API to fetch lyrics.
 */
const LyricsService = {
  searchLyrics: async function (title, artist) {
    YTLyricsLogger.log(`Searching lyrics for: "${title}" by "${artist}"`);
    try {
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
          throw new Error('Lyrics not found (404)');
        }
        throw new Error(`API returned status: ${response.status}`);
      }

      const data = await response.json();
      if (!data || data.length === 0) {
        throw new Error('No lyrics found for this song.');
      }

      const track = data[0];
      return {
        title: track.trackName,
        artist: track.artistName,
        syncedLyrics: track.syncedLyrics,
        plainLyrics: track.plainLyrics
      };

    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error('Network timeout while fetching lyrics.');
      }
      throw error;
    }
  }
};

window.YTLyricsService = LyricsService;
