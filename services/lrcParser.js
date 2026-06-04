/**
 * Phase 8: LRC Parser
 * Parses synchronized lyrics in [mm:ss.xx] format.
 */
const LrcParser = {
  parse: function(lrcString) {
    if (!lrcString) return [];
    
    const lines = lrcString.split('\n');
    const parsedLyrics = [];
    const timeRegex = /\[(\d{2}):(\d{2}(?:\.\d{2,3})?)\]/g;

    lines.forEach(line => {
      let match;
      const text = line.replace(timeRegex, '').trim();
      
      timeRegex.lastIndex = 0;
      
      while ((match = timeRegex.exec(line)) !== null) {
        const minutes = parseInt(match[1], 10);
        const seconds = parseFloat(match[2]);
        const timeInSeconds = (minutes * 60) + seconds;
        
        parsedLyrics.push({
          time: timeInSeconds,
          text: text
        });
      }
    });

    parsedLyrics.sort((a, b) => a.time - b.time);
    return parsedLyrics;
  }
};

window.YTLyricsParser = LrcParser;
