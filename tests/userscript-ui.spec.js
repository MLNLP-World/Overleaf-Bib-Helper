const { test, expect } = require('./fixtures');
const {
  boot, requestAt, respond, dblpXML, openAndSearch,
  MODERN_TOOLBAR, LEGACY_TOOLBAR, GLOBAL_TOOLBAR, VALID_BIB,
} = require('./helpers');

for (const [name, toolbar] of [['current', MODERN_TOOLBAR], ['legacy', LEGACY_TOOLBAR]]) {
  test(`mounts one accessible native button in the ${name} editor toolbar`, async ({ page }) => {
    await boot(page, { toolbar });
    const button = page.locator('#toolbar > #obh-toggle-icon');
    await expect(button).toBeVisible();
    await expect(button).toHaveJSProperty('tagName', 'BUTTON');
    await expect(button).toHaveAttribute('type', 'button');
    await expect(button).toHaveAccessibleName(/bib/i);
    await page.locator('#editor').evaluate((el) => {
      for (let i = 0; i < 10; i++) el.append(document.createElement('span'));
    });
    await expect(page.locator('#obh-toggle-icon')).toHaveCount(1);
    await button.click();
    await expect(page.locator('#obh-popup')).toBeVisible();
    await expect(page.locator('#obh-search-input')).toBeFocused();
  });
}

test('a physical launcher click stays isolated from editor pointer and mouse handlers', async ({ page }) => {
  await boot(page);
  await page.locator('#editor').focus();
  await page.locator('#toolbar').evaluate((toolbar) => {
    window.__obhTest.hostEvents = [];
    for (const eventType of ['pointerdown', 'mousedown']) {
      toolbar.addEventListener(eventType, (event) => {
        window.__obhTest.hostEvents.push(event.type);
        if (event.type === 'mousedown') {
          // An editor host can restore its selection and rerender its toolbar
          // before mouseup, consuming the user's intended launcher click.
          document.getElementById('editor').focus();
          event.target.closest('#obh-toggle-icon')?.remove();
        }
      });
    }
  });
  await page.locator('#obh-toggle-icon').click();
  await expect(page.locator('#obh-popup')).toBeVisible();
  await expect(page.locator('#obh-search-input')).toBeFocused();
  expect(await page.evaluate(() => window.__obhTest.hostEvents)).toEqual([]);
});

test('mounts after Overleaf creates the editor toolbar asynchronously', async ({ page }) => {
  await boot(page, { toolbar: '' });
  await page.locator('body').evaluate((body, html) => body.insertAdjacentHTML('afterbegin', html), MODERN_TOOLBAR);
  await expect(page.locator('#toolbar > #obh-toggle-icon')).toBeVisible();
});

test('moves from the global fallback into the editor toolbar when it becomes available', async ({ page }) => {
  await boot(page, { toolbar: GLOBAL_TOOLBAR });
  await expect(page.locator('#global-toolbar #obh-toggle-icon')).toBeVisible();
  await page.locator('body').evaluate((body, html) => body.insertAdjacentHTML('afterbegin', html), MODERN_TOOLBAR);
  await expect(page.locator('#toolbar > #obh-toggle-icon')).toBeVisible();
  await expect(page.locator('#obh-toggle-icon')).toHaveCount(1);
});

test('remounts when React replaces the toolbar without losing the open search', async ({ page }) => {
  await boot(page);
  await page.locator('#obh-toggle-icon').click();
  await page.locator('#obh-search-input').fill('persistent query');
  await page.locator('#toolbar').evaluate((toolbar) => {
    const replacement = toolbar.cloneNode(false);
    replacement.dataset.replaced = 'true';
    toolbar.replaceWith(replacement);
  });
  await expect(page.locator('#toolbar[data-replaced] > #obh-toggle-icon')).toBeVisible();
  await expect(page.locator('#obh-toggle-icon')).toHaveCount(1);
  await expect(page.locator('#obh-popup')).toBeVisible();
  await expect(page.locator('#obh-search-input')).toHaveValue('persistent query');
});

test('moves out of an editor toolbar hidden by an Overleaf layout switch', async ({ page }) => {
  await boot(page, { toolbar: `${MODERN_TOOLBAR}${GLOBAL_TOOLBAR}` });
  await expect(page.locator('#toolbar > #obh-toggle-icon')).toBeVisible();
  await page.locator('#toolbar').evaluate((toolbar) => { toolbar.style.display = 'none'; });
  await expect(page.locator('#global-toolbar #obh-toggle-icon')).toBeVisible();
  await expect(page.locator('#obh-toggle-icon')).toHaveCount(1);
  await page.locator('#toolbar').evaluate((toolbar) => { toolbar.style.display = ''; });
  await expect(page.locator('#toolbar > #obh-toggle-icon')).toBeVisible();
});

test('shortcut and userscript menu open the helper even without any known toolbar', async ({ page }) => {
  await boot(page, { toolbar: '' });
  // On macOS, Option can change event.key while event.code remains KeyB.
  await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'ı', code: 'KeyB', altKey: true, shiftKey: true, bubbles: true,
  })));
  await expect(page.locator('#obh-popup')).toBeVisible();
  await expect(page.locator('#obh-search-input')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#obh-popup')).toBeHidden();
  await page.evaluate(() => {
    const menu = window.__obhTest.menus.find((item) => /bib|helper/i.test(item.label));
    if (!menu) throw new Error('Missing Bib Helper userscript menu');
    menu.callback();
  });
  await expect(page.locator('#obh-popup')).toBeVisible();
});

test('popup remains reachable within a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await boot(page);
  await page.locator('#obh-toggle-icon').click();
  await expect(page.locator('#obh-popup')).toBeVisible();
  const bounds = await page.locator('#obh-popup').boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(376);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(668);
  await expect(page.locator('#obh-close')).toBeInViewport();
  await page.keyboard.press('Escape');
  await expect(page.locator('#obh-popup')).toBeHidden();
});

test('an older response cannot overwrite a newer submitted search', async ({ page }) => {
  await boot(page);
  await openAndSearch(page, 'old query');
  await page.locator('#obh-search-input').fill('new query');
  await page.locator('#obh-search-input').press('Enter');
  await requestAt(page, 1);
  await respond(page, 1, { body: dblpXML({ title: 'New result' }) });
  await expect(page.locator('.obh-result-title')).toHaveText('New result');
  await respond(page, 0, { body: dblpXML({ title: 'Old result' }) });
  await expect(page.locator('.obh-result-title')).toHaveText('New result');
  await expect(page.locator('#obh-search-word')).toBeEnabled();
});

for (const failure of [
  { name: 'HTTP error', response: { status: 503, body: 'Service unavailable' } },
  { name: 'timeout', response: { event: 'timeout', status: 0 } },
  { name: 'HTML verification response', response: { body: '<html><body>Verify you are not a robot</body></html>' } },
  { name: 'truncated BibTeX', response: { body: '@article{broken, title = {Truncated}' } },
]) {
  test(`${failure.name} cannot replace the clipboard with an invalid citation`, async ({ page }) => {
    await boot(page);
    await openAndSearch(page);
    await respond(page, 0, { body: dblpXML() });
    await page.locator('.obh-result-title').click();
    const request = await requestAt(page, 1);
    expect(request.timeout).toBeGreaterThan(0);
    await respond(page, 1, failure.response);
    await expect(page.locator('#obh-status')).toHaveClass(/error/);
    expect(await page.evaluate(() => window.__obhTest.clipboard)).toBe('original clipboard');
    expect(await page.evaluate(() => window.__obhTest.clipboardWrites)).toEqual([]);
  });
}

test('preview is separate from copy, and edited BibTeX is validated before copying', async ({ page }) => {
  await boot(page);
  await openAndSearch(page);
  await respond(page, 0, { body: dblpXML() });
  await page.locator('.obh-result [data-obh-action="preview"]').click();
  await respond(page, 1, { body: VALID_BIB });
  await expect(page.locator('#obh-bib-preview')).toBeVisible();
  await expect(page.locator('#obh-bib-preview')).toHaveValue(VALID_BIB);
  expect(await page.evaluate(() => window.__obhTest.clipboard)).toBe('original clipboard');
  await page.locator('#obh-bib-preview').fill('<html>not a citation</html>');
  await page.locator('#obh-copy-preview').click();
  await expect(page.locator('#obh-preview-status')).toHaveClass(/error/);
  expect(await page.evaluate(() => window.__obhTest.clipboard)).toBe('original clipboard');
  await page.locator('#obh-bib-preview').fill(VALID_BIB.replace('attention2026', 'myCitation'));
  await page.locator('#obh-copy-preview').click();
  await expect.poll(() => page.evaluate(() => window.__obhTest.clipboard)).toBe(VALID_BIB.replace('attention2026', 'myCitation'));
});

test('preview copies a citation key and a LaTeX citation without another request', async ({ page }) => {
  await boot(page);
  await openAndSearch(page);
  await respond(page, 0, { body: dblpXML() });
  await page.locator('.obh-result [data-obh-action="preview"]').click();
  await respond(page, 1, { body: VALID_BIB });
  await page.locator('#obh-citation-key').fill('custom2026');
  await page.locator('#obh-copy-key').click();
  await expect.poll(() => page.evaluate(() => window.__obhTest.clipboard)).toBe('custom2026');
  await page.locator('#obh-copy-cite').click();
  await expect.poll(() => page.evaluate(() => window.__obhTest.clipboard)).toBe('\\cite{custom2026}');
  expect(await page.evaluate(() => window.__obhTest.requests.length)).toBe(2);
});

test('loading a new preview disables old citation actions and closing ignores its late response', async ({ page }) => {
  await boot(page);
  await openAndSearch(page);
  await respond(page, 0, { body: dblpXML([
    { title: 'First paper', key: 'conf/test/First2026' },
    { title: 'Second paper', key: 'conf/test/Second2026' },
  ]) });
  await page.locator('.obh-result').filter({ hasText: 'First paper' }).locator('[data-obh-action="preview"]').click();
  await respond(page, 1, { body: VALID_BIB });
  await expect(page.locator('#obh-copy-preview')).toBeEnabled();
  await page.locator('.obh-result').filter({ hasText: 'Second paper' }).locator('[data-obh-action="preview"]').click();
  await requestAt(page, 2);
  await expect(page.locator('#obh-bib-preview')).toHaveValue('');
  for (const id of ['obh-copy-preview', 'obh-copy-key', 'obh-copy-cite', 'obh-download-bib']) {
    await expect(page.locator(`#${id}`)).toBeDisabled();
  }
  await page.locator('#obh-close-preview').click();
  await respond(page, 2, { body: VALID_BIB.replace('attention2026', 'second2026') });
  await expect(page.locator('#obh-preview')).toBeHidden();
  expect(await page.evaluate(() => window.__obhTest.clipboard)).toBe('original clipboard');
});

test('edited citation downloads as a BibTeX file with the chosen citation key', async ({ page }) => {
  await boot(page);
  await openAndSearch(page);
  await respond(page, 0, { body: dblpXML() });
  await page.locator('.obh-result [data-obh-action="preview"]').click();
  await respond(page, 1, { body: VALID_BIB });
  await page.locator('#obh-citation-key').fill('download2026');
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#obh-download-bib').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('download2026.bib');
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  expect(Buffer.concat(chunks).toString('utf8')).toBe(VALID_BIB.replace('attention2026', 'download2026') + '\n');
  expect(await page.evaluate(() => window.__obhTest.clipboard)).toBe('original clipboard');
});

for (const prefix of [
  { name: 'auxiliary comment record', text: '@comment{note, ignored}\n' },
  { name: 'commented citation record', text: '% @article{fake, title={Old}}\n' },
]) {
  test(`preview ignores the ${prefix.name} when reading and editing the citation key`, async ({ page }) => {
    await boot(page);
    await openAndSearch(page);
    await respond(page, 0, { body: dblpXML() });
    await page.locator('.obh-result [data-obh-action="preview"]').click();
    await respond(page, 1, { body: prefix.text + VALID_BIB });
    await expect(page.locator('#obh-citation-key')).toHaveValue('attention2026');
    await page.locator('#obh-citation-key').fill('corrected2026');
    await page.locator('#obh-copy-preview').click();
    await expect.poll(() => page.evaluate(() => window.__obhTest.clipboard))
      .toBe(prefix.text + VALID_BIB.replace('attention2026', 'corrected2026'));
  });
}

test('preview rejects multiple real entries and preserves the clipboard', async ({ page }) => {
  await boot(page);
  await openAndSearch(page);
  await respond(page, 0, { body: dblpXML() });
  await page.locator('.obh-result [data-obh-action="preview"]').click();
  await respond(page, 1, { body: `${VALID_BIB}\n${VALID_BIB.replace('attention2026', 'second2026')}` });
  await expect(page.locator('#obh-preview-status')).toHaveClass(/error/);
  await expect(page.locator('#obh-preview-status')).toContainText(/one|single|1/i);
  await expect(page.locator('#obh-copy-preview')).toBeDisabled();
  await expect(page.locator('#obh-copy-key')).toBeDisabled();
  expect(await page.evaluate(() => window.__obhTest.clipboard)).toBe('original clipboard');
  expect(await page.evaluate(() => window.__obhTest.clipboardWrites)).toEqual([]);
});

test('the last copy selection wins when two BibTeX responses arrive in reverse order', async ({ page }) => {
  await boot(page);
  await openAndSearch(page);
  await respond(page, 0, { body: dblpXML([
    { title: 'First paper', key: 'conf/test/First2026' },
    { title: 'Second paper', key: 'conf/test/Second2026' },
  ]) });
  await page.locator('.obh-result-title').filter({ hasText: 'First paper' }).click();
  await requestAt(page, 1);
  await page.locator('.obh-result-title').filter({ hasText: 'Second paper' }).click();
  await requestAt(page, 2);
  const second = VALID_BIB.replace('attention2026', 'second2026');
  await respond(page, 2, { body: second });
  await expect.poll(() => page.evaluate(() => window.__obhTest.clipboard)).toBe(second);
  await respond(page, 1, { body: VALID_BIB });
  expect(await page.evaluate(() => window.__obhTest.clipboard)).toBe(second);
  expect(await page.evaluate(() => window.__obhTest.clipboardWrites)).toEqual([second]);
});

test('copying a preview citation supersedes a pending result copy', async ({ page }) => {
  await boot(page);
  await openAndSearch(page);
  await respond(page, 0, { body: dblpXML([
    { title: 'Preview paper', key: 'conf/test/Preview2026' },
    { title: 'Pending paper', key: 'conf/test/Pending2026' },
  ]) });
  await page.locator('.obh-result').filter({ hasText: 'Preview paper' }).locator('[data-obh-action="preview"]').click();
  await respond(page, 1, { body: VALID_BIB });
  await page.locator('.obh-result-title').filter({ hasText: 'Pending paper' }).click();
  await requestAt(page, 2);
  await page.locator('#obh-copy-cite').click();
  await expect.poll(() => page.evaluate(() => window.__obhTest.clipboard)).toBe('\\cite{attention2026}');
  await respond(page, 2, { body: VALID_BIB.replace('attention2026', 'pending2026') });
  expect(await page.evaluate(() => window.__obhTest.clipboard)).toBe('\\cite{attention2026}');
});

test('starting another search prevents a pending old result from copying later', async ({ page }) => {
  await boot(page);
  await openAndSearch(page);
  await respond(page, 0, { body: dblpXML() });
  await page.locator('.obh-result-title').click();
  await requestAt(page, 1);
  await page.locator('#obh-search-input').fill('new topic');
  await page.locator('#obh-search-input').press('Enter');
  await requestAt(page, 2);
  await respond(page, 1, { body: VALID_BIB });
  expect(await page.evaluate(() => window.__obhTest.clipboard)).toBe('original clipboard');
  await expect(page.locator('#obh-status')).toHaveClass(/loading/);
  await respond(page, 2, { body: dblpXML({ title: 'New topic result' }) });
  await expect(page.locator('.obh-result-title')).toHaveText('New topic result');
});

test('a slow preview response preserves focus after the user resumes typing a query', async ({ page }) => {
  await boot(page);
  await openAndSearch(page);
  await respond(page, 0, { body: dblpXML() });
  await page.locator('.obh-result [data-obh-action="preview"]').click();
  await requestAt(page, 1);
  await page.locator('#obh-search-input').click();
  await page.locator('#obh-search-input').fill('another paper title');
  await respond(page, 1, { body: VALID_BIB });
  await expect(page.locator('#obh-bib-preview')).toHaveValue(VALID_BIB);
  await expect(page.locator('#obh-search-input')).toBeFocused();
  await expect(page.locator('#obh-search-input')).toHaveValue('another paper title');
});

for (const phase of ['search', 'citation']) {
  test(`DBLP ${phase} challenge exposes an explicit verification action without copying or opening tabs`, async ({ page }) => {
    await boot(page);
    await openAndSearch(page);
    let requestIndex = 0;
    if (phase === 'citation') {
      await respond(page, 0, { body: dblpXML() });
      await page.locator('.obh-result-title').click();
      requestIndex = 1;
    }
    const request = await requestAt(page, requestIndex);
    await respond(page, requestIndex, {
      status: 200,
      body: '<!doctype html><html><script id="anubis_challenge" type="application/json">{}</script><body>Making sure you are not a bot!</body></html>',
    });
    await expect(page.locator('#obh-status')).toHaveClass(/error/);
    await expect(page.locator('#obh-status')).toContainText(/DBLP.*verification/i);
    await expect(page.locator('#obh-search-word')).toBeEnabled();
    expect(await page.evaluate(() => window.__obhTest.clipboard)).toBe('original clipboard');
    expect(await page.evaluate(() => window.__obhTest.clipboardWrites)).toEqual([]);
    expect(await page.evaluate(() => window.__obhTest.openedTabs)).toEqual([]);
    await page.locator('#obh-status').getByRole('button', { name: 'Open verification page' }).click();
    expect(await page.evaluate(() => window.__obhTest.openedTabs)).toEqual([request.url]);
  });
}
