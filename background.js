chrome.commands.onCommand.addListener((command) => {
  if (command === "toggle-dark-mode") {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      chrome.tabs.sendMessage(tabs[0].id, {action: "toggle"});
    });
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("Background script received message:", request);

  if (request.action === "getDarkModeState") {
    console.log("Handling getDarkModeState request");
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (chrome.runtime.lastError) {
        console.error(chrome.runtime.lastError);
        sendResponse({error: "Unable to get current tab"});
        return;
      }
      const domain = new URL(tabs[0].url).hostname;
      console.log("Current domain:", domain);
      chrome.storage.sync.get(domain, (result) => {
        const darkModeEnabled = result[domain] || false;
        console.log("Dark mode state for", domain, ":", darkModeEnabled);
        sendResponse({darkModeEnabled: darkModeEnabled});
      });
    });
    return true; // Indicates that the response is asynchronous
  }
  
  if (request.action === "toggleDarkMode") {
    const { domain } = request;
    chrome.storage.sync.get(domain, (result) => {
      const newState = !result[domain];
      chrome.storage.sync.set({ [domain]: newState }, () => {
        sendResponse({ newState });
      });
    });
    return true; // Indicates that the response is asynchronous
  }
});
