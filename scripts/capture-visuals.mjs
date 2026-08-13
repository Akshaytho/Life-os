import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const outputDir = 'visual-artifacts';
await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });

const pages = [
  { name: 'today', path: '/' },
  {
    name: 'capture-routing',
    path: '/capture',
    expected: [
      'Review only. Nothing changed.',
      'YOU SAID · USER SOURCE',
      'LIFE OS SAW · OBSERVATION',
      'LIFE OS PROPOSES · SUGGESTION',
      'IF APPROVED',
    ],
  },
  {
    name: 'capture-confirmed-dates',
    path: '/capture?sample=confirmed',
    expected: [
      'Review only. Nothing changed.',
      'YOU SAID · USER SOURCE',
      'LIFE OS SAW · OBSERVATION',
      'LIFE OS PROPOSES · SUGGESTION',
      'Preserve that these dates were explicitly decided, with the capture as provenance.',
    ],
  },
  { name: 'journey-overview', path: '/journey' },
  { name: 'journey-sound-design', path: '/journey/travel-creator/sound-design' },
  { name: 'calendar-day', path: '/calendar', expected: ['DAY / CAPACITY'] },
  { name: 'calendar-week', path: '/calendar?lens=week', expected: ['WEEK / RHYTHM'] },
  { name: 'calendar-month', path: '/calendar?lens=month', expected: ['MONTH / TEXTURE'] },
  { name: 'calendar-year', path: '/calendar?lens=year', expected: ['YEAR / SEASONS'] },
  {
    name: 'memory-overview',
    path: '/memory',
    expected: [
      'MEMORY / RECALL',
      'RECALL / ASK MEMORY',
      'TRUSTED NOW',
      'WORTH KEEPING',
      'TIME MEMORY',
      'DERIVED / LOWER AUTHORITY',
    ],
  },
  {
    name: 'interaction-ledger-committed',
    path: '/interactions/sample?state=committed',
    expected: [
      'COMMITTED',
      'A canonical change was made.',
      'YOU SAID',
      'LIFE OS SAW',
      'LIFE OS PROPOSED',
      'YOU CHOSE',
      'CALENDAR CHANGED',
      'Not recorded yet.',
    ],
  },
  {
    name: 'interaction-ledger-rejected',
    path: '/interactions/sample?state=rejected',
    expected: [
      'CLOSED · NO CHANGE',
      'Nothing in your canonical life state changed.',
      'YOU SAID',
      'LIFE OS SAW',
      'LIFE OS PROPOSED',
      'YOU CHOSE',
      'No canonical change',
      'Not recorded yet.',
    ],
  },
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

    for (const expected of targetPage.expected ?? []) {
      await page.getByText(expected, { exact: true }).first().waitFor({ state: 'visible', timeout: 8000 });
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
