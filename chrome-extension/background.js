// background.js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.source !== 'GEMINI_PODCAST_CONTENT') return;

  // Retrieve the target applet URL config
  chrome.storage.local.get(['appUrl'], (result) => {
    const appUrl = result.appUrl;
    if (!appUrl) return;

    // Normalize appUrl domain search criteria
    const strippedTarget = appUrl.replace('https://', '').replace('http://', '').split('/')[0];

    chrome.tabs.query({}, (tabs) => {
      // Find open Studio App tabs matching the config
      const matchingTabs = tabs.filter(t => t.url && t.url.includes(strippedTarget));

      if (matchingTabs.length > 0) {
        matchingTabs.forEach(targetTab => {
          // Execute script to bubble postMessage inside the applet page
          chrome.scripting.executeScript({
            target: { tabId: targetTab.id },
            func: (payload) => {
              window.postMessage({
                source: 'GEMINI_PODCAST_EXTENSION',
                type: payload.type,
                url: payload.url,
                content: payload.content,
                title: payload.title,
                contentType: payload.contentType,
                sourceName: payload.sourceName,
                isLive: payload.isLive,
                currentTime: payload.currentTime,
                duration: payload.duration
              }, '*');
            },
            args: [message]
          }, () => {
             if (chrome.runtime.lastError) {
               console.log("Transmission relay silent: " + chrome.runtime.lastError.message);
             }
          });
        });
      }
    });
  });
});
