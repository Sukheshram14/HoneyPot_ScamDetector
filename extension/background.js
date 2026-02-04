try {
    importScripts('utils.js');
} catch (e) {
    console.error(e);
}

// Cache results to save API calls
const analysisCache = new Map();

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'analyzeMessage') {
        handleMessageAnalysis(request, sendResponse);
        return true; // Keep channel open for async response
    }
});

async function handleMessageAnalysis(request, sendResponse) {
    const { text, sessionId, conversationHistory } = request;
    
    // 1. Check Cache
    const cacheKey = `${sessionId}:${text.substring(0, 50)}`; // Simple hash
    if (analysisCache.has(cacheKey)) {
        sendResponse(analysisCache.get(cacheKey));
        return;
    }

    // 2. Get Settings
    const settings = await Utils.getSettings();
    if (!settings.enabled) {
        sendResponse({ decision: 'safe', score: 0 });
        return;
    }

    // 3. Initial Local Check (Fast Fail)
    const localCheck = Utils.quickScan(text);
    if (!localCheck) {
        // Safe enough to not query LLM for every "Hello"
        const result = { decision: 'safe', score: 0.1 };
        // Don't cache 'safe' heavily to allow context changes, but ok for now
        sendResponse(result);
        return;
    }

    // 4. API Call
    // 4. API Call
    try {
        // PRIVACY: Redact PII before sending to cloud
        const safeText = Utils.redactPII(text);
        
        const res = await fetch(`${settings.apiUrl}/api/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': settings.apiKey
            },
            body: JSON.stringify({
                sessionId: sessionId,
                message: safeText, // Send redacted text
                conversationHistory: conversationHistory || [],
                metadata: { 
                    source: 'whatsapp_web',
                    persona: settings.persona || 'default' 
                }
            })
        });

        if (!res.ok) throw new Error('API Error');
        
        const data = await res.json();
        
        // Parse response to determine risk
        // Note: The backend returns a reply, but acts on 'sessionData' state. 
        // We need to infer risk from the fact it processed it or extended the session.
        // Ideally backend should return the analysis score directly in the response.
        // For MVP, we will assume if it replied with a "scamDetected" flag (we need to add this to backend response)
        // OR we just use the local check's severity combined with the fact it didn't error.
        
        // WAIT: The backend response currently is just { status: "success", reply: ... }
        // We should add 'analysis' to the response in server.js to make this useful.
        // For now, I'll simulate logic: if extraction worked, it's worth flagging.
        
        let riskScore = 0.5; // Default suspicious if it passed local check
        let decision = 'review';

        // Update stats
        Utils.incrementStat('messagesScanned');

        if (settings.autoMode && data.reply) {
            // AUTOMATIC MODE: Trigger the reply injection
            // Add randomized delay (Human-like behavior)
            const minDelay = 2000;
            const maxDelay = 6000;
            const delay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;

            console.log(`HoneyPot Background: Queuing Auto-Reply in ${delay}ms`);
            
            setTimeout(() => {
                chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
                    if (tabs[0]) {
                        chrome.tabs.sendMessage(tabs[0].id, {
                            action: "injectReply",
                            text: data.reply
                        });
                    }
                });
            }, delay);

            decision = 'autonomous_engaged';
        }

        const result = { 
            decision: decision, 
            score: riskScore,
            reply: data.reply
        };

        analysisCache.set(cacheKey, result);
        sendResponse(result);

    } catch (error) {
        console.error('Analysis Failed', error);
        
        // Fallback to local check result if API is down
        if (localCheck && localCheck.type) {
             const fallbackResult = { 
                decision: 'warning', 
                score: 0.8, // High confidence for local regex match
                error: true 
            };
            analysisCache.set(cacheKey, fallbackResult);
            sendResponse(fallbackResult);
            return;
        }

        sendResponse({ 
            decision: 'safe', 
            score: 0, 
            error: true 
        });
    }
}
