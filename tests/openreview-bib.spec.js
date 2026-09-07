const { test, expect } = require('./fixtures');
const { boot, requestAt, respond } = require('./helpers');

// Synthetic notes follow the official v1/v2 schemas. The live API may require
// verification; these fixtures do not imply a successful live OpenReview fetch.
const ID = 'iclrPaper123';
const FORUM = `https://openreview.net/forum?id=${ID}`;
const BIB = `@inproceedings{official2025graph,
  title = {Graph Learning with {Nested} Braces},
  author = {Zoë Writer and Wei Zhang},
  booktitle = {The Thirteenth International Conference on Learning Representations},
  year = {2025},
  url = {${FORUM}}
}`;

function modernNote(overrides = {}) {
  return { id: ID, forum: ID, content: {
    _bibtex: { value: BIB }, venue: { value: 'ICLR 2025 Poster' },
    venueid: { value: 'ICLR.cc/2025/Conference' },
  }, ...overrides };
}

async function start(page) {
  await page.evaluate((url) => {
    window.__obhTest.pending = getBibTexOfficial('OpenReview', url)
      .then(value => ({ value }), error => ({ error: error.message }));
  }, FORUM);
}

test.beforeEach(async ({ page }) => { await boot(page); });

test('OpenReview reads the exact official v2 BibTeX with the matching root note', async ({ page }) => {
  await start(page);
  expect((await requestAt(page, 0)).url).toBe(`https://api2.openreview.net/notes?id=${ID}`);
  await respond(page, 0, { body: JSON.stringify({ notes: [modernNote()] }) });
  expect(await page.evaluate(() => window.__obhTest.pending)).toEqual({ value: BIB });
});

for (const missing of ['empty', '404']) {
  test(`OpenReview falls back to v1 only when the v2 record is ${missing}`, async ({ page }) => {
    await start(page);
    await respond(page, 0, missing === 'empty'
      ? { body: JSON.stringify({ notes: [] }) }
      : { status: 404, body: JSON.stringify({ name: 'NotFoundError' }) });
    expect((await requestAt(page, 1)).url).toBe(`https://api.openreview.net/notes?id=${ID}`);
    // Historical accepted papers may omit venueid and store _bibtex directly.
    await respond(page, 1, { body: JSON.stringify({ notes: [{ id: ID, content: { _bibtex: BIB } }] }) });
    expect(await page.evaluate(() => window.__obhTest.pending)).toEqual({ value: BIB });
  });
}

test('OpenReview verification errors do not cause a v1 retry or a clipboard write', async ({ page }) => {
  await start(page);
  await respond(page, 0, { status: 403, body: JSON.stringify({ name: 'ChallengeRequiredError' }) });
  expect((await page.evaluate(() => window.__obhTest.pending)).error).toMatch(/verification/i);
  expect(await page.evaluate(() => window.__obhTest.requests.length)).toBe(1);
  expect(await page.evaluate(() => window.__obhTest.clipboardWrites)).toEqual([]);
});

for (const [name, note] of [
  ['missing official export', modernNote({ content: { title: { value: 'Paper with metadata only' } } })],
  ['different note identity', modernNote({ id: 'anotherPaper' })],
  ['discussion note', modernNote({ forum: 'anotherPaper' })],
  ['different citation URL', modernNote({ content: { _bibtex: { value: BIB.replace(FORUM, 'https://openreview.net/forum?id=anotherPaper') } } })],
  ['empty booktitle', modernNote({ content: { _bibtex: { value: BIB.replace('The Thirteenth International Conference on Learning Representations', '') } } })],
  ['multiline under-review status', modernNote({ content: { _bibtex: { value: BIB.replace('The Thirteenth International Conference on Learning Representations', '\nSubmitted to {ICLR}') } } })],
  ['modern submission venue', modernNote({ content: { _bibtex: { value: BIB }, venueid: { value: 'ICLR.cc/2025/Conference/Submission' } } })],
  ['legacy rejected citation', modernNote({ content: { _bibtex: BIB.replace('@inproceedings', '@misc'), venueid: 'ICLR.cc/2025/Conference' } })],
]) {
  test(`OpenReview refuses ${name} without generating a replacement`, async ({ page }) => {
    await start(page);
    await respond(page, 0, { body: JSON.stringify({ notes: [note] }) });
    expect(await page.evaluate(() => window.__obhTest.pending)).toEqual({ error: expect.any(String) });
    expect(await page.evaluate(() => window.__obhTest.requests.length)).toBe(1);
  });
}
