import { test, expect } from '@playwright/test';
import { MULTI_PAGE_PDF, SINGLE_PAGE_PDF, uploadPdf, waitForAppReady } from './fixtures.js';

test.describe('Scroll and page navigation', () => {
    test.beforeEach(async ({ page }) => {
        await waitForAppReady(page);
    });

    test('page indicator shows correct initial state after upload', async ({ page }) => {
        await uploadPdf(page, MULTI_PAGE_PDF);

        const pageInfo = page.locator('#page-info');
        // Should show "1 / N" where N > 1
        const text = await pageInfo.textContent();
        const match = text.match(/(\d+)\s*\/\s*(\d+)/);
        expect(match).toBeTruthy();
        expect(parseInt(match[1], 10)).toBe(1);
        expect(parseInt(match[2], 10)).toBeGreaterThan(1);
    });

    test('multiple page shells are created for multi-page PDF', async ({ page }) => {
        await uploadPdf(page, MULTI_PAGE_PDF);

        const pageShells = page.locator('.page-shell');
        const count = await pageShells.count();
        expect(count).toBeGreaterThan(1);
    });

    test('next page button advances the page indicator', async ({ page }) => {
        await uploadPdf(page, MULTI_PAGE_PDF);

        const pageInfo = page.locator('#page-info');
        await expect(pageInfo).toContainText('1 /');

        // Click next page
        await page.click('#next-page');

        // Wait for page indicator to update
        await expect(pageInfo).toContainText('2 /');
    });

    test('previous page button goes back', async ({ page }) => {
        await uploadPdf(page, MULTI_PAGE_PDF);

        // Go to page 2
        await page.click('#next-page');
        await expect(page.locator('#page-info')).toContainText('2 /');

        // Go back to page 1
        await page.click('#prev-page');
        await expect(page.locator('#page-info')).toContainText('1 /');
    });

    test('previous page button is disabled on first page', async ({ page }) => {
        await uploadPdf(page, MULTI_PAGE_PDF);

        const prevBtn = page.locator('#prev-page');
        await expect(prevBtn).toBeDisabled();
    });

    test('scrolling the viewer updates the page indicator', async ({ page }) => {
        await uploadPdf(page, MULTI_PAGE_PDF);

        // Wait for initial render
        await page.waitForTimeout(500);

        const pageInfo = page.locator('#page-info');
        await expect(pageInfo).toContainText('1 /');

        // Scroll the viewer container far enough to reach a later page
        await page.evaluate(() => {
            const scroll = document.getElementById('viewer-scroll');
            if (scroll) {
                // Scroll to the bottom
                scroll.scrollTop = scroll.scrollHeight;
            }
        });

        // Wait for scroll handler to update
        await page.waitForTimeout(500);

        // Page indicator should have changed from page 1
        const text = await pageInfo.textContent();
        const match = text.match(/(\d+)\s*\/\s*(\d+)/);
        expect(match).toBeTruthy();
        const activePage = parseInt(match[1], 10);
        // After scrolling to bottom, active page should not be 1
        expect(activePage).toBeGreaterThan(1);
    });

    test('page input field allows jumping to a specific page', async ({ page }) => {
        await uploadPdf(page, MULTI_PAGE_PDF);

        // Get the total page count
        const pageInfo = page.locator('#page-info');
        const text = await pageInfo.textContent();
        const match = text.match(/\d+\s*\/\s*(\d+)/);
        const totalPages = parseInt(match[1], 10);

        if (totalPages >= 3) {
            // Type a page number in the page input and press Enter
            const pageInput = page.locator('#page-input');
            await pageInput.fill('3');
            await pageInput.press('Enter');

            // Wait for scroll and indicator update
            await page.waitForTimeout(500);

            await expect(pageInfo).toContainText('3 /');
        }
    });
});
