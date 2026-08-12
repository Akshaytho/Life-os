import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const outputDir = 'visual-artifacts';
await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });

const pages = [
  { name: 'today', path: '/' },
  { name: 'capture-routing', path: '/capture', expected: 'Where this would go.' },
  {
    name: 'capture-confirmed-travel',
    path: '/capture',
    expected: 'Where this would go.',
    example: 'Yes, Sep 12-16 is decided.',
    expectedAfter: 'Preserve that these dates were explicitly decided, with the capture as provenance.',
  },
  { name: 'journey-overview', path: '/journey' },
  { name: 'journey-sound-design', path: '/journey/travel-creator/sound-design' },
  { name: 'calendar-day', path: '/calendar', expected: 'DAY / CAPACITY' },
  { name: 'calendar-week', path: '/calendar?lens=week', expected: 'WEEK / RHYTHM' },
  { name: 'calendar-month', path: '/calendar?lens=month', expected: 'MONTH / TEXTURE' },
  { name: 'calendar-year', path: '/calendar?lens=year', expected: 'YEAR / SEASONS' },
];

const targets = [
  { name: 'mobile-390', width: 390, height: 844 },
  { name: 'mobile-430', width: 430, height: 932 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'desktop-1440', width: 1440, height: 1000 },
];

for (const targetPage of pages) {
  for (const target of targets) {
    const context = await browser.newContext({
      viewport: { width: target.width, height: target.height },
      deviceScaleFactor: 1,
      isMobile: target.width < 600,
      hasTouch: target.width < 600,
    });

    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:3000${targetPage.path}`, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);

    if (targetPage.expected) {
      await page.getByText(targetPage.expected, { exact: true }).waitFor({ state: 'visible', timeout: 8000 });
    }

    if (targetPage.example) {
      await page.waitForTimeout(500);
      await page.getByRole('button', { name: targetPage.example, exact: true }).click();
      await page.getByText(targetPage.expectedAfter, { exact: true }).waitFor({ state: 'visible', timeout: 8000 });
    }

    await page.screenshot({
      path: `${outputDir}/${targetPage.name}-${target.name}-viewport.png`,
      fullPage: false,
    });

    await page.screenshot({
      path: `${outputDir}/${targetPage.name}-${target.name}-full.png`,
      fullPage: true,
    });

    await context.close();
  }
}

await browser.close();
