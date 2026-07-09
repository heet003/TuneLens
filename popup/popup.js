document.addEventListener('DOMContentLoaded', async () => {
  const debugToggle = document.getElementById('debug-toggle');
  const statusMsg = document.getElementById('status-msg');
  const todayTimeEl = document.getElementById('today-time');
  const topArtistEl = document.getElementById('top-artist');
  const tunedeckToggle = document.getElementById('tunedeck-toggle');
  const tunedeckStatus = document.getElementById('tunedeck-status');

  // ── Debug toggle ──────────────────────────────────────────────

  chrome.storage.local.get(['debugMode'], (result) => {
    debugToggle.checked = result.debugMode === true;
  });

  debugToggle.addEventListener('change', (e) => {
    const isDebug = e.target.checked;
    chrome.storage.local.set({ debugMode: isDebug }, () => {
      statusMsg.textContent = 'Saved. Refresh YouTube to apply.';
      setTimeout(() => { statusMsg.textContent = ''; }, 3000);
    });
  });

  // ── Navigation buttons ────────────────────────────────────────

  document.getElementById('btn-dashboard').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('popup/dashboard.html') });
  });

  document.getElementById('btn-history').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('popup/history.html') });
  });

  // ── TuneDeck toggle ───────────────────────────────────────────

  /**
   * Update the visual status label beneath the TuneDeck toggle.
   * @param {boolean} enabled
   */
  function updateTunedeckStatus(enabled) {
    tunedeckStatus.textContent = enabled ? 'On' : 'Off';
    tunedeckStatus.classList.toggle('active', enabled);
  }

  // Load saved TuneDeck state — defaults to OFF
  chrome.storage.local.get(['tunedeckEnabled'], (result) => {
    const isEnabled = result.tunedeckEnabled === true; // strict: undefined → false
    tunedeckToggle.checked = isEnabled;
    updateTunedeckStatus(isEnabled);
  });

  tunedeckToggle.addEventListener('change', (e) => {
    const isEnabled = e.target.checked;

    // Persist the preference
    chrome.storage.local.set({ tunedeckEnabled: isEnabled }, () => {
      updateTunedeckStatus(isEnabled);

      // Notify the active YouTube tab content script immediately so it
      // enables/disables TuneDeckClient without requiring a page refresh.
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs[0];
        if (!tab?.id || !tab.url?.includes('youtube.com')) return;

        chrome.tabs.sendMessage(tab.id, {
          type: 'TUNEDECK_TOGGLE',
          payload: { enabled: isEnabled }
        }, () => {
          // Ignore "Could not establish connection" errors gracefully
          if (chrome.runtime.lastError) { /* no-op */ }
        });
      });
    });
  });

  // ── Quick stats ───────────────────────────────────────────────

  if (window.YTLyricsAnalytics) {
    try {
      const stats = await window.YTLyricsAnalytics.getStats();
      todayTimeEl.innerText = window.YTLyricsAnalytics.formatDuration(stats.todayTime) || '—';
      topArtistEl.innerText = stats.topArtist !== 'N/A' ? stats.topArtist : '—';
      topArtistEl.title = stats.topArtist;
    } catch (e) {
      todayTimeEl.innerText = '—';
      topArtistEl.innerText = '—';
    }
  }
});
