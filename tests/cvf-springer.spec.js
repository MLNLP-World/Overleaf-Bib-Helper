const { test, expect } = require('./fixtures');
const { boot, requestAt, respond } = require('./helpers');

const CVPR_PAGE = 'https://openaccess.thecvf.com/content/CVPR2025/html/Ren_MINIMA_Modality_Invariant_Image_Matching_CVPR_2025_paper.html';
const ICCV_PAGE = 'https://openaccess.thecvf.com/content/ICCV2023/html/Kirillov_Segment_Anything_ICCV_2023_paper.html';
const WACV_PAGE = 'https://openaccess.thecvf.com/content/WACV2024/html/Han_Efficient_MAE_Towards_Large-Scale_Vision_Transformers_WACV_2024_paper.html';
const WORKSHOP_PAGE = 'https://openaccess.thecvf.com/content/CVPR2024W/ABAW/html/Dresvyanskiy_Multi-modal_Arousal_and_Valence_Estimation_under_Noisy_Conditions_CVPRW_2024_paper.html';
const LEGACY_PAGE = 'https://openaccess.thecvf.com/content_cvpr_2017/html/Zamir_Feedback_Networks_CVPR_2017_paper.html';
const LEGACY_WORKSHOP_PAGE = 'https://openaccess.thecvf.com/content_CVPRW_2020/html/w6/Kansal_A_Multi-Level_Supervision_Model_A_Novel_Approach_for_Thermal_Image_CVPRW_2020_paper.html';
const ECCV_CVF_PAGE = 'https://openaccess.thecvf.com/content_ECCV_2018/html/Sanghyun_Woo_Convolutional_Block_Attention_ECCV_2018_paper.html';
const ECVA_PAGE = 'https://www.ecva.net/papers/eccv_2022/papers_ECCV/html/1557_ECCV_2022_paper.php';
const SPRINGER_DOI = '10.1007/978-3-031-73232-4_1';
const ECVA_DOI = '10.1007/978-3-031-20059-5_1';
const SPRINGER_PAGE = `https://link.springer.com/chapter/${SPRINGER_DOI}`;
const springerExport = (doi) => `https://citation-needed.springer.com/v2/references/${doi}?format=bibtex&flavour=citation`;

// Public official citation metadata; Springer abstracts are omitted from these fixtures.
const CVF_BIB = `@InProceedings{Ren_2025_CVPR,
    author    = {Ren, Jiangwei and Jiang, Xingyu and Li, Zizhuo and Liang, Dingkang and Zhou, Xin and Bai, Xiang},
    title     = {MINIMA: Modality Invariant Image Matching},
    booktitle = {Proceedings of the IEEE/CVF Conference on Computer Vision and Pattern Recognition (CVPR)},
    month     = {June},
    year      = {2025},
    pages     = {23059-23068}
}`;
const LEGACY_BIB = `@InProceedings{Zamir_2017_CVPR,
author = {Zamir, Amir R. and Wu, Te-Lin and Sun, Lin and Shen, William B. and Shi, Bertram E. and Malik, Jitendra and Savarese, Silvio},
title = {Feedback Networks},
booktitle = {Proceedings of the IEEE Conference on Computer Vision and Pattern Recognition (CVPR)},
month = {July},
year = {2017}
}`;
const SPRINGER_BIB = String.raw`@InProceedings{10.1007/978-3-031-73232-4_1,
author="Bonato, Jacopo
and Cotogni, Marco
and Sabetta, Luigi",
editor="Leonardis, Ale{\v{s}}
and Ricci, Elisa
and Roth, Stefan
and Russakovsky, Olga
and Sattler, Torsten
and Varol, G{\"u}l",
title="Is Retain Set All You Need in Machine Unlearning? Restoring Performance of Unlearned Models with Out-of-Distribution Images",
booktitle="Computer Vision -- ECCV 2024",
year="2025",
publisher="Springer Nature Switzerland",
address="Cham",
pages="1--19",
isbn="978-3-031-73232-4"
}`;
const ECVA_BIB = String.raw`@InProceedings{10.1007/978-3-031-20059-5_1,
author="Boecking, Benedikt
and Usuyama, Naoto
and Bannur, Shruthi
and Castro, Daniel C.
and Schwaighofer, Anton
and Hyland, Stephanie
and Wetscherek, Maria
and Naumann, Tristan
and Nori, Aditya
and Alvarez-Valle, Javier
and Poon, Hoifung
and Oktay, Ozan",
title="Making the Most of Text Semantics to Improve Biomedical Vision--Language Processing",
booktitle="Computer Vision -- ECCV 2022",
year="2022",
publisher="Springer Nature Switzerland",
pages="1--21",
isbn="978-3-031-20059-5"
}`;

const htmlEscape = (text) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const cvfHTML = (bib = CVF_BIB) => `<html><body><div class="bibref pre-white-space">${htmlEscape(bib)}</div></body></html>`;
const ecvaHTML = (link = `https://link.springer.com/chapter/${ECVA_DOI}`) => `<html><body>
  <div id="papertitle">Making the Most of Text Semantics to Improve Biomedical Vision-Language Processing</div>
  <a href="../papers/136940001.pdf">pdf</a><a href="${link}">DOI</a>
</body></html>`;

async function startOfficial(page, source, cid) {
  await page.evaluate(({ source, cid }) => {
    window.__obhTest.pendingPublisher = getBibTexOfficial(source, cid)
      .then((value) => ({ value }), (error) => ({ error: error.message }));
  }, { source, cid });
}

const result = (page) => page.evaluate(() => window.__obhTest.pendingPublisher);

test.beforeEach(async ({ page }) => { await boot(page); });

test('CVF recognizes modern conferences, modern and historical workshops, and ECCV 2018', async ({ page }) => {
  const urls = [CVPR_PAGE, ICCV_PAGE, WACV_PAGE, WORKSHOP_PAGE, LEGACY_PAGE, LEGACY_WORKSHOP_PAGE, ECCV_CVF_PAGE];
  expect(await page.evaluate((values) => values.map(getOfficialSource), urls))
    .toEqual(urls.map((cid) => ({ source: 'CVF', cid })));
  expect(await page.evaluate((url) => getOfficialSource(url), CVPR_PAGE.replace('https://openaccess.', 'http://www.openaccess.')))
    .toEqual({ source: 'CVF', cid: CVPR_PAGE });
});

test('CVF main-paper PDF links normalize to HTML while supplements and deceptive hosts are rejected', async ({ page }) => {
  const urls = [CVPR_PAGE, WORKSHOP_PAGE, LEGACY_WORKSHOP_PAGE];
  const pdfs = urls.map((url) => url.replace('/html/', '/papers/').replace(/\.html$/, '.pdf'));
  expect(await page.evaluate((values) => values.map(getOfficialSource), pdfs))
    .toEqual(urls.map((cid) => ({ source: 'CVF', cid })));
  const rejected = [
    ICCV_PAGE.replace('/html/', '/supplemental/').replace('_paper.html', '_supplemental.pdf'),
    CVPR_PAGE.replace('openaccess.thecvf.com', 'openaccess.thecvf.com.evil.example'),
    CVPR_PAGE.replace('https://', 'https://user:secret@'),
    'https://openaccess.thecvf.com/CVPR2025?day=all',
  ];
  expect(await page.evaluate((values) => values.map(getOfficialSource), rejected)).toEqual(rejected.map(() => null));
});

test('CVF extracts the original modern BibTeX block with HTML entities decoded', async ({ page }) => {
  const bib = CVF_BIB.replace('Modality Invariant Image Matching', 'Modality Invariant Image Matching & Comparison');
  await startOfficial(page, 'CVF', CVPR_PAGE);
  expect((await requestAt(page, 0)).url).toBe(CVPR_PAGE);
  await respond(page, 0, { body: cvfHTML(bib) });
  expect(await result(page)).toEqual({ value: bib });
  expect(await page.evaluate(() => window.__obhTest.requests.length)).toBe(1);
});

test('CVF historical BibTeX with br elements retains citation fields and LaTeX text', async ({ page }) => {
  await startOfficial(page, 'CVF', LEGACY_PAGE);
  const block = htmlEscape(LEGACY_BIB).replaceAll('\n', '<br>\n');
  await respond(page, 0, { body: `<html><body><div class="bibref">\n${block}\n</div></body></html>` });
  const extracted = await result(page);
  expect(extracted.error).toBeUndefined();
  expect(extracted.value.replace(/\s+/g, ' ')).toBe(LEGACY_BIB.replace(/\s+/g, ' '));
});

test('CVF refuses missing, ambiguous, malformed, and multiple-record BibTeX blocks', async ({ page }) => {
  const invalid = [
    '<html><body>No citation export</body></html>',
    `<html><body><div class="bibref">${CVF_BIB}</div><div class="bibref">${LEGACY_BIB}</div></body></html>`,
    cvfHTML('@InProceedings{broken,title={unfinished}'),
    cvfHTML(`${CVF_BIB}\n${LEGACY_BIB}`),
  ];
  for (const [index, body] of invalid.entries()) {
    await startOfficial(page, 'CVF', CVPR_PAGE);
    await respond(page, index, { body });
    expect(await result(page)).toEqual({ error: expect.any(String) });
  }
  expect(await page.evaluate(() => window.__obhTest.clipboardWrites)).toEqual([]);
});

test('CVF refuses redirects to another paper or an unrelated host', async ({ page }) => {
  for (const [index, finalUrl] of [ICCV_PAGE, 'https://example.org/paper.html'].entries()) {
    await startOfficial(page, 'CVF', CVPR_PAGE);
    await respond(page, index, { body: cvfHTML(), finalUrl });
    expect(await result(page)).toEqual({ error: expect.any(String) });
  }
});

test('Springer DOI and publisher URLs and ECVA paper URLs normalize to canonical sources', async ({ page }) => {
  const springerURLs = [SPRINGER_DOI, `https://doi.org/${SPRINGER_DOI}`, SPRINGER_PAGE,
    SPRINGER_PAGE.replace('link.springer.com', 'link.springernature.com')];
  expect(await page.evaluate((values) => values.map(getOfficialSource), springerURLs))
    .toEqual(springerURLs.map(() => ({ source: 'Springer', cid: SPRINGER_PAGE })));
  const ecvaURLs = [ECVA_PAGE, ECVA_PAGE.replace('www.ecva.net', 'ecva.net')];
  expect(await page.evaluate((values) => values.map(getOfficialSource), ecvaURLs))
    .toEqual(ecvaURLs.map(() => ({ source: 'ECVA', cid: ECVA_PAGE })));
});

test('Springer fetches the publisher export and preserves DOI keys, quoted fields, and publication year', async ({ page }) => {
  await startOfficial(page, 'Springer', SPRINGER_PAGE);
  expect((await requestAt(page, 0)).url).toBe(springerExport(SPRINGER_DOI));
  await respond(page, 0, { body: SPRINGER_BIB });
  expect(await result(page)).toEqual({ value: SPRINGER_BIB });
  expect(SPRINGER_BIB).toContain('booktitle="Computer Vision -- ECCV 2024"');
  expect(SPRINGER_BIB).toContain('year="2025"');
  expect(await page.evaluate(() => window.__obhTest.requests.length)).toBe(1);
});

test('Springer verifies DOI fields or DOI citation keys and rejects conflicting identifiers', async ({ page }) => {
  const matchingField = SPRINGER_BIB.replace(`{${SPRINGER_DOI},`, '{customCitationKey,')
    .replace('isbn=', `doi="${SPRINGER_DOI}",\nisbn=`);
  await startOfficial(page, 'Springer', SPRINGER_PAGE);
  await respond(page, 0, { body: matchingField });
  expect(await result(page)).toEqual({ value: matchingField });

  const invalid = [
    SPRINGER_BIB.replace('isbn=', `doi="${ECVA_DOI}",\nisbn=`),
    SPRINGER_BIB.replace('isbn=', 'doi="not-a-doi",\nisbn='),
    SPRINGER_BIB.replace(`{${SPRINGER_DOI},`, `{${ECVA_DOI},`),
    SPRINGER_BIB.replace(`{${SPRINGER_DOI},`, '{unverifiedKey,'),
  ];
  for (const [index, body] of invalid.entries()) {
    await startOfficial(page, 'Springer', SPRINGER_PAGE);
    await respond(page, index + 1, { body });
    expect(await result(page)).toEqual({ error: expect.any(String) });
  }
});

test('Springer rejects unexpected export redirects even when the body contains the requested citation', async ({ page }) => {
  const redirected = [springerExport(ECVA_DOI), 'https://citation-needed.springer.com.evil.example/export'];
  for (const [index, finalUrl] of redirected.entries()) {
    await startOfficial(page, 'Springer', SPRINGER_PAGE);
    await respond(page, index, { body: SPRINGER_BIB, finalUrl });
    expect(await result(page)).toEqual({ error: expect.any(String) });
  }
});

test('ECVA follows its paper-specific Springer DOI link to the original publisher export', async ({ page }) => {
  await startOfficial(page, 'ECVA', ECVA_PAGE);
  expect((await requestAt(page, 0)).url).toBe(ECVA_PAGE);
  await respond(page, 0, { body: ecvaHTML() });
  expect((await requestAt(page, 1)).url).toBe(springerExport(ECVA_DOI));
  await respond(page, 1, { body: ECVA_BIB });
  expect(await result(page)).toEqual({ value: ECVA_BIB });
  expect(await page.evaluate(() => window.__obhTest.requests.length)).toBe(2);
});

test('ECVA refuses missing publisher links, deceptive DOI hosts, and redirects to a different paper', async ({ page }) => {
  const cases = [
    { body: '<html><body><div id="papertitle">Paper without citation export</div></body></html>' },
    { body: ecvaHTML(`https://link.springer.com.evil.example/chapter/${ECVA_DOI}`) },
    { body: ecvaHTML(), finalUrl: ECVA_PAGE.replace('1557_ECCV', '7173_ECCV') },
  ];
  for (const [index, response] of cases.entries()) {
    await startOfficial(page, 'ECVA', ECVA_PAGE);
    await respond(page, index, response);
    expect(await result(page)).toEqual({ error: expect.any(String) });
  }
  expect(await page.evaluate(() => window.__obhTest.requests.length)).toBe(cases.length);
});

test('official routing prefers CVF over an earlier IEEE DOI while the DBLP preference is respected', async ({ page }) => {
  const cvfURL = 'https://openaccess.thecvf.com/content/CVPR2024W/FGVC11/html/Moltisanti_Coarse_or_Fine_Recognising_Action_End_States_without_Labels_CVPRW_2024_paper.html';
  const article = {
    title: 'Coarse or Fine? Recognising Action End States without Labels',
    url: 'https://dblp.org/rec/conf/cvpr/MoltisantiBSK24',
    venue: 'CVPR Workshops', year: '2024', type: 'Conference and Workshop Papers',
    electronicEditions: ['https://doi.org/10.1109/CVPRW63382.2024.00126', cvfURL],
  };
  expect(await page.evaluate((paper) => getArticleBibTarget(paper, 'DBLP', 'official'), article))
    .toEqual({ source: 'CVF', cid: cvfURL });
  expect(await page.evaluate((paper) => getArticleBibTarget(paper, 'DBLP', 'search'), article))
    .toEqual({ source: 'DBLP', cid: article.url, origin: '' });
});
