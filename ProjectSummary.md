# TuneLens Feature Specification

Version: 1.1.0

---

# Overview

TuneLens is a Chrome extension that provides:

* Synchronized lyrics overlay for YouTube.
* Music listening analytics.
* Mood analysis.
* Listening personas.
* AI-generated listening insights.
* Metadata intelligence.
* Session tracking.

---

# Overlay System

The extension displays a floating overlay on YouTube.

Header contains:

* Song title.
* Artist name.
* Offset decrease button.
* Offset display.
* Offset increase button.
* Search button.
* Minimize button.
* Close button.

---

# Lyrics Display

The overlay displays:

* Synced lyrics.
* Active line highlighting.
* Automatic scrolling.
* Unsynced lyrics fallback.
* Empty state.

---

# Lyrics Search System

Current metadata sources:

* YouTube title.
* YouTube channel.
* Metadata Intelligence.

Search provider:

* LRCLIB.

Search flow:

1. Metadata extraction.
2. Candidate generation.
3. Search attempts.
4. Candidate scoring.
5. Verification.
6. Lyrics display.

---

# Metadata Intelligence

Responsibilities:

* Channel classification.
* Title normalization.
* Artist extraction.
* Noise removal.
* Feature extraction.

Channel types:

* TOPIC_AUTO
* VEVO
* OFFICIAL
* LABEL
* LYRICS
* UNKNOWN

Metadata flags:

* isLive
* isCover
* isRemix
* featuredArtists

---

# Lyrics Verification

Confidence model:

* score 0-100

Verified:

* score >= threshold
* artist validated

Ambiguous:

* lyrics shown
* metadata not overwritten

---

# Manual Search Mode

Search button always visible.

Pressing search:

* hides lyrics
* displays search form

Form:

* Song Name
* Artist Name
* Search button

Behavior:

* prefilled from metadata
* editable by user

Search success:

* display lyrics

Search failure:

* keep search form visible
* show error

Search toggle:

* pressing search again restores previous lyrics

---

# State Management

States:

* loading
* lyrics
* empty
* error
* search mode

Search states:

* idle
* searching
* success
* failed

---

# Session Tracking

Track:

* song title
* artist
* channel
* startedAt
* endedAt
* listenDuration
* totalDuration
* metadata source
* confidence

Minimum session:

* 2 seconds

---

# Listening Analytics

Metrics:

* total listening time
* sessions
* unique artists
* unique songs
* completion rate
* replay rate
* discovery score
* artist concentration
* hourly distribution
* weekly distribution

---

# Persona System

Possible personas:

* Night Owl
* Explorer
* Loop Addict
* Deep Diver
* Weekend Warrior
* Casual Hopper

---

# Mood Analysis

Moods:

* energetic
* happy
* reflective
* melancholic
* romantic
* aggressive

---

# AI Insights

Generated using Gemini.

Outputs:

* title
* corePattern
* hiddenConnection
* behavioralTension
* surprisingInsight
* reflection

---

# Storage

chrome.storage.local:

* music_history
* AI cache
* future correction cache

Storage must survive:

* extension reload
* browser restart

---

# Navigation

When YouTube video changes:

* previous session ends
* new session begins
* lyrics reset
* state reset

Manual search results must not leak.

---

# Error Handling

Handle:

* network failures
* LRCLIB unavailable
* timeout
* empty response
* malformed response

Overlay must never crash.

---

# Performance Goals

* fast overlay render
* minimal API calls
* no memory leaks
* no duplicate searches
* low CPU usage
* smooth scrolling

---
