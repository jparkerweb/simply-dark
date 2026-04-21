function domainFromUrl(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

async function migrate() {
  const raw = await chrome.storage.sync.get(null);
  const domains = {};
  let colors;

  for (const key of Object.keys(raw)) {
    const value = raw[key];
    if (key === 'customColors' && value && typeof value === 'object') {
      const mapped = {};
      if (typeof value.backgroundColor === 'string') mapped.bg = value.backgroundColor;
      if (typeof value.textColor === 'string') mapped.text = value.textColor;
      if (typeof value.linkColor === 'string') mapped.link = value.linkColor;
      if (typeof value.borderColor === 'string') mapped.border = value.borderColor;
      if (Object.keys(mapped).length) colors = mapped;
    } else if (key === 'cssVersion' || key === 'DomainPreferences') {
      continue;
    } else if (typeof value === 'boolean') {
      const canon = key.replace(/^www\./, '');
      domains[canon] = domains[canon] || value;
    }
  }

  const payload = { domains };
  if (colors) payload.colors = colors;

  await chrome.storage.local.set(payload);
  await chrome.storage.sync.clear();
}

chrome.runtime.onInstalled.addListener(() => { migrate(); });

async function onToggleCommand() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) return;
  const domain = domainFromUrl(tab.url);
  if (!domain) return;
  const { domains = {} } = await chrome.storage.local.get('domains');
  domains[domain] = !domains[domain];
  await chrome.storage.local.set({ domains });
}

chrome.commands.onCommand.addListener(cmd => {
  if (cmd === 'toggle-dark-mode') onToggleCommand();
});
