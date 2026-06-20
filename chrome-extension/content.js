// content.js
let isActive = true;
let currentAppUrl = "";

// 1. Initial State Sync
chrome.storage.local.get(['isActive', 'appUrl'], (result) => {
  isActive = result.isActive !== false;
  currentAppUrl = result.appUrl || "";
});

// 2. Continuous Playback Tracker for YouTube
let lastSentTime = -1;
setInterval(() => {
  if (!isActive) return;

  // Check if we are on a YouTube video page
  if (window.location.hostname.includes('youtube.com') && window.location.pathname.includes('watch')) {
    const video = document.querySelector('video');
    if (video && !video.paused) {
      const currentTime = Math.floor(video.currentTime);
      const duration = Math.floor(video.duration);
      
      // Prevent flooding - send once per second
      if (currentTime !== lastSentTime) {
        lastSentTime = currentTime;
        
        // Send updates to the background worker to relay to the open Applet tab
        chrome.runtime.sendMessage({
          source: 'GEMINI_PODCAST_CONTENT',
          type: 'UPDATE_PLAYBACK',
          currentTime,
          duration,
          url: window.location.href
        });
      }
    }
  }
}, 1000);

// 3. Hear operations from popup or background worker
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'TOGGLE_ACTIVE') {
    isActive = request.isActive;
    sendResponse({ success: true, isActive });
    return true;
  }

  if (request.type === 'SCRAPE_PAGE') {
    const scrapedText = extractPageContent();
    const title = document.title || "Web Article";
    const sourceName = window.location.hostname;
    const contentType = window.location.href.includes('youtube.com') ? 'video' : 'article';

    // Broadcast context sync request to background script to relay to open Studio App
    chrome.runtime.sendMessage({
      source: 'GEMINI_PODCAST_CONTENT',
      type: 'SYNC_STATE',
      url: window.location.href,
      content: scrapedText,
      title: title,
      contentType: contentType,
      sourceName: sourceName,
      isLive: isActive
    });

    sendResponse({ success: true, textLength: scrapedText.length });
    return true;
  }
});

// 4. Relay direct messages to web app window if this tab IS the Studio App
window.addEventListener('message', (event) => {
  // If we receive events from background or other frames, we can forward them here
});

// Helper: Extract text cleanly from page
function extractPageContent() {
  // If YouTube, try to find description, comments, or title
  if (window.location.hostname.includes('youtube.com')) {
    const videoTitle = document.querySelector('h1.ytd-watch-metadata')?.textContent?.trim() || document.title;
    const descriptionText = document.querySelector('#description-inline-expander')?.textContent?.trim() || "";
    return `[0s] (Video Content) Title: ${videoTitle}\n\nDescription details: ${descriptionText.slice(0, 1500)}`;
  }

  // If generic article, grab headings and paragraph blocks
  const paragraphs = Array.from(document.querySelectorAll('article p, main p, div.content p, p'));
  const bodyText = paragraphs
    .map(p => p.textContent?.trim() || "")
    .filter(text => text.length > 30)
    .join("\n\n");

  return bodyText.slice(0, 5000) || "Could not scrape core body text automatically. Please use copy-paste option.";
}
