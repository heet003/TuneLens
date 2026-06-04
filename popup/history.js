let allHistory = [];
let filteredHistory = [];
let currentPage = 1;
const ITEMS_PER_PAGE = 50;

document.addEventListener('DOMContentLoaded', async () => {
  try {
    allHistory = await window.YTLyricsAnalytics.getHistory();
  } catch (e) {
    console.error('[YT-LYRICS] Failed to load history:', e);
    return;
  }

  // Sort newest first
  allHistory.sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
  filteredHistory = [...allHistory];

  updateRecordCount();
  renderTable();

  // ── Search ────────────────────────────────────────────────────
  document.getElementById('search-box').addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase().trim();
    filteredHistory = q
      ? allHistory.filter(h =>
          (h.title && h.title.toLowerCase().includes(q)) ||
          (h.artist && h.artist.toLowerCase().includes(q))
        )
      : [...allHistory];
    currentPage = 1;
    renderTable();
  });

  // ── Pagination ────────────────────────────────────────────────
  document.getElementById('btn-prev').addEventListener('click', () => {
    if (currentPage > 1) { currentPage--; renderTable(); }
  });

  document.getElementById('btn-next').addEventListener('click', () => {
    if (currentPage * ITEMS_PER_PAGE < filteredHistory.length) {
      currentPage++;
      renderTable();
    }
  });

  // ── Clear All ─────────────────────────────────────────────────
  document.getElementById('btn-clear').addEventListener('click', () => {
    if (!confirm('Clear ALL listening history? This cannot be undone.')) return;
    chrome.storage.local.set({ music_history: [] }, () => {
      allHistory = [];
      filteredHistory = [];
      updateRecordCount();
      renderTable();
    });
  });

  // ── Export JSON ───────────────────────────────────────────────
  document.getElementById('btn-export-json').addEventListener('click', () => {
    const json = JSON.stringify(allHistory, null, 2);
    downloadFile('data:text/json;charset=utf-8,' + encodeURIComponent(json), 'music_history.json');
  });

  // ── Export CSV ────────────────────────────────────────────────
  document.getElementById('btn-export-csv').addEventListener('click', () => {
    const escape = (v) => `"${String(v || '').replace(/"/g, '""')}"`;
    let csv = 'Date,Song,Artist,Duration (s),Formatted Duration,URL\n';
    allHistory.forEach(row => {
      csv += [
        escape(row.date || ''),
        escape(row.title || ''),
        escape(row.artist || ''),
        row.listenDuration || 0,
        escape(window.YTLyricsAnalytics.formatDuration(row.listenDuration)),
        escape(row.url || '')
      ].join(',') + '\n';
    });
    downloadFile('data:text/csv;charset=utf-8,' + encodeURIComponent(csv), 'music_history.csv');
  });
});

function updateRecordCount() {
  const countEl = document.getElementById('record-count');
  if (countEl) {
    countEl.innerText = `${allHistory.length} sessions recorded`;
  }
}

function renderTable() {
  const tbody = document.getElementById('history-body');
  const emptyState = document.getElementById('empty-state');
  tbody.innerHTML = '';

  if (filteredHistory.length === 0) {
    emptyState.style.display = 'block';
    document.getElementById('page-info').innerText = 'No results';
    document.getElementById('btn-prev').disabled = true;
    document.getElementById('btn-next').disabled = true;
    return;
  }

  emptyState.style.display = 'none';

  const start = (currentPage - 1) * ITEMS_PER_PAGE;
  const end = start + ITEMS_PER_PAGE;
  const pageData = filteredHistory.slice(start, end);

  pageData.forEach(item => {
    const tr = document.createElement('tr');
    const dt = item.startedAt
      ? new Date(item.startedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
      : item.date || '—';

    tr.innerHTML = `
      <td>${dt}</td>
      <td class="td-song" title="${escapeHtml(item.title || '')}">${escapeHtml(item.title || 'Unknown')}</td>
      <td class="td-artist">${escapeHtml(item.artist || 'Unknown')}</td>
      <td class="td-duration">${window.YTLyricsAnalytics.formatDuration(item.listenDuration)}</td>
      <td>${item.url ? `<a href="${item.url}" target="_blank">Open ↗</a>` : '—'}</td>
    `;
    tbody.appendChild(tr);
  });

  const totalPages = Math.max(1, Math.ceil(filteredHistory.length / ITEMS_PER_PAGE));
  document.getElementById('page-info').innerText = `Page ${currentPage} of ${totalPages} · ${filteredHistory.length} records`;
  document.getElementById('btn-prev').disabled = currentPage <= 1;
  document.getElementById('btn-next').disabled = currentPage >= totalPages;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function downloadFile(dataStr, filename) {
  const a = document.createElement('a');
  a.setAttribute('href', dataStr);
  a.setAttribute('download', filename);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
