const { test, expect } = require('./fixtures');
const { boot, requestAt, respond, dblpXML, openAndSearch } = require('./helpers');

const ACM_DOI = '10.1145/2939672.2939785';
const ACM_PAGE = `https://dl.acm.org/doi/${ACM_DOI}`;
const ACM_BIB = `@inproceedings{${ACM_DOI},
author = {Chen, Tianqi and Guestrin, Carlos},
title = {XGBoost: A Scalable Tree Boosting System},
year = {2016},
publisher = {Association for Computing Machinery},
doi = {${ACM_DOI}},
booktitle = {Proceedings of the 22nd ACM SIGKDD International Conference on Knowledge Discovery and Data Mining},
pages = {785–794},
series = {KDD '16}
}`;
const AAMAS_DOI = '10.5555/3635637.3662979';
const AAMAS_PAGE = `https://dl.acm.org/doi/${AAMAS_DOI}`;
// Official AAMAS citation metadata, with the abstract omitted: no DOI or URL field.
const AAMAS_BIB = `@inproceedings{3635637.3662979,
author = {Liu, Jijia and Yu, Chao and Gao, Jiaxuan and Xie, Yuqing and Liao, Qingmin and Wu, Yi and Wang, Yu},
title = {LLM-Powered Hierarchical Language Agent for Real-time Human-AI Coordination},
year = {2024},
isbn = {9798400704864},
publisher = {International Foundation for Autonomous Agents and Multiagent Systems},
address = {Richland, SC},
booktitle = {Proceedings of the 23rd International Conference on Autonomous Agents and Multiagent Systems},
pages = {1219–1228},
numpages = {10},
keywords = {hierarchical reasoning and planning, language agents, large language models, real-time human-ai coordination},
location = {Auckland, New Zealand},
series = {AAMAS '24}
}`;
const IEEE_DOI = '10.1109/CVPR.2016.90';
const IEEE_PAGE = 'https://ieeexplore.ieee.org/document/7780459/';
const IEEE_EXPORT = 'https://ieeexplore.ieee.org/xpl/downloadCitations?legacy=true';
const IEEE_BIB = `@INPROCEEDINGS{7780459,
author={He, Kaiming and Zhang, Xiangyu and Ren, Shaoqing and Sun, Jian},
booktitle={2016 IEEE Conference on Computer Vision and Pattern Recognition (CVPR)},
title={Deep Residual Learning for Image Recognition},
year={2016},
pages={770-778},
doi={${IEEE_DOI}}
}`;
const BRIDGE_TOKEN = '1234567890abcdef1234567890abcdef';
const REQUEST_KEY = `obh-acm-request:${BRIDGE_TOKEN}`;
const RESULT_KEY = `obh-acm-result:${BRIDGE_TOKEN}`;

async function startOfficial(page, source, cid) {
  await page.evaluate(({ source, cid }) => {
    window.__obhTest.pending = getBibTexOfficial(source, cid)
      .then((value) => ({ value }), (error) => ({ error: error.message, verificationUrl: error.verificationUrl || null }));
  }, { source, cid });
}

async function pendingResult(page) {
  return page.evaluate(() => window.__obhTest.pending);
}

async function acmRequest(page) {
  await expect.poll(() => page.evaluate(() => window.__obhTest.openedTabs.length)).toBeGreaterThan(0);
  return page.evaluate(() => {
    const key = Object.keys(window.__obhTest.storage).find((key) => key.startsWith('obh-acm-request:'));
    return { key, resultKey: key.replace('request:', 'result:'), request: window.__obhTest.storage[key] };
  });
}

async function assertBridgeClean(page) {
  expect(await page.evaluate(() => ({
    listeners: window.__obhTest.valueListeners.size,
    keys: Object.keys(window.__obhTest.storage).filter((key) => key.startsWith('obh-acm-')),
  }))).toEqual({ listeners: 0, keys: [] });
}

function withEdition(url) {
  return dblpXML().replace('</info>', `<ee>${url.replaceAll('&', '&amp;')}</ee></info>`);
}

function htmlAttribute(value) {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('\n', '&#10;')
    .replace(/[^\x00-\x7f]/gu, (character) => `&#${character.codePointAt(0)};`);
}

/** The real ACM page renders content after its native format-change handler. */
function acmDialog({ completeOnFormatChange = true, openOnFirstClick = true, bib = ACM_BIB } = {}) {
  const completion = completeOnFormatChange
    ? "document.querySelector('#exportCitation input[name=content]').value=this.dataset.bib; document.querySelector('.download__btn').classList.remove('disabled');"
    : '';
  const openDialog = openOnFirstClick ? "document.getElementById('exportCitation').style.display='block'" : '';
  return `<button data-target="#exportCitation" aria-label="Export Citation"
    onclick="window.__obhTest.exportClicks=(window.__obhTest.exportClicks||0)+1;${openDialog}">Export Citation</button>
    <div id="exportCitation" style="display:none">
      <form action="/action/exportCiteProcCitation" method="post">
        <select id="citation-format" data-bib="${htmlAttribute(bib)}"
          onchange="window.__obhTest.formatChanges=(window.__obhTest.formatChanges||0)+1;${completion}">
          <option value="endNote" selected>EndNote</option><option value="bibtex">BibTeX</option>
        </select>
        <input type="hidden" name="content" value="">
        <a class="download__btn disabled">Download citation</a>
      </form>
    </div>`;
}

test('ACM creates a unique expiring request and returns the exact publisher text through its storage listener', async ({ page }) => {
  await boot(page);
  await startOfficial(page, 'ACM', ACM_PAGE);
  const { key, resultKey, request } = await acmRequest(page);
  const token = key.slice('obh-acm-request:'.length);
  expect(token).toMatch(/^[a-f\d]{32}$/);
  expect(request.cid).toBe(ACM_PAGE);
  expect(request.expiresAt).toBeGreaterThan(await page.evaluate(() => Date.now()));
  expect(request.expiresAt).toBeLessThanOrEqual(await page.evaluate(() => Date.now() + 90000));
  expect(await page.evaluate(() => window.__obhTest.openedTabs)).toEqual([`${ACM_PAGE}#obh-acm=${token}`]);
  expect(await page.evaluate(() => window.__obhTest.requests)).toEqual([]);
  expect(await page.evaluate(() => window.__obhTest.valueListeners.size)).toBe(1);

  await page.evaluate(({ resultKey, cid, bib }) => GM_setValue(resultKey, { cid, bib }), { resultKey, cid: ACM_PAGE, bib: ACM_BIB });
  expect(await pendingResult(page)).toEqual({ value: ACM_BIB });
  await assertBridgeClean(page);
  expect(await page.evaluate(() => window.__obhTest.closedTabs)).toEqual([`${ACM_PAGE}#obh-acm=${token}`]);
  expect(await page.evaluate(() => window.__obhTest.clipboardWrites)).toEqual([]);
});

test('ACM still resolves when Tampermonkey throws while closing the publisher tab', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => {
    window.GM_openInTab = (url) => {
      window.__obhTest.openedTabs.push(url);
      return { close() { throw new Error('The publisher tab cannot be closed.'); } };
    };
  });
  await startOfficial(page, 'ACM', ACM_PAGE);
  const { resultKey } = await acmRequest(page);
  await page.evaluate(({ resultKey, cid, bib }) => GM_setValue(resultKey, { cid, bib }), { resultKey, cid: ACM_PAGE, bib: ACM_BIB });
  expect(await pendingResult(page)).toEqual({ value: ACM_BIB });
  await assertBridgeClean(page);
});

test('ACM accepts an original AAMAS export without DOI or URL only with the exact pseudo ID key', async ({ page }) => {
  await boot(page);
  for (const bib of [AAMAS_BIB, AAMAS_BIB.replace('{3635637.3662979,', `{${AAMAS_DOI},`)]) {
    await startOfficial(page, 'ACM', AAMAS_PAGE);
    const { resultKey } = await acmRequest(page);
    await page.evaluate(({ resultKey, cid, bib }) => GM_setValue(resultKey, { cid, bib }), { resultKey, cid: AAMAS_PAGE, bib });
    expect(await pendingResult(page)).toEqual({ value: bib });
    await assertBridgeClean(page);
  }
});

test('the native ACM bridge returns the unchanged AAMAS citation with its suffix key and absent DOI', async ({ page }) => {
  await boot(page, {
    url: `${AAMAS_PAGE}#obh-acm=${BRIDGE_TOKEN}`,
    toolbar: acmDialog({ bib: AAMAS_BIB }),
    storage: { [REQUEST_KEY]: { cid: AAMAS_PAGE, expiresAt: Date.now() + 60000 } },
  });
  await expect.poll(() => page.evaluate((key) => window.__obhTest.storage[key], RESULT_KEY)).toEqual({ cid: AAMAS_PAGE, bib: AAMAS_BIB });
  expect(await page.evaluate(() => window.__obhTest.exportClicks)).toBe(1);
  expect(await page.evaluate(() => window.__obhTest.clipboardWrites)).toEqual([]);
});

test('ACM pseudo IDs cannot conceal a wrong key or explicit DOI, and ordinary ACM records still require DOI', async ({ page }) => {
  await boot(page);
  const cases = [
    { cid: AAMAS_PAGE, bib: AAMAS_BIB.replace('{3635637.3662979,', '{3635637.3662980,') },
    { cid: AAMAS_PAGE, bib: AAMAS_BIB.replace('\nyear =', '\ndoi = {10.5555/3635637.3662980},\nyear =') },
    { cid: AAMAS_PAGE, bib: AAMAS_BIB.replace('\nyear =', '\ndoi = {not-a-doi},\nyear =') },
    { cid: ACM_PAGE, bib: ACM_BIB.replace(`doi = {${ACM_DOI}},\n`, '') },
  ];
  for (const { cid, bib } of cases) {
    await startOfficial(page, 'ACM', cid);
    const { resultKey } = await acmRequest(page);
    await page.evaluate(({ resultKey, cid, bib }) => GM_setValue(resultKey, { cid, bib }), { resultKey, cid, bib });
    const result = await pendingResult(page);
    expect(result.error).toMatch(/identifier|DOI/i);
    expect(result.value).toBeUndefined();
    await assertBridgeClean(page);
  }
  expect(await page.evaluate(() => window.__obhTest.clipboardWrites)).toEqual([]);
});

test('closing the ACM tab cancels promptly, allows a fresh retry, and automatic close preserves success', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => {
    window.__obhTest.tabs = [];
    window.GM_openInTab = (url) => {
      window.__obhTest.openedTabs.push(url);
      const tab = { close() { window.__obhTest.closedTabs.push(url); this.onclose?.(); } };
      window.__obhTest.tabs.push(tab);
      return tab;
    };
  });
  const startCached = () => page.evaluate((cid) => {
    window.__obhTest.pending = fetchBib('ACM', cid)
      .then((value) => ({ value }), (error) => ({ error: error.message }));
  }, ACM_PAGE);
  await startCached();
  const first = await acmRequest(page);
  await page.evaluate(() => window.__obhTest.tabs[0].close());
  expect((await pendingResult(page)).error).toMatch(/tab was closed/i);
  await assertBridgeClean(page);

  await startCached();
  await expect.poll(() => page.evaluate(() => window.__obhTest.openedTabs.length)).toBe(2);
  const second = await acmRequest(page);
  expect(second.key).not.toBe(first.key);
  // A repeated old-tab close event must not cancel the new request.
  await page.evaluate(() => window.__obhTest.tabs[0].onclose());
  await page.evaluate(({ resultKey, cid, bib }) => GM_setValue(resultKey, { cid, bib }), { resultKey: second.resultKey, cid: ACM_PAGE, bib: ACM_BIB });
  expect(await pendingResult(page)).toEqual({ value: ACM_BIB });
  await assertBridgeClean(page);
  expect(await page.evaluate(() => window.__obhTest.closedTabs.length)).toBe(2);
});

for (const failure of [
  { name: 'a different publisher page', result: { cid: 'https://dl.acm.org/doi/10.1145/1.2', bib: ACM_BIB }, message: /different paper/i },
  { name: 'a different DOI in the citation', result: { cid: ACM_PAGE, bib: ACM_BIB.replace(`doi = {${ACM_DOI}}`, 'doi = {10.1145/1.2}') }, message: /DOI.*match/i },
  { name: 'an explicit publisher error', result: { cid: ACM_PAGE, error: 'Publisher citation export failed.' }, message: /Publisher citation export failed/ },
]) {
  test(`ACM rejects ${failure.name} and removes the listener and temporary storage`, async ({ page }) => {
    await boot(page);
    await startOfficial(page, 'ACM', ACM_PAGE);
    const { resultKey } = await acmRequest(page);
    await page.evaluate(({ resultKey, result }) => GM_setValue(resultKey, result), { resultKey, result: failure.result });
    const result = await pendingResult(page);
    expect(result.error).toMatch(failure.message);
    expect(result.value).toBeUndefined();
    await assertBridgeClean(page);
    expect(await page.evaluate(() => window.__obhTest.clipboardWrites)).toEqual([]);
  });
}

test('ACM timeout removes temporary state and returns the official page for explicit verification', async ({ page }) => {
  await boot(page);
  await page.clock.install();
  await startOfficial(page, 'ACM', ACM_PAGE);
  await acmRequest(page);
  await page.clock.fastForward(90001);
  const result = await pendingResult(page);
  expect(result.error).toMatch(/did not finish|timed out/i);
  expect(result.verificationUrl).toBe(ACM_PAGE);
  await assertBridgeClean(page);
  expect(await page.evaluate(() => window.__obhTest.clipboardWrites)).toEqual([]);
});

for (const invalid of ['ordinary visit', 'unknown token', 'expired token', 'wrong paper', 'missing expiry', 'invalid expiry']) {
  test(`ACM bridge stays inert with ${invalid}`, async ({ page }) => {
    const now = Date.now();
    await page.clock.install({ time: new Date(now) });
    const request = { cid: ACM_PAGE, expiresAt: now + 60000 };
    if (invalid === 'expired token') request.expiresAt = now - 1;
    if (invalid === 'wrong paper') request.cid = 'https://dl.acm.org/doi/10.1145/1.2';
    if (invalid === 'missing expiry') delete request.expiresAt;
    if (invalid === 'invalid expiry') request.expiresAt = 'not a timestamp';
    await boot(page, {
      url: ACM_PAGE + (invalid === 'ordinary visit' ? '' : `#obh-acm=${BRIDGE_TOKEN}`),
      toolbar: acmDialog(),
      storage: invalid === 'unknown token' ? {} : { [REQUEST_KEY]: request },
    });
    await page.clock.fastForward(1000);
    expect(await page.evaluate(() => window.__obhTest.exportClicks || 0)).toBe(0);
    expect(await page.evaluate(() => window.__obhTest.formatChanges || 0)).toBe(0);
    expect(await page.evaluate((key) => window.__obhTest.storage[key], RESULT_KEY)).toBeUndefined();
    expect(await page.evaluate(() => window.__obhTest.requests)).toEqual([]);
    expect(await page.evaluate(() => window.__obhTest.openedTabs)).toEqual([]);
    expect(await page.evaluate(() => window.__obhTest.menus)).toEqual([]);
    await expect(page.locator('#obh-toggle-icon')).toHaveCount(0);
  });
}

test('a live ACM bridge opens the native dialog, selects BibTeX, and returns its original export', async ({ page }) => {
  await boot(page, {
    url: `${ACM_PAGE}#obh-acm=${BRIDGE_TOKEN}`,
    toolbar: acmDialog(),
    storage: { [REQUEST_KEY]: { cid: ACM_PAGE, expiresAt: Date.now() + 60000 } },
  });
  await expect.poll(() => page.evaluate((key) => window.__obhTest.storage[key], RESULT_KEY)).toEqual({ cid: ACM_PAGE, bib: ACM_BIB });
  expect(await page.evaluate(() => window.__obhTest.exportClicks)).toBe(1);
  expect(await page.evaluate(() => window.__obhTest.formatChanges)).toBe(1);
  await expect(page.locator('#citation-format')).toHaveValue('bibtex');
  await expect(page.locator('#exportCitation')).toBeVisible();
  expect(await page.evaluate(() => window.__obhTest.clipboardWrites)).toEqual([]);
  expect(await page.evaluate(() => window.__obhTest.requests)).toEqual([]);
});

test('ACM retries an early click after the publisher attaches its dialog handler, then stops clicking', async ({ page }) => {
  const now = Date.now();
  await page.clock.install({ time: new Date(now) });
  await boot(page, {
    url: `${ACM_PAGE}#obh-acm=${BRIDGE_TOKEN}`,
    toolbar: acmDialog({ openOnFirstClick: false }),
    storage: { [REQUEST_KEY]: { cid: ACM_PAGE, expiresAt: now + 60000 } },
  });
  expect(await page.evaluate(() => window.__obhTest.exportClicks)).toBe(1);
  await page.clock.fastForward(1000);
  expect(await page.evaluate(() => window.__obhTest.exportClicks)).toBe(1);
  expect(await page.evaluate((key) => window.__obhTest.storage[key], RESULT_KEY)).toBeUndefined();
  await page.locator('button[aria-label="Export Citation"]').evaluate((button) => {
    button.addEventListener('click', () => { document.querySelector('#exportCitation').style.display = 'block'; });
  });
  await page.clock.fastForward(600);
  expect(await page.evaluate((key) => window.__obhTest.storage[key], RESULT_KEY)).toEqual({ cid: ACM_PAGE, bib: ACM_BIB });
  expect(await page.evaluate(() => window.__obhTest.exportClicks)).toBe(2);
  await page.clock.fastForward(3000);
  expect(await page.evaluate(() => window.__obhTest.exportClicks)).toBe(2);
});

test('an ACM publisher tab stops polling after its requester removes the live token', async ({ page }) => {
  const now = Date.now();
  await page.clock.install({ time: new Date(now) });
  await boot(page, {
    url: `${ACM_PAGE}#obh-acm=${BRIDGE_TOKEN}`,
    toolbar: acmDialog({ completeOnFormatChange: false }),
    storage: { [REQUEST_KEY]: { cid: ACM_PAGE, expiresAt: now + 60000 } },
  });
  await page.evaluate(({ requestKey, bib }) => {
    GM_deleteValue(requestKey);
    document.querySelector('#exportCitation input[name=content]').value = bib;
    document.querySelector('.download__btn').classList.remove('disabled');
  }, { requestKey: REQUEST_KEY, bib: ACM_BIB });
  await page.clock.fastForward(1000);
  expect(await page.evaluate((key) => window.__obhTest.storage[key], RESULT_KEY)).toBeUndefined();
  expect(await page.evaluate(() => window.__obhTest.exportClicks)).toBe(1);
});

test('ACM result actions explain the new tab and explicit Preview waits for the official bridge', async ({ page }) => {
  await boot(page);
  await openAndSearch(page);
  await respond(page, 0, { body: withEdition(ACM_PAGE) });
  await expect(page.locator('.obh-result').getByRole('button', { name: 'Open ACM & copy', exact: true })).toBeVisible();
  const preview = page.locator('.obh-result').getByRole('button', { name: 'Open ACM preview', exact: true });
  await expect(preview).toBeVisible();
  expect(await page.evaluate(() => window.__obhTest.openedTabs)).toEqual([]);
  await preview.click();
  const { resultKey } = await acmRequest(page);
  await page.evaluate(({ resultKey, bib, cid }) => GM_setValue(resultKey, { cid, bib }), { resultKey, bib: ACM_BIB, cid: ACM_PAGE });
  await expect(page.locator('#obh-bib-preview')).toHaveValue(ACM_BIB);
  await expect(page.locator('#obh-preview-source')).toContainText('ACM');
  expect(await page.evaluate(() => window.__obhTest.clipboardWrites)).toEqual([]);
  await assertBridgeClean(page);
});

test('IEEE resolves an opaque DOI to its real article number and submits the official form payload', async ({ page }) => {
  await boot(page);
  await startOfficial(page, 'IEEE', `https://doi.org/${IEEE_DOI}`);
  expect((await requestAt(page, 0)).url).toBe(`https://doi.org/${IEEE_DOI}`);
  await respond(page, 0, { body: '<html>IEEE article</html>', finalUrl: 'http://ieeexplore.ieee.org/document/7780459/' });
  const request = await requestAt(page, 1);
  expect(request.url).toBe(IEEE_EXPORT);
  expect(request.method).toBe('POST');
  const exportOptions = await page.evaluate(() => {
    const { data, headers } = window.__obhTest.requests[1].options;
    return { data, headers };
  });
  expect(exportOptions.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
  expect(Object.fromEntries(new URLSearchParams(exportOptions.data))).toEqual({
    recordIds: '7780459', 'citations-format': 'citation-only', 'download-format': 'download-bibtex',
  });
  await respond(page, 1, { body: IEEE_BIB });
  expect(await pendingResult(page)).toEqual({ value: IEEE_BIB });
});

test('IEEE rejects a redirect to an unrelated host before requesting a citation', async ({ page }) => {
  await boot(page);
  await startOfficial(page, 'IEEE', `https://doi.org/${IEEE_DOI}`);
  await respond(page, 0, { body: '<html>A different page</html>', finalUrl: 'https://evil.example/document/7780459/' });
  expect((await pendingResult(page)).error).toMatch(/unexpected page/i);
  expect(await page.evaluate(() => window.__obhTest.requests.length)).toBe(1);
});

test('IEEE rejects a wrong DOI or wrong direct record number instead of returning a plausible citation', async ({ page }) => {
  await boot(page);
  await startOfficial(page, 'IEEE', `https://doi.org/${IEEE_DOI}`);
  await respond(page, 0, { body: '<html>IEEE</html>', finalUrl: IEEE_PAGE });
  await respond(page, 1, { body: IEEE_BIB.replace(IEEE_DOI, '10.1109/CVPR.2016.91') });
  expect((await pendingResult(page)).error).toMatch(/DOI.*match/i);

  await startOfficial(page, 'IEEE', IEEE_PAGE);
  await respond(page, 2, { body: IEEE_BIB.replace('{7780459,', '{7780460,') });
  expect((await pendingResult(page)).error).toMatch(/matched to this paper/i);
});

test('IEEE invalid document IDs and malformed DOIs are rejected without network requests', async ({ page }) => {
  await boot(page);
  for (const cid of [
    'https://ieeexplore.ieee.org/document/not-a-number/',
    'https://ieeexplore.ieee.org/document/-7780459/',
    'https://ieeexplore.ieee.org/stamp/stamp.jsp?arnumber=7780459abc',
    'https://doi.org/10.1109/',
    'https://doi.org/10.1109/../another-record',
  ]) {
    await startOfficial(page, 'IEEE', cid);
    expect((await pendingResult(page)).error).toMatch(/Invalid official publication URL/i);
  }
  expect(await page.evaluate(() => window.__obhTest.requests)).toEqual([]);
});

test('IEEE HTTP 418 exposes an explicit verification action and preserves the clipboard', async ({ page }) => {
  await boot(page);
  await openAndSearch(page);
  await respond(page, 0, { body: withEdition(IEEE_PAGE) });
  await page.locator('.obh-result [data-obh-action="copy"]').click();
  await respond(page, 1, {
    status: 418,
    body: '<html><title>IEEE Xplore - Unable to Load Page</title><p>IEEE Xplore has detected an unusual request pattern.</p></html>',
  });
  await expect(page.locator('#obh-status')).toHaveClass(/error/);
  await expect(page.locator('#obh-status')).toContainText(/IEEE.*verification/i);
  expect(await page.evaluate(() => window.__obhTest.clipboardWrites)).toEqual([]);
  expect(await page.evaluate(() => window.__obhTest.openedTabs)).toEqual([]);
  await page.locator('#obh-status').getByRole('button', { name: 'Open verification page', exact: true }).click();
  expect(await page.evaluate(() => window.__obhTest.openedTabs)).toEqual([IEEE_PAGE]);
});
