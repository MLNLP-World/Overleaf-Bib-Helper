const { test: base, expect } = require('@playwright/test');

const test = base.extend({
  runtimeErrors: [async ({ page }, use) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await use(errors);
    expect(errors, 'No uncaught userscript runtime errors').toEqual([]);
  }, { auto: true }],
});

module.exports = { test, expect };
