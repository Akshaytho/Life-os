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
    path: '/',
    authenticated: true,
    expected: [
      'REFLECTION / DAILY RETURN',
      'Remember the day. Choose the return.',
      'No Daily Log reflections yet.',
      'Did I return to my direction after drifting?',
    ],
  },
  {
    name: 'capture-real-boundary',
    path: '/capture',
    expected: [
      'PRIVATE SESSION · CAPTURE',
      'Sign in before Life OS can read or save private Capture.',
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

const visualUser = {
  id: '00000000-0000-4000-8000-000000000001',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'visual-review@example.invalid',
  email_confirmed_at: '2026-01-01T00:00:00.000Z',
  phone: '',
  confirmed_at: '2026-01-01T00:00:00.000Z',
  last_sign_in_at: '2026-01-01T00:00:00.000Z',
  app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: {},
  identities: [],
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  is_anonymous: false,
};

const visualSession = {
  access_token: 'visual-review-access-token',
  refresh_token: 'visual-review-refresh-token',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: 4102444800,
  user: visualUser,
};

async function configureAuthenticatedBoundary(context) {
  await context.route('**/auth/v1/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/user')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(visualUser) });
      return;
    }
    if (url.pathname.endsWith('/token')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(visualSession) });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });

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

    if (targetPage.authenticated) {
      await configureAuthenticatedBoundary(context);
    }

    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:3000${targetPage.path}`, { waitUntil: 'networkidle' });

    if (targetPage.authenticated) {
      await page.getByLabel('Email').fill('visual-review@example.invalid');
      await page.getByLabel('Password').fill('Visual-review-password-123!');
      await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    }

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
