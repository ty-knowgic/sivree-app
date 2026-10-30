// Shared by the fail-fast developer check and the evidence-producing operations run.
export const qualityChecks = [
  { id: 'types', args: ['node_modules/typescript/bin/tsc', '--noEmit'] },
  ...['check-locales', 'check-i18n-keys', 'check-brand', 'test-xss', 'test-sync', 'test-visit', 'test-onboarding', 'test-hashtags', 'test-refresh', 'test-shell', 'test-preview', 'test-operations'].map(id => ({ id, args: [`scripts/${id}.mjs`] })),
  ...['check-source-names', 'test-performance', 'test-professional', 'test-sources-ux', 'test-interest', 'test-search', 'test-robots', 'test-feeds', 'test-saved', 'test-tiers', 'test-migrate', 'test-coverage-audit'].map(id => ({ id, args: ['--import', 'tsx', `scripts/${id}.ts`] })),
  { id: 'build', args: ['scripts/build-static.mjs'] }
];
