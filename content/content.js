/**
 * Main Orchestrator — Content Script Entry Point
 * Bug 1, 5 Fixed:
 *   - reset() called on every video change to clear stale lyrics immediately
 *   - setSongMeta() called before API fetch so title always shows in header
 *   - setSongMeta() also called on error so header is never stuck on "Loading..."
 */
(function () {
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

  // Cancellation token: tracks the most recently requested video.
  // Any LRCLIB response from a superseded video is silently discarded.
  let activeVideoId = null;

  function handleVideoChange(videoInfo) {
    YTLyricsLogger.success('New video detected:', videoInfo);

    // Update the cancellation token FIRST before any async work
    activeVideoId = videoInfo.videoId;
    const myVideoId = videoInfo.videoId;

    // Step 1: Build DOM if not yet built, then show
    YTLyricsOverlay.init();
    YTLyricsOverlay.show();

    // Step 2: RESET all stale state immediately (Bug 1 & 4 Fix)
    YTLyricsOverlay.reset(videoInfo.videoId);

    // Step 3: Extract clean query params using Metadata Intelligence Layer
    let queryTitle = videoInfo.title || '';
    let queryArtist = videoInfo.channel || '';

    if (window.YTLyricsMetadataInt) {
      const candidates = window.YTLyricsMetadataInt.extractCandidates(queryTitle, queryArtist);
      queryTitle = candidates.candidateTitle;
      queryArtist = candidates.candidateArtist;
    } else {
      queryTitle = YTLyricsDetector.cleanTitle(queryTitle);
    }

    // Step 4: ALWAYS show song name in header immediately (Bug 5 Fix)
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
        // Race condition guard: if the user navigated away, discard this stale response
        if (activeVideoId !== myVideoId) {
          YTLyricsLogger.warn('[Content] Stale LRCLIB response discarded for video:', myVideoId);
          return;
        }

        const fetchMs = (performance.now() - fetchStart).toFixed(0);
        YTLyricsLogger.success('Lyrics found!', lyricsData.title, 'by', lyricsData.artist,
          `| confidence: ${lyricsData.confidence} | verified: ${lyricsData.isVerified}`);

        // Always display lyrics in the overlay regardless of confidence
        YTLyricsOverlay.displayLyrics(lyricsData);
        YTLyricsOverlay.updateDebugInfo({
          'Status': lyricsData.isVerified ? 'Syncing (Verified)' : 'Syncing (Ambiguous)',
          'API Time': fetchMs + 'ms',
          'Confidence': lyricsData.confidence,
          'Lines': YTLyricsOverlay.parsedLyrics.length
        });

        // Only update persistent session metadata when confidence is sufficient
        if (window.YTLyricsTracker) {
          if (lyricsData.isVerified) {
            YTLyricsTracker.updateSessionMetadata({
              title: lyricsData.title,
              artist: lyricsData.artist,
              confidence: lyricsData.confidence
            });
          } else {
            // Mark session as LRCLIB_AMBIGUOUS without overwriting title/artist
            YTLyricsTracker.markSessionAmbiguous(lyricsData.confidence);
            YTLyricsLogger.warn('[Content] AMBIGUOUS match — lyrics shown but metadata preserved:', lyricsData.title, 'vs', queryTitle);
          }
        }

        // Mood analysis: run on verified metadata or high-confidence ambiguous results
        if ((lyricsData.isVerified || lyricsData.confidence >= 60) && window.YTLyricsMoodEngine && lyricsData.plainLyrics) {
          const moodScores = YTLyricsMoodEngine.analyzeLyrics(lyricsData.plainLyrics);
          if (window.YTLyricsTracker) {
            YTLyricsTracker.setSessionMood(moodScores);
          }
        }

        startSyncLoop();
      })
      .catch(error => {
        // Race condition guard
        if (activeVideoId !== myVideoId) return;

        YTLyricsLogger.error('Lyrics fetch failed:', error.message);
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
