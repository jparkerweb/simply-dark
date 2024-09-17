console.log('domainPreferences.js script loaded');

const DomainPreferences = {
  async getDarkModeForDomain(domain) {
    console.log(`Getting dark mode for domain: ${domain}`);
    return new Promise((resolve) => {
      chrome.storage.sync.get(domain, (result) => {
        console.log(`Dark mode state for ${domain}:`, result[domain]);
        resolve(result[domain] || false);
      });
    });
  },

  async setDarkModeForDomain(domain, enabled) {
    console.log(`Setting dark mode for domain: ${domain} to ${enabled}`);
    return new Promise((resolve) => {
      chrome.storage.sync.set({ [domain]: enabled }, () => {
        console.log(`Dark mode set for ${domain}`);
        resolve();
      });
    });
  },

  async toggleDarkModeForDomain(domain) {
    console.log(`Toggling dark mode for domain: ${domain}`);
    const currentState = await this.getDarkModeForDomain(domain);
    await this.setDarkModeForDomain(domain, !currentState);
    console.log(`New dark mode state for ${domain}: ${!currentState}`);
    return !currentState;
  }
};

window.DomainPreferences = DomainPreferences;
console.log('DomainPreferences defined');

console.log('domainPreferences.js script execution completed');
