import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const outputDir = 'visual-artifacts';
await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });

const pages = [
  { name: 'today', path: '/' },
  { name: 'journey-overview', path: '/journey' },
  { name: 'journey-sound-design', path: '/journey/travel-creator/sound-design' },
  { name: 'calendar-day', path: '/calendar', lens: 'Day', expected: 'DAY / CAPACITY' },
  { name: 'calendar-week', path: '/calendar', lens: 'Week', expected: 'WEEK / RHYTHM' },
  { name: 'calendar-month', path: '/calendar', lens: 'Month', expected: 'MONTH / TEXTURE' },
  { name: 'calendar-year', path: '/calendar', lens: 'Year', expected: 'YEAR / SEASONS' },
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

    if (targetPage.lens) {
      await page.waitForTimeout(450);
      if (targetPage.lens !== 'Day') {
        await page.getByRole('button', { name: new RegExp(`^${targetPage.lens}`, 'i') }).click();
      }
      await page.getByText(targetPage.expected, { exact: true }).waitFor({ state: 'visible' });
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
