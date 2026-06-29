
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

  // Phase 2 Search State Management
  let automaticLyricsData = null;
  let manualLyricsData = null;
  let activeLyricsSource = 'AUTO';

  // BUG-06: Generation counter — prevents stale in-flight manual search
  // promises from toggling a freshly-reopened search form.
  let manualSearchGeneration = 0;

  function handleVideoChange(videoInfo) {
    YTLyricsLogger.success('New video detected:', videoInfo);

    // BUG-09: Stop any stale sync loop from the previous video immediately.
    if (syncInterval) {
      clearInterval(syncInterval);
      syncInterval = null;
    }

    // Update the cancellation token FIRST before any async work
    activeVideoId = videoInfo.videoId;
    const myVideoId = videoInfo.videoId;

    // BUG-06: Invalidate in-flight manual searches from the previous video.
    manualSearchGeneration++;

    // Reset Phase 2 search state
    automaticLyricsData = null;
    manualLyricsData = null;
    activeLyricsSource = 'AUTO';

    // Step 1: Build DOM if not yet built, then show
    YTLyricsOverlay.init();
    YTLyricsOverlay.show();

    // Step 2: RESET all stale state immediately (Bug 1 & 4 Fix)
    YTLyricsOverlay.reset(videoInfo.videoId);

    // Step 3: Extract clean query params using Metadata Intelligence Layer
    let queryTitle = videoInfo.title || '';
    let queryArtist = videoInfo.channel || '';
    let channelContext = {}; // { channelType, channelConfidence } for LRCLIB scoring
    let metaHints = {};     // { isLive, isCover, isRemix, featuredArtists } for session schema

    if (window.YTLyricsMetadataInt) {
      const result = window.YTLyricsMetadataInt.extractCandidates(queryTitle, queryArtist);
      channelContext = {
        channelType: result.channelType,
        channelConfidence: result.channelConfidence
      };
      metaHints = {
        isLive: result.isLive,
        isCover: result.isCover,
        isRemix: result.isRemix,
        featuredArtists: result.featuredArtists
      };

      if (result.candidateTitle) {
        queryTitle = result.candidateTitle;
        queryArtist = result.candidateArtist || queryArtist;
      }
    } else {
      queryTitle = YTLyricsDetector.cleanTitle(queryTitle);
    }

    // Step 4: ALWAYS show song name in header immediately (Bug 5 Fix)
    YTLyricsOverlay.setSongMeta(
      queryTitle || videoInfo.title || 'Unknown Song',
      queryArtist || videoInfo.channel || ''
    );

    // Pass prefill values to the Manual Search form
    YTLyricsOverlay.setSearchInitialValues(queryTitle, queryArtist);

    // Step 5: Bind Manual Search Orchestrator for this video session
    YTLyricsOverlay.onManualSearch = (title, artist) => {
      YTLyricsOverlay.setSearchState('loading');

      // BUG-06: Capture current generation. Any result from an older generation is discarded.
      const myGeneration = ++manualSearchGeneration;

      const manualFetchStart = performance.now();
      YTLyricsService.searchLyrics(title, artist, channelContext)
        .then(lyricsData => {
          if (activeVideoId !== myVideoId) return; // stale video guard
          if (manualSearchGeneration !== myGeneration) return; // BUG-06: stale search guard

          const fetchMs = (performance.now() - manualFetchStart).toFixed(0);
          YTLyricsLogger.success('Manual Lyrics found!', lyricsData.title, 'by', lyricsData.artist);

          manualLyricsData = lyricsData;
          activeLyricsSource = 'MANUAL';
          lyricsData.displayArtist = lyricsData.isVerified ? lyricsData.artist : queryArtist;

          YTLyricsOverlay.displayLyrics(lyricsData);
          startSyncLoop(); // BUG-01: start sync loop for manually found lyrics

          YTLyricsOverlay.updateDebugInfo({
            'Status': lyricsData.isVerified ? 'Syncing (Manual)' : 'Syncing (Manual Ambiguous)',
            'API Time': fetchMs + 'ms',
            'Confidence': lyricsData.confidence,
            'Lines': YTLyricsOverlay.parsedLyrics.length,
            'Candidate': 'MANUAL'
          });

          // Close search form and reset its state
          YTLyricsOverlay.toggleSearchMode();
          YTLyricsOverlay.setSearchState('idle'); // BUG-02: reset form to idle after success

          // BUG-03: Persist manual lyrics to chrome.storage.local so they survive navigation
          chrome.storage.local.get(['manual_lyrics_cache'], (result) => {
            const cache = result.manual_lyrics_cache || {};
            cache[myVideoId] = lyricsData;
            // Evict oldest entry when cache exceeds 50 videos
            const keys = Object.keys(cache);
            if (keys.length > 50) delete cache[keys[0]];
            chrome.storage.local.set({ manual_lyrics_cache: cache });
          });

          if (window.YTLyricsTracker) {
            if (lyricsData.isVerified) {
              YTLyricsTracker.updateSessionMetadata({
                title: lyricsData.title,
                artist: lyricsData.artist,
                confidence: lyricsData.confidence,
                artistValidated: lyricsData.artistValidated,
                source: 'LRCLIB_VERIFIED_MANUAL'
              });
            } else {
              YTLyricsTracker.markSessionAmbiguous(lyricsData.confidence);
            }
          }

          if ((lyricsData.isVerified || lyricsData.confidence >= 60) && window.YTLyricsMoodEngine && lyricsData.plainLyrics) {
            const moodScores = YTLyricsMoodEngine.analyzeLyrics(lyricsData.plainLyrics);
            if (window.YTLyricsTracker) YTLyricsTracker.setSessionMood(moodScores);
          }
        })
        .catch(error => {
          if (activeVideoId !== myVideoId) return;
          if (manualSearchGeneration !== myGeneration) return; // BUG-06
          YTLyricsOverlay.setSearchState('error', error.message);
        });
    };

    // Step 6: Initialize listening tracker with full metadata context
    if (window.YTLyricsTracker) {
      YTLyricsTracker.init({
        videoId: videoInfo.videoId,
        title: queryTitle || videoInfo.title,
        channel: queryArtist || videoInfo.channel,
        channelType: channelContext.channelType,
        isLive: metaHints.isLive,
        isCover: metaHints.isCover,
        isRemix: metaHints.isRemix,
        featuredArtists: metaHints.featuredArtists
      });
    }

    // Step 7: BUG-03 — Check persistent manual lyrics cache BEFORE running auto search.
    // If a manual result exists for this video, restore it and skip the LRCLIB call.
    chrome.storage.local.get(['manual_lyrics_cache'], (cacheResult) => {
      // Guard: video changed while the storage read was in progress
      if (activeVideoId !== myVideoId) return;

      const cache = cacheResult.manual_lyrics_cache || {};
      const cachedLyrics = cache[myVideoId];

      if (cachedLyrics) {
        // Cache HIT: restore manual lyrics, skip automatic search
        YTLyricsLogger.success('[Content] Manual cache hit for', myVideoId, '— skipping auto search.');
        manualLyricsData = cachedLyrics;
        activeLyricsSource = 'MANUAL';
        cachedLyrics.displayArtist = cachedLyrics.isVerified ? cachedLyrics.artist : queryArtist;

        YTLyricsOverlay.displayLyrics(cachedLyrics);
        startSyncLoop();

        YTLyricsOverlay.updateDebugInfo({
          'Status': 'Syncing (Manual Cache)',
          'Confidence': cachedLyrics.confidence,
          'Lines': YTLyricsOverlay.parsedLyrics.length,
          'Candidate': 'MANUAL_CACHE'
        });

        // Restore tracker metadata for this session
        if (window.YTLyricsTracker && cachedLyrics.isVerified) {
          YTLyricsTracker.updateSessionMetadata({
            title: cachedLyrics.title,
            artist: cachedLyrics.artist,
            confidence: cachedLyrics.confidence,
            artistValidated: cachedLyrics.artistValidated,
            source: 'LRCLIB_VERIFIED_MANUAL'
          });
        }
        return; // Skip automatic LRCLIB search entirely
      }

      // Cache MISS: run automatic LRCLIB search
      YTLyricsOverlay.displayMessage('Searching for lyrics...');
      YTLyricsOverlay.updateDebugInfo({
        'Status': 'Fetching lyrics...',
        'Query Title': queryTitle,
        'Query Artist': queryArtist,
        'Channel Type': channelContext.channelType || 'UNKNOWN'
      });

      const fetchStart = performance.now();

      const processLyrics = (lyricsData, searchType) => {
        // Race condition guard: discard stale response if video changed
        if (activeVideoId !== myVideoId) {
          YTLyricsLogger.warn('[Content] Stale LRCLIB response discarded for video:', myVideoId);
          return;
        }

        const fetchMs = (performance.now() - fetchStart).toFixed(0);
        YTLyricsLogger.success('Lyrics found!', lyricsData.title, 'by', lyricsData.artist,
          `| confidence: ${lyricsData.confidence} | verified: ${lyricsData.isVerified} | artistValidated: ${lyricsData.artistValidated} | fallback: ${searchType === 'TITLE_ONLY'}`);

        // Cache the automatic response
        automaticLyricsData = lyricsData;

        // Only update UI if the user hasn't switched to manual mode in the meantime
        if (activeLyricsSource === 'AUTO') {
          // For AMBIGUOUS results, preserve the YouTube artist in the header
          lyricsData.displayArtist = lyricsData.isVerified ? lyricsData.artist : queryArtist;

          YTLyricsOverlay.displayLyrics(lyricsData);
          YTLyricsOverlay.updateDebugInfo({
            'Status': lyricsData.isVerified ? 'Syncing (Verified)' : 'Syncing (Ambiguous)',
            'API Time': fetchMs + 'ms',
            'Confidence': lyricsData.confidence,
            'Lines': YTLyricsOverlay.parsedLyrics.length,
            'Search': searchType
          });

          if (window.YTLyricsTracker) {
            if (lyricsData.isVerified) {
              YTLyricsTracker.updateSessionMetadata({
                title: lyricsData.title,
                artist: lyricsData.artist,
                confidence: lyricsData.confidence,
                artistValidated: lyricsData.artistValidated,
                source: 'LRCLIB_VERIFIED'
              });
            } else {
              // Mark session as LRCLIB_AMBIGUOUS without overwriting title/artist
              YTLyricsTracker.markSessionAmbiguous(lyricsData.confidence);
              YTLyricsLogger.warn('[Content] AMBIGUOUS match — metadata preserved:', lyricsData.title, 'vs', queryTitle);
            }
          }

          if ((lyricsData.isVerified || lyricsData.confidence >= 60) && window.YTLyricsMoodEngine && lyricsData.plainLyrics) {
            const moodScores = YTLyricsMoodEngine.analyzeLyrics(lyricsData.plainLyrics);
            if (window.YTLyricsTracker) YTLyricsTracker.setSessionMood(moodScores);
          }

          startSyncLoop(); // BUG-04: startSyncLoop is now inside the AUTO guard
        }
      };

      const handleError = (error) => {
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
      };

      // Perform Title + Artist search
      YTLyricsService.searchLyrics(queryTitle, queryArtist, channelContext)
        .then(data => processLyrics(data, 'PRIMARY'))
        .catch(error => {
          // If primary fails and we have an artist, fallback to Title Only
          if (queryArtist && activeVideoId === myVideoId) {
            YTLyricsLogger.log('[Content] Primary search failed, attempting Title Only fallback...');
            YTLyricsService.searchLyrics(queryTitle, null, channelContext)
              .then(data => processLyrics(data, 'TITLE_ONLY'))
              .catch(handleError);
          } else {
            handleError(error);
          }
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
