import * as Sentry from '@sentry/astro';

Sentry.init({
  dsn: 'https://479bcdacfd59ab8714b7996e912301a6@o4512491554865152.ingest.us.sentry.io/4512491575574528',
  tracesSampleRate: 1.0,
});
