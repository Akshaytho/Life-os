import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const outputDir = 'visual-artifacts';
await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });

const targets = [
  { name: 'today-mobile-390', width: 390, height: 844 },
  { name: 'today-mobile-430', width: 430, height: 932 },
  { name: 'today-tablet-768', width: 768, height: 1024 },
  { name: 'today-desktop-1440', width: 1440, height: 1000 },
];

for (const target of targets) {
  const context = await browser.newContext({
    viewport: { width: target.width, height: target.height },
    deviceScaleFactor: 1,
    isMobile: target.width < 600,
    hasTouch: target.width < 600,
  });

  const page = await context.newPage();
  await page.goto('http://127.0.0.1:3000', { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: `${outputDir}/${target.name}.png`,
    fullPage: true,
  });
  await context.close();
}

await browser.close();
