(function() {
  const domain = window.location.hostname;
  chrome.storage.sync.get(domain, (result) => {
    if (result[domain]) {
      document.documentElement.style.setProperty('color-scheme', 'dark');
    }
  });
})();