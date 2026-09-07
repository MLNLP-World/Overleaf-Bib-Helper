const { test, expect } = require('./fixtures');
const { boot, requestAt, respond, dblpXML, openAndSearch, VALID_BIB } = require('./helpers');

const NEURIPS_PAGE = 'https://proceedings.neurips.cc/paper_files/paper/2024/hash/0ef47f7b768e1a012e3d995ac8d8fac7-Abstract-Datasets_and_Benchmarks_Track.html';
const NEURIPS_EXPORT = 'https://proceedings.neurips.cc/paper_files/paper/25334-/bibtex';
const LEGACY_PAGE = 'https://proceedings.neurips.cc/paper_files/paper/2017/hash/3f5ee243547dee91fbd053c1c4a845aa-Abstract.html';
const LEGACY_EXPORT = 'https://proceedings.neurips.cc/paper_files/paper/2017/file/3f5ee243547dee91fbd053c1c4a845aa-Bibtex.bib';
const PMLR_PAGE = 'https://proceedings.mlr.press/v235/shi24f.html';
const ACL_PAGE = 'https://aclanthology.org/2024.acl-long.1/';
const OFFICIAL_BIB = '@inproceedings{official2026,\n  title = {Attention with {Nested} Braces},\n  author = {Yin, Xunjian},\n  booktitle = {Advances in Neural Information Processing Systems},\n  year = {2026},\n  pages = {12--34}\n}';

/** These two link forms are used by current and historical NeurIPS pages. */
function neuripsHTML(href = '/paper_files/paper/25334-/bibtex') {
  return `<html><body><div class="paper-actions"><a class="btn btn-light" href="${href}">Bibtex</a></div></body></html>`;
}

function pmlrHTML(bib = OFFICIAL_BIB) {
  const encoded = bib.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  return `<html><body><pre><code id="bibtex" class="citecode">${encoded}</code></pre></body></html>`;
}

function officialXML({ urls = [NEURIPS_PAGE], ...record } = {}) {
  const editions = urls.map((url) => `<ee>${url.replaceAll('&', '&amp;')}</ee>`).join('');
  return dblpXML(record).replace('</info>', `${editions}</info>`);
}

async function startOfficialRequest(page, source, cid) {
  await page.evaluate(({ source, cid }) => {
    window.__obhTest.pending = getBibTexOfficial(source, cid)
      .then((value) => ({ value }), (error) => ({ error: error.message }));
  }, { source, cid });
}

test.beforeEach(async ({ page }) => { await boot(page); });

test('recognizes official paper URLs and rejects deceptive hosts, credentials, and non-web schemes', async ({ page }) => {
  const accepted = await page.evaluate((urls) => urls.map(getOfficialSource), [NEURIPS_PAGE, PMLR_PAGE, ACL_PAGE]);
  expect(accepted).toEqual([
    { source: 'NeurIPS', cid: NEURIPS_PAGE },
    { source: 'PMLR', cid: PMLR_PAGE },
    { source: 'ACLAnthology', cid: ACL_PAGE },
  ]);
  const rejected = await page.evaluate((urls) => urls.map(getOfficialSource), [
    'https://proceedings.neurips.cc.example.org/paper_files/paper/25334-/bibtex',
    'https://aclanthology.org@evil.example/2024.acl-long.1/',
    'https://user:password@proceedings.mlr.press/v235/shi24f.html',
    'javascript:alert(1)',
    'file:///2024.acl-long.1.bib',
    'https://proceedings.neurips.cc/',
    'https://doi.org/10.0000/paper',
  ]);
  expect(rejected).toEqual(Array(rejected.length).fill(null));
});

test('DBLP retains every electronic edition even when a DOI precedes the official venue', async ({ page }) => {
  const urls = ['https://doi.org/10.0000/paper', NEURIPS_PAGE, 'https://arxiv.org/abs/2401.00001'];
  await page.evaluate(() => {
    window.__obhTest.pending = getArticleIDListDBLP('attention', 5);
  });
  await respond(page, 0, { body: officialXML({ urls }) });
  const records = await page.evaluate(() => window.__obhTest.pending);
  expect(records).toHaveLength(1);
  expect(records[0].electronicEditions).toEqual(urls);
});

test('NeurIPS follows the numeric Bibtex link instead of deriving a nonexistent hash export', async ({ page }) => {
  await startOfficialRequest(page, 'NeurIPS', NEURIPS_PAGE);
  expect((await requestAt(page, 0)).url).toBe(NEURIPS_PAGE);
  await respond(page, 0, { body: neuripsHTML() });
  expect((await requestAt(page, 1)).url).toBe(NEURIPS_EXPORT);
  await respond(page, 1, { body: OFFICIAL_BIB });
  expect(await page.evaluate(() => window.__obhTest.pending)).toEqual({ value: OFFICIAL_BIB });
});

test('NeurIPS also follows historical hash-based Bibtex downloads', async ({ page }) => {
  await startOfficialRequest(page, 'NeurIPS', LEGACY_PAGE);
  await respond(page, 0, { body: neuripsHTML(new URL(LEGACY_EXPORT).pathname) });
  expect((await requestAt(page, 1)).url).toBe(LEGACY_EXPORT);
  await respond(page, 1, { body: OFFICIAL_BIB });
  expect(await page.evaluate(() => window.__obhTest.pending)).toEqual({ value: OFFICIAL_BIB });
});

test('PMLR extracts the complete official code block and decodes HTML entities without rewriting fields', async ({ page }) => {
  const bib = OFFICIAL_BIB.replace('Advances in Neural Information Processing Systems', 'Proceedings of Machine Learning Research')
    .replace('Nested', 'Nested & Compared < Exactly');
  await startOfficialRequest(page, 'PMLR', PMLR_PAGE);
  expect((await requestAt(page, 0)).url).toBe(PMLR_PAGE);
  await respond(page, 0, { body: pmlrHTML(bib) });
  expect(await page.evaluate(() => window.__obhTest.pending)).toEqual({ value: bib });
  expect(await page.evaluate(() => window.__obhTest.requests.length)).toBe(1);
});

test('ACL Anthology fetches one direct .bib export for modern and legacy paper IDs', async ({ page }) => {
  for (const [index, cid] of [ACL_PAGE, 'https://aclanthology.org/P19-1013/'].entries()) {
    await startOfficialRequest(page, 'ACLAnthology', cid);
    expect((await requestAt(page, index)).url).toBe(`${cid.slice(0, -1)}.bib`);
    await respond(page, index, { body: OFFICIAL_BIB });
    expect(await page.evaluate(() => window.__obhTest.pending)).toEqual({ value: OFFICIAL_BIB });
  }
});

test('official fetch refuses an off-site export link or redirect without requesting a substitute citation', async ({ page }) => {
  await startOfficialRequest(page, 'NeurIPS', NEURIPS_PAGE);
  await respond(page, 0, { body: neuripsHTML('https://evil.example/paper.bib') });
  expect(await page.evaluate(() => window.__obhTest.pending)).toEqual({ error: expect.any(String) });
  expect(await page.evaluate(() => window.__obhTest.requests.length)).toBe(1);

  await startOfficialRequest(page, 'PMLR', PMLR_PAGE);
  await respond(page, 1, { body: pmlrHTML(), finalUrl: 'https://evil.example/redirected' });
  expect(await page.evaluate(() => window.__obhTest.pending)).toEqual({ error: expect.any(String) });
  expect(await page.evaluate(() => window.__obhTest.requests.length)).toBe(2);
});

test('official BibTeX rejects malformed and multiple-record exports', async ({ page }) => {
  const invalid = ['<html>Verification required</html>', '@article{broken,title={Incomplete}', `${OFFICIAL_BIB}\n${VALID_BIB}`];
  for (const [index, body] of invalid.entries()) {
    await startOfficialRequest(page, 'ACLAnthology', ACL_PAGE);
    await respond(page, index, { body });
    expect(await page.evaluate(() => window.__obhTest.pending)).toEqual({ error: expect.any(String) });
  }
  expect(await page.evaluate(() => window.__obhTest.clipboardWrites)).toEqual([]);
});

test('official is the default BibTeX preference and its control is hidden for Scholar', async ({ page }) => {
  await page.locator('#obh-toggle-icon').click();
  await expect(page.locator('#obh-bib-source')).toHaveValue('official');
  await page.locator('#obh-source').selectOption('GoogleScholar');
  await expect(page.locator('#obh-bib-source')).toBeHidden();
  await page.locator('#obh-source').selectOption('DBLP');
  await expect(page.locator('#obh-bib-source')).toBeVisible();
  await page.locator('#obh-bib-source').selectOption('search');
  expect(await page.evaluate(() => window.__obhTest.storage.bibSource)).toBe('search');
});

test('Copy follows an official edition after the DOI and Preview identifies its source and page link', async ({ page }) => {
  await openAndSearch(page);
  await respond(page, 0, { body: officialXML({ urls: ['https://doi.org/10.0000/paper', NEURIPS_PAGE] }) });
  await expect(page.locator('.obh-result')).toContainText('NeurIPS');
  await page.locator('.obh-result-title').click();
  expect((await requestAt(page, 1)).url).toBe(NEURIPS_PAGE);
  await respond(page, 1, { body: neuripsHTML() });
  expect((await requestAt(page, 2)).url).toBe(NEURIPS_EXPORT);
  await respond(page, 2, { body: OFFICIAL_BIB });
  await expect.poll(() => page.evaluate(() => window.__obhTest.clipboard)).toBe(OFFICIAL_BIB);

  await page.locator('.obh-result [data-obh-action="preview"]').click();
  await expect(page.locator('#obh-bib-preview')).toHaveValue(OFFICIAL_BIB);
  await expect(page.locator('#obh-preview-source')).toContainText('NeurIPS');
  await expect(page.locator('#obh-preview-source a')).toHaveAttribute('href', NEURIPS_PAGE);
  expect(await page.evaluate(() => window.__obhTest.requests.length)).toBe(3);
});

test('unsupported venues and preprints keep DBLP citations and show their actual source', async ({ page }) => {
  await openAndSearch(page);
  const unsupported = officialXML({ title: 'Unsupported venue paper', urls: ['https://doi.org/10.0000/paper'] });
  const preprint = officialXML({ title: 'Only a preprint', key: 'journals/corr/abs-2601-00001', urls: [NEURIPS_PAGE] })
    .replace('<venue>ACL</venue>', '<venue>CoRR</venue>');
  const hit = (xml) => xml.match(/<hit>[\s\S]*?<\/hit>/)[0];
  await respond(page, 0, { body: `<?xml version="1.0"?><result><hits total="2">${hit(unsupported)}${hit(preprint)}</hits></result>` });
  for (const [offset, title] of ['Unsupported venue paper', 'Only a preprint'].entries()) {
    const row = page.locator('.obh-result').filter({ hasText: title });
    await expect(row).toContainText('DBLP');
    await row.locator('[data-obh-action="preview"]').click();
    expect((await requestAt(page, offset + 1)).url).toMatch(/^https:\/\/dblp\.org\/rec\/.+\.bib$/);
    await respond(page, offset + 1, { body: VALID_BIB });
    await expect(page.locator('#obh-preview-source')).toContainText('DBLP');
  }
  expect(await page.evaluate(() => window.__obhTest.clipboardWrites)).toEqual([]);
});

test('official failure offers explicit DBLP fallback without silently requesting or copying it', async ({ page }) => {
  await openAndSearch(page);
  const results = officialXML({ urls: [PMLR_PAGE] });
  await respond(page, 0, { body: results });
  await page.locator('.obh-result-title').click();
  await respond(page, 1, { status: 503, body: 'Service unavailable' });
  await expect(page.locator('#obh-status')).toHaveClass(/error/);
  const fallback = page.getByRole('button', { name: 'Use DBLP BibTeX', exact: true });
  await expect(fallback).toBeVisible();
  expect(await page.evaluate(() => window.__obhTest.requests.length)).toBe(2);
  expect(await page.evaluate(() => window.__obhTest.clipboardWrites)).toEqual([]);

  await fallback.click();
  await expect(page.locator('#obh-bib-source')).toHaveValue('search');
  expect(new URL((await requestAt(page, 2)).url).pathname).toBe('/search/publ/api');
  await respond(page, 2, { body: results });
  expect(await page.evaluate(() => window.__obhTest.clipboardWrites)).toEqual([]);
  expect(await page.evaluate(() => window.__obhTest.requests.length)).toBe(3);
  await page.locator('.obh-result [data-obh-action="preview"]').click();
  expect((await requestAt(page, 3)).url).toMatch(/^https:\/\/dblp\.org\/rec\/.+\.bib$/);
  await respond(page, 3, { body: VALID_BIB });
  await expect(page.locator('#obh-preview-source')).toContainText('DBLP');
  await expect(page.locator('#obh-bib-preview')).toHaveValue(VALID_BIB);
});

for (const action of ['copy', 'preview']) {
  test(`changing BibTeX preference ignores a pending official ${action} response`, async ({ page }) => {
    await openAndSearch(page);
    await respond(page, 0, { body: officialXML() });
    await page.locator(`.obh-result [data-obh-action="${action}"]`).click();
    await respond(page, 1, { body: neuripsHTML() });
    await requestAt(page, 2);
    await page.locator('#obh-bib-source').selectOption('search');
    await requestAt(page, 3);
    await respond(page, 2, { body: OFFICIAL_BIB });
    expect(await page.evaluate(() => window.__obhTest.clipboardWrites)).toEqual([]);
    await expect(page.locator('#obh-preview')).toBeHidden();
    await respond(page, 3, { body: officialXML() });
    await expect(page.locator('.obh-result')).toContainText('DBLP');
    await expect(page.locator('#obh-status')).not.toContainText('Copied');
  });
}

test('a new search invalidates an official preview while its Bibtex download is pending', async ({ page }) => {
  await openAndSearch(page);
  await respond(page, 0, { body: officialXML() });
  await page.locator('.obh-result [data-obh-action="preview"]').click();
  await respond(page, 1, { body: neuripsHTML() });
  await requestAt(page, 2);
  await page.locator('#obh-search-input').fill('another paper');
  await page.locator('#obh-search-input').press('Enter');
  await requestAt(page, 3);
  await respond(page, 2, { body: OFFICIAL_BIB });
  await expect(page.locator('#obh-preview')).toBeHidden();
  expect(await page.evaluate(() => window.__obhTest.clipboardWrites)).toEqual([]);
  await respond(page, 3, { body: dblpXML({ title: 'Another paper' }) });
  await expect(page.locator('.obh-result-title')).toHaveText('Another paper');
});
