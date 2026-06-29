/**
 * Metadata Intelligence Layer — v2 (Full Redesign)
 *
 * Multi-stage pipeline:
 *   Phase 1: Channel Classification  → channelType, extractedArtist, channelConfidence
 *   Phase 2: Title Normalization     → strip emojis, variants, live/cover markers, feat. clauses
 *   Phase 3: Title Parsing          → expanded delimiter support (- | — :)
 *   Phase 4: Signal Assembly        → priority merge of channel + title signals
 *
 * Design principle: Every source is a signal, not a truth.
 * Returns a rich candidates object — never a single string.
 */

const MetadataIntelligence = {

  // ── Channel Type Constants ────────────────────────────────────────────
  CHANNEL_TYPE: {
    TOPIC_AUTO: 'TOPIC_AUTO',  // YouTube auto-generated, highest trust
    VEVO: 'VEVO',        // Label-verified official
    OFFICIAL: 'OFFICIAL',    // Artist official channel
    LABEL: 'LABEL',       // T-Series, Sony etc — no artist signal
    LYRICS: 'LYRICS',      // Lyrics aggregator — toxic
    UNKNOWN: 'UNKNOWN'      // Default
  },

  // ── Known Toxic Entities ──────────────────────────────────────────────
  _TOXIC_LABELS: [
    't-series', 'tseries', 'sony music', 'times music', 'zee music',
    'saregama', 'tips music', 'speed records', 'desi music factory',
    'tips official', 'lahari music', 'aditya music', 'universal music',
    'warner music', 'emi music', 'atlantic records', 'republic records'
  ],

  _TOXIC_LYRICS_CHANNELS: [
    'worldfamouslyrics', 'wfl', 'lyricworld', 'lyricsvideo',
    'lyricsvideohd', 'lyricshd', 'songlyrics', 'officiallyrics',
    'lyrics planet', 'azlyrics'
  ],

  // Audio variant suffixes — these variants map to the SAME canonical song
  _AUDIO_VARIANTS: [
    'slowed reverb', 'slowed and reverb', 'slowed + reverb',
    'slowed  reverb', 'slowed', 'reverb',
    '8d audio', '8d', 'bass boosted', 'nightcore',
    'lofi', 'lo-fi', 'lo fi', 'sped up', 'speed up',
    'pitched up', 'pitched down', 'acoustic version',
    'instrumental version', 'karaoke version'
  ],

  // ── Phase 1: Channel Classification ──────────────────────────────────
  /**
   * Classify a YouTube channel and extract artist metadata with a confidence score.
   * @param {string} channelName
   * @returns {{ channelType, extractedArtist, channelConfidence }}
   */
  classifyChannel: function (channelName) {
    const CT = this.CHANNEL_TYPE;
    if (!channelName) return { channelType: CT.UNKNOWN, extractedArtist: '', channelConfidence: 0 };

    const raw = channelName.trim();
    const lower = raw.toLowerCase();

    // ── Highest Trust: YouTube Topic channels (" - Topic" suffix) ─────
    if (lower.endsWith(' - topic')) {
      const artist = raw.substring(0, raw.length - 8).trim();
      return { channelType: CT.TOPIC_AUTO, extractedArtist: artist, channelConfidence: 95 };
    }

    // ── High Trust: VEVO channels ─────────────────────────────────────
    if (lower.endsWith('vevo')) {
      const artist = raw.substring(0, raw.length - 4).trim();
      return { channelType: CT.VEVO, extractedArtist: artist, channelConfidence: 85 };
    }

    // ── Lyrics aggregator (toxic) ─────────────────────────────────────
    if (this._TOXIC_LYRICS_CHANNELS.some(t => lower === t || lower.includes(t))) {
      return { channelType: CT.LYRICS, extractedArtist: '', channelConfidence: 0 };
    }
    // Suffix-based lyrics toxic detection
    const lyricsSuffixes = ['lyrics', 'lyric', 'lyric video', 'lyricsvideo'];
    if (lyricsSuffixes.some(s => lower.endsWith(s))) {
      return { channelType: CT.LYRICS, extractedArtist: '', channelConfidence: 0 };
    }

    // ── Label channels (no artist signal) ─────────────────────────────
    if (this._TOXIC_LABELS.some(l => lower.includes(l))) {
      return { channelType: CT.LABEL, extractedArtist: '', channelConfidence: 0 };
    }
    // Records label suffix
    if (lower.endsWith('records') || lower.endsWith('music') || lower.endsWith('entertainment')) {
      return { channelType: CT.LABEL, extractedArtist: '', channelConfidence: 0 };
    }

    // ── Official channels (moderate confidence) ───────────────────────
    if (lower.endsWith('official')) {
      // e.g. "Sonu Nigam Official" → "Sonu Nigam"
      const artist = raw.substring(0, raw.length - 8).replace(/[-_]/g, '').trim();
      return { channelType: CT.OFFICIAL, extractedArtist: artist || raw, channelConfidence: 60 };
    }

    // ── Unknown channel — treat as potential artist with low confidence ─
    return { channelType: CT.UNKNOWN, extractedArtist: raw, channelConfidence: 30 };
  },

  // ── Phase 2: Title Normalization ──────────────────────────────────────
  /**
   * Normalize a raw YouTube title.
   * Strips noise and detects semantic metadata hints.
   * @param {string} rawTitle
   * @returns {{ cleanTitle, isLive, isCover, isRemix, featuredArtists[] }}
   */
  normalizeTitle: function (rawTitle) {
    if (!rawTitle) return { cleanTitle: '', isLive: false, isCover: false, isRemix: false, featuredArtists: [] };

    let title = rawTitle;
    const featuredArtists = [];
    let isLive = false;
    let isCover = false;
    let isRemix = false;

    // ── Strip emoji and unicode decorations ───────────────────────────
    // Covers most emoji ranges (requires 'u' flag for \u{...} syntax)
    title = title.replace(/[\u{1F000}-\u{1FFFF}]|[\u{2600}-\u{27FF}]|[\u{FE00}-\u{FE0F}]/gu, '').trim();

    // ── Extract featured artist(s) BEFORE stripping ───────────────────
    // Match parenthesized: (feat. X), (ft. X), [feat. X] etc.
    const featParenRegex = /\s*[\(\[]\s*(?:feat(?:uring)?|ft)\.?\s+([^\)\]]+)[\)\]]/gi;
    let featMatch;
    while ((featMatch = featParenRegex.exec(title)) !== null) {
      const names = featMatch[1].trim().split(/\s*[,&]\s*/);
      names.forEach(n => { if (n.trim()) featuredArtists.push(n.trim()); });
    }
    // Strip parenthesized feat clauses
    title = title.replace(/\s*[\(\[]\s*(?:feat(?:uring)?|ft)\.?\s+[^\)\]]+[\)\]]/gi, '');
    // Strip trailing non-parenthesized feat. clause: "Song feat. Artist"
    title = title.replace(/\s+(?:feat(?:uring)?|ft)\.?\s+[^|\-(\[]+$/gi, '');

    // ── Detect and strip LIVE markers ────────────────────────────────
    if (/[\(\[]\s*live(?:\s+(?:at|from|performance|session|version)[^\)\]]*)?[\)\]]/gi.test(title)) {
      isLive = true;
      title = title.replace(/\s*[\(\[]\s*live(?:\s+(?:at|from|performance|session|version)[^\)\]]*)?[\)\]]/gi, '');
    }
    if (/\s+-\s+live\s*$/i.test(title) || /\s+live\s*$/i.test(title)) {
      isLive = true;
      title = title.replace(/\s+[-–]\s+live\s*$/i, '').replace(/\s+live\s*$/i, '');
    }

    // ── Detect and strip COVER markers ───────────────────────────────
    if (/[\(\[](?:[^\)\]]*\s+)?cover[\)\]]/gi.test(title)) {
      isCover = true;
      title = title.replace(/\s*[\(\[][^\)\]]*cover[\)\]]/gi, '');
    }

    // ── Detect and strip AUDIO VARIANT markers ────────────────────────
    // Build pattern from known variants (sorted by length, longest first to avoid partial matches)
    const sortedVariants = [...this._AUDIO_VARIANTS].sort((a, b) => b.length - a.length);
    for (const variant of sortedVariants) {
      const escapedVariant = variant.replace(/[+.]/g, '\\$&').replace(/\s+/g, '\\s+');
      const variantRegex = new RegExp(`\\s*[\\(\\[]\\s*${escapedVariant}(?:\\s+(?:version|edit|mix))?\\s*[\\)\\]]`, 'gi');
      if (variantRegex.test(title)) {
        isRemix = true;
        title = title.replace(variantRegex, '');
        break; // One variant match is sufficient
      }
    }

    // ── Strip standard noise brackets ────────────────────────────────
    title = title
      .replace(/\s*[\(\[]\s*official\s*(?:music\s*)?(?:video|audio|mv|lyric[s]?\s*video|visualizer|clip)?\s*[\)\]]/gi, '')
      .replace(/\s*[\(\[]\s*lyric[s]?\s*(?:video)?\s*[\)\]]/gi, '')
      .replace(/\s*[\(\[]\s*(?:full\s*)?hd\s*[\)\]]/gi, '')
      .replace(/\s*[\(\[]\s*4k\s*[\)\]]/gi, '')
      .replace(/\s*[\(\[]\s*1080p\s*[\)\]]/gi, '')
      .replace(/\s*[\(\[]\s*720p\s*[\)\]]/gi, '')
      .replace(/\s*[\(\[]\s*audio\s*(?:only)?\s*[\)\]]/gi, '')
      .replace(/\s*[\(\[]\s*visualizer\s*[\)\]]/gi, '')
      .replace(/\s*[\(\[]\s*full\s*song\s*[\)\]]/gi, '')
      .replace(/\s*[\(\[]\s*video\s*song\s*[\)\]]/gi, '');

    // ── Clean up extra whitespace and trailing punctuation ────────────
    title = title.replace(/\s{2,}/g, ' ').replace(/[-–—|:,]\s*$/, '').trim();

    return { cleanTitle: title, isLive, isCover, isRemix, featuredArtists };
  },

  // ── Phase 3: Title Structure Parsing ─────────────────────────────────
  /**
   * Parse a cleaned title using delimiter heuristics.
   * Supports: em-dash (—), hyphen ( - ), pipe (|), colon (: )
   * @param {string} cleanTitle
   * @returns {{ candidateTitle, candidateArtist, titleStructureScore, hasDelimiter }}
   */
  parseTitle: function (cleanTitle) {
    if (!cleanTitle) return { candidateTitle: '', candidateArtist: '', titleStructureScore: 0, hasDelimiter: false };

    // ── Em-dash — (unicode, e.g. "Artist — Song") ─────────────────────
    if (cleanTitle.includes('—')) {
      const parts = cleanTitle.split('—').map(s => s.trim()).filter(Boolean);
      if (parts.length >= 2) {
        return { candidateTitle: parts.slice(1).join('—').trim(), candidateArtist: parts[0], titleStructureScore: 25, hasDelimiter: true };
      }
    }

    // ── Hyphen " - " (most common western: Artist - Song) ─────────────
    if (cleanTitle.includes(' - ')) {
      const parts = cleanTitle.split(' - ').map(s => s.trim());
      if (parts.length >= 2) {
        return { candidateTitle: parts.slice(1).join(' - ').trim(), candidateArtist: parts[0], titleStructureScore: 20, hasDelimiter: true };
      }
    }

    // ── En-dash " – " ─────────────────────────────────────────────────
    if (cleanTitle.includes(' – ')) {
      const parts = cleanTitle.split(' – ').map(s => s.trim());
      if (parts.length >= 2) {
        return { candidateTitle: parts.slice(1).join(' – ').trim(), candidateArtist: parts[0], titleStructureScore: 20, hasDelimiter: true };
      }
    }

    // ── Pipe | (South Asian: Song | Singer | Movie) ───────────────────
    if (cleanTitle.includes('|')) {
      const parts = cleanTitle.split('|').map(s => s.trim()).filter(Boolean);
      if (parts.length >= 2) {
        // South Asian convention: Part[0] = Song, Part[1] = Singer
        return { candidateTitle: parts[0], candidateArtist: parts[1], titleStructureScore: 18, hasDelimiter: true };
      }
    }

    // ── Colon ": " (e.g. "Adele: Hello") ──────────────────────────────
    if (cleanTitle.includes(': ')) {
      const parts = cleanTitle.split(': ').map(s => s.trim());
      if (parts.length >= 2) {
        return { candidateTitle: parts.slice(1).join(': ').trim(), candidateArtist: parts[0], titleStructureScore: 15, hasDelimiter: true };
      }
    }

    // ── No delimiter found ─────────────────────────────────────────────
    return { candidateTitle: cleanTitle, candidateArtist: '', titleStructureScore: 0, hasDelimiter: false };
  },

  // ── Phase 4: Signal Assembly (Main Entry Point) ───────────────────────
  /**
   * Full pipeline. Returns enriched candidates object with all signals.
   * @param {string} rawTitle
   * @param {string} rawChannel
   * @returns {{
   *   candidateTitle, candidateArtist,
   *   channelType, channelConfidence,
   *   titleStructureScore,
   *   isLive, isCover, isRemix, featuredArtists,
   *   signals
   * }}
   */
  extractCandidates: function (rawTitle, rawChannel) {
    const CT = this.CHANNEL_TYPE;
    const empty = {
      candidateTitle: '',
      candidateArtist: '',
      channelType: CT.UNKNOWN,
      channelConfidence: 0,
      titleStructureScore: 0,
      isLive: false,
      isCover: false,
      isRemix: false,
      featuredArtists: [],
      signals: []
    };
    if (!rawTitle) return empty;

    const signals = [];

    // ── Step 1: Classify channel ───────────────────────────────────────
    const channelResult = this.classifyChannel(rawChannel);
    signals.push({
      source: 'channel',
      type: channelResult.channelType,
      confidence: channelResult.channelConfidence,
      value: channelResult.extractedArtist
    });

    // ── Step 2: Normalize title ────────────────────────────────────────
    const { cleanTitle, isLive, isCover, isRemix, featuredArtists } = this.normalizeTitle(rawTitle);

    // ── Step 3: Parse title structure ──────────────────────────────────
    const titleResult = this.parseTitle(cleanTitle);
    if (titleResult.hasDelimiter) {
      signals.push({
        source: 'titleStructure',
        score: titleResult.titleStructureScore,
        artistFromTitle: titleResult.candidateArtist
      });
    }

    // ── Step 4: Determine final candidateArtist by priority ───────────
    let candidateArtist = '';

    if (channelResult.channelType === CT.TOPIC_AUTO || channelResult.channelType === CT.VEVO) {
      // Highest trust: use channel-derived artist regardless of title structure
      candidateArtist = channelResult.extractedArtist;
      signals.push({ source: 'channelPriority', reason: channelResult.channelType, value: candidateArtist });

    } else if (titleResult.candidateArtist && !this.isToxicString(titleResult.candidateArtist)) {
      // Title structure produces a clean artist
      candidateArtist = titleResult.candidateArtist;

      // Agreement bonus: if channel name also points to same artist, signal it
      if (channelResult.extractedArtist &&
        this._wordSimilarity(channelResult.extractedArtist, titleResult.candidateArtist) >= 0.5) {
        signals.push({ source: 'channelTitleAgreement', bonus: 10 });
      }

    } else if (channelResult.channelType === CT.OFFICIAL || channelResult.channelType === CT.UNKNOWN) {
      // Fall back to channel name when title has no structure
      candidateArtist = channelResult.extractedArtist;
    }
    // CT.LABEL and CT.LYRICS → no artist (candidateArtist remains '')

    // ── Step 5: Final cleanup ─────────────────────────────────────────
    // Strip any residual VEVO suffix (safety net)
    if (candidateArtist && candidateArtist.toLowerCase().endsWith('vevo')) {
      candidateArtist = candidateArtist.substring(0, candidateArtist.length - 4).trim();
    }

    return {
      candidateTitle: titleResult.candidateTitle.trim(),
      candidateArtist: candidateArtist.trim(),
      channelType: channelResult.channelType,
      channelConfidence: channelResult.channelConfidence,
      titleStructureScore: titleResult.titleStructureScore,
      isLive,
      isCover,
      isRemix,
      featuredArtists,
      signals
    };
  },


  // ── Utility: Backward-compatible toxic channel check ─────────────────
  isToxicChannel: function (channelName) {
    const result = this.classifyChannel(channelName);
    return result.channelType === this.CHANNEL_TYPE.LYRICS ||
      result.channelType === this.CHANNEL_TYPE.LABEL;
  },

  // ── Utility: Check if a string is a toxic/unusable artist name ───────
  isToxicString: function (str) {
    if (!str) return true;
    const lower = str.toLowerCase().trim();
    if (lower.length <= 1) return true;

    const exactToxic = [
      'vevo', 'topic', 'wfl', 'worldfamouslyrics', 'lyricworld',
      'lyricsvideo', 'unknown', 'official'
    ];
    if (exactToxic.includes(lower)) return true;

    const suffixToxic = ['vevo', 'records', 'lyrics', 'lyric', 'music', 'entertainment'];
    if (suffixToxic.some(s => lower.endsWith(s))) return true;

    if (this._TOXIC_LABELS.some(l => lower.includes(l))) return true;

    return false;
  },

  // ── Utility: Word-set overlap similarity (0.0–1.0) ───────────────────
  _wordSimilarity: function (a, b) {
    if (!a || !b) return 0;
    const normalize = s => s.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 0);
    const wordsA = new Set(normalize(a));
    const wordsB = new Set(normalize(b));
    if (wordsA.size === 0 || wordsB.size === 0) return 0;
    let intersection = 0;
    for (const w of wordsA) { if (wordsB.has(w)) intersection++; }
    return intersection / Math.max(wordsA.size, wordsB.size);
  }
};

window.YTLyricsMetadataInt = MetadataIntelligence;
