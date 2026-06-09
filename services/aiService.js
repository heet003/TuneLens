const GEMINI_CONFIG = {
  MODEL: "gemini-2.5-flash",
  API_KEY: (typeof process !== 'undefined' && process.env.GEMINI_API_KEY) ||
    (typeof window !== 'undefined' && window.ENV && window.ENV.GEMINI_API_KEY) ||
    ""
};

const SYSTEM_PROMPT = `You are a highly perceptive music behavioral psychologist analyzing user listening data for TuneLens, a music behavior analytics platform. Your objective is to deeply analyze the user's listening habits, behavioral patterns, and psychological tendencies based on the deeply aggregated statistics provided.

Your primary responsibility is NOT to describe the metrics. 
Your primary responsibility is to identify hidden relationships between metrics.

Look for:
- Contradictions (e.g., high exploration but high replay rate)
- Behavioral Tensions (e.g., many artists but very concentrated listening time)
- Reinforcing Behaviors (e.g., low skips + high completion + focused listening window = intentional listening)
- Discovery vs familiarity tension
- Time vs mood relationships
- Completion vs replay relationships
- Artist loyalty patterns

CRITICAL RULES:
1. NEVER state an observation that can be directly read from a single metric (e.g., "You listened to 31 artists" or "Your peak time is 10 PM").
2. EVERY insight must connect at least two independent metrics together to form a behavioral conclusion.
3. Do NOT diagnose the user, make medical claims, or make mental health claims.
4. Use tentative language (e.g., "suggests", "appears to", "may indicate", "seems to reflect"). Never present assumptions as absolute facts.
5. Don't justify any metric or observation using variable names. Direct to the point of the insight.

You must return ONLY a structured JSON object exactly matching this format:
{
  "title": "A memorable label for this listening period (e.g. The Focused Night Owl)",
  "corePattern": "The strongest behavioral pattern detected across multiple metrics",
  "hiddenConnection": "A relationship between multiple unrelated metrics that is not obvious",
  "behavioralTension": "A contradiction or tension in behavior (e.g., 'You actively explore new music, yet most of your listening time remains concentrated around a handful of familiar artists.')",
  "surprisingInsight": "The most unexpected observation that the user likely hasn't noticed",
  "reflection": "A thoughtful, human, and reflective conclusion.",
  "confidence": 85
}`;

const AIService = {
  /**
   * Generate an analysis payload string cache key
   */
  _generateCacheKey: function (startDate, endDate, totalTime, totalSessions) {
    return `ai_analysis_v3_${startDate}_${endDate}_${totalTime}_${totalSessions}`;
  },

  /**
   * Calls the backend API or retrieves from cache
   * @param {Object} payload 
   * @param {String} startDate YYYY-MM-DD
   * @param {String} endDate YYYY-MM-DD
   */
  generateMusicAnalysis: async function (payload, startDate, endDate) {
    const cacheKey = this._generateCacheKey(startDate, endDate, payload.totalTime, payload.totalSessions);

    // 1. Check Cache
    const cached = await this._getFromCache(cacheKey);
    if (cached) {
      console.log('[AI_SERVICE] Returning cached analysis for key:', cacheKey);
      return cached;
    }

    console.log('[AI_SERVICE] Fetching new analysis from Gemini...');

    // 2. Fetch from Gemini API
    let attempt = 0;
    const maxRetries = 1;

    while (attempt <= maxRetries) {
      try {
        if (!GEMINI_CONFIG.API_KEY) {
          throw new Error("Gemini API key is missing. Please configure GEMINI_API_KEY in env.js.");
        }

        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_CONFIG.MODEL}:generateContent?key=${GEMINI_CONFIG.API_KEY}`;

        const requestBody = {
          system_instruction: {
            parts: [{ text: SYSTEM_PROMPT }]
          },
          contents: [
            {
              role: "user",
              parts: [{ text: JSON.stringify(payload, null, 2) }]
            }
          ],
          generationConfig: {
            response_mime_type: "application/json",
            temperature: 0.7
          }
        };

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error?.message || `HTTP Error ${response.status}`);
        }

        const data = await response.json();

        if (!data.candidates || data.candidates.length === 0) {
          throw new Error("Gemini returned an empty response.");
        }

        const rawText = data.candidates[0].content.parts[0].text;

        let parsedData;
        try {
          parsedData = JSON.parse(rawText);
        } catch (parseError) {
          throw new Error("Failed to parse Gemini JSON output.");
        }

        // Validate JSON Structure
        if (!parsedData.title || !parsedData.corePattern || !parsedData.hiddenConnection || !parsedData.behavioralTension) {
          throw new Error("Gemini JSON output is missing required structured fields.");
        }

        // 3. Save to Cache
        await this._saveToCache(cacheKey, parsedData);

        return parsedData;

      } catch (error) {
        console.error(`[AI_SERVICE] Error generating analysis (Attempt ${attempt + 1}):`, error);
        attempt++;
        if (attempt > maxRetries) {
          throw error;
        }
      }
    }
  },

  _getFromCache: function (key) {
    return new Promise((resolve) => {
      chrome.storage.local.get([key], (result) => {
        resolve(result[key] || null);
      });
    });
  },

  _saveToCache: function (key, data) {
    return new Promise((resolve) => {
      const obj = {};
      obj[key] = data;
      chrome.storage.local.set(obj, () => {
        resolve();
      });
    });
  }
};

window.YTLyricsAIService = AIService;
