document.addEventListener('DOMContentLoaded', async () => {
  const appUrlInput = document.getElementById('appUrl');
  const syncBtn = document.getElementById('syncBtn');
  const toggleSleepBtn = document.getElementById('toggleSleepBtn');
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const detectedUrlEl = document.getElementById('detectedUrl');
  const playbackStatusEl = document.getElementById('playbackStatus');

  // Load saved configurations
  chrome.storage.local.get(['appUrl', 'isActive'], (result) => {
    if (result.appUrl) {
      appUrlInput.value = result.appUrl;
    } else {
      // Default placeholder
      appUrlInput.value = "https://ais-pre-r5uswfubwv5pusctmo7kck-420492939424.us-west2.run.app";
    }
    
    const isActive = result.isActive !== false;
    updateStatusUI(isActive);
  });

  // Scrape Active Tab details
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) {
    detectedUrlEl.textContent = tab.title || tab.url;
    if (tab.url && tab.url.includes('youtube.com/watch')) {
      playbackStatusEl.textContent = "YouTube Player Ready";
    } else {
      playbackStatusEl.textContent = "Web Content Ready";
    }
  }

  appUrlInput.addEventListener('input', () => {
    chrome.storage.local.set({ appUrl: appUrlInput.value });
  });

  toggleSleepBtn.addEventListener('click', () => {
    chrome.storage.local.get(['isActive'], (result) => {
      const nextActive = !result.isActive;
      chrome.storage.local.set({ isActive: nextActive }, () => {
        updateStatusUI(nextActive);
        if (tab) {
          chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_ACTIVE', isActive: nextActive }, () => {
            // Safe callback
            if (chrome.runtime.lastError) {}
          });
        }
      });
    });
  });

  syncBtn.addEventListener('click', async () => {
    if (!tab) return;
    
    syncBtn.disabled = true;
    syncBtn.textContent = "⌛ Syncing...";

    chrome.tabs.sendMessage(tab.id, { 
      type: 'SCRAPE_PAGE',
      targetAppUrl: appUrlInput.value 
    }, (response) => {
      syncBtn.disabled = false;
      syncBtn.textContent = "🔄 Sync Page to Studio";
      
      if (chrome.runtime.lastError) {
        alert("Failed to communicate with page. Try reloading the active tab.");
      } else if (response && response.success) {
        // Successful transmission prompt
        showStatusBanner("Successfully Synced!");
      } else {
        alert("Verification check failed or tab was asleep.");
      }
    });
  });

  function updateStatusUI(isActive) {
    if (isActive) {
      statusDot.classList.add('active');
      statusText.textContent = "Active";
    } else {
      statusDot.classList.remove('active');
      statusText.textContent = "Sleep";
    }
  }

  function showStatusBanner(text) {
    const originalText = syncBtn.textContent;
    syncBtn.textContent = text;
    syncBtn.style.backgroundColor = "#10b981";
    setTimeout(() => {
      syncBtn.textContent = originalText;
      syncBtn.style.backgroundColor = "#ff4e00";
    }, 2000);
  }
});
