const { test, expect } = require('./fixtures');
const { boot, requestAt, respond } = require('./helpers');

// These two IJCAI responses were fetched from the official export URLs on
// 2026-09-07. Preserve their fields and keys rather than reconstructing them.
const IJCAI_2025_BIB = `@inproceedings{ijcai2025p1,
  title     = {Synthesising Minimum Cost Dynamic Norms},
  author    = {Alechina, Natasha and Logan, Brian and Perelli, Giuseppe},
  booktitle = {Proceedings of the Thirty-Fourth International Joint Conference on
               Artificial Intelligence, {IJCAI-25}},
  publisher = {International Joint Conferences on Artificial Intelligence Organization},
  editor    = {James Kwok},
  pages     = {3--11},
  year      = {2025},
  month     = {8},
  note      = {Main Track},
  doi       = {10.24963/ijcai.2025/1},
  url       = {https://doi.org/10.24963/ijcai.2025/1},
}`;
const IJCAI_2017_BIB = `@inproceedings{ijcai2017p1,
  author    = {Luigi Bellomarini and Georg Gottlob and Andreas Pieris and Emanuel Sallinger},
  title     = {Swift Logic for Big Data and Knowledge Graphs},
  booktitle = {Proceedings of the Twenty-Sixth International Joint Conference on
               Artificial Intelligence, {IJCAI-17}},
  pages     = {2--10},
  year      = {2017},
  doi       = {10.24963/ijcai.2017/1},
  url       = {https://doi.org/10.24963/ijcai.2017/1},
}`;

const AAAI_PAGE = 'https://ojs.aaai.org/index.php/AAAI/article/view/29794';
const AAAI_DOI = '10.1609/aaai.v38i16.29794';
const AAAI_EXPORT = 'https://ojs.aaai.org/index.php/AAAI/citationstylelanguage/download/bibtex?submissionId=29794&publicationId=28078';
const KR_PAGE = 'https://proceedings.kr.org/2024/1/';

// Exact <pre> text fetched from https://proceedings.kr.org/2024/1/bibtex/
// on 2026-09-07. That endpoint serves a complete HTML page, not plain BibTeX.
const KR_BIB = `@inproceedings{KR2024-1,
    title     = {{Consistent Query Answering over SHACL Constraints}},
    author    = {Ahmetaj, Shqiponja and Merkl, Timo Camillo and Pichler, Reinhard},
    booktitle = {{Proceedings of the 21st International Conference on Principles of Knowledge Representation and Reasoning}},
    pages     = {2--13},
    year      = {2024},
    month     = {8},
    doi       = {10.24963/kr.2024/1},
    url       = {https://doi.org/10.24963/kr.2024/1},
  }`;

// The OJS HTML links and distinct publication IDs below were observed live.
// OJS export downloads failed in the research environment, so these BibTeX
// payloads are explicitly synthetic schema fixtures, not claimed live exports.
function syntheticOjsBib({ page = AAAI_PAGE, doi = AAAI_DOI } = {}) {
  return `@article{syntheticOfficial2024,
  title = {Synthetic Conference Citation Fixture},
  author = {Fixture, Author},
  journal = {Proceedings of the Fixture Conference},
  year = {2024},
  DOI = {${doi}},
  url = {${page}}
}`;
}

function ojsHTML({ page = AAAI_PAGE, doi = AAAI_DOI, href = AAAI_EXPORT } = {}) {
  const link = href === null ? '' : `<a href="${href.replaceAll('&', '&amp;')}">BibTeX</a>`;
  return `<html><head>
    <meta name="citation_title" content="Synthetic Conference Citation Fixture">
    <meta name="citation_doi" content="${doi}">
    <meta name="citation_abstract_html_url" content="${page}">
  </head><body><div class="item citation">${link}</div></body></html>`;
}

async function start(page, source, cid) {
  await page.evaluate(({ source, cid }) => {
    window.__obhTest.pending = getBibTexOfficial(source, cid)
      .then(value => ({ value }), error => ({ error: error.message }));
  }, { source, cid });
}

async function expectFailure(page, requestCount) {
  expect(await page.evaluate(() => window.__obhTest.pending)).toEqual({ error: expect.any(String) });
  expect(await page.evaluate(() => window.__obhTest.requests.length)).toBe(requestCount);
  expect(await page.evaluate(() => window.__obhTest.clipboardWrites)).toEqual([]);
}

test.beforeEach(async ({ page }) => { await boot(page); });

test('AAAI and IJCAI recognize DOI aliases and preserve publisher paper identities', async ({ page }) => {
  const cases = [
    [AAAI_PAGE, { source: 'AAAI', cid: AAAI_PAGE }],
    [`https://doi.org/${AAAI_DOI}`, { source: 'AAAI', cid: AAAI_PAGE }],
    [AAAI_DOI, { source: 'AAAI', cid: AAAI_PAGE }],
    ['10.1609/aaaiss.v9i1.42899', { source: 'AAAI', cid: 'https://ojs.aaai.org/index.php/AAAI-SS/article/view/42899' }],
    ['10.1609/aies.v8i2.36627', { source: 'AAAI', cid: 'https://ojs.aaai.org/index.php/AIES/article/view/36627' }],
    ['10.1609/icwsm.v12i1.15044', { source: 'AAAI', cid: 'https://ojs.aaai.org/index.php/ICWSM/article/view/15044' }],
    ['https://ijcai.org/proceedings/2025/0001', { source: 'IJCAI', cid: 'https://www.ijcai.org/proceedings/2025/1' }],
    ['https://www.ijcai.org/proceedings/2017/0001.pdf', { source: 'IJCAI', cid: 'https://www.ijcai.org/proceedings/2017/1' }],
    ['10.24963/ijcai.2025/1', { source: 'IJCAI', cid: 'https://www.ijcai.org/proceedings/2025/1' }],
  ];
  for (const [input, expected] of cases) {
    expect(await page.evaluate(url => getOfficialSource(url), input)).toEqual(expected);
  }
});

test('publisher recognition rejects deceptive hosts, credentials, and unsupported historical PDFs', async ({ page }) => {
  const inputs = [
    'https://ojs.aaai.org.evil.example/index.php/AAAI/article/view/29794',
    'https://www.ijcai.org.evil.example/proceedings/2025/1',
    'https://user:secret@ojs.aaai.org/index.php/AAAI/article/view/29794',
    'https://www.ijcai.org/proceedings/2016/1',
    'https://www.ijcai.org/Proceedings/16/Papers/001.pdf',
    'https://doi.org/10.1609/unrelated-record',
    'https://doi.org/10.24963/ijcai.2025/',
  ];
  expect(await page.evaluate(urls => urls.map(getOfficialSource), inputs)).toEqual(inputs.map(() => null));
});

test('IJCAI copies exact historical and current official BibTeX exports', async ({ page }) => {
  for (const [index, [year, bib]] of [[2017, IJCAI_2017_BIB], [2025, IJCAI_2025_BIB]].entries()) {
    await start(page, 'IJCAI', `https://www.ijcai.org/proceedings/${year}/1`);
    expect((await requestAt(page, index)).url).toBe(`https://www.ijcai.org/proceedings/${year}/bibtex/1`);
    await respond(page, index, { body: `${bib}\n` });
    expect(await page.evaluate(() => window.__obhTest.pending)).toEqual({ value: bib });
  }
});

test('IJCAI rejects its real HTTP 200 empty-paper template', async ({ page }) => {
  // The official endpoint returns this shape for an unknown numeric paper ID.
  const empty = `@inproceedings{ijcai2025p999999,
    title = {}, author = {},
    booktitle = {Proceedings of the Thirty-Fourth International Joint Conference on Artificial Intelligence},
    pages = {---1}, year = {2025},
    doi = {10.24963/ijcai.2025/}, url = {https://doi.org/10.24963/ijcai.2025/}
  }`;
  await start(page, 'IJCAI', 'https://www.ijcai.org/proceedings/2025/999999');
  await respond(page, 0, { body: empty });
  await expectFailure(page, 1);
});

test('IJCAI rejects another paper DOI or missing bibliographic identity', async ({ page }) => {
  const invalid = [
    IJCAI_2025_BIB.replaceAll('10.24963/ijcai.2025/1', '10.24963/ijcai.2025/2'),
    IJCAI_2025_BIB.replace('Synthesising Minimum Cost Dynamic Norms', ''),
    IJCAI_2025_BIB.replace('Alechina, Natasha and Logan, Brian and Perelli, Giuseppe', ''),
  ];
  for (const [index, body] of invalid.entries()) {
    await start(page, 'IJCAI', 'https://www.ijcai.org/proceedings/2025/1');
    await respond(page, index, { body });
    await expectFailure(page, index + 1);
  }
});

test('IJCAI refuses an export redirected to another paper', async ({ page }) => {
  await start(page, 'IJCAI', 'https://www.ijcai.org/proceedings/2025/1');
  await respond(page, 0, {
    body: IJCAI_2025_BIB,
    finalUrl: 'https://www.ijcai.org/proceedings/2025/bibtex/2',
  });
  await expectFailure(page, 1);
});

test('AAAI follows the provided publicationId and preserves the official entry type and fields', async ({ page }) => {
  const bib = syntheticOjsBib();
  await start(page, 'AAAI', AAAI_PAGE);
  expect((await requestAt(page, 0)).url).toBe(AAAI_PAGE);
  await respond(page, 0, { body: ojsHTML() });
  const requested = new URL((await requestAt(page, 1)).url);
  expect(requested.origin + requested.pathname).toBe(AAAI_EXPORT.split('?')[0]);
  expect(requested.searchParams.get('submissionId')).toBe('29794');
  expect(requested.searchParams.get('publicationId')).toBe('28078');
  await respond(page, 1, { body: bib });
  expect(await page.evaluate(() => window.__obhTest.pending)).toEqual({ value: bib });
});

test('the OJS provider follows verified AIES and ICWSM export links in their own journals', async ({ page }) => {
  const cases = [
    ['AIES', '36627', '34886', '10.1609/aies.v8i2.36627'],
    ['ICWSM', '15044', '13403', '10.1609/icwsm.v12i1.15044'],
  ];
  for (const [index, [journal, id, publicationId, doi]] of cases.entries()) {
    const cid = `https://ojs.aaai.org/index.php/${journal}/article/view/${id}`;
    const href = `https://ojs.aaai.org/index.php/${journal}/citationstylelanguage/download/bibtex?submissionId=${id}&publicationId=${publicationId}`;
    const bib = syntheticOjsBib({ page: cid, doi });
    await start(page, 'AAAI', cid);
    await respond(page, index * 2, { body: ojsHTML({ page: cid, doi, href }) });
    const requested = new URL((await requestAt(page, index * 2 + 1)).url);
    expect(requested.pathname).toBe(new URL(href).pathname);
    expect(requested.searchParams.get('submissionId')).toBe(id);
    expect(requested.searchParams.get('publicationId')).toBe(publicationId);
    await respond(page, index * 2 + 1, { body: bib });
    expect(await page.evaluate(() => window.__obhTest.pending)).toEqual({ value: bib });
  }
});

test('AAAI rejects export links for another submission, journal, or host', async ({ page }) => {
  const invalid = [
    AAAI_EXPORT.replace('submissionId=29794', 'submissionId=29795'),
    AAAI_EXPORT.replace('/AAAI/', '/ICWSM/'),
    AAAI_EXPORT.replace('ojs.aaai.org', 'evil.example'),
  ];
  for (const [index, href] of invalid.entries()) {
    await start(page, 'AAAI', AAAI_PAGE);
    await respond(page, index, { body: ojsHTML({ href }) });
    await expectFailure(page, index + 1);
  }
});

test('AAAI refuses a page with metadata but no official export link', async ({ page }) => {
  await start(page, 'AAAI', AAAI_PAGE);
  await respond(page, 0, { body: ojsHTML({ href: null }) });
  await expectFailure(page, 1);
});

test('AAAI rejects a mismatching export DOI or non-BibTeX response', async ({ page }) => {
  const invalid = [
    syntheticOjsBib().replace(AAAI_DOI, '10.1609/aaai.v38i16.29795'),
    '<html><body>Export temporarily unavailable</body></html>',
  ];
  for (const [index, body] of invalid.entries()) {
    await start(page, 'AAAI', AAAI_PAGE);
    await respond(page, index * 2, { body: ojsHTML() });
    await respond(page, index * 2 + 1, { body });
    await expectFailure(page, index * 2 + 2);
  }
});

test('AAAI refuses a successful export response redirected off the official host', async ({ page }) => {
  await start(page, 'AAAI', AAAI_PAGE);
  await respond(page, 0, { body: ojsHTML() });
  await respond(page, 1, { body: syntheticOjsBib(), finalUrl: 'https://evil.example/paper.bib' });
  await expectFailure(page, 2);
});

test('legacy AAAI OCS resolves the actual modern DOI without reusing the old paper ID', async ({ page }) => {
  const legacy = 'https://www.aaai.org/ocs/index.php/AAAI/AAAI18/paper/view/16441';
  const wordpress = 'https://aaai.org/papers/11416-multi-task-deep-learning-for-predicting-poverty-from-satellite-images/';
  const modern = 'https://ojs.aaai.org/index.php/AAAI/article/view/11416';
  const doi = '10.1609/aaai.v32i1.11416';
  await start(page, 'AAAI', legacy);
  const first = new URL((await requestAt(page, 0)).url);
  expect(['aaai.org', 'www.aaai.org']).toContain(first.hostname);
  expect(first.pathname).toBe('/ocs/index.php/AAAI/AAAI18/paper/view/16441');
  await respond(page, 0, {
    finalUrl: wordpress,
    body: `<html><head><link rel="canonical" href="${wordpress}"></head><body>
      <h1>Multi-Task Deep Learning for Predicting Poverty From Satellite Images</h1>
      <div class="paper-section-wrap"><h4>DOI:</h4><div class="attribute-output"><p>${doi}</p><br></div></div>
    </body></html>`,
  });
  expect((await requestAt(page, 1)).url).toBe(modern);
  // Synthetic export metadata follows the verified modern article identity.
  const href = 'https://ojs.aaai.org/index.php/AAAI/citationstylelanguage/download/bibtex?submissionId=11416&publicationId=12585';
  await respond(page, 1, { body: ojsHTML({ page: modern, doi, href }) });
  expect(new URL((await requestAt(page, 2)).url).searchParams.get('submissionId')).toBe('11416');
  const bib = syntheticOjsBib({ page: modern, doi });
  await respond(page, 2, { body: bib });
  expect(await page.evaluate(() => window.__obhTest.pending)).toEqual({ value: bib });
});

test('AAAI export access failures do not synthesize a citation or silently fetch DBLP', async ({ page }) => {
  await start(page, 'AAAI', AAAI_PAGE);
  await respond(page, 0, { body: ojsHTML() });
  await respond(page, 1, { status: 403, body: 'Forbidden' });
  await expectFailure(page, 2);
});

test('KR normalizes DOI and supported current and legacy export URL forms', async ({ page }) => {
  const inputs = [
    '10.24963/kr.2024/1',
    'https://doi.org/10.24963/kr.2024/1',
    'https://proceedings.kr.org/2024/0001/',
    'https://proceedings.kr.org/2024/1/bibtex/',
    'https://proceedings.kr.org/2024/bibtex/1',
  ];
  expect(await page.evaluate(urls => urls.map(getOfficialSource), inputs)).toEqual(
    inputs.map(() => ({ source: 'KR', cid: KR_PAGE })),
  );
});

test('KR follows its actual link and extracts the original BibTeX from the HTML export page', async ({ page }) => {
  await start(page, 'KR', KR_PAGE);
  expect((await requestAt(page, 0)).url).toBe(KR_PAGE);
  // The live paper links the route without the trailing slash; the export
  // redirects to /bibtex/ and wraps exactly one record in an HTML <pre>.
  await respond(page, 0, {
    body: '<html><body><a href="/2024/1/bibtex"><svg aria-hidden="true"></svg>BibTeX</a></body></html>',
  });
  expect((await requestAt(page, 1)).url).toBe('https://proceedings.kr.org/2024/1/bibtex');
  await respond(page, 1, {
    finalUrl: 'https://proceedings.kr.org/2024/1/bibtex/',
    body: `<html><head><title>BibTeX | KR Proceedings</title></head><body><h1>BibTeX</h1><pre>${KR_BIB}</pre></body></html>`,
  });
  expect(await page.evaluate(() => window.__obhTest.pending)).toEqual({ value: KR_BIB });
});

test('KR honors a supported legacy export link and refuses a different paper DOI', async ({ page }) => {
  // The legacy route here is a synthetic compatibility fixture. The current
  // record itself is the exact live export above; no historical live claim.
  await start(page, 'KR', KR_PAGE);
  await respond(page, 0, { body: '<a href="/2024/bibtex/1">BibTeX</a>' });
  expect((await requestAt(page, 1)).url).toBe('https://proceedings.kr.org/2024/bibtex/1');
  await respond(page, 1, { body: KR_BIB });
  expect(await page.evaluate(() => window.__obhTest.pending)).toEqual({ value: KR_BIB });

  await start(page, 'KR', KR_PAGE);
  await respond(page, 2, { body: '<a href="/2024/1/bibtex">BibTeX</a>' });
  await respond(page, 3, { body: `<pre>${KR_BIB.replaceAll('10.24963/kr.2024/1', '10.24963/kr.2024/2')}</pre>` });
  await expectFailure(page, 4);
});

test('KR refuses a foreign paper link and ambiguous multi-record export pages', async ({ page }) => {
  await start(page, 'KR', KR_PAGE);
  await respond(page, 0, { body: '<a href="/2024/2/bibtex">BibTeX</a>' });
  await expectFailure(page, 1);

  await start(page, 'KR', KR_PAGE);
  await respond(page, 1, { body: '<a href="/2024/1/bibtex">BibTeX</a>' });
  await respond(page, 2, { body: `<html><body><pre>${KR_BIB}</pre><pre>${KR_BIB}</pre></body></html>` });
  await expectFailure(page, 3);
});
