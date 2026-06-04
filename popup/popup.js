document.addEventListener('DOMContentLoaded', async () => {
  const debugToggle = document.getElementById('debug-toggle');
  const statusMsg = document.getElementById('status-msg');
  const todayTimeEl = document.getElementById('today-time');
  const topArtistEl = document.getElementById('top-artist');

  // Load saved debug mode setting
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

  document.getElementById('btn-dashboard').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('popup/dashboard.html') });
  });

  document.getElementById('btn-history').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('popup/history.html') });
  });

  // Load quick stats
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
