const fs = require('node:fs/promises');
const path = require('node:path');
const { expect } = require('@playwright/test');

const MODERN_TOOLBAR = '<div class="ol-toolbar-layout-right" id="toolbar"><button type="button">Review</button></div>';
const LEGACY_TOOLBAR = '<div class="ol-cm-toolbar-button-group ol-cm-toolbar-end" id="toolbar"><button type="button">Review</button></div>';
const GLOBAL_TOOLBAR = '<div class="ide-redesign-toolbar-actions" id="global-toolbar"><button type="button">Share</button></div>';
const VALID_BIB = '@article{attention2026,\n  title = {Attention with {Nested} Braces},\n  author = {Yin, Xunjian},\n  year = {2026}\n}';

/** Each test runs an inert Overleaf fixture in a fresh browser context. */
async function boot(page, { toolbar = MODERN_TOOLBAR, storage = {} } = {}) {
  await page.route('**/*', async (route) => {
    if (route.request().isNavigationRequest()) {
      return route.fulfill({
        contentType: 'text/html',
        body: `<!doctype html><html><head><style>
          body { margin: 0; font: 14px Arial; }
          #editor { min-height: 500px; }
          .ol-toolbar-layout-right, .ol-cm-toolbar-button-group, .ide-redesign-toolbar-actions {
            display: flex; gap: 6px; align-items: center; min-height: 36px; justify-content: flex-end;
          }
        </style></head><body>${toolbar}<main id="editor" tabindex="0">Overleaf editor fixture</main></body></html>`,
      });
    }
    return route.abort();
  });
  await page.goto('https://www.overleaf.com/project/regression-fixture');
  await page.evaluate((initialStorage) => {
    const state = window.__obhTest = {
      storage: { ...initialStorage },
      clipboard: 'original clipboard',
      clipboardWrites: [],
      requests: [],
      menus: [],
      openedTabs: [],
    };
    window.GM_getValue = (key, fallback) => Object.hasOwn(state.storage, key) ? state.storage[key] : fallback;
    window.GM_setValue = (key, value) => { state.storage[key] = value; };
    window.GM_addStyle = (css) => {
      const style = document.createElement('style');
      style.textContent = css;
      document.head.append(style);
      return style;
    };
    window.GM_setClipboard = (text, type, callback) => {
      state.clipboard = text;
      state.clipboardWrites.push(text);
      callback?.();
    };
    window.GM_registerMenuCommand = (label, callback) => {
      state.menus.push({ label, callback });
      return state.menus.length;
    };
    window.GM_openInTab = (url) => { state.openedTabs.push(url); };
    window.GM_xmlhttpRequest = (options) => {
      const request = { options, aborted: false };
      state.requests.push(request);
      return {
        abort() {
          request.aborted = true;
          options.onabort?.({ status: 0, responseText: '' });
        },
      };
    };
  }, { searchSource: 'DBLP', ...storage });
  await page.addScriptTag({
    content: await fs.readFile(path.resolve(__dirname, '../Overleaf-Bib-Helper.js'), 'utf8'),
  });
}

async function requestAt(page, index) {
  await expect.poll(() => page.evaluate((i) => window.__obhTest.requests[i]?.options.url, index)).toBeTruthy();
  return page.evaluate((i) => {
    const { options, aborted } = window.__obhTest.requests[i];
    return { url: options.url, timeout: options.timeout, method: options.method, aborted };
  }, index);
}

/** Explicit delivery also exercises callbacks that race with abort(). */
async function respond(page, index, { body = '', status = 200, event = 'load', finalUrl } = {}) {
  await requestAt(page, index);
  await page.evaluate(({ i, body, status, event, finalUrl }) => {
    const request = window.__obhTest.requests[i].options;
    request[`on${event}`]?.({ status, responseText: body, finalUrl: finalUrl || request.url });
  }, { i: index, body, status, event, finalUrl });
}

function dblpXML(input = {}) {
  const records = Array.isArray(input) ? input : [input];
  const hits = records.map(({ title = 'Attention with Nested Braces', key = 'conf/test/Attention2026', year = '2026' }) => `<hit><info>
      <title>${title}</title><authors><author>Xunjian Yin</author></authors>
      <venue>ACL</venue><year>${year}</year><type>Conference and Workshop Papers</type>
      <url>https://dblp.org/rec/${key}</url>
    </info></hit>`).join('');
  return `<?xml version="1.0"?><result><hits total="${records.length}">${hits}</hits></result>`;
}

async function openAndSearch(page, query = 'attention') {
  await page.locator('#obh-toggle-icon').click();
  await page.locator('#obh-search-input').fill(query);
  await page.locator('#obh-search-input').press('Enter');
  await requestAt(page, 0);
}

module.exports = {
  boot, requestAt, respond, dblpXML, openAndSearch,
  MODERN_TOOLBAR, LEGACY_TOOLBAR, GLOBAL_TOOLBAR, VALID_BIB,
};
