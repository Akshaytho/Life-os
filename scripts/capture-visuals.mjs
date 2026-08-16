import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const outputDir = 'visual-artifacts';
await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });

const realDataOnly = 'No sample life data will be shown here.';
const browserAuthUnavailable = 'Live browser authentication is not configured for this deployment.';

const pages = [
  {
    name: 'today-real-boundary',
    path: '/',
    expected: [
      'PRIVATE SESSION · TODAY',
      'Sign in before Life OS can read your Today state.',
      browserAuthUnavailable,
    ],
  },
  {
    name: 'capture-real-boundary',
    path: '/capture',
    expected: [
      'PRIVATE SESSION · CAPTURE',
      'Sign in before Life OS can read or save private Capture.',
      browserAuthUnavailable,
    ],
  },
  {
    name: 'journey-real-boundary',
    path: '/journey',
    expected: [
      'Journey will appear only when it is real.',
      realDataOnly,
    ],
  },
  {
    name: 'journey-sound-design-real-boundary',
    path: '/journey/travel-creator/sound-design',
    expected: [
      'Sound Design will appear only from real Journey state.',
      realDataOnly,
    ],
  },
  {
    name: 'calendar-real-boundary',
    path: '/calendar',
    expected: [
      'PRIVATE SESSION · CALENDAR',
      'Sign in before Life OS can read your canonical Calendar.',
      browserAuthUnavailable,
    ],
  },
  {
    name: 'memory-real-boundary',
    path: '/memory',
    expected: [
      'Memory will show only trusted persisted context.',
      realDataOnly,
    ],
  },
  {
    name: 'you-direction-dormant',
    path: '/you',
    expected: [
      'CURRENT DIRECTION · DECISION',
      'Your Direction belongs to you.',
      'DORMANT',
      'This high-authority surface is deliberately not live in this deployment yet. Life OS will not substitute sample data or an AI guess while canonical Direction is dormant.',
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
