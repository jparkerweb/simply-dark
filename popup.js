// ID -> storage-key map for color inputs in popup.html:
//   backgroundColor -> bg
//   textColor       -> text
//   linkColor       -> link
//   borderColor     -> border
// Storage shape: chrome.storage.local = {
//   domains: { [host]: bool },
//   colors: { bg, text, link, border },       // persisted (committed via Save)
//   previewColors: { bg, text, link, border } // ephemeral live-preview; cleared on close/save/reset
// }

const DEFAULTS = { bg: '#121212', text: '#e4e4e4', link: '#3391ff', border: '#555555' };
const COLOR_MAP = { backgroundColor: 'bg', textColor: 'text', linkColor: 'link', borderColor: 'border' };

let currentDomain = null;

async function getActiveDomain() {
  const override = new URLSearchParams(location.search).get('testDomain');
  if (override) return override;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) return null;
  try {
    return new URL(tab.url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

function setInputs(colors) {
  for (const [inputId, key] of Object.entries(COLOR_MAP)) {
    const el = document.getElementById(inputId);
    if (el) el.value = colors?.[key] ?? DEFAULTS[key];
  }
}

function readInputs() {
  const colors = {};
  for (const [inputId, key] of Object.entries(COLOR_MAP)) {
    colors[key] = document.getElementById(inputId).value;
  }
  return colors;
}

async function render() {
  currentDomain = await getActiveDomain();
  const domainEl = document.getElementById('currentDomain');
  const toggle = document.getElementById('darkModeToggle');

  if (currentDomain) {
    domainEl.textContent = currentDomain;
  } else {
    domainEl.textContent = 'No active tab';
    toggle.disabled = true;
  }

  await chrome.storage.local.remove('previewColors');
  const { domains = {}, colors } = await chrome.storage.local.get(['domains', 'colors']);
  toggle.checked = !!domains[currentDomain];
  setInputs(colors);
}

async function onToggleChange() {
  if (!currentDomain) return;
  const { domains = {} } = await chrome.storage.local.get('domains');
  domains[currentDomain] = !domains[currentDomain];
  await chrome.storage.local.set({ domains });
}

async function onColorInput() {
  await chrome.storage.local.set({ previewColors: readInputs() });
}

async function onSaveColors() {
  await chrome.storage.local.set({ colors: readInputs() });
  await chrome.storage.local.remove('previewColors');
}

async function onResetColors() {
  await chrome.storage.local.remove(['colors', 'previewColors']);
  for (const [inputId, key] of Object.entries(COLOR_MAP)) {
    document.getElementById(inputId).value = DEFAULTS[key];
  }
}

function syncUIFromStorage(patch) {
  if ('domains' in patch) {
    const toggle = document.getElementById('darkModeToggle');
    toggle.checked = !!(patch.domains && patch.domains[currentDomain]);
  }
  if ('colors' in patch) {
    setInputs(patch.colors);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  render();
  document.getElementById('darkModeToggle').addEventListener('change', onToggleChange);
  document.getElementById('saveColors').addEventListener('click', onSaveColors);
  document.getElementById('resetColors').addEventListener('click', onResetColors);

  for (const inputId of Object.keys(COLOR_MAP)) {
    const el = document.getElementById(inputId);
    if (el) el.addEventListener('input', onColorInput);
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    const patch = {};
    if (changes.domains) patch.domains = changes.domains.newValue || {};
    if (changes.colors) patch.colors = changes.colors.newValue;
    if ('domains' in patch || 'colors' in patch) syncUIFromStorage(patch);
  });
});

window.addEventListener('pagehide', () => {
  chrome.storage.local.remove('previewColors');
});
