/**
 * Lyrics Overlay — Floating Sidebar UI
 * Bug 1, 4, 5 Fixed:
 *   - Added reset() to fully clear stale state on new song
 *   - Added setSongMeta() to always show song name even if lyrics fail
 *   - init() guard no longer blocks state updates (split into init+reset)
 * Feature: Now Playing pulsing badge
 * Feature: Debug panel visibility tied to debug mode setting
 * Feature: Per-song offset cached in chrome.storage.local
 */
const LyricsOverlay = {
  container: null,
  lyricsContainer: null,
  debugContainer: null,
  nowPlayingBadge: null,
  activeLyricIndex: -1,
  parsedLyrics: [],
  offset: 0,
  offsetDisplay: null,
  currentVideoId: null,

  init: function() {
    // Only build the DOM once — subsequent calls just show the panel
    if (document.getElementById('yt-lyrics-overlay')) {
      this.show();
      return;
    }

    YTLyricsLogger.log('Building Lyrics Overlay DOM');

    // ── Container ──────────────────────────────────────────────────
    this.container = document.createElement('div');
    this.container.id = 'yt-lyrics-overlay';

    // ── Header ─────────────────────────────────────────────────────
    const header = document.createElement('div');
    header.id = 'yt-lyrics-header';

    // Now Playing badge (pulsing dots)
    this.nowPlayingBadge = document.createElement('div');
    this.nowPlayingBadge.id = 'yt-now-playing-badge';
    this.nowPlayingBadge.innerHTML = `
      <span class="np-dot"></span>
      <span class="np-dot"></span>
      <span class="np-dot"></span>
    `;
    this.nowPlayingBadge.title = 'Now Playing';

    // Title info area
    const titleInfo = document.createElement('div');
    titleInfo.id = 'yt-lyrics-title-info';
    titleInfo.innerHTML = `<span id="yt-lyric-song">Loading...</span><span id="yt-lyric-artist"></span>`;

    // Controls
    const controls = document.createElement('div');
    controls.id = 'yt-lyrics-controls';

    const offsetDecBtn = document.createElement('button');
    offsetDecBtn.innerHTML = '&minus;';
    offsetDecBtn.title = 'Delay lyrics (−0.5s)';
    offsetDecBtn.onclick = () => this.adjustOffset(-0.5);

    this.offsetDisplay = document.createElement('span');
    this.offsetDisplay.className = 'yt-lyric-offset-display';
    this.offsetDisplay.innerText = '0.0s';

    const offsetIncBtn = document.createElement('button');
    offsetIncBtn.innerHTML = '&plus;';
    offsetIncBtn.title = 'Advance lyrics (+0.5s)';
    offsetIncBtn.onclick = () => this.adjustOffset(0.5);

    const minBtn = document.createElement('button');
    minBtn.innerHTML = '&#x2012;';
    minBtn.title = 'Minimize';
    minBtn.onclick = () => this.toggleMinimize();

    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '&#x2715;';
    closeBtn.title = 'Close';
    closeBtn.onclick = () => this.hide();

    controls.appendChild(offsetDecBtn);
    controls.appendChild(this.offsetDisplay);
    controls.appendChild(offsetIncBtn);
    controls.appendChild(minBtn);
    controls.appendChild(closeBtn);

    header.appendChild(this.nowPlayingBadge);
    header.appendChild(titleInfo);
    header.appendChild(controls);

    // ── Debug Panel ────────────────────────────────────────────────
    this.debugContainer = document.createElement('div');
    this.debugContainer.id = 'yt-lyrics-debug';
    this.debugContainer.style.display = 'none'; // Hidden by default (Bug 5)

    // ── Lyrics Content ─────────────────────────────────────────────
    this.lyricsContainer = document.createElement('div');
    this.lyricsContainer.id = 'yt-lyrics-content';

    this.container.appendChild(header);
    this.container.appendChild(this.debugContainer);
    this.container.appendChild(this.lyricsContainer);

    document.body.appendChild(this.container);
    this.makeDraggable(this.container, header);

    // Load debug panel visibility from storage
    this._applyDebugVisibility();
  },

  // ── State Reset on New Song (Bug 1 & 4 Fix) ──────────────────────
  reset: function(videoId) {
    this.currentVideoId = videoId;
    this.parsedLyrics = [];
    this.activeLyricIndex = -1;
    this.offset = 0;
    if (this.offsetDisplay) this.offsetDisplay.innerText = '0.0s';
    if (this.lyricsContainer) this.lyricsContainer.innerHTML = '';
    // Reset now-playing badge to paused state
    this.setPlayingState(false);
    // Load cached offset for this videoId
    if (videoId) this._loadOffset(videoId);
  },

  // ── Always Show Song Name (Bug 5 Fix) ────────────────────────────
  setSongMeta: function(title, artist) {
    const songEl = document.getElementById('yt-lyric-song');
    const artistEl = document.getElementById('yt-lyric-artist');
    if (songEl) songEl.innerText = title || 'Unknown Song';
    if (artistEl) artistEl.innerText = artist || '';
  },

  // ── Now Playing Badge ─────────────────────────────────────────────
  setPlayingState: function(isPlaying) {
    if (!this.nowPlayingBadge) return;
    if (isPlaying) {
      this.nowPlayingBadge.classList.add('is-playing');
    } else {
      this.nowPlayingBadge.classList.remove('is-playing');
    }
  },

  // ── Per-Song Offset Cache ─────────────────────────────────────────
  _loadOffset: function(videoId) {
    chrome.storage.local.get(['lyric_offsets'], (result) => {
      const offsets = result.lyric_offsets || {};
      if (offsets[videoId] !== undefined) {
        this.offset = offsets[videoId];
        if (this.offsetDisplay) {
          this.offsetDisplay.innerText = (this.offset > 0 ? '+' : '') + this.offset.toFixed(1) + 's';
        }
        YTLyricsLogger.log('Loaded cached offset for', videoId, ':', this.offset);
      }
    });
  },

  _saveOffset: function() {
    if (!this.currentVideoId) return;
    chrome.storage.local.get(['lyric_offsets'], (result) => {
      const offsets = result.lyric_offsets || {};
      offsets[this.currentVideoId] = this.offset;
      chrome.storage.local.set({ lyric_offsets: offsets });
    });
  },

  // ── Debug Panel Visibility ────────────────────────────────────────
  _applyDebugVisibility: function() {
    chrome.storage.local.get(['debugMode'], (result) => {
      const show = result.debugMode === true;
      if (this.debugContainer) {
        this.debugContainer.style.display = show ? 'block' : 'none';
      }
    });
  },

  // ── Draggable Logic ───────────────────────────────────────────────
  makeDraggable: function(element, dragHandle) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;

    dragHandle.onmousedown = (e) => {
      if (e.target.tagName === 'BUTTON' || e.target.closest('button')) return;
      e.preventDefault();
      pos3 = e.clientX;
      pos4 = e.clientY;
      document.onmouseup = closeDragElement;
      document.onmousemove = elementDrag;
    };

    function elementDrag(e) {
      e.preventDefault();
      pos1 = pos3 - e.clientX;
      pos2 = pos4 - e.clientY;
      pos3 = e.clientX;
      pos4 = e.clientY;
      element.style.top = (element.offsetTop - pos2) + 'px';
      element.style.left = (element.offsetLeft - pos1) + 'px';
      element.style.bottom = 'auto';
      element.style.right = 'auto';
    }

    function closeDragElement() {
      document.onmouseup = null;
      document.onmousemove = null;
    }
  },

  show: function() {
    if (this.container) this.container.style.display = 'flex';
    this._applyDebugVisibility();
  },

  hide: function() {
    if (this.container) this.container.style.display = 'none';
  },

  toggleMinimize: function() {
    if (!this.container) return;
    this.container.classList.toggle('yt-lyrics-minimized');
  },

  adjustOffset: function(delta) {
    this.offset = parseFloat((this.offset + delta).toFixed(1));
    if (this.offsetDisplay) {
      this.offsetDisplay.innerText = (this.offset > 0 ? '+' : '') + this.offset.toFixed(1) + 's';
    }
    this._saveOffset();
  },

  updateDebugInfo: function(info) {
    if (!this.debugContainer) return;
    let html = '<strong>Debug Log</strong><br>';
    for (const [key, value] of Object.entries(info)) {
      html += `<span><b>${key}:</b> ${value}</span><br>`;
    }
    this.debugContainer.innerHTML = html;
  },

  displayMessage: function(message) {
    if (this.lyricsContainer) {
      this.lyricsContainer.innerHTML = `<div class="yt-lyrics-message">${message}</div>`;
    }
  },

  displayLyrics: function(lyricsData) {
    // Update header with confirmed API data
    this.setSongMeta(lyricsData.title, lyricsData.artist);

    if (lyricsData.syncedLyrics) {
      this.parsedLyrics = YTLyricsParser.parse(lyricsData.syncedLyrics);
      if (this.parsedLyrics.length > 0) {
        let html = '';
        this.parsedLyrics.forEach((lyric, index) => {
          const text = lyric.text || '&#x200B;'; // zero-width space for empty lines
          html += `<div class="yt-lyric-line" id="lyric-line-${index}">${text}</div>`;
        });
        this.lyricsContainer.innerHTML = html;
        return;
      }
    }

    if (lyricsData.plainLyrics) {
      this.parsedLyrics = [];
      const formatted = lyricsData.plainLyrics.replace(/\n/g, '<br>');
      this.lyricsContainer.innerHTML = `<div class="yt-lyric-plain">${formatted}</div>`;
    } else {
      this.displayMessage('No lyrics available for this song.');
    }
  },

  syncLyrics: function(currentTime) {
    if (this.parsedLyrics.length === 0) return;

    const adjustedTime = currentTime + this.offset;

    let activeIndex = -1;
    for (let i = 0; i < this.parsedLyrics.length; i++) {
      if (adjustedTime >= this.parsedLyrics[i].time) {
        activeIndex = i;
      } else {
        break;
      }
    }

    if (activeIndex !== this.activeLyricIndex && activeIndex !== -1) {
      if (this.activeLyricIndex !== -1) {
        const oldEl = document.getElementById(`lyric-line-${this.activeLyricIndex}`);
        if (oldEl) oldEl.classList.remove('yt-lyric-active');
      }
      this.activeLyricIndex = activeIndex;
      const newEl = document.getElementById(`lyric-line-${activeIndex}`);
      if (newEl) {
        newEl.classList.add('yt-lyric-active');
        newEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }
};

window.YTLyricsOverlay = LyricsOverlay;
