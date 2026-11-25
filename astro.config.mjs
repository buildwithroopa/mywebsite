import { defineConfig } from 'astro/config';
import sentry from '@sentry/astro';

export default defineConfig({
  integrations: [sentry({
    project: 'mywebsite',
    org: 'test-ore',
    authToken: process.env.SENTRY_AUTH_TOKEN,
  })],
});
