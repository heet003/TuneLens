/**
 * Phase 3: YouTube Detector
 * Handles extraction of video info from YouTube's dynamic DOM.
 */
const YouTubeDetector = {
  getVideoId: function() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('v');
  },
  
  getTitle: function() {
    const titleEl = document.querySelector('h1.ytd-watch-metadata yt-formatted-string') || 
                    document.querySelector('h1.title yt-formatted-string') ||
                    document.querySelector('#title h1 yt-formatted-string');
    if (titleEl && titleEl.textContent) {
      return titleEl.textContent;
    }

    // Fallback to document.title during heavy SPA transitions
    if (document.title) {
      let docTitle = document.title.replace(/ - YouTube$/, '').trim();
      // Remove unread notification counts e.g., "(3) Song Title"
      docTitle = docTitle.replace(/^\(\d+\)\s*/, '');
      if (docTitle && docTitle !== 'YouTube') return docTitle;
    }
    
    return null;
  },

  getChannelName: function() {
    const channelEl = document.querySelector('ytd-channel-name yt-formatted-string a') || 
                      document.querySelector('#upload-info #channel-name a') ||
                      document.querySelector('ytd-video-owner-renderer a.yt-simple-endpoint');
    return channelEl ? channelEl.textContent : null;
  },

  getCurrentTime: function() {
    const videoElement = document.querySelector('video.html5-main-video');
    return videoElement ? videoElement.currentTime : 0;
  },
  
  cleanTitle: function(title) {
    if (!title) return '';
    let cleaned = title.replace(/\(official.*?\)/i, '')
                       .replace(/\[official.*?\]/i, '')
                       .replace(/\(lyric.*?\)/i, '')
                       .replace(/\[lyric.*?\]/i, '')
                       .replace(/\(music video\)/i, '')
                       .replace(/ft\..*/i, '')
                       .replace(/feat\..*/i, '');
    return cleaned.trim();
  }
};

window.YTLyricsDetector = YouTubeDetector;
