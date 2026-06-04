/**
 * Video Observer — SPA Navigation + Autoplay Detection (Bug 1 & Sync Fix)
 * Detects video changes via URL params and the yt-page-data-updated event.
 * Uses robust polling to ensure YouTube's heavy DOM is fully loaded 
 * before dispatching the new video metadata.
 */
const VideoObserver = {
  currentVideoId: null,
  previousTitle: null,
  onVideoChangeCallback: null,
  _videoEndedListener: null,
  _pollingTimeout: null,

  init: function(callback) {
    this.onVideoChangeCallback = callback;
    YTLyricsLogger.log('Initializing Video Observer');

    // Check immediately on load
    this.checkVideoState();

    // YouTube SPA navigation events
    window.addEventListener('yt-navigate-finish', () => {
      YTLyricsLogger.log('yt-navigate-finish fired, checking state...');
      this.checkVideoState();
    });
    
    window.addEventListener('yt-page-data-updated', () => {
      YTLyricsLogger.log('yt-page-data-updated fired, checking state...');
      this.checkVideoState();
    });

    // Fallback polling every 2s for edge cases
    setInterval(() => this.checkVideoState(), 2000);
  },

  checkVideoState: function() {
    if (!window.location.pathname.startsWith('/watch')) {
      if (window.YTLyricsOverlay) YTLyricsOverlay.hide();
      return;
    }

    const newVideoId = YTLyricsDetector.getVideoId();
    if (newVideoId && newVideoId !== this.currentVideoId) {
      const oldId = this.currentVideoId;
      this.currentVideoId = newVideoId;
      
      YTLyricsLogger.log('Video changed in URL', { oldId, newId: newVideoId });

      // Attach 'ended' listener to new video element for autoplay detection
      this._attachVideoEndedListener(newVideoId);
      
      // Start polling for the DOM to update
      this._waitForDOMUpdate(newVideoId);
    }
  },

  _waitForDOMUpdate: function(targetVideoId, attempts = 0) {
    if (this._pollingTimeout) clearTimeout(this._pollingTimeout);

    const title = YTLyricsDetector.getTitle();
    const channel = YTLyricsDetector.getChannelName();

    // The DOM is considered ready if:
    // 1. We have a title.
    // 2. It is different from the previous song's title OR we've exhausted our attempts (10 = 5 seconds) 
    //    meaning it might actually be a song with the exact same title, or the DOM is just slow.
    const isReady = title && (title !== this.previousTitle || attempts >= 10);

    if (isReady) {
      this.previousTitle = title; // Lock in the new title
      
      YTLyricsLogger.log('DOM Ready, dispatching video change:', { targetVideoId, title, channel });
      
      if (this.onVideoChangeCallback) {
        this.onVideoChangeCallback({
          videoId: targetVideoId,
          title: title,
          channel: channel
        });
      }
    } else {
      // DOM hasn't updated yet. Poll again in 500ms.
      this._pollingTimeout = setTimeout(() => {
        // Double check the videoId hasn't changed while we were waiting
        if (this.currentVideoId === targetVideoId) {
          this._waitForDOMUpdate(targetVideoId, attempts + 1);
        }
      }, 500);
    }
  },

  _attachVideoEndedListener: function(videoId) {
    // Remove any previous ended listener to prevent duplicates
    if (this._videoEndedListener) {
      const oldVideo = document.querySelector('video.html5-main-video');
      if (oldVideo) oldVideo.removeEventListener('ended', this._videoEndedListener);
    }

    // Wait for the video element to be available
    const attachWhenReady = (attempts = 0) => {
      const videoEl = document.querySelector('video.html5-main-video');
      if (videoEl) {
        this._videoEndedListener = () => {
          YTLyricsLogger.log('[VideoObserver] Video ended naturally, preparing for next video...');
          // Reset current video id so next checkVideoState triggers a full metadata fetch
          this.currentVideoId = null;
        };
        videoEl.addEventListener('ended', this._videoEndedListener);
      } else if (attempts < 5) {
        setTimeout(() => attachWhenReady(attempts + 1), 500);
      }
    };
    attachWhenReady();
  }
};

window.YTLyricsVideoObserver = VideoObserver;
