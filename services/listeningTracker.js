/**
 * Listening Tracker — Wall-Clock Based (Bug 3 Fixed)
 * Uses wall-clock elapsed time instead of video.currentTime delta
 * to avoid floating-point drift and false "listened" time from seeking.
 *
 * [MUSIC-ANALYTICS]
 */
const ListeningTracker = {
  currentSession: null,
  heartbeatInterval: null,
  videoElement: null,
  playStartWallTime: null, // Wall-clock timestamp when play started

  init: function (videoInfo) {
    YTLyricsLogger.log('[MUSIC-ANALYTICS] Initializing tracker for', videoInfo);
    this.endCurrentSession(); // Save + end any previous session cleanly

    this.videoElement = document.querySelector('video.html5-main-video');
    if (!this.videoElement) {
      YTLyricsLogger.warn('[MUSIC-ANALYTICS] No video element found, will retry...');
      // Retry once after 2s in case the player hasn't mounted yet
      setTimeout(() => {
        this.videoElement = document.querySelector('video.html5-main-video');
        if (this.videoElement) this._startTracking(videoInfo);
        else YTLyricsLogger.error('[MUSIC-ANALYTICS] Video element not found after retry');
      }, 2000);
      return;
    }
    this._startTracking(videoInfo);
  },

  _startTracking: function (videoInfo) {
    this.currentSession = {
      id: `${Date.now()}_${videoInfo.videoId}`,
      videoId: videoInfo.videoId,
      title: videoInfo.title,
      artist: videoInfo.channel || 'Unknown',
      channel: videoInfo.channel || 'Unknown',
      startedAt: Date.now(),
      endedAt: Date.now(),
      listenDuration: 0, // stored as integer seconds
      totalDuration: 0,  // Added for Replay Analytics
      moodScores: null,  // Added for Mood Analysis
      date: new Date().toISOString().split('T')[0],
      url: window.location.href
    };

    // If video is already playing when we init, start the wall clock now
    if (!this.videoElement.paused) {
      this.playStartWallTime = Date.now();
    }

    this.bindEvents();
    this.startHeartbeat();
    YTLyricsLogger.success('[MUSIC-ANALYTICS] Tracking started:', this.currentSession.title);
  },

  bindEvents: function () {
    // Remove any stale listeners first
    this.unbindEvents();

    this._onPlay = () => this.handlePlay();
    this._onPause = () => this.handlePause();
    this._onEnded = () => this.handleEnded();
    this._onBeforeUnload = () => this.endCurrentSession();

    this.videoElement.addEventListener('play', this._onPlay);
    this.videoElement.addEventListener('pause', this._onPause);
    this.videoElement.addEventListener('ended', this._onEnded);
    window.addEventListener('beforeunload', this._onBeforeUnload);
  },

  unbindEvents: function () {
    if (this.videoElement && this._onPlay) {
      this.videoElement.removeEventListener('play', this._onPlay);
      this.videoElement.removeEventListener('pause', this._onPause);
      this.videoElement.removeEventListener('ended', this._onEnded);
    }
    if (this._onBeforeUnload) {
      window.removeEventListener('beforeunload', this._onBeforeUnload);
    }
  },

  handlePlay: function () {
    // Record the wall-clock time when play begins
    this.playStartWallTime = Date.now();
    YTLyricsLogger.log('[MUSIC-ANALYTICS] Playback started, wall clock recording');
  },

  handlePause: function () {
    // Accumulate elapsed seconds since last play event
    this._accumulateElapsed();
    this.saveSession();
    YTLyricsLogger.log('[MUSIC-ANALYTICS] Paused, listenDuration:', this.currentSession?.listenDuration);
  },

  handleEnded: function () {
    // Track ends naturally — accumulate time, save, then signal video change
    YTLyricsLogger.log('[MUSIC-ANALYTICS] Video ended naturally');
    this._accumulateElapsed();
    this.saveSession();
    // Trigger video observer to recheck for the next video
    if (window.YTLyricsVideoObserver) {
      setTimeout(() => YTLyricsVideoObserver.checkVideoState(), 500);
    }
  },

  _accumulateElapsed: function () {
    if (!this.currentSession || this.playStartWallTime === null) return;
    const elapsedSeconds = Math.round((Date.now() - this.playStartWallTime) / 1000);
    if (elapsedSeconds > 0) {
      this.currentSession.listenDuration += elapsedSeconds;
      this.currentSession.endedAt = Date.now();
      if (this.videoElement && !isNaN(this.videoElement.duration) && this.videoElement.duration !== Infinity) {
        this.currentSession.totalDuration = Math.round(this.videoElement.duration);
      }
    }
    this.playStartWallTime = null; // Reset for next play event
  },

  startHeartbeat: function () {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    this.heartbeatInterval = setInterval(() => {
      // Sanity check: If YouTube destroyed the video element during autoplay, grab the new one.
      if (this.videoElement && !this.videoElement.isConnected) {
        YTLyricsLogger.warn('[MUSIC-ANALYTICS] Video element detached! Re-binding to new element.');
        const newVideoEl = document.querySelector('video.html5-main-video');
        if (newVideoEl) {
          this.videoElement = newVideoEl;
          this.bindEvents(); // Rebind play/pause/ended to the new active element
        }
      }

      // Accumulate elapsed without resetting playStartWallTime (mid-play save)
      if (this.currentSession && this.playStartWallTime !== null) {
        const elapsed = Math.round((Date.now() - this.playStartWallTime) / 1000);
        if (elapsed > 0) {
          this.currentSession.listenDuration += elapsed;
          this.currentSession.endedAt = Date.now();
          if (this.videoElement && !isNaN(this.videoElement.duration) && this.videoElement.duration !== Infinity) {
            this.currentSession.totalDuration = Math.round(this.videoElement.duration);
          }
          // Reset wall clock so next heartbeat doesn't double-count
          this.playStartWallTime = Date.now();
        }
      }
      this.saveSession();
    }, 5000);
  },

  setSessionMood: function (scores) {
    if (this.currentSession) {
      this.currentSession.moodScores = scores;
      this.saveSession();
    }
  },

  saveSession: function () {
    if (!this.currentSession || this.currentSession.listenDuration < 2) return;

    // Snapshot to avoid async mutation issues
    const sessionSnapshot = { ...this.currentSession };

    chrome.storage.local.get(['music_history'], (result) => {
      let history = result.music_history || [];
      const index = history.findIndex(s => s.id === sessionSnapshot.id);
      if (index >= 0) {
        history[index] = sessionSnapshot;
      } else {
        history.push(sessionSnapshot);
      }
      chrome.storage.local.set({ music_history: history }, () => {
        YTLyricsLogger.log('[MUSIC-ANALYTICS] Session saved. Duration:', sessionSnapshot.listenDuration + 's');
      });
    });
  },

  endCurrentSession: function () {
    if (this.currentSession) {
      this._accumulateElapsed();
      this.saveSession();
      YTLyricsLogger.log('[MUSIC-ANALYTICS] Session ended:', this.currentSession.title);
      this.currentSession = null;
    }
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    this.playStartWallTime = null;
    this.unbindEvents();
  }
};

window.YTLyricsTracker = ListeningTracker;
