// Empty stand-in for stylesheet imports under jest (see jest.config.ts's
// moduleNameMapper). CSS is a no-op in jsdom; the real cascade is exercised
// by the Playwright e2e run and CI's build-smoke job.
module.exports = {};
