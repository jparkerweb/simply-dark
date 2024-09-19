// Load DomainPreferences from the extension's storage
async function loadDomainPreferences() {
  return new Promise((resolve) => {
    chrome.storage.local.get('DomainPreferences', (result) => {
      if (result.DomainPreferences) {
        resolve(result.DomainPreferences);
      } else {
        resolve({
          getDarkModeForDomain: async (domain) => {
            return new Promise((resolve) => {
              chrome.storage.sync.get(domain, (result) => {
                resolve(result[domain] || false);
              });
            });
          },
          setDarkModeForDomain: async (domain, enabled) => {
            return new Promise((resolve) => {
              chrome.storage.sync.set({ [domain]: enabled }, resolve);
            });
          },
          toggleDarkModeForDomain: async (domain) => {
            const currentState = await this.getDarkModeForDomain(domain);
            const newState = !currentState;
            await this.setDarkModeForDomain(domain, newState);
            return newState;
          }
        });
      }
    });
  });
}

function applyDarkMode() {
  document.documentElement.classList.add('simply-dark-mode');
  document.documentElement.style.setProperty('color-scheme', 'dark');
  invertColors();
}

function removeDarkMode() {
  document.documentElement.classList.remove('simply-dark-mode');
  document.documentElement.style.removeProperty('color-scheme');
  removeInversion();
  removeDarkModeStyles();
}

function removeDarkModeStyles() {
  const elements = document.getElementsByTagName('*');
  for (let i = 0; i < elements.length; i++) {
    elements[i].style.removeProperty('background-color');
    elements[i].style.removeProperty('color');
    elements[i].style.removeProperty('border-color');
  }
  document.body.style.removeProperty('background-color');
  document.body.style.removeProperty('color');
}

function getCurrentDomain() {
  return window.location.hostname;
}

// Function to toggle dark mode for a domain
async function toggleDarkModeForDomain(domain) {
  const newState = await DomainPreferences.toggleDarkModeForDomain(domain);
  if (newState) {
    applyDarkMode();
  } else {
    removeDarkMode();
  }
  // Force a repaint to ensure all styles are updated
  document.body.style.display = 'none';
  document.body.offsetHeight; // Trigger a reflow
  document.body.style.display = '';
  return newState;
}

// Message listener
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "toggle") {
    const domain = getCurrentDomain();
    const newState = toggleDarkModeForDomain(domain);
    sendResponse({ success: true, newState: newState });
  }
});

function invertColors() {
  const styleId = 'simply-dark-style';
  let style = document.getElementById(styleId);
  if (!style) {
    style = document.createElement('style');
    style.id = styleId;
    document.head.appendChild(style);
  }

  chrome.storage.sync.get(['customColors', 'cssVersion'], function(result) {
    const colors = result.customColors || {
      backgroundColor: '#121212',
      textColor: '#e4e4e4',
      linkColor: '#3391ff',
      borderColor: '#555555'
    };
    const cssVersion = result.cssVersion || 1;

    const css = `
      /* CSS Version: ${cssVersion} */
      html.simply-dark-mode {
        --background-color: ${colors.backgroundColor};
        --text-color: ${colors.textColor};
        --link-color: ${colors.linkColor};
        --border-color: ${colors.borderColor};
      }
      html.simply-dark-mode,
      html.simply-dark-mode body {
        background-color: var(--background-color) !important;
        color: var(--text-color) !important;
        transition: background-color 0.3s ease, color 0.3s ease;
      }
      html.simply-dark-mode *:not(#simply-dark-mode-indicator):not(a) {
        background-color: var(--background-color) !important;
        color: var(--text-color) !important;
        border-color: var(--border-color) !important;
      }
      html.simply-dark-mode img,
      html.simply-dark-mode video,
      html.simply-dark-mode canvas,
      html.simply-dark-mode picture,
      html.simply-dark-mode [style*="background-image"] {
        filter: brightness(0.8) contrast(1.2) !important;
      }
      html.simply-dark-mode a,
      html.simply-dark-mode a:link,
      html.simply-dark-mode a:visited,
      html.simply-dark-mode a:hover,
      html.simply-dark-mode a:active {
        color: var(--link-color) !important;
      }
    `;

    style.textContent = css;
  });
}

function removeInversion() {
  const styleId = 'simply-dark-style';
  const style = document.getElementById(styleId);
  if (style) {
    style.remove(); // Remove the style element completely
  }
  // Remove inline styles set by the extension
  document.documentElement.style.removeProperty('--background-color');
  document.documentElement.style.removeProperty('--text-color');
  document.documentElement.style.removeProperty('--link-color');
  document.documentElement.style.removeProperty('--border-color');
}

// Initialize dark mode based on stored preference
async function initializeDarkMode() {
  const domain = getCurrentDomain();
  try {
    const DomainPreferences = await loadDomainPreferences();
    const darkModeEnabled = await DomainPreferences.getDarkModeForDomain(domain);
    if (darkModeEnabled) {
      // Apply dark mode immediately
      document.documentElement.style.setProperty('color-scheme', 'dark');
      applyDarkMode();
    }
  } catch (error) {
    console.error('Error initializing dark mode:', error);
  }
}

// Run initialization immediately
initializeDarkMode();

// Modify the MutationObserver to use the loaded DomainPreferences
const observer = new MutationObserver((mutations) => {
  mutations.forEach((mutation) => {
    if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
      const domain = getCurrentDomain();
      loadDomainPreferences().then(DomainPreferences => {
        DomainPreferences.getDarkModeForDomain(domain).then(isDarkModeEnabled => {
          if (isDarkModeEnabled && !document.documentElement.classList.contains('simply-dark-mode')) {
            applyDarkMode();
          } else if (!isDarkModeEnabled && document.documentElement.classList.contains('simply-dark-mode')) {
            removeDarkMode();
          }
        });
      });
    }
  });
});

observer.observe(document.documentElement, { attributes: true, childList: true, subtree: true });
