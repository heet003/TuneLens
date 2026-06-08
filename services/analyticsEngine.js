/**
 * Analytics Engine
 * Processes local storage history into advanced stats.
 * Features: Heatmap data, Discovery Metrics, Replay Analytics, Timeline Analytics
 */
const AnalyticsEngine = {
  getHistory: function () {
    return new Promise((resolve) => {
      chrome.storage.local.get(['music_history'], (result) => {
        resolve(result.music_history || []);
      });
    });
  },

  getStats: async function () {
    const history = await this.getHistory();
    const stats = {
      // Basic
      totalTime: 0,
      totalSessions: 0,
      distinctSongsCount: 0,
      uniqueArtistsCount: 0,
      todayTime: 0,
      thisWeekTime: 0,
      topArtist: 'N/A',
      topSong: 'N/A',
      artists: {},
      songs: {},
      daily: {},

      // Replay Analytics
      completedPlays: 0,
      skippedPlays: 0,
      partialPlays: 0,
      averageCompletionRate: 0,

      // Discovery Metrics
      newSongsToday: 0,
      newSongsThisWeek: 0,
      newSongsThisMonth: 0,
      newArtistsToday: 0,
      newArtistsThisWeek: 0,
      newArtistsThisMonth: 0,
      discoveryPercentage: 0,
      discoveryScore: 0,

      // Timeline Analytics
      hourlyDistribution: new Array(24).fill(0),
      weeklyDistribution: new Array(7).fill(0), // 0 = Mon, 6 = Sun
      mostActiveHour: null,
      mostActiveDay: null,
      peakListeningWindow: null,

      // Persona & Mood
      persona: null,
      secondaryTraits: [],
      primaryMood: null,
      secondaryMood: null,
      moodDistribution: {
        energetic: 0,
        happy: 0,
        reflective: 0,
        melancholic: 0,
        romantic: 0,
        aggressive: 0
      }
    };

    if (!history || history.length === 0) return stats;

    // Sort chronologically for accurate first-seen discovery metrics
    history.sort((a, b) => (a.startedAt || 0) - (b.startedAt || 0));

    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    // Time boundaries for discovery metrics
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

    const dayOfWeek = now.getDay();
    const diffToMonday = (dayOfWeek === 0 ? 6 : dayOfWeek - 1);
    const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    weekStart.setDate(weekStart.getDate() - diffToMonday);
    const startOfWeek = weekStart.getTime();

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

    const firstSeenSong = new Map();
    const firstSeenArtist = new Map();
    let validCompletionCount = 0;
    let totalCompletionPercentage = 0;

    history.forEach(session => {
      const dur = session.listenDuration || 0;
      if (dur < 2) return; // Skip noise

      stats.totalTime += dur;
      stats.totalSessions++;

      const startedAt = session.startedAt || new Date(session.date).getTime() || 0;
      const dateObj = new Date(startedAt);
      const dateKey = session.date || `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;

      const artist = (session.artist || 'Unknown').trim();
      const normArtist = artist.toLowerCase().replace(/\s+/g, ' ');
      const videoId = session.videoId || `${session.title}__${artist}`;

      // ── Replay Analytics ──────────────────────────────────────
      if (session.totalDuration && session.totalDuration > 0 && !isNaN(session.totalDuration)) {
        const completionPct = dur / session.totalDuration;
        validCompletionCount++;
        totalCompletionPercentage += Math.min(1, completionPct);
        if (completionPct >= 0.8) stats.completedPlays++;
        else if (completionPct <= 0.3) stats.skippedPlays++;
        else stats.partialPlays++;
      } else {
        // Fallback for legacy records without totalDuration
        stats.partialPlays++;
      }

      // ── Discovery Metrics ─────────────────────────────────────
      if (!firstSeenSong.has(videoId)) {
        firstSeenSong.set(videoId, startedAt);
        if (startedAt >= startOfToday) stats.newSongsToday++;
        if (startedAt >= startOfWeek) stats.newSongsThisWeek++;
        if (startedAt >= startOfMonth) stats.newSongsThisMonth++;
      }

      if (normArtist && normArtist !== 'unknown') {
        if (!firstSeenArtist.has(normArtist)) {
          firstSeenArtist.set(normArtist, startedAt);
          if (startedAt >= startOfToday) stats.newArtistsToday++;
          if (startedAt >= startOfWeek) stats.newArtistsThisWeek++;
          if (startedAt >= startOfMonth) stats.newArtistsThisMonth++;
        }
      }

      // ── Timeline Analytics ────────────────────────────────────
      const hour = dateObj.getHours();
      let day = dateObj.getDay();
      let isoDay = day === 0 ? 6 : day - 1; // 0=Mon, 6=Sun

      stats.hourlyDistribution[hour] += dur;
      stats.weeklyDistribution[isoDay] += dur;

      // ── Mood Aggregation ──────────────────────────────────────
      if (session.moodScores) {
        let weight = 1.0;
        let completionPct = 0.5;
        if (session.totalDuration && session.totalDuration > 0 && !isNaN(session.totalDuration)) {
          completionPct = dur / session.totalDuration;
        }
        if (completionPct >= 0.8) weight = 1.2;
        if (completionPct <= 0.3) weight = 0.5;

        // Late night boost
        if (hour >= 22 || hour <= 4) {
          stats.moodDistribution.reflective += (session.moodScores.reflective || 0) * weight * 1.2;
          stats.moodDistribution.melancholic += (session.moodScores.melancholic || 0) * weight * 1.2;
        } else {
          stats.moodDistribution.reflective += (session.moodScores.reflective || 0) * weight;
          stats.moodDistribution.melancholic += (session.moodScores.melancholic || 0) * weight;
        }

        stats.moodDistribution.energetic += (session.moodScores.energetic || 0) * weight;
        stats.moodDistribution.happy += (session.moodScores.happy || 0) * weight;
        stats.moodDistribution.romantic += (session.moodScores.romantic || 0) * weight;
        stats.moodDistribution.aggressive += (session.moodScores.aggressive || 0) * weight;
      }

      // ── Basic Aggregations ────────────────────────────────────
      if (dateKey === todayStr) stats.todayTime += dur;
      if (startedAt >= startOfWeek) stats.thisWeekTime += dur;

      if (!stats.daily[dateKey]) stats.daily[dateKey] = { time: 0, songs: new Set(), artists: new Set() };
      stats.daily[dateKey].time += dur;
      stats.daily[dateKey].songs.add(videoId);
      if (artist !== 'Unknown') stats.daily[dateKey].artists.add(artist);

      if (!stats.artists[artist]) stats.artists[artist] = { time: 0, plays: 0 };
      stats.artists[artist].time += dur;
      stats.artists[artist].plays++;

      if (!stats.songs[videoId]) {
        stats.songs[videoId] = {
          title: session.title || 'Unknown',
          artist: artist,
          time: 0,
          plays: 0
        };
      }
      stats.songs[videoId].time += dur;
      stats.songs[videoId].plays++;
    });

    // ── Post Processing ─────────────────────────────────────────
    stats.distinctSongsCount = firstSeenSong.size;
    stats.uniqueArtistsCount = firstSeenArtist.size;

    stats.averageCompletionRate = validCompletionCount > 0
      ? Math.round((totalCompletionPercentage / validCompletionCount) * 100)
      : 0;

    stats.discoveryPercentage = stats.totalSessions > 0
      ? Math.round((stats.distinctSongsCount / stats.totalSessions) * 100)
      : 0;

    // Normalize discovery score out of 100 (50% unique artists weight, 50% unique songs weight)
    const artistScore = stats.totalSessions > 0 ? (stats.uniqueArtistsCount / stats.totalSessions) * 50 : 0;
    const songScore = stats.totalSessions > 0 ? (stats.distinctSongsCount / stats.totalSessions) * 50 : 0;
    stats.discoveryScore = Math.min(100, Math.round(artistScore + songScore));

    // Timeline calculations
    let maxH = 0, hIdx = 0;
    for (let i = 0; i < 24; i++) { if (stats.hourlyDistribution[i] > maxH) { maxH = stats.hourlyDistribution[i]; hIdx = i; } }
    stats.mostActiveHour = maxH > 0 ? hIdx : null;

    let maxW = 0, wIdx = 0;
    for (let i = 0; i < 24; i++) {
      let sum = stats.hourlyDistribution[i] + stats.hourlyDistribution[(i + 1) % 24] + stats.hourlyDistribution[(i + 2) % 24];
      if (sum > maxW) { maxW = sum; wIdx = i; }
    }
    stats.peakListeningWindow = maxW > 0 ? `${this.formatHour(wIdx)} - ${this.formatHour((wIdx + 3) % 24)}` : null;

    const daysStr = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    let maxD = 0, dIdx = 0;
    for (let i = 0; i < 7; i++) { if (stats.weeklyDistribution[i] > maxD) { maxD = stats.weeklyDistribution[i]; dIdx = i; } }
    stats.mostActiveDay = maxD > 0 ? daysStr[dIdx] : null;

    // Top artist/song
    let maxArtistTime = 0;
    for (const [name, data] of Object.entries(stats.artists)) {
      if (data.time > maxArtistTime) {
        maxArtistTime = data.time;
        stats.topArtist = name;
      }
    }
    let maxSongTime = 0;
    for (const [, data] of Object.entries(stats.songs)) {
      if (data.time > maxSongTime) {
        maxSongTime = data.time;
        stats.topSong = data.title;
      }
    }

    // ── Persona Calculation ──────────────────────────────────────
    const personaScores = {
      'Night Owl': 0,
      'Explorer': 0,
      'Loop Addict': 0,
      'Deep Diver': 0,
      'Weekend Warrior': 0,
      'Casual Hopper': 0
    };

    if (stats.totalSessions > 0) {
      let lateNightTime = 0;
      for (let i = 22; i < 24; i++) lateNightTime += stats.hourlyDistribution[i];
      for (let i = 0; i <= 4; i++) lateNightTime += stats.hourlyDistribution[i];
      personaScores['Night Owl'] = stats.totalTime > 0 ? (lateNightTime / stats.totalTime) * 100 : 0;

      personaScores['Explorer'] = stats.discoveryPercentage;

      const playsPerSong = stats.totalSessions / Math.max(1, stats.distinctSongsCount);
      personaScores['Loop Addict'] = Math.min(100, (playsPerSong / 3) * 100);

      personaScores['Deep Diver'] = stats.averageCompletionRate;

      const weekendTime = stats.weeklyDistribution[5] + stats.weeklyDistribution[6];
      personaScores['Weekend Warrior'] = stats.totalTime > 0 ? (weekendTime / stats.totalTime) * 100 : 0;

      const skipRatio = stats.skippedPlays / stats.totalSessions;
      personaScores['Casual Hopper'] = skipRatio * 100;
    }

    const sortedPersonas = Object.entries(personaScores).sort((a, b) => b[1] - a[1]);
    if (sortedPersonas[0][1] > 0) {
      stats.persona = sortedPersonas[0][0];
      stats.secondaryTraits = [sortedPersonas[1][0], sortedPersonas[2][0]].filter(t => personaScores[t] > 0);
    }

    // ── Mood Distribution Normalization ──────────────────────────
    let totalMoodScore = 0;
    for (const score of Object.values(stats.moodDistribution)) {
      totalMoodScore += score;
    }

    if (totalMoodScore > 0) {
      for (const mood in stats.moodDistribution) {
        stats.moodDistribution[mood] = Math.round((stats.moodDistribution[mood] / totalMoodScore) * 100);
      }
      const sortedMoods = Object.entries(stats.moodDistribution).sort((a, b) => b[1] - a[1]);
      if (sortedMoods[0][1] > 0) stats.primaryMood = sortedMoods[0][0];
      if (sortedMoods[1][1] > 0) stats.secondaryMood = sortedMoods[1][0];
    }

    return stats;
  },

  formatDuration: function (seconds) {
    if (!seconds || seconds < 1) return '0s';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (hrs > 0) return `${hrs}h ${mins}m`;
    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs}s`;
  },

  formatHour: function (hour) {
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const h = hour % 12 || 12;
    return `${h} ${ampm}`;
  }
};

window.YTLyricsAnalytics = AnalyticsEngine;
