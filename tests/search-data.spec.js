const { test, expect } = require('./fixtures');
const { boot, requestAt, respond, dblpXML, VALID_BIB } = require('./helpers');

test.beforeEach(async ({ page }) => { await boot(page); });

test('groups duplicate versions without discarding non-Latin titles or authors', async ({ page }) => {
  const groups = await page.evaluate(() => groupSearchResults([
    { title: '语言模型 Study', author: '王伟', url: 'v1' },
    { title: '语言模型 Study', author: '李明', url: 'v2' },
    { title: '视觉模型 Study', author: '王伟', url: 'v3' },
    { title: '语言模型 Study', author: '王伟', url: 'v4' },
  ], 'DBLP'));
  expect(groups).toHaveLength(3);
  expect(groups.map((group) => group.versions.length)).toEqual([2, 1, 1]);
});

test('hide preprints omits preprint-only papers and keeps published versions', async ({ page }) => {
  const groups = await page.evaluate(() => buildGroupedResults([
    { title: 'Mixed paper', author: 'A Writer', venue: 'CoRR', year: '2025', url: 'https://dblp.org/rec/journals/corr/abs-2501-00001' },
    { title: 'Mixed paper', author: 'A Writer', venue: 'ACL', year: '2026', url: 'https://dblp.org/rec/conf/acl/Writer26' },
    { title: 'Only a preprint', author: 'B Writer', venue: 'CoRR', year: '2026', url: 'https://dblp.org/rec/journals/corr/abs-2601-00001' },
  ], 'DBLP', { versionPref: 'hidePreprints', sortMode: 'relevance' }));
  expect(groups).toHaveLength(1);
  expect(groups[0].versions).toHaveLength(1);
  expect(groups[0].best.venue).toBe('ACL');
});

test('DBLP publication URL conversion handles query, fragment, and existing suffix', async ({ page }) => {
  const converted = await page.evaluate(() => [
    'https://dblp.org/rec/conf/acl/Writer26.html?view=bibtex#bibtex',
    'https://dblp.org/rec/conf/acl/Writer26?foo=bar#record',
    'https://dblp.org/rec/conf/acl/Writer26.bib',
  ].map(getBibTexURLDBLP));
  expect(converted).toEqual(Array(3).fill('https://dblp.org/rec/conf/acl/Writer26.bib'));
});

test('DBLP URL conversion rejects unrelated and malformed locations', async ({ page }) => {
  const converted = await page.evaluate(() => [
    'https://example.com/rec/conf/acl/Writer26',
    'javascript:alert(1)',
    'https://dblp.org/search/publ?q=attention',
  ].map((value) => {
    try { return getBibTexURLDBLP(value); } catch { return null; }
  }));
  expect(converted.every((value) => !value)).toBe(true);
});

test('DBLP search encodes the complete query and parses a publication record', async ({ page }) => {
  const query = 'attention & retrieval # 中文';
  await page.evaluate((query) => {
    window.__obhTest.pending = getArticleIDListDBLP(query, 5);
  }, query);
  const request = await requestAt(page, 0);
  const url = new URL(request.url);
  expect(url.origin).toBe('https://dblp.org');
  expect(url.searchParams.get('q')).toBe(query);
  expect(Number(url.searchParams.get('h'))).toBeGreaterThanOrEqual(5);
  expect(request.timeout).toBeGreaterThan(0);
  await respond(page, 0, { body: dblpXML() });
  const records = await page.evaluate(() => window.__obhTest.pending);
  expect(records).toEqual([expect.objectContaining({
    title: 'Attention with Nested Braces', author: 'Xunjian Yin', venue: 'ACL', year: '2026',
  })]);
});

for (const failure of [
  { name: 'HTTP 429', response: { status: 429, body: '<html>Rate limited</html>' } },
  { name: 'timeout', response: { event: 'timeout', status: 0 } },
  { name: 'network error', response: { event: 'error', status: 0 } },
  { name: 'malformed XML', response: { body: '<result><hits><hit>' } },
]) {
  test(`DBLP search reports ${failure.name} rather than an empty successful result`, async ({ page }) => {
    await page.evaluate(() => {
      window.__obhTest.pending = getArticleIDListDBLP('attention', 5)
        .then((value) => ({ value }), (error) => ({ error: error.message }));
    });
    await respond(page, 0, failure.response);
    const result = await page.evaluate(() => window.__obhTest.pending);
    expect(result.error).toBeTruthy();
    expect(result.value).toBeUndefined();
  });
}

test('BibTeX validator accepts nested braces and quoted values, rejects incomplete or non-BibTeX data', async ({ page }) => {
  const valid = [VALID_BIB, '@book{sample, title = "A quoted title", year = 2026}', '@article{escaped, title={An escaped \\{ brace}, year={2026}}'];
  const invalid = ['', '<html>CAPTCHA</html>', '@article{missing, title={Open}', '@article{missingKey}', 'Gateway timeout'];
  const result = await page.evaluate(({ valid, invalid }) => ({
    accepted: valid.map((text) => validateBibTeX(`  ${text}\n`)),
    rejected: invalid.map((text) => {
      try { validateBibTeX(text); return false; } catch { return true; }
    }),
  }), { valid, invalid });
  expect(result.accepted).toEqual(valid);
  expect(result.rejected).toEqual(invalid.map(() => true));
});

test('Scholar captures the selected origin with results even if settings change in flight', async ({ page }) => {
  await page.evaluate(() => {
    GM_setValue('configure.origin', 'https://scholar.google.com.hk');
    window.__obhTest.pending = getArticleIDListGoogleScholar('attention', 1, {});
  });
  const request = await requestAt(page, 0);
  expect(new URL(request.url).origin).toBe('https://scholar.google.com.hk');
  await page.evaluate(() => GM_setValue('configure.origin', 'https://scholar.google.com'));
  await respond(page, 0, {
    body: '<div class="gs_r gs_or gs_scl" data-cid="citation123"><h3 class="gs_rt"><a href="https://example.com/paper">Attention</a></h3><div class="gs_a">X Yin - ACL, 2026</div></div>',
  });
  const records = await page.evaluate(() => window.__obhTest.pending);
  expect(records).toEqual([expect.objectContaining({ id: 'citation123', title: 'Attention', origin: 'https://scholar.google.com.hk' })]);
});

test('Scholar BibTeX follows the captured origin and resolves a relative export link', async ({ page }) => {
  await page.evaluate(() => {
    GM_setValue('configure.origin', 'https://scholar.google.com');
    window.__obhTest.pending = getBibTexGoogleScholar('citation123', 'https://scholar.google.com.hk');
  });
  const citeRequest = await requestAt(page, 0);
  expect(new URL(citeRequest.url).origin).toBe('https://scholar.google.com.hk');
  await respond(page, 0, {
    body: '<div id="gs_citi"><a class="gs_citi" href="/scholar.enw?c=citation123">EndNote</a><a class="gs_citi" href="/scholar.bib?c=citation123&amp;output=citation">BibTeX</a></div>',
  });
  const bibRequest = await requestAt(page, 1);
  expect(bibRequest.url).toBe('https://scholar.google.com.hk/scholar.bib?c=citation123&output=citation');
  await respond(page, 1, { body: VALID_BIB });
  expect(await page.evaluate(() => window.__obhTest.pending)).toBe(VALID_BIB);
});

test('Scholar verification rejects with an actionable error without opening unsolicited tabs', async ({ page }) => {
  await page.evaluate(() => {
    window.__obhTest.pending = getArticleIDListGoogleScholar('attention', 1, {})
      .then((value) => ({ value }), (error) => ({ message: error.message }));
  });
  await respond(page, 0, { body: '<html><form id="gs_captcha_f">Verify you are not a robot</form></html>' });
  const result = await page.evaluate(() => window.__obhTest.pending);
  expect(result.message).toMatch(/verification|captcha|verify/i);
  expect(await page.evaluate(() => window.__obhTest.openedTabs)).toEqual([]);
});
