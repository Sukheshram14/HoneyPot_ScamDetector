document.addEventListener('DOMContentLoaded', async () => {
    // UI Elements
    const connectionStatus = document.getElementById('connectionStatus');
    const autoModeToggle = document.getElementById('autoModeToggle');
    const scamsDetectedEl = document.getElementById('scamsDetected');
    const messagesScannedEl = document.getElementById('messagesScanned');
    const settingsBtn = document.getElementById('settingsBtn');
    const settingsModal = document.getElementById('settingsModal');
    const closeSettings = document.querySelector('.close-btn');
    const saveSettingsFn = document.getElementById('saveSettings');
    const apiUrlInput = document.getElementById('apiUrl');
    const apiKeyInput = document.getElementById('apiKey');
    const personaSelect = document.getElementById('personaSelect');

    // Load Initial State
    const settings = await Utils.getSettings();
    const stats = await Utils.getStats();

    // Fill UI
    extensionToggle.checked = settings.enabled;
    autoModeToggle.checked = settings.autoMode;
    scamsDetectedEl.textContent = stats.scamsDetected;
    messagesScannedEl.textContent = stats.messagesScanned;
    apiUrlInput.value = settings.apiUrl;
    apiKeyInput.value = settings.apiKey;
    personaSelect.value = settings.persona || 'default';

    // Check Connection
    checkConnection(settings.apiUrl);

    // --- EVENT LISTENERS ---

    // Toggle Extension
    extensionToggle.addEventListener('change', (e) => {
        const enabled = e.target.checked;
        Utils.saveSettings({ enabled });
    });

    // Toggle Auto Mode
    autoModeToggle.addEventListener('change', (e) => {
        const autoMode = e.target.checked;
        Utils.saveSettings({ autoMode });
        // Optional: Show warning or confirmation for enabling active AI
    });

    // Settings Modal
    settingsBtn.addEventListener('click', () => {
        settingsModal.classList.remove('hidden');
    });

    closeSettings.addEventListener('click', () => {
        settingsModal.classList.add('hidden');
    });

    const reportBtn = document.getElementById('reportBtn'); // This exists in HTML footer

    // Save Settings
    saveSettingsFn.addEventListener('click', () => {
        const newSettings = {
            apiUrl: apiUrlInput.value,
            apiKey: apiKeyInput.value,
            persona: personaSelect.value
        };
        Utils.saveSettings(newSettings);
        settingsModal.classList.add('hidden');
        checkConnection(newSettings.apiUrl);
    });

    // Generate Report
    reportBtn.addEventListener('click', async () => {
        const currentStats = await Utils.getStats();
        // Dynamic import or assume loaded in HTML
        if (window.ReportGenerator) {
            ReportGenerator.generatePDF({
                detectionCount: currentStats.scamsDetected,
                messagesScanned: currentStats.messagesScanned
            });
        } else {
            console.error('ReportGenerator not loaded');
        }
    });

    // --- HELPERS ---

    async function checkConnection(url) {
        connectionStatus.classList.remove('connected', 'disconnected');
        try {
            const res = await fetch(`${url}/`, { method: 'GET' });
            if (res.ok) {
                connectionStatus.classList.add('connected');
                connectionStatus.querySelector('.text').textContent = 'Connected';
            } else {
                throw new Error('Status not OK');
            }
        } catch (e) {
            console.error('Connection Check Failed:', e);
            connectionStatus.classList.add('disconnected');
            connectionStatus.querySelector('.text').textContent = 'Disconnected';
        }
    }

    // Live Stat Updates (listen for changes)
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local') {
            if (changes.scamsDetected) scamsDetectedEl.textContent = changes.scamsDetected.newValue;
            if (changes.messagesScanned) messagesScannedEl.textContent = changes.messagesScanned.newValue;
        }
    });
});
