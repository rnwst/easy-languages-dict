# Live translator tests

These tests contact the real Google, Bing, and DeepL services. Run them explicitly:

```sh
npm run test-live
npm run test-live -- --testPathPatterns=bing
```

The default `npm test` and `npm run test-coverage` commands exclude this directory.
Required CI runs the mocked translator suites in the parent directory instead.
`jest.live.config.js` selects only live translator tests and allows 30 seconds per
test; the command runs suites serially to limit simultaneous service traffic.

Live checks can fail because of service outages, rate limits, IP restrictions,
translation wording changes, or changes to the unofficial APIs. A failure needs
investigation and does not necessarily indicate a code regression. Bing's browser
storage is mocked, but its authentication and translation requests are real.
