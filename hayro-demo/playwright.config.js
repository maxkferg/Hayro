import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './e2e',
    timeout: 60_000,
    expect: {
        timeout: 10_000,
    },
    retries: 0,
    workers: 1,
    reporter: 'list',
    use: {
        baseURL: 'http://localhost:8080',
        headless: true,
        actionTimeout: 10_000,
    },
    projects: [
        {
            name: 'chromium',
            use: {
                browserName: 'chromium',
                viewport: { width: 1280, height: 900 },
            },
            testIgnore: /mobile/,
        },
        {
            name: 'mobile-chromium',
            use: {
                browserName: 'chromium',
                viewport: { width: 390, height: 844 },
                isMobile: true,
                hasTouch: true,
            },
            testMatch: /mobile/,
        },
    ],
    webServer: {
        command: 'python3 -m http.server 8080 --directory www',
        port: 8080,
        reuseExistingServer: true,
        timeout: 10_000,
    },
});
