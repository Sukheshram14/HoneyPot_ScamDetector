/**
 * HoneyPot AI Extension Utilities
 * Shared logic between content script, background, and popup.
 */

const Utils = {
    PATTERNS: {
        upiIds: /[a-zA-Z0-9.\-_]{2,256}@(paytm|ybl|okaxis|oksbi|axl|ibl|upi|okhdfcbank|okicici|barodampay|idbi|aubank|axisbank|bandhan|federal|hdfcbank|icici|indus|kbl|kotak|paywiz|rbl|sbi|sc|sib|uco|unionbank|yesbank)/gi,
        bankAccounts: /\b\d{9,18}\b/g,
        phoneNumbers: /(?:\+91[\-\s]?)?[6-9]\d{9}\b/g,
        phishingLinks: /https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&//=]*)/gi,
        keywords: [
            "blocked", "suspended", "verify", "kyc", "urgency", "urgent", "immediate", 
            "expire", "lapse", "refund", "lottery", "winner", "prize", "password", "otp", 
            "pin", "cvv", "atm card", "credit card", "debit card", "click here", "link",
            "police", "arrest", "jail", "cbi", "customs", "suicide", "died", "killed",
            "accident", "hospital", "drugs", "illegal", "fbi", "income tax", "seized"
        ]
    },

    /**
     * EXTRACT INTELLIGENCE (Local Fast Pass)
     * Returns true if any suspicious patterns are found
     */
    quickScan: (text) => {
        if (!text) return false;
        text = text.toLowerCase();
        
        // 1. Check for specific patterns
        if (text.match(Utils.PATTERNS.upiIds)) return { type: 'upi', risk: 'high' };
        if (text.match(Utils.PATTERNS.phishingLinks)) return { type: 'link', risk: 'medium' };
        
        // 2. Keyword density check
        let keywordCount = 0;
        for (const kw of Utils.PATTERNS.keywords) {
            if (text.includes(kw)) keywordCount++;
        }

        if (keywordCount >= 2) return { type: 'keyword', risk: 'medium' };
        if (keywordCount === 1) return { type: 'keyword', risk: 'low' };
        
        return null;
    },

    /**
     * PRIVACY: Redact PII (Phone/Email) locally
     */
    redactPII: (text) => {
        if (!text) return "";
        return text
            .replace(Utils.PATTERNS.phoneNumbers, '[PHONE_REDACTED]')
            .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL_REDACTED]');
    },

    /**
     * STORAGE HELPERS
     */
    getSettings: async () => {
        return new Promise((resolve) => {
            chrome.storage.sync.get(['apiUrl', 'apiKey', 'enabled', 'autoMode'], (items) => {
                resolve({
                    apiUrl: items.apiUrl || 'http://localhost:3000',
                    apiKey: items.apiKey || 'GUVI_SECRET_KEY',
                    enabled: items.enabled !== false, // Default true
                    autoMode: items.autoMode || false // Default false
                });
            });
        });
    },

    saveSettings: (settings) => {
        return new Promise((resolve) => {
            chrome.storage.sync.set(settings, resolve);
        });
    },

    getStats: async () => {
        return new Promise((resolve) => {
            chrome.storage.local.get(['scamsDetected', 'messagesScanned'], (items) => {
                resolve({
                    scamsDetected: items.scamsDetected || 0,
                    messagesScanned: items.messagesScanned || 0
                });
            });
        });
    },

    incrementStat: (key) => {
        chrome.storage.local.get([key], (items) => {
            const current = items[key] || 0;
            chrome.storage.local.set({ [key]: current + 1 });
        });
    },

    /**
     * GENERATE SESSION ID
     * Creates a consistent ID for a chat title
     */
    generateSessionId: (title) => {
        // Simple hash to make it safe for URLs
        let hash = 0;
        for (let i = 0; i < title.length; i++) {
            const char = title.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return `wa-session-${Math.abs(hash)}`;
    }
};
