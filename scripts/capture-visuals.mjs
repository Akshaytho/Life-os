import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const outputDir = 'visual-artifacts';
await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });

const realDataOnly = 'No sample life data will be shown here.';

const pages = [
  {
    name: 'today-real-boundary',
    path: '/',
    expected: [
      'PRIVATE SESSION · TODAY',
      'Sign in before Life OS can read your Today state.',
    ],
  },
  {
    name: 'today-daily-return-empty',
    path: '/visual-review/daily-return',
    syntheticPrivateBoundary: true,
    expected: [
      'REFLECTION / DAILY RETURN',
      'Remember the day. Choose the return.',
      'What is worth remembering right now?',
      'Did I return to my direction after drifting?',
    ],
  },
  {
    name: 'capture-real-boundary',
    path: '/capture',
    expected: [
      'PRIVATE SESSION · BRAIN DUMP',
      'Sign in before Life OS can read or save your private Brain Dump.',
    ],
  },
  {
    name: 'not-now-review',
    path: '/visual-review/not-now',
    syntheticPrivateBoundary: true,
    expected: [
      'DELIBERATE PARKING LOT',
      /Not abandoned\.\s*Not committed\./,
      'Temporary inspiration',
      'Researching without commitment',
    ],
  },
  {
    name: 'drift-return-review',
    path: '/visual-review/drift',
    syntheticPrivateBoundary: true,
    expected: [
      'RELIABLE RETURN',
      /You noticed\.\s*That is already a return\./,
      "I'M DRIFTING",
      'Temporary inspiration',
      'I am still returning',
      'RESOLVED · Return to my direction · provenance retained',
    ],
  },
  {
    name: 'journey-real-boundary',
    path: '/journey',
    expected: [
      'PRIVATE SESSION · JOURNEY',
      'Sign in before Life OS can read or record your private Journey evidence.',
    ],
  },
  {
    name: 'journey-sound-design-real-boundary',
    path: '/journey/travel-creator/sound-design',
    expected: [
      'PRIVATE SESSION · JOURNEY / SOUND DESIGN',
      'Sign in before Life OS can read or record private Sound Design practice.',
    ],
  },
  {
    name: 'journey-activation-review',
    path: '/visual-review/journey-activation',
    syntheticPrivateBoundary: true,
    expected: [
      'DELIBERATE CAPABILITY',
      /Choose deliberately\.\s*Then practise for evidence\./,
      'Travel Creator → Sound Design',
      'Environmental sound',
      'Review activation',
    ],
  },
  {
    name: 'journey-practice-review',
    path: '/visual-review/journey-practice',
    syntheticPrivateBoundary: true,
    expected: [
      'DELIBERATE CAPABILITY',
      /Sound is the\s*work now\./,
      'Travel Creator',
      'ACTIVE PRACTICE',
      'Evidence, not streaks.',
      'RETAINED-LEARNING CANDIDATE · NOT MEMORY',
    ],
  },
  {
    name: 'ask-life-os-real-boundary',
    path: '/ask',
    expected: [
      'PRIVATE SESSION · ASK LIFE OS',
      'Sign in before AI can receive your private, source-bounded context.',
    ],
  },
  {
    name: 'ask-life-os-review',
    path: '/visual-review/ask',
    syntheticPrivateBoundary: true,
    expected: [
      'CONTEXT, NOT CONTROL',
      /Ask from what\s*is actually known\./,
      'AI OBSERVATION · READ ONLY',
      'Nothing changed.',
      'Cited canonical context',
      'Current direction',
    ],
  },
  {
    name: 'calendar-real-boundary',
    path: '/calendar',
    expected: [
      'PRIVATE SESSION · CALENDAR',
      'Sign in before Life OS can read your canonical Calendar.',
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

async function configureSyntheticPrivateBoundary(context) {
  await context.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/v1/calendar' && route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          from: url.searchParams.get('from'),
          to: url.searchParams.get('to'),
          items: [],
        }),
      });
      return;
    }
    if (url.pathname === '/api/v1/daily-return' && route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          localDate: url.searchParams.get('date'),
          logEntries: [],
          currentReview: null,
          reviewHistory: [],
        }),
      });
      return;
    }
    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'visual_review_route_not_stubbed' }),
    });
  });
}

for (const targetPage of pages) {
  for (const target of targets) {
    const context = await browser.newContext({
      viewport: { width: target.width, height: target.height },
      deviceScaleFactor: 1,
      isMobile: target.width < 600,
      hasTouch: target.width < 600,
    });

    if (targetPage.syntheticPrivateBoundary) {
      await configureSyntheticPrivateBoundary(context);
    }

    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:3000${targetPage.path}`, { waitUntil: 'networkidle' });

    await page.evaluate(() => document.fonts.ready);

    for (const expected of targetPage.expected ?? []) {
      const expectedText = expected instanceof RegExp
        ? page.getByText(expected)
        : page.getByText(expected, { exact: true });
      await expectedText.first().waitFor({ state: 'visible', timeout: 8000 });
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
