document.addEventListener('DOMContentLoaded', function() {
  const toggleSwitch = document.getElementById('darkModeToggle');
  const domainDisplay = document.getElementById('currentDomain');
  const saveColorsButton = document.getElementById('saveColors');
  const resetColorsButton = document.getElementById('resetColors');
  const colorInputs = {
    backgroundColor: document.getElementById('backgroundColor'),
    textColor: document.getElementById('textColor'),
    linkColor: document.getElementById('linkColor'),
    borderColor: document.getElementById('borderColor')
  };

  const defaultColors = {
    backgroundColor: '#121212',
    textColor: '#e4e4e4',
    linkColor: '#3391ff',
    borderColor: '#555555'
  };

  // Load saved colors
  chrome.storage.sync.get('customColors', function(result) {
    if (result.customColors) {
      Object.keys(colorInputs).forEach(key => {
        colorInputs[key].value = result.customColors[key];
      });
    }
  });

  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    const domain = new URL(tabs[0].url).hostname;
    domainDisplay.textContent = domain;

    chrome.runtime.sendMessage({action: "getDarkModeState", domain}, function(response) {
      if (chrome.runtime.lastError) {
        console.error('Error:', chrome.runtime.lastError);
        toggleSwitch.disabled = true;
      } else if (response && response.darkModeEnabled !== undefined) {
        toggleSwitch.checked = response.darkModeEnabled;
      } else {
        console.error('Invalid response from background script:', response);
        toggleSwitch.disabled = true;
      }
    });
  });

  toggleSwitch.addEventListener('change', function() {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      const domain = new URL(tabs[0].url).hostname;
      chrome.runtime.sendMessage({action: "toggleDarkMode", domain}, function(response) {
        if (chrome.runtime.lastError) {
          console.error('Error:', chrome.runtime.lastError);
        } else if (response && response.newState !== undefined) {
          toggleSwitch.checked = response.newState;
          reloadCurrentTab();
        } else {
          console.error('Invalid response from background script:', response);
        }
      });
    });
  });

  saveColorsButton.addEventListener('click', function() {
    const customColors = {};
    Object.keys(colorInputs).forEach(key => {
      customColors[key] = colorInputs[key].value;
    });
    chrome.storage.sync.set({customColors: customColors}, function() {
      console.log('Custom colors saved');
      reloadCurrentTab();
    });
  });

  resetColorsButton.addEventListener('click', function() {
    Object.keys(colorInputs).forEach(key => {
      colorInputs[key].value = defaultColors[key];
    });
    chrome.storage.sync.remove('customColors', function() {
      console.log('Colors reset to default');
      reloadCurrentTab();
    });
  });

  function reloadCurrentTab() {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      chrome.tabs.reload(tabs[0].id);
    });
  }
});
