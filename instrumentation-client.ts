const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim();
const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST?.trim() || 'https://us.i.posthog.com';

if (posthogKey) {
  void import('posthog-js')
    .then(({ default: posthog }) => {
      posthog.init(posthogKey, {
        api_host: posthogHost,
        defaults: '2026-01-30',
      });
    })
    .catch((error) => {
      console.warn('[posthog] Failed to initialize analytics', error);
    });
}
