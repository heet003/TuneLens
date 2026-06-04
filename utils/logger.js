/**
 * Phase 5: Logger Utility
 * Provides consistent logging with debug mode toggling.
 */
const Logger = {
  debugMode: true,
  prefix: '[YT-LYRICS]',

  init: function() {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.get(['debugMode'], (result) => {
        if (result.debugMode !== undefined) {
          this.debugMode = result.debugMode;
        }
      });
    }
  },

  log: function(...args) {
    if (this.debugMode) console.log(this.prefix, ...args);
  },
  
  warn: function(...args) {
    if (this.debugMode) console.warn(this.prefix, ...args);
  },
  
  error: function(...args) {
    if (this.debugMode) console.error(this.prefix, ...args);
  },
  
  success: function(...args) {
    if (this.debugMode) console.log(`%c${this.prefix}`, 'color: #00ff00; font-weight: bold;', ...args);
  }
};

Logger.init();
window.YTLyricsLogger = Logger;
