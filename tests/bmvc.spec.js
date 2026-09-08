const { test, expect } = require('./fixtures');
const { boot, requestAt, respond } = require('./helpers');

const PAGE_2023 = 'https://proceedings.bmvc2023.org/202/';
const PAGE_2024 = 'https://bmvc2024.org/proceedings/828/';
const PAGE_2025 = 'https://bmvc2025.bmva.org/proceedings/12/';
const PAGE_2015 = 'https://www.bmva-archive.org.uk/bmvc/2015/papers/paper020/index.html';
const PAGE_2016 = 'https://www.bmva-archive.org.uk/bmvc/2016/papers/paper059/index.html';
const PAGE_2017 = 'https://www.bmva-archive.org.uk/bmvc/2017/papers/paper046/index.html';

// Original public citation blocks from the six official pages above. Abstracts are omitted.
const BIB_2023 = `@inproceedings{Lee_2023_BMVC,
author    = {Jae Young Lee and Wonjun Lee and Jaehyun Choi and Yongkwi LEE and Young Seog Yoon},
title     = {Few-Shot Anomaly Detection with Adversarial Loss for Robust Feature Representations},
booktitle = {34th British Machine Vision Conference 2023, {BMVC} 2023, Aberdeen, UK, November 20-24, 2023},
publisher = {BMVA},
year      = {2023},
url       = {https://papers.bmvc2023.org/0202.pdf}
}`;
const BIB_2024 = `@inproceedings{Verma_2024_BMVC,
author    = {Riya Verma and Sukhendu Das},
title     = {Multi-Scale Semantic Enrichment and Dual Angular Margin Contrast for Few-Shot Class Incremental Learning},
booktitle = {35th British Machine Vision Conference 2024, {BMVC} 2024, Glasgow, UK, November 25-28, 2024},
publisher = {BMVA},
year      = {2024},
url       = {https://papers.bmvc2024.org/0828.pdf}
}`;
const BIB_2025 = `@inproceedings{Chao_2025_BMVC,
author    = {Jun-Jee Chao and Qingyuan Jiang and Volkan Isler},
title     = {Part Segmentation and Motion Estimation for Articulated Objects with Dynamic 3D Gaussians},
booktitle = {36th British Machine Vision Conference 2025, {BMVC} 2025, Sheffield, UK, November 24-27, 2025},
publisher = {BMVA},
year      = {2025},
url       = {https://bmva-archive.org.uk/bmvc/2025/assets/papers/Paper_12/paper.pdf}
}`;
const BIB_2015 = `@inproceedings{BMVC2015_20,
	title={Robust Multiple Model Fitting with Preference Analysis and Low-rank Approximation},
	author={Luca Magri and Andrea Fusiello},
	year={2015},
	month={September},
	pages={20.1-20.12},
	articleno={20},
	numpages={12},
	booktitle={Proceedings of the British Machine Vision Conference (BMVC)},
	publisher={BMVA Press},
	editor={Xianghua Xie, Mark W. Jones, and Gary K. L. Tam},
	doi={10.5244/C.29.20},
	isbn={1-901725-53-7},
	url={https://dx.doi.org/10.5244/C.29.20}
}`;
const BIB_2016 = `@inproceedings{BMVC2016_59,
        	title={Exploiting Random RGB and Sparse Features for Camera Pose Estimation},
        	author={Lili Meng, Jianhui Chen, Frederick Tung, James Little and Clarence Silva},
        	year={2016},
        	month={September},
        	pages={59.1-59.12},
        	articleno={59},
        	numpages={12},
        	booktitle={Proceedings of the British Machine Vision Conference (BMVC)},
        	publisher={BMVA Press},
        	editor={Richard C. Wilson, Edwin R. Hancock and William A. P. Smith},
        	doi={10.5244/C.30.59},
        	isbn={1-901725-59-6},
        	url={https://dx.doi.org/10.5244/C.30.59}
        }`;
const BIB_2017 = `@inproceedings{BMVC2017_46,
                title={Cross-domain Generative Learning for Fine-Grained Sketch-Based Image Retrieval},
                author={Kaiyue Pang, Yi-zhe Song, Tony Xiang and Timothy Hospedales},
                year={2017},
                month={September},
                pages={46.1-46.12},
                articleno={46},
                numpages={12},
                booktitle={Proceedings of the British Machine Vision Conference (BMVC)},
                publisher={BMVA Press},
                editor={Tae-Kyun Kim, Stefanos Zafeiriou, Gabriel Brostow and Krystian Mikolajczyk},
                doi={10.5244/C.31.46},
                isbn={1-901725-60-X},
                url={https://dx.doi.org/10.5244/C.31.46}
            }`;

const htmlEscape = (text) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const modernHTML = (bib) => `<html><body><h2>Citation</h2><div class="highlighter-rouge"><div class="highlight"><pre class="highlight"><code>${htmlEscape(bib)}\n</code></pre></div></div></body></html>`;
const archiveHTML = (bib) => `<html><body><h2>Bibtex</h2><pre class="citation">\n${htmlEscape(bib)}</pre></body></html>`;
const result = (page) => page.evaluate(() => window.__obhTest.pendingBMVC);

async function startOfficial(page, cid) {
  await page.evaluate((url) => {
    window.__obhTest.pendingBMVC = getBibTexOfficial('BMVC', url)
      .then((value) => ({ value }), (error) => ({ error: error.message }));
  }, cid);
}

test.beforeEach(async ({ page }) => { await boot(page); });

test('BMVC recognizes the verified modern and archived main-conference paper pages', async ({ page }) => {
  const urls = [PAGE_2023, PAGE_2024, PAGE_2025, PAGE_2015, PAGE_2016, PAGE_2017];
  expect(await page.evaluate((values) => values.map(getOfficialSource), urls))
    .toEqual(urls.map((cid) => ({ source: 'BMVC', cid })));
  expect(await page.evaluate((url) => getOfficialSource(url), PAGE_2024.replace('https:', 'http:') + '?utm_source=dblp#citation'))
    .toEqual({ source: 'BMVC', cid: PAGE_2024 });
});

test('BMVC archive DOIs and old BMVA URLs resolve directly to the same archive identity', async ({ page }) => {
  const cases = [
    ['10.5244/C.29.20', PAGE_2015],
    ['https://doi.org/10.5244/C.30.59', PAGE_2016],
    ['https://dx.doi.org/10.5244/C.31.46', PAGE_2017],
    ['https://doi.org/10.5244%2FC.31.46', PAGE_2017],
    [PAGE_2017.replace('www.bmva-archive.org.uk', 'www.bmva.org'), PAGE_2017],
    [PAGE_2016.replace('www.bmva-archive.org.uk', 'bmva.org'), PAGE_2016],
    [PAGE_2015.replace('www.bmva-archive.org.uk', 'bmva-archive.org.uk'), PAGE_2015],
  ];
  expect(await page.evaluate((values) => values.map(([url]) => getOfficialSource(url)), cases))
    .toEqual(cases.map(([, cid]) => ({ source: 'BMVC', cid })));
});

test('BMVC normalizes only main-paper PDFs to the matching HTML page', async ({ page }) => {
  const cases = [
    ['https://papers.bmvc2023.org/0202.pdf', PAGE_2023],
    ['https://papers.bmvc2024.org/0828.pdf', PAGE_2024],
    ['https://bmva-archive.org.uk/bmvc/2024/papers/Paper_828/paper.pdf', PAGE_2024],
    ['https://bmva-archive.org.uk/bmvc/2025/assets/papers/Paper_12/paper.pdf', PAGE_2025],
    [PAGE_2017.replace('index.html', 'paper046.pdf'), PAGE_2017],
  ];
  expect(await page.evaluate((values) => values.map(([url]) => getOfficialSource(url)), cases))
    .toEqual(cases.map(([, cid]) => ({ source: 'BMVC', cid })));
});

test('BMVC leaves unverified years, workshops, invalid IDs, and unrelated hosts unsupported', async ({ page }) => {
  const rejected = [
    'https://bmvc2022.mpi-inf.mpg.de/491/',
    'https://bmvc2026.bmva.org/proceedings/12/',
    'https://workshops.proceedings.bmvc2023.org/202/',
    PAGE_2017.replace('/2017/', '/2011/'),
    '10.5244/C.25.26',
    '10.5244/C.29.DIFFCV.11',
    '10.5244/C.31.0',
    PAGE_2025.replace('/12/', '/0/'),
    PAGE_2025.replace('/12/', '/99999999999999999999999/'),
    'https://papers.bmvc2023.org/0202_poster.pdf',
    'https://bmva-archive.org.uk/bmvc/2025/assets/papers/Paper_12/supplementary.pdf',
    'https://bmva-archive.org.uk/bmvc/2024/assets/papers/Paper_828/paper.pdf',
    PAGE_2017.replace('index.html', 'paper047.pdf'),
    PAGE_2024.replace('bmvc2024.org', 'bmvc2024.org.evil.example'),
    PAGE_2024.replace('https://', 'https://user:secret@'),
    PAGE_2024.replace('bmvc2024.org', 'bmvc2024.org:444'),
    'https://constructor/202.pdf',
  ];
  expect(await page.evaluate((values) => values.map(getOfficialSource), rejected)).toEqual(rejected.map(() => null));
});

test('BMVC returns the exact original 2023, 2024, and 2025 Citation blocks in one request', async ({ page }) => {
  for (const [index, [cid, bib]] of [[PAGE_2023, BIB_2023], [PAGE_2024, BIB_2024], [PAGE_2025, BIB_2025]].entries()) {
    await startOfficial(page, cid);
    expect((await requestAt(page, index)).url).toBe(cid);
    await respond(page, index, { body: modernHTML(bib) });
    expect(await result(page)).toEqual({ value: bib });
  }
  expect(await page.evaluate(() => window.__obhTest.requests.length)).toBe(3);
});

test('BMVC archive exports preserve original author formatting and DOI fields', async ({ page }) => {
  for (const [index, [cid, bib]] of [[PAGE_2015, BIB_2015], [PAGE_2016, BIB_2016], [PAGE_2017, BIB_2017]].entries()) {
    await startOfficial(page, cid);
    await respond(page, index, { body: archiveHTML(bib) });
    expect(await result(page)).toEqual({ value: bib });
  }
});

test('BMVC decodes HTML entities without altering nested BibTeX braces or LaTeX commands', async ({ page }) => {
  const bib = BIB_2025.replace('Dynamic 3D Gaussians', String.raw`{Dynamic} 3D Gaussians & {\LaTeX} <Signals>`);
  await startOfficial(page, PAGE_2025);
  await respond(page, 0, { body: modernHTML(bib) });
  expect(await result(page)).toEqual({ value: bib });
});

test('BMVC refuses missing, ambiguous, malformed, and multi-record exports', async ({ page }) => {
  const invalid = [
    '<html><body><h2>Citation unavailable</h2></body></html>',
    modernHTML(BIB_2025).replace('</body>', `<pre class="citation">${BIB_2025}</pre></body>`),
    modernHTML('@inproceedings{broken,title={unfinished}'),
    modernHTML(`${BIB_2025}\n${BIB_2024}`),
    modernHTML('@inproceedings{missing,title={Only a title}}'),
    modernHTML(BIB_2025.replace('title     =', 'note      =')),
  ];
  for (const [index, body] of invalid.entries()) {
    await startOfficial(page, PAGE_2025);
    await respond(page, index, { body });
    expect(await result(page)).toEqual({ error: expect.any(String) });
  }
  expect(await page.evaluate(() => window.__obhTest.clipboardWrites)).toEqual([]);
});

test('BMVC rejects modern exports that identify a different paper, year, or non-paper URL', async ({ page }) => {
  const originalURL = 'https://bmva-archive.org.uk/bmvc/2025/assets/papers/Paper_12/paper.pdf';
  const invalidURLs = [
    originalURL.replace('Paper_12', 'Paper_13'),
    'https://papers.bmvc2024.org/0012.pdf',
    originalURL.replace('paper.pdf', 'poster.pdf'),
    originalURL.replace('bmva-archive.org.uk', 'example.org'),
    '',
  ];
  for (const [index, url] of invalidURLs.entries()) {
    await startOfficial(page, PAGE_2025);
    await respond(page, index, { body: modernHTML(BIB_2025.replace(originalURL, url)) });
    expect(await result(page)).toEqual({ error: expect.any(String) });
  }
});

test('BMVC rejects missing, malformed, and conflicting archive DOIs', async ({ page }) => {
  const invalid = [
    BIB_2017.replace('doi={10.5244/C.31.46}', 'doi={10.5244/C.31.47}'),
    BIB_2017.replace('doi={10.5244/C.31.46}', 'doi={not-a-doi}'),
    BIB_2017.replace('doi={10.5244/C.31.46}', 'doi={}'),
    BIB_2017.replace('doi={10.5244/C.31.46}', 'note={DOI omitted}'),
  ];
  for (const [index, bib] of invalid.entries()) {
    await startOfficial(page, PAGE_2017);
    await respond(page, index, { body: archiveHTML(bib) });
    expect(await result(page)).toEqual({ error: expect.any(String) });
  }
});

test('BMVC accepts its archive alias but rejects cross-paper and unrelated redirects', async ({ page }) => {
  await startOfficial(page, PAGE_2017);
  await respond(page, 0, { body: archiveHTML(BIB_2017), finalUrl: PAGE_2017.replace('www.bmva-archive', 'bmva-archive') });
  expect(await result(page)).toEqual({ value: BIB_2017 });
  for (const [index, finalUrl] of [PAGE_2024, PAGE_2025.replace('/12/', '/13/'), 'https://example.org/paper/12/'].entries()) {
    await startOfficial(page, PAGE_2025);
    await respond(page, index + 1, { body: modernHTML(BIB_2025), finalUrl });
    expect(await result(page)).toEqual({ error: expect.any(String) });
  }
});

test('DBLP electronic editions select BMVC while the user can still request DBLP BibTeX', async ({ page }) => {
  const article = {
    title: 'Cross-domain Generative Learning for Fine-Grained Sketch-Based Image Retrieval',
    url: 'https://dblp.org/rec/conf/bmvc/PangSXH17',
    venue: 'BMVC', year: '2017', type: 'Conference and Workshop Papers',
    electronicEditions: ['https://doi.org/10.5244/C.31.46'],
  };
  expect(await page.evaluate((paper) => getArticleBibTarget(paper, 'DBLP', 'official'), article))
    .toEqual({ source: 'BMVC', cid: PAGE_2017 });
  expect(await page.evaluate((paper) => getArticleBibTarget(paper, 'DBLP', 'search'), article))
    .toEqual({ source: 'DBLP', cid: article.url, origin: '' });
  const unsupported = { ...article, electronicEditions: ['https://bmvc2022.mpi-inf.mpg.de/491/'] };
  expect(await page.evaluate((paper) => getArticleBibTarget(paper, 'DBLP', 'official'), unsupported))
    .toEqual({ source: 'DBLP', cid: article.url, origin: '' });
});
