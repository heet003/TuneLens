/**
 * Metadata Intelligence Layer
 * Heuristics-based parser for noisy YouTube metadata.
 */

const MetadataIntelligence = {
  extractCandidates: function (rawTitle, rawChannel) {
    if (!rawTitle) return { candidateTitle: '', candidateArtist: '' };

    let cleanedTitle = window.YTLyricsDetector ? window.YTLyricsDetector.cleanTitle(rawTitle) : rawTitle;
    let candidateArtist = this.isToxicChannel(rawChannel) ? '' : rawChannel;
    let candidateTitle = cleanedTitle;

    // 1. South Asian Convention (Pipe Delimiter): Song | Singer | Movie | Channel
    if (cleanedTitle.includes('|')) {
      const parts = cleanedTitle.split('|').map(s => s.trim()).filter(s => s);
      if (parts.length > 0) {
        candidateTitle = parts[0];

        // Use part 1 as artist if it's not toxic/generic
        if (parts.length > 1 && !this.isToxicString(parts[1])) {
          candidateArtist = parts[1];
        }
      }
    }
    // 2. Western Convention (Hyphen Delimiter): Artist - Song
    else if (cleanedTitle.includes(' - ')) {
      const parts = cleanedTitle.split(' - ').map(s => s.trim());
      if (parts.length >= 2) {
        candidateArtist = parts[0];
        candidateTitle = parts.slice(1).join(' - ');
      }
    }

    // 3. VEVO cleanup (e.g. "EminemVEVO" -> "Eminem")
    if (candidateArtist && candidateArtist.toLowerCase().endsWith('vevo')) {
      candidateArtist = candidateArtist.substring(0, candidateArtist.length - 4);
    }

    return {
      candidateTitle: candidateTitle.trim(),
      candidateArtist: candidateArtist.trim()
    };
  },

  isToxicChannel: function (channelName) {
    if (!channelName) return true;
    return this.isToxicString(channelName);
  },

  isToxicString: function (str) {
    if (!str) return true;
    const lower = str.toLowerCase().trim();

    // Exact or suffix matches for known aggregator/label channel patterns
    const exactToxic = ['vevo', 'topic', 'wfl', 'worldfamouslyrics', 'lyricworld', 'lyricsvideo'];
    if (exactToxic.includes(lower)) return true;

    // Suffix patterns — e.g. "SonyMusicIndia" or "T-SeriesOfficial"
    const suffixToxic = ['vevo', 'official', 'records', 'lyrics'];
    if (suffixToxic.some(s => lower.endsWith(s))) return true;

    // Multi-word phrase matches for major label channels
    const phraseToxic = ['t-series', 'sony music', 'times music', 'zee music', 'saregama', 'tips music', 'speed records', 'desi music factory', 'tseries'];
    if (phraseToxic.some(p => lower.includes(p))) return true;

    return false;
  }
};

window.YTLyricsMetadataInt = MetadataIntelligence;
