document.addEventListener('DOMContentLoaded', async () => {
  let stats;
  try {
    stats = await window.YTLyricsAnalytics.getStats();
  } catch (e) {
    console.error('[YT-LYRICS] Failed to load stats:', e);
    return;
  }

  // ── Overview Cards ───────────────────────────────────────────
  document.getElementById('total-time').innerText = window.YTLyricsAnalytics.formatDuration(stats.totalTime);
  document.getElementById('distinct-songs').innerText = stats.distinctSongsCount;
  document.getElementById('total-sessions').innerText = `${stats.totalSessions} total play${stats.totalSessions !== 1 ? 's' : ''}`;
  document.getElementById('unique-artists').innerText = stats.uniqueArtistsCount;
  document.getElementById('this-week-time').innerText = window.YTLyricsAnalytics.formatDuration(stats.thisWeekTime);

  // ── Discovery Metrics ─────────────────────────────────────────
  document.getElementById('d-score').innerText = stats.discoveryScore;
  document.getElementById('d-pct').innerText = `${stats.discoveryPercentage}%`;
  document.getElementById('new-songs-week').innerText = stats.newSongsThisWeek;
  document.getElementById('new-artists-week').innerText = stats.newArtistsThisWeek;

  // ── Replay Analytics ──────────────────────────────────────────
  document.getElementById('avg-completion').innerText = `${stats.averageCompletionRate}%`;
  document.getElementById('comp-bar-fill').style.width = `${stats.averageCompletionRate}%`;
  document.getElementById('completed-plays').innerText = stats.completedPlays;
  document.getElementById('skipped-plays').innerText = stats.skippedPlays;
  document.getElementById('partial-plays').innerText = stats.partialPlays;

  // ── Timeline Highlights ───────────────────────────────────────
  document.getElementById('most-active-hour').innerText = stats.mostActiveHour !== null ? window.YTLyricsAnalytics.formatHour(stats.mostActiveHour) : '—';
  document.getElementById('most-active-day').innerText = stats.mostActiveDay || '—';
  document.getElementById('peak-window').innerText = stats.peakListeningWindow || '—';

  // ── Heatmap (Current Week / Last 7 Days) ──────────────────────
  renderHeatmap(stats.daily);

  // ── Hourly Distribution Chart ─────────────────────────────────
  renderHourlyChart(stats.hourlyDistribution);

  // ── Top Artists & Songs ───────────────────────────────────────
  renderTopList('artists-chart', stats.artists, (data) => data.time);
  renderTopList('songs-chart', stats.songs, (data) => data.time);
});

function renderHeatmap(dailyStats) {
  const container = document.getElementById('heatmap-grid');
  const tooltip = document.getElementById('heatmap-tooltip');
  container.innerHTML = '';
  
  const now = new Date();
  // Generate last 7 days array ending today
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    days.push(d);
  }

  days.forEach(dateObj => {
    const dateStr = dateObj.toISOString().split('T')[0];
    const data = dailyStats[dateStr] || { time: 0, songs: { size: 0 }, artists: { size: 0 } };
    
    // Calculate level (0 min = 0, 1-10m = 1, 10-30m = 2, 30-60m = 3, 60+m = 4)
    const mins = data.time / 60;
    let level = 0;
    if (mins > 0 && mins <= 10) level = 1;
    else if (mins > 10 && mins <= 30) level = 2;
    else if (mins > 30 && mins <= 60) level = 3;
    else if (mins > 60) level = 4;

    const dayCol = document.createElement('div');
    dayCol.className = 'heat-day';
    
    const dayLabel = document.createElement('span');
    dayLabel.className = 'heat-label';
    dayLabel.innerText = dateObj.toLocaleDateString(undefined, { weekday: 'short' });

    const box = document.createElement('div');
    box.className = `heat-box level-${level}`;

    // Tooltip logic
    box.addEventListener('mouseenter', (e) => {
      tooltip.innerHTML = `
        <strong>${dateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</strong><br>
        Listening: ${window.YTLyricsAnalytics.formatDuration(data.time)}<br>
        Songs: ${data.songs.size || 0}<br>
        Artists: ${data.artists.size || 0}
      `;
      tooltip.style.display = 'block';
      const rect = box.getBoundingClientRect();
      tooltip.style.left = rect.left + (rect.width / 2) + 'px';
      tooltip.style.top = rect.top - 8 + 'px';
    });
    box.addEventListener('mouseleave', () => { tooltip.style.display = 'none'; });

    dayCol.appendChild(box);
    dayCol.appendChild(dayLabel);
    container.appendChild(dayCol);
  });
}

function renderHourlyChart(hourlyArray) {
  const container = document.getElementById('hourly-chart');
  container.innerHTML = '';
  const max = Math.max(...hourlyArray, 1);

  hourlyArray.forEach((time, index) => {
    const pct = (time / max) * 100;
    const col = document.createElement('div');
    col.className = 't-col';
    
    const bar = document.createElement('div');
    bar.className = 't-bar';
    bar.title = `${window.YTLyricsAnalytics.formatHour(index)}: ${window.YTLyricsAnalytics.formatDuration(time)}`;
    
    // Animate
    setTimeout(() => { bar.style.height = `${pct}%`; }, 100 + index * 20);

    const label = document.createElement('div');
    label.className = 't-label';
    // Show label every 4 hours to avoid crowding
    label.innerText = (index % 4 === 0) ? window.YTLyricsAnalytics.formatHour(index).replace(':00', '') : '';

    col.appendChild(bar);
    col.appendChild(label);
    container.appendChild(col);
  });
}

function renderTopList(elementId, dataObj, sortValGetter) {
  const arr = Object.entries(dataObj)
    .map(([name, data]) => ({ name: data.title || name, time: data.time }))
    .sort((a, b) => b.time - a.time)
    .slice(0, 8);

  const container = document.getElementById(elementId);
  const maxTime = arr[0]?.time || 1;
  container.innerHTML = '';

  arr.forEach((item, i) => {
    container.appendChild(createBar(item.name, item.time, maxTime, i + 1));
  });

  if (arr.length === 0) {
    container.innerHTML = '<p style="color:#A0A8B8;font-size:13px;padding:8px 0">No data yet. Start listening!</p>';
  }
}

function createBar(label, value, maxValue, rank) {
  const pct = Math.max(2, Math.min(100, (value / maxValue) * 100));
  const row = document.createElement('div');
  row.className = 'bar-row';
  
  row.innerHTML = `
    <div class="bar-rank">${rank}</div>
    <div class="bar-label" title="${label}">${label}</div>
    <div class="bar-track">
      <div class="bar-fill"></div>
    </div>
    <div class="bar-value">${window.YTLyricsAnalytics.formatDuration(value)}</div>
  `;
  
  setTimeout(() => { row.querySelector('.bar-fill').style.width = pct + '%'; }, 80 + rank * 40);
  return row;
}
