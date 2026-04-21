const domain = location.hostname.replace(/^www\./, '');

const COLOR_KEYS = {
  bg: '--sd-bg',
  text: '--sd-text',
  link: '--sd-link',
  border: '--sd-border',
};

function apply(enabled, colors) {
  const root = document.documentElement;
  if (enabled) {
    root.classList.add('simply-dark');
  } else {
    root.classList.remove('simply-dark');
  }
  for (const [key, prop] of Object.entries(COLOR_KEYS)) {
    if (colors && colors[key]) {
      root.style.setProperty(prop, colors[key]);
    } else {
      root.style.removeProperty(prop);
    }
  }
}

function loadAndApply() {
  chrome.storage.local.get(['domains', 'colors', 'previewColors'], ({ domains, colors, previewColors }) => {
    apply(!!(domains && domains[domain]), previewColors || colors);
  });
}

loadAndApply();

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.domains || changes.colors || changes.previewColors)) {
    loadAndApply();
  }
});
