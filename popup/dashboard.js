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

  // ── Persona & Identity ────────────────────────────────────────
  if (stats.persona) {
    document.getElementById('persona-section').style.display = 'block';
    document.getElementById('persona-title').innerText = `The ${stats.persona}`;

    const pDetails = getPersonaDetails(stats.persona);
    document.getElementById('persona-story').innerText = pDetails.story || '';
    document.getElementById('persona-desc').innerText = pDetails.desc;

    // Fallback image handling
    const imgElement = document.getElementById('persona-illustration');
    const fallbackIcon = document.getElementById('persona-icon');
    if (pDetails.image) {
      imgElement.src = pDetails.image;
      imgElement.style.display = 'block';
      fallbackIcon.style.display = 'none';
      imgElement.onerror = () => {
        imgElement.style.display = 'none';
        fallbackIcon.style.display = 'flex';
        fallbackIcon.innerText = pDetails.icon;
      };
    } else {
      imgElement.style.display = 'none';
      fallbackIcon.style.display = 'flex';
      fallbackIcon.innerText = pDetails.icon;
    }

    // Why list generation
    const whySection = document.getElementById('persona-why-section');
    const whyTitle = document.getElementById('persona-why-title');
    const whyList = document.getElementById('persona-why-list');
    if (whySection && whyList) {
      whySection.style.display = 'block';
      whyTitle.innerText = `Why you're The ${stats.persona}`;
      whyList.innerHTML = '';
      const bullets = generatePersonaWhyBullets(stats.persona, stats);
      bullets.forEach(bulletText => {
        const li = document.createElement('li');
        li.innerText = bulletText;
        whyList.appendChild(li);
      });
    }

    // Trait Chips with indicator dot
    const tagsContainer = document.getElementById('persona-tags');
    tagsContainer.innerHTML = '';
    stats.secondaryTraits.forEach(trait => {
      const t = document.createElement('div');
      t.className = 'persona-tag';
      
      const dot = document.createElement('span');
      dot.className = 'tag-indicator';
      
      const label = document.createElement('span');
      label.innerText = trait;
      
      t.appendChild(dot);
      t.appendChild(label);
      tagsContainer.appendChild(t);
    });

    renderPersonaInsights(stats);
  }

  // ── Mood Dashboard ────────────────────────────────────────────
  if (stats.primaryMood) {
    document.getElementById('mood-section').style.display = 'block';
    const mDetails = getMoodDetails(stats.primaryMood, stats.secondaryMood);
    document.getElementById('mood-primary-title').innerText = mDetails.title;
    document.getElementById('mood-summary').innerText = mDetails.desc;

    // Fallback image handling
    const moodImgElement = document.getElementById('mood-illustration');
    const moodFallbackIcon = document.getElementById('mood-icon');
    if (mDetails.image) {
      moodImgElement.src = mDetails.image;
      moodImgElement.style.display = 'block';
      moodFallbackIcon.style.display = 'none';
      moodImgElement.onerror = () => {
        moodImgElement.style.display = 'none';
        moodFallbackIcon.style.display = 'flex';
        moodFallbackIcon.innerText = mDetails.fallback || '🔮';
      };
    } else {
      moodImgElement.style.display = 'none';
      moodFallbackIcon.style.display = 'flex';
      moodFallbackIcon.innerText = mDetails.fallback || '🔮';
    }

    // Weekly Insight Box
    const insightContainer = document.getElementById('mood-insight-container');
    const insightText = document.getElementById('mood-insight');
    if (insightContainer && insightText) {
      insightContainer.style.display = 'block';
      insightText.innerText = getWeeklyMoodInsight(stats.primaryMood, stats);
    }

    // Stacked Mood Distribution Bar
    const stackedBar = document.getElementById('mood-stacked-bar');
    if (stackedBar) {
      stackedBar.innerHTML = '';
      const sortedMoodsForBar = Object.entries(stats.moodDistribution).sort((a, b) => b[1] - a[1]);
      sortedMoodsForBar.forEach(([mood, pct]) => {
        if (pct > 0) {
          const segment = document.createElement('div');
          segment.className = `mood-segment ${mood}`;
          segment.style.width = `${pct}%`;
          segment.title = `${mood}: ${pct}%`;
          stackedBar.appendChild(segment);
        }
      });
    }

    // Individual Mood Bars
    const moodContainer = document.getElementById('mood-distribution');
    moodContainer.innerHTML = '';
    const sortedMoods = Object.entries(stats.moodDistribution).sort((a, b) => b[1] - a[1]);
    sortedMoods.forEach(([mood, pct]) => {
      if (pct > 0) {
        moodContainer.appendChild(createMoodBar(mood, pct));
      }
    });
  }

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

function getPersonaDetails(persona) {
  const map = {
    'Night Owl': { 
      image: '../assets/illustrations/personas/night_owl.png', 
      icon: '🌙', 
      desc: 'You come alive after dark. Most of your listening happens when the world slows down.',
      story: 'Your music sessions begin when most people are logging off for the day.' 
    },
    'Explorer': { 
      image: '../assets/illustrations/personas/explorer.png', 
      icon: '🧭', 
      desc: 'Always searching for the next sound. You discover new tracks at a high rate.',
      story: 'You rarely stay in one place. New artists and fresh discoveries drive most of your listening.' 
    },
    'Loop Addict': { 
      image: '../assets/illustrations/personas/loop_addict.png', 
      icon: '🔁', 
      desc: 'When you find a song you like, you stay with it. High replay rates.',
      story: 'When a song clicks, you lock it on repeat. You love getting lost in familiar rhythms.' 
    },
    'Deep Diver': { 
      image: '../assets/illustrations/personas/deep_diver.png', 
      icon: '🤿', 
      desc: 'You immerse yourself. You rarely skip and finish what you start.',
      story: 'You don\'t just sample music. You commit to complete listening experiences.' 
    },
    'Weekend Warrior': { 
      image: '../assets/illustrations/personas/weekend_warrior.png', 
      icon: '🎉', 
      desc: 'Your music peaks on the weekends. Saturday and Sunday are your jams.',
      story: 'You save your energy for the weekend. Saturday and Sunday are your musical playground.' 
    },
    'Casual Hopper': { 
      image: '../assets/illustrations/personas/casual_hopper.png', 
      icon: '🐇', 
      desc: 'You jump around. A lot of skipping and finding exactly the right vibe.',
      story: 'You are always on the move. Skipping and searching for that exact perfect vibe.' 
    }
  };
  return map[persona] || { icon: '🎧', desc: 'Your music, your rules.', story: 'You enjoy exploring unique sounds at your own pace.' };
}

function generatePersonaWhyBullets(persona, stats) {
  const bullets = [];
  switch (persona) {
    case 'Explorer':
      bullets.push(`High Discovery: ${stats.discoveryPercentage}% of your listening is completely new songs.`);
      bullets.push(`New Horizons: Discovered ${stats.newArtistsThisWeek || stats.uniqueArtistsCount} new artists recently.`);
      bullets.push(`Low Replay Dependence: You prefer fresh discoveries over repeated tracks.`);
      break;
    case 'Night Owl':
      bullets.push(`Peak Hours: Your most active time is ${stats.mostActiveHour !== null ? window.YTLyricsAnalytics.formatHour(stats.mostActiveHour) : 'late night'}.`);
      bullets.push(`After-Midnight: A high portion of your listening happens past midnight.`);
      bullets.push(`Midnight Vibe: Quiet-hour listening strongly shapes your identity.`);
      break;
    case 'Loop Addict':
      bullets.push(`Loyal Listener: Only ${stats.discoveryPercentage}% of your queue consists of new songs.`);
      bullets.push(`Repeat Frequency: You play your top tracks multiple times.`);
      bullets.push(`Heavy Rotation: You keep a small set of songs in heavy rotation.`);
      break;
    case 'Deep Diver':
      bullets.push(`Completion Rate: You finish ${stats.averageCompletionRate}% of the songs you start.`);
      bullets.push(`Low Skip Rate: You rarely skip tracks (${stats.skippedPlays} skips recorded).`);
      bullets.push(`Full Attention: You prefer experiencing songs in their entirety.`);
      break;
    case 'Weekend Warrior':
      bullets.push(`Active Day: ${stats.mostActiveDay || 'Weekend'} is your primary listening window.`);
      bullets.push(`Weekend Focus: A significant part of your listening time is concentrated on Saturday and Sunday.`);
      bullets.push(`Weekday Break: Sparse or quiet listening during the typical work/school week.`);
      break;
    case 'Casual Hopper':
      bullets.push(`Skip Rate: You skipped ${stats.skippedPlays} songs in your recent history.`);
      bullets.push(`Vibe Search: Completion rate is ${stats.averageCompletionRate}%, showing active selection.`);
      bullets.push(`Quick Transitions: You browse and hop between tracks to find the perfect beat.`);
      break;
    default:
      bullets.push(`Personal Style: You have a unique listening blueprint.`);
      bullets.push(`Activity: Total listening time is ${window.YTLyricsAnalytics.formatDuration(stats.totalTime)}.`);
      bullets.push(`Variety: Your listening list contains ${stats.distinctSongsCount} unique songs.`);
  }
  return bullets;
}

function renderPersonaInsights(stats) {
  const container = document.getElementById('persona-insights');
  container.innerHTML = '';

  const addCard = (title, val) => {
    const card = document.createElement('div');
    card.className = 'insight-card';
    card.innerHTML = `<div class="insight-title">${title}</div><div class="insight-val">${val}</div>`;
    container.appendChild(card);
  };

  if (stats.mostActiveHour !== null) {
    addCard('Late Night Energy', `Most active around ${window.YTLyricsAnalytics.formatHour(stats.mostActiveHour)}`);
  }

  // Find top song play count
  let maxSongPlays = 0;
  for (const data of Object.values(stats.songs)) {
    if (data.plays > maxSongPlays) maxSongPlays = data.plays;
  }
  if (stats.topSong !== 'N/A' && maxSongPlays > 0) {
    addCard('Replay Habit', `Top replayed song played ${maxSongPlays} times`);
  }

  if (stats.uniqueArtistsCount > 0) {
    addCard('Discovery', `${stats.uniqueArtistsCount} artists explored in total`);
  }
  if (stats.mostActiveDay) {
    addCard('Listening Pattern', `${stats.mostActiveDay} is your strongest music day`);
  }
}

function getMoodDetails(primary, secondary) {
  const titles = {
    'energetic': 'High Energy Vibes',
    'happy': 'Uplifting & Bright',
    'reflective': 'Deep & Thoughtful',
    'melancholic': 'In Your Feelings',
    'romantic': 'Love & Romance',
    'aggressive': 'Intense & Heavy'
  };
  const images = {
    'energetic': '../assets/illustrations/moods/energetic.png',
    'happy': '../assets/illustrations/moods/happy.png',
    'reflective': '../assets/illustrations/moods/reflective.png',
    'melancholic': '../assets/illustrations/moods/melancholic.png',
    'romantic': '../assets/illustrations/moods/romantic.png',
    'aggressive': '../assets/illustrations/moods/aggressive.png'
  };
  const fallbacks = {
    'energetic': '⚡',
    'happy': '☀️',
    'reflective': '🧘',
    'melancholic': '🌧️',
    'romantic': '💖',
    'aggressive': '🔥'
  };
  let desc = `You spent most of your listening time with ${primary} tracks.`;
  if (secondary) {
    desc = `A mix of ${primary} and ${secondary} sounds dominated your sessions.`;
  }
  return { 
    title: titles[primary] || 'Music Explorer', 
    desc,
    image: images[primary] || '',
    fallback: fallbacks[primary] || '🔮'
  };
}

function getWeeklyMoodInsight(primaryMood, stats) {
  const insights = {
    'reflective': "You returned to emotionally rich, thoughtful songs more often than usual.",
    'melancholic': "Your listening leaned toward emotional, deeply atmospheric tracks this week.",
    'energetic': "Your listening favored high-tempo, uplifting, and energetic tracks throughout the week.",
    'happy': "Bright, feel-good anthems dominated your queue and kept your vibe positive.",
    'romantic': "A warm, affectionate rhythm and gentle melodies filled your listening hours.",
    'aggressive': "Intense, heavy, and high-octane tracks powered your peak sessions."
  };
  
  // Custom check for late-night listening
  if (stats.mostActiveHour !== null && (stats.mostActiveHour >= 22 || stats.mostActiveHour <= 4)) {
    return "Late-night listening strongly influenced this week's mood.";
  }
  
  return insights[primaryMood] || "Your musical palette was rich, diverse, and well-balanced this week.";
}

function createMoodBar(mood, pct) {
  const row = document.createElement('div');
  row.className = 'mood-bar-row';
  row.innerHTML = `
    <div class="mood-label">${mood}</div>
    <div class="mood-track">
      <div class="mood-fill ${mood}"></div>
    </div>
    <div class="mood-val">${pct}%</div>
  `;
  setTimeout(() => { row.querySelector('.mood-fill').style.width = pct + '%'; }, 100);
  return row;
}
