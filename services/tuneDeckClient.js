/**
 * TuneDeckClient — Phase 2 Integration
 *
 * Manages the WebSocket connection from TuneLens to TuneDeck Server.
 * Sits entirely within the content script context and exposes a clean
 * event API that content.js calls into.
 *
 * Key design decisions:
 *  - Only connects when the user has enabled the TuneDeck toggle.
 *  - Reconnects with capped exponential backoff (1s → 30s).
 *  - Deduplicates song_changed events (guards against stale re-triggers).
 *  - Debounces play/pause events (300ms) to avoid chatty state flapping
 *    caused by YouTube ads, buffering, or rapid seek interactions.
 *  - Sends progress events every 5 seconds while playing.
 *  - Re-announces current song state after every successful reconnect.
 *  - Fails completely silently — never impacts the lyrics overlay.
 */
const TuneDeckClient = {

  // ── Configuration ───────────────────────────────────────────────────
  _SERVER_URL: 'ws://localhost:5000/ws',
  _PROGRESS_INTERVAL_MS: 5000,
  _RECONNECT_BASE_MS: 1000,
  _RECONNECT_MAX_MS: 30000,
  _PLAY_PAUSE_DEBOUNCE_MS: 300,

  // ── Internal State ──────────────────────────────────────────────────
  _ws: null,
  _reconnectTimer: null,
  _progressTimer: null,
  _playPauseDebounceTimer: null,
  _reconnectDelay: 1000,
  _enabled: false,

  // Track last sent state for deduplication
  _lastVideoId: null,
  _lastIsPlaying: null,
  _lastPayload: null,

  // ── Public API ──────────────────────────────────────────────────────

  /**
   * Enable the TuneDeck client and attempt to connect.
   * Called when the user toggles TuneDeck ON in the popup.
   */
  enable: function () {
    if (this._enabled) return;
    this._enabled = true;
    YTLyricsLogger.log('[TuneDeck] Enabled — connecting to server...');
    this._connect();
  },

  /**
   * Disable the TuneDeck client and permanently close the connection.
   * Called when the user toggles TuneDeck OFF in the popup.
   */
  disable: function () {
    if (!this._enabled) return;
    this._enabled = false;
    YTLyricsLogger.log('[TuneDeck] Disabled — closing connection.');
    this._clearReconnectTimer();
    this._stopProgress();
    if (this._ws) {
      this._ws.close();
      this._ws = null;
    }
    this._lastVideoId = null;
    this._lastIsPlaying = null;
    this._lastPayload = null;
  },

  /**
   * Called by content.js when a new video is detected.
   * Sends a song_changed event to the server.
   *
   * The `artwork` field is intentionally omitted from the payload.
   * Artwork resolution is the server's responsibility (ArtworkResolver).
   * TuneLens only provides the video ID — the backend finds the best thumbnail.
   *
   * @param {Object} payload - { id, title, artist, channel, channelType, isLive, isCover, isRemix }
   */
  onVideoChange: function (payload) {
    if (!this._enabled) return;

    // Guard: skip if same video was already sent (prevents double-fire on SPA nav)
    if (payload.id && payload.id === this._lastVideoId) {
      YTLyricsLogger.log('[TuneDeck] Skipping duplicate song_changed for:', payload.id);
      return;
    }

    this._lastVideoId = payload.id;
    this._lastIsPlaying = null; // Reset so play state is re-sent for new song
    this._lastPayload = payload;

    this._stopProgress(); // Stop previous song's progress timer

    this._send({
      type: 'song_changed',
      payload: payload,
      ts: Date.now()
    });
  },

  /**
   * Called by content.js sync loop (every 500ms).
   * Internally debounced and deduplicated — safe to call frequently.
   *
   * @param {boolean} isPlaying
   * @param {number}  currentTime - seconds
   * @param {number}  duration    - seconds (may be NaN for live streams)
   */
  onPlayStateChange: function (isPlaying, currentTime, duration) {
    if (!this._enabled) return;
    if (!this._lastVideoId) return; // No song registered yet

    // Deduplicate — only act if play state actually changed
    if (isPlaying === this._lastIsPlaying) return;

    // Debounce to avoid flapping during ads/buffering
    if (this._playPauseDebounceTimer) clearTimeout(this._playPauseDebounceTimer);
    this._playPauseDebounceTimer = setTimeout(() => {
      // Re-check after debounce (state may have flipped back)
      if (isPlaying === this._lastIsPlaying) return;

      this._lastIsPlaying = isPlaying;
      const safeDuration = isNaN(duration) ? 0 : duration;

      if (isPlaying) {
        this._send({ type: 'play', payload: { position: currentTime }, ts: Date.now() });
        this._startProgress(currentTime, safeDuration);
      } else {
        this._send({ type: 'pause', payload: { position: currentTime }, ts: Date.now() });
        this._stopProgress();
      }
    }, this._PLAY_PAUSE_DEBOUNCE_MS);
  },

  // ── WebSocket Lifecycle ─────────────────────────────────────────────

  _connect: function () {
    if (!this._enabled) return;
    if (this._ws && (this._ws.readyState === WebSocket.OPEN || this._ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    try {
      YTLyricsLogger.log('[TuneDeck] Connecting to:', this._SERVER_URL);
      this._ws = new WebSocket(this._SERVER_URL);

      this._ws.onopen = () => {
        YTLyricsLogger.success('[TuneDeck] Connected to TuneDeck Server');
        this._reconnectDelay = this._RECONNECT_BASE_MS; // Reset backoff

        // Announce identity
        this._send({
          type: 'connected',
          payload: { clientType: 'extension' },
          ts: Date.now()
        });

        // Re-announce current song state so server re-syncs after reconnect
        if (this._lastPayload) {
          YTLyricsLogger.log('[TuneDeck] Re-announcing song state after reconnect');
          const reannounce = { ...this._lastPayload };
          this._lastVideoId = null; // Reset so onVideoChange doesn't deduplicate
          this.onVideoChange(reannounce);

          // Also re-send play state if we know it
          if (this._lastIsPlaying !== null) {
            const videoEl = document.querySelector('video.html5-main-video');
            if (videoEl) {
              const isPlaying = !videoEl.paused;
              this._lastIsPlaying = null; // Reset for re-emit
              this.onPlayStateChange(isPlaying, videoEl.currentTime, videoEl.duration);
            }
          }
        }
      };

      this._ws.onmessage = (event) => {
        // Handle inbound messages (e.g. CONNECTED handshake from server)
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'connected') {
            YTLyricsLogger.log('[TuneDeck] Server handshake received. Client ID:', msg.payload?.clientId);
          }
        } catch {
          // Non-JSON message — ignore
        }
      };

      this._ws.onerror = (err) => {
        // Only log — onerror is always followed by onclose
        YTLyricsLogger.warn('[TuneDeck] WebSocket error. Will attempt reconnect.');
      };

      this._ws.onclose = (event) => {
        if (!this._enabled) return; // Intentional disable — don't reconnect
        YTLyricsLogger.warn(`[TuneDeck] Disconnected (code: ${event.code}). Reconnecting in ${this._reconnectDelay}ms...`);
        this._stopProgress();
        this._scheduleReconnect();
      };

    } catch (err) {
      YTLyricsLogger.error('[TuneDeck] Failed to create WebSocket:', err);
      this._scheduleReconnect();
    }
  },

  _scheduleReconnect: function () {
    if (!this._enabled) return;
    this._clearReconnectTimer();

    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      this._connect();
    }, this._reconnectDelay);

    // Exponential backoff: 1s → 2s → 4s → 8s → 16s → 30s cap
    this._reconnectDelay = Math.min(this._reconnectDelay * 2, this._RECONNECT_MAX_MS);
  },

  _clearReconnectTimer: function () {
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
  },

  // ── Progress reporting ──────────────────────────────────────────────

  _startProgress: function (initialPosition, initialDuration) {
    this._stopProgress();

    // Send one immediate progress event so the mobile receives the real
    // duration right away, before the first 5-second interval tick fires.
    // Without this, the mobile shows '0:00' total for the first 5 seconds.
    this._send({
      type: 'progress',
      payload: { position: initialPosition, duration: initialDuration },
      ts: Date.now()
    });

    this._progressTimer = setInterval(() => {
      if (!this._enabled) { this._stopProgress(); return; }

      const videoEl = document.querySelector('video.html5-main-video');
      if (!videoEl || videoEl.paused) { this._stopProgress(); return; }

      const position = videoEl.currentTime;
      const duration = isNaN(videoEl.duration) ? 0 : videoEl.duration;

      this._send({
        type: 'progress',
        payload: { position, duration },
        ts: Date.now()
      });
    }, this._PROGRESS_INTERVAL_MS);
  },

  _stopProgress: function () {
    if (this._progressTimer) {
      clearInterval(this._progressTimer);
      this._progressTimer = null;
    }
  },

  // ── Send helper ─────────────────────────────────────────────────────

  _send: function (event) {
    if (!this._ws || this._ws.readyState !== WebSocket.OPEN) {
      YTLyricsLogger.log('[TuneDeck] Cannot send — WebSocket not open. Event queued for next connect:', event.type);
      return;
    }
    try {
      this._ws.send(JSON.stringify(event));
    } catch (err) {
      YTLyricsLogger.error('[TuneDeck] Send failed:', err);
    }
  }
};

window.TuneDeckClient = TuneDeckClient;
