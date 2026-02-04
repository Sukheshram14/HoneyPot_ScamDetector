/**
 * HoneyPot AI - WhatsApp Web Content Script
 */

let observer = null;
let currentSessionId = null;

// Initialize when page loads
window.addEventListener('load', () => {
    console.log('HoneyPot AI Extension: Loaded');
    startObserver();
});

// Re-start observer if URL changes (SPA navigation)
let lastUrl = location.href; 
new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
        lastUrl = url;
        console.log('HoneyPot: Chat Switched - Resetting Session');
        processingSet.clear(); // Reset processed messages for new chat
        currentSessionId = null; // Force new session ID generation
        startObserver();
    }
}).observe(document, {subtree: true, childList: true});


// DEBUG: Visualizer to show what the script "sees"
// DEBUG: Visualizer removed for production
// setInterval(() => { ... }, 5000);

// Improved Selectors for 2026
const SELECTORS = {
    // Container for all messages
    messageList: 'div[role="application"]', 
    // Broadest row selector - looking for any flexible container in the message list
    messageRow: 'div[role="row"]', 
    // The actual text content wrapper
    messageText: 'span.selectable-text',
    // The bubble container (often has a specific class or style)
    bubble: 'div.copyable-text', 
    // Metadata/Time to append badge
    meta: '[data-pre-plain-text], ._1GTOQ' 
};

// DEBUG: Periodic cleanup, not scanning
setInterval(() => {
    // Optional: Log stats occasionally, but don't re-scan here
    // const count = document.querySelectorAll(SELECTORS.messageRow).length;
    // console.log(`[HoneyPot Status] Tracking ${count} rows`);
}, 60000);

function startObserver() {
    console.log('HoneyPot: Starting Observer...');
    const waitForChat = setInterval(() => {
        const main = document.getElementById('main');
        if (main) {
            clearInterval(waitForChat);
            console.log('HoneyPot: Chat Container Found');
            
            // Try to find the message list - it's usually the scrollable div
            const messageList = main.querySelector(SELECTORS.messageList) || 
                                main.closest('div[tabindex="-1"]') || 
                                document.querySelector('div._2gzeB'); // Fallback

            if (messageList) {
                console.log('HoneyPot: Message List target found', messageList);
                observer = new MutationObserver(handleMutations);
                observer.observe(messageList, {
                    childList: true,
                    subtree: true
                });
                scanExistingMessages(); // Initial scan
            } else {
                console.error('HoneyPot: Could not locate message list container.');
            }
        }
    }, 1000);
}

function handleMutations(mutations) {
    for (const mutation of mutations) {
        mutation.addedNodes.forEach(node => {
            if (node.nodeType === 1) {
                // Check if it IS a message or CONTAINS messages
                if (node.querySelector?.(SELECTORS.messageText)) {
                    processMessage(node);
                } else {
                     // Sometimes a whole block is added
                    const messages = node.querySelectorAll?.(SELECTORS.messageRow);
                    messages?.forEach(processMessage);
                }
            }
        });
    }
}

function scanExistingMessages() {
    console.log('HoneyPot: Scanning existing...');
    // Only select rows that haven't been scanned
    const messages = document.querySelectorAll(SELECTORS.messageRow);
    messages.forEach(processMessage);
}

const processingSet = new Set();

async function processMessage(node) {
    if (node.dataset.hpScanned) return;
    
    // Find the text
    const textNode = node.querySelector(SELECTORS.messageText);
    if (!textNode) return;
    
    // Use a unique ID to prevent double processing if DOM recycles
    const text = textNode.innerText;
    const msgId = text.substring(0, 20) + text.length; // Simple hash
    if (processingSet.has(msgId)) {
        node.dataset.hpScanned = 'true'; // Mark as scanned if we've seen this content recently
        return; 
    }
    
    node.dataset.hpScanned = 'true';
    processingSet.add(msgId);
    
    // Cleanup set to avoid memory leak
    if (processingSet.size > 1000) processingSet.clear();

    // console.log('HoneyPot Scanning:', text.substring(0, 20) + '...');

    const settings = await Utils.getSettings();

    chrome.runtime.sendMessage({
        action: 'analyzeMessage',
        text: text,
        sessionId: currentSessionId || 'unknown',
        autoMode: settings.autoMode // Pass the mode preference
    }, (response) => {
        if (chrome.runtime.lastError) return;
        
        if (response && (response.score > 0.4 || response.decision !== 'safe')) {
            console.log('HoneyPot Risk Detected:', response);
            markMessage(node, response);
        }
    });
}

// Listen for commands from Background (e.g., AI Reply)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'injectReply') {
        console.log('HoneyPot: Automating Reply...', request.text);
        sendReplyToChat(request.text);
    }
});

async function sendReplyToChat(message) {
    // 1. Find Input Box
    const inputBox = document.querySelector('div[contenteditable="true"][role="textbox"]') || 
                     document.querySelector('footer div[contenteditable="true"]');
    
    if (!inputBox) {
        console.error('HoneyPot: Could not find chat input box');
        return;
    }

    // 2. Focus and Simulate Typing
    inputBox.focus();
    
    // Modern React inputs often require execCommand or specific event simulation
    document.execCommand('insertText', false, message); 
    
    // Wait a moment before sending
    setTimeout(() => {
        const sendBtn = document.querySelector('span[data-icon="send"]');
        if (sendBtn) {
            sendBtn.click();
            console.log('HoneyPot: AI Reply Sent');
        } else {
            // Sometimes it's a button with an aria-label
            const altSend = document.querySelector('button[aria-label="Send"]');
            altSend?.click();
        }
    }, 500 + Math.random() * 1000); // Random delay 0.5s - 1.5s
}

function markMessage(node, analysis) {
    // We look for the INNER bubble connected to the text, which is more stable
    const textNode = node.querySelector(SELECTORS.messageText);
    if (!textNode) return;

    // Find the closest "bubble" container (usually parent of parent of text)
    // Structure: Row > Container > Bubble > Text
    let bubble = textNode.closest('div.copyable-text')?.parentElement;
    
    if (!bubble) {
        bubble = textNode.parentElement.parentElement; // Fallback
    }

    if (bubble) {
        const color = analysis.score > 0.7 ? '#ef4444' : '#f97316'; // Red-500 : Orange-500
        const bgColor = analysis.score > 0.7 ? '#fee2e2' : '#ffedd5'; // Red-100 : Orange-100
        
        // Apply styles to the BUBBLE directly
        bubble.style.border = `3px solid ${color}`;
        bubble.style.boxShadow = `0 4px 6px -1px ${color}`;
        bubble.style.backgroundColor = bgColor; // Tint the whole bubble
        
        // Add Warning Label inside the bubble so it stays with text
        const existingBadge = bubble.querySelector('.hp-warning-badge');
        if (!existingBadge) {
            const riskLabel = analysis.score > 0.7 ? '⛔ Scam Detected' : '⚠️ Suspicious';
            const badge = document.createElement('div');
            badge.className = 'hp-warning-badge';
            badge.style.cssText = `
                background-color: ${color};
                color: white;
                padding: 4px 8px;
                border-radius: 4px;
                font-weight: bold;
                font-size: 11px;
                margin-bottom: 6px;
                text-align: center;
                box-shadow: 0 1px 2px rgba(0,0,0,0.1);
            `;
            badge.innerText = riskLabel;
            
            // Insert at top of bubble
            bubble.insertBefore(badge, bubble.firstChild);
        }
    }
}
