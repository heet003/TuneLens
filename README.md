# TuneLens

**Personal Music Intelligence for YouTube**

TuneLens is a powerful, vanilla JavaScript Chrome Extension (Manifest V3) that elevates your YouTube music experience. It seamlessly overlays synchronized lyrics onto the video player and runs a sophisticated local analytics engine to track, analyze, and visualize your music listening habits—all without leaving YouTube.

## 🚀 Key Features

### 🎤 Synchronized Lyrics Overlay
- **Real-Time Sync:** Automatically fetches and syncs lyrics via the LRCLIB API.
- **Glassmorphism UI:** A sleek, draggable, floating sidebar with a premium dark theme and purple accents.
- **Per-Song Offset Caching:** Manually adjust lyric timing (±0.5s) if slightly out of sync. The extension remembers your offset for that specific song.
- **Now Playing Badge:** Visual pulse indicator when music is actively playing.

### 📊 Advanced Music Analytics Engine
- **Replay Intelligence:** Tracks completion rates to distinguish between completed plays, partial listens, and skipped tracks.
- **Discovery Metrics:** Calculates a "Discovery Score" by tracking new artists and songs you've explored today, this week, and this month.
- **Timeline Insights:** Analyzes your habits to determine your most active listening hour, day, and peak listening windows.
- **Activity Heatmap:** Visualizes your weekly listening density with a GitHub-style contribution grid.

### 🎧 Listening History & Data Management
- **Searchable History:** View a complete, paginated log of your listening history.
- **Export Capabilities:** Export your listening data to CSV or JSON for external analysis.
- **Privacy First:** All tracking and analytics are processed and stored locally on your device using Chrome's local storage.

### ⚙️ Technical Highlights
- **Wall-Clock Tracking:** Uses robust wall-clock timing instead of video elapsed time to prevent false listening time accumulation from seeking/scrubbing.
- **SPA Resilience:** Fully supports YouTube's Single Page Application architecture. Seamlessly detects URL and video changes without requiring a page reload.
- **Developer Debug Mode:** Built-in debug panel exposing real-time API latency, lyric line detection, and internal state.

## 🏗️ Architecture

```text
YouTube Page 
 ├──> content.js (Main Orchestrator & Sync Loop)
 │     ├──> videoObserver.js (Detects SPA URL/Video changes)
 │     ├──> youtubeDetector.js (Extracts Title, Artist, Time)
 │     ├──> lyricsService.js (API Calls to LRCLIB)
 │     ├──> lrcParser.js (Parses [mm:ss.xx] timestamps)
 │     └──> lyricsOverlay.js (UI / Floating Sidebar)
 └──> popup.js (Settings & Dashboard entry)
       └──> analyticsEngine.js (Processes local storage into stats)
       └──> listeningTracker.js (Wall-clock tracking logic)
```

## 🛠️ Installation Instructions

1. Open Google Chrome.
2. Navigate to `chrome://extensions/` in your URL bar.
3. Enable the **Developer mode** toggle in the top right corner.
4. Click the **Load unpacked** button in the top left.
5. Select the `tunelens` directory.
6. The extension is now installed! Pin it to your toolbar to access your Analytics and History.

## 🧪 Testing Instructions

1. Navigate to a YouTube music video.
2. The **TuneLens** floating sidebar will appear on the right side of the screen with synchronized lyrics.
3. Click the extension icon in the toolbar and open the **Analytics Dashboard** to see your stats populate in real-time.
4. Click on a different video from the YouTube sidebar (SPA navigation). Watch the extension gracefully handle the transition, fetch new lyrics, and continue tracking.

## 🔮 Future Roadmap

- Local indexing / caching of fetched lyrics to reduce network overhead.
- Overarching API fallback system to scrape other lyric sites if LRCLIB returns a 404.
- Integration with Spotify/Last.fm for cross-platform data merging.
