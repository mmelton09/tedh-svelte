import type { Handle } from '@sveltejs/kit';

const BOT_PATTERNS = [
  'googlebot', 'bingbot', 'yandex', 'baiduspider', 'duckduckbot',
  'slurp', 'facebookexternalhit', 'linkedinbot', 'twitterbot',
  'applebot', 'semrushbot', 'ahrefsbot', 'mj12bot', 'dotbot',
  'petalbot', 'bytespider', 'gptbot', 'claudebot', 'anthropic',
  'crawler', 'spider', 'bot/', 'bot;', 'headless', 'python-requests',
  'curl', 'wget', 'scrapy', 'httpclient', 'java/', 'go-http-client'
];

function isBot(userAgent: string): boolean {
  const ua = userAgent.toLowerCase();
  return BOT_PATTERNS.some(pattern => ua.includes(pattern));
}

export const handle: Handle = async ({ event, resolve }) => {
  const ua = event.request.headers.get('user-agent') || 'no-ua';
  const path = event.url.pathname;
  const ip = event.getClientAddress();

  // Only log page requests, skip static assets
  if (!path.startsWith('/_app') && !path.includes('.')) {
    const isABot = isBot(ua);
    console.log(JSON.stringify({
      time: new Date().toISOString(),
      path,
      ip: ip.slice(0, 12) + '...',  // Truncate for privacy
      bot: isABot,
      ua: ua.slice(0, 100)  // Truncate long UAs
    }));
  }

  return resolve(event);
};
