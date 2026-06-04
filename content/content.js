/**
 * Main Orchestrator — Content Script Entry Point
 * Bug 1, 5 Fixed:
 *   - reset() called on every video change to clear stale lyrics immediately
 *   - setSongMeta() called before API fetch so title always shows in header
 *   - setSongMeta() also called on error so header is never stuck on "Loading..."
 */
(function() {
  YTLyricsLogger.success('Content script loaded');

  let syncInterval = null;

  function startSyncLoop() {
    if (syncInterval) clearInterval(syncInterval);

    syncInterval = setInterval(() => {
      const currentTime = YTLyricsDetector.getCurrentTime();
      YTLyricsOverlay.syncLyrics(currentTime);

      // Update Now Playing badge based on video play state
      const videoEl = document.querySelector('video.html5-main-video');
      if (videoEl) {
        YTLyricsOverlay.setPlayingState(!videoEl.paused);
      }

      // Update debug info (only rendered if debug mode is on)
      const activeLine = YTLyricsOverlay.activeLyricIndex;
      let activeText = '—';
      let nextText = '—';

      if (activeLine >= 0 && YTLyricsOverlay.parsedLyrics[activeLine]) {
        activeText = YTLyricsOverlay.parsedLyrics[activeLine].text || '(empty line)';
        if (YTLyricsOverlay.parsedLyrics[activeLine + 1]) {
          nextText = YTLyricsOverlay.parsedLyrics[activeLine + 1].text || '(empty line)';
        }
      }

      YTLyricsOverlay.updateDebugInfo({
        'Video ID': YTLyricsDetector.getVideoId() || 'none',
        'Time': currentTime.toFixed(2) + 's',
        'Offset': (YTLyricsOverlay.offset > 0 ? '+' : '') + YTLyricsOverlay.offset.toFixed(1) + 's',
        'Active Line': activeText,
        'Next Line': nextText
      });
    }, 500);
  }

  function handleVideoChange(videoInfo) {
    YTLyricsLogger.success('New video detected:', videoInfo);

    // Step 1: Build DOM if not yet built, then show
    YTLyricsOverlay.init();
    YTLyricsOverlay.show();

    // Step 2: RESET all stale state immediately (Bug 1 & 4 Fix)
    YTLyricsOverlay.reset(videoInfo.videoId);

    // Step 3: Extract clean query params
    let queryTitle = YTLyricsDetector.cleanTitle(videoInfo.title || '');
    let queryArtist = videoInfo.channel || '';

    // If title has "Artist - Song" pattern, split it
    if (queryTitle.includes(' - ')) {
      const parts = queryTitle.split(' - ');
      if (parts.length >= 2) {
        queryArtist = parts[0].trim();
        queryTitle = parts.slice(1).join(' - ').trim();
      }
    }

    // Step 4: ALWAYS show song name in header immediately (Bug 5 Fix)
    // Use cleaned title and extracted artist so header is populated before API call
    YTLyricsOverlay.setSongMeta(
      queryTitle || videoInfo.title || 'Unknown Song',
      queryArtist || videoInfo.channel || ''
    );

    YTLyricsOverlay.displayMessage('Searching for lyrics...');
    YTLyricsOverlay.updateDebugInfo({
      'Status': 'Fetching lyrics...',
      'Query Title': queryTitle,
      'Query Artist': queryArtist
    });

    // Step 5: Initialize listening tracker
    if (window.YTLyricsTracker) {
      YTLyricsTracker.init({
        videoId: videoInfo.videoId,
        title: queryTitle || videoInfo.title,
        channel: queryArtist || videoInfo.channel
      });
    }

    // Step 6: Fetch lyrics
    const fetchStart = performance.now();
    YTLyricsService.searchLyrics(queryTitle, queryArtist)
      .then(lyricsData => {
        const fetchMs = (performance.now() - fetchStart).toFixed(0);
        YTLyricsLogger.success('Lyrics found!', lyricsData.title, 'by', lyricsData.artist);

        YTLyricsOverlay.displayLyrics(lyricsData);
        YTLyricsOverlay.updateDebugInfo({
          'Status': 'Syncing',
          'API Time': fetchMs + 'ms',
          'Lines': YTLyricsOverlay.parsedLyrics.length
        });

        startSyncLoop();
      })
      .catch(error => {
        YTLyricsLogger.error('Lyrics fetch failed:', error.message);

        // Bug 5 Fix: header already shows correct title — just update lyrics area
        YTLyricsOverlay.displayMessage(
          `<span style="font-size:15px">Lyrics not found</span><br>
           <small style="opacity:0.6">${error.message}</small>`
        );
        YTLyricsOverlay.updateDebugInfo({
          'Status': 'No lyrics',
          'Error': error.message
        });
      });
  }

  function init() {
    YTLyricsLogger.log('Initializing TuneLens extension');
    YTLyricsVideoObserver.init(handleVideoChange);
  }

  // Allow YouTube SPA to finish mounting before scanning
  setTimeout(init, 1000);
})();
