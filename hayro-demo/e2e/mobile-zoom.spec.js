import { test, expect } from '@playwright/test';
import { SINGLE_PAGE_PDF, uploadPdf, waitForAppReady } from './fixtures.js';

/**
 * Read the current zoom percentage from the zoom input field.
 */
async function getZoomPercent(page) {
    const value = await page.locator('#zoom-input').inputValue();
    return parseInt(value, 10);
}

/**
 * Scroll a toolbar button into view and tap it on mobile.
 */
async function tapToolbarButton(page, selector) {
    const btn = page.locator(selector);
    await btn.scrollIntoViewIfNeeded();
    await btn.tap();
}

test.describe('Mobile: Zoom controls', () => {
    test.beforeEach(async ({ page }) => {
        await waitForAppReady(page);
        await uploadPdf(page, SINGLE_PAGE_PDF);
        await page.waitForTimeout(500);
    });

    test('initial zoom is set after loading a PDF on mobile', async ({ page }) => {
        const zoom = await getZoomPercent(page);
        expect(zoom).toBeGreaterThan(0);
        expect(zoom).toBeLessThanOrEqual(500);
    });

    test('zoom in button works on mobile', async ({ page }) => {
        const initialZoom = await getZoomPercent(page);

        await tapToolbarButton(page, '#zoom-in');
        await page.waitForTimeout(200);

        const newZoom = await getZoomPercent(page);
        expect(newZoom).toBeGreaterThan(initialZoom);
    });

    test('zoom out button works on mobile', async ({ page }) => {
        const initialZoom = await getZoomPercent(page);

        await tapToolbarButton(page, '#zoom-out');
        await page.waitForTimeout(200);

        const newZoom = await getZoomPercent(page);
        expect(newZoom).toBeLessThan(initialZoom);
    });

    test('fit-width sets zoom on mobile', async ({ page }) => {
        // Zoom in first
        await tapToolbarButton(page, '#zoom-in');
        await page.waitForTimeout(100);
        await tapToolbarButton(page, '#zoom-in');
        await page.waitForTimeout(100);
        await tapToolbarButton(page, '#zoom-in');
        await page.waitForTimeout(100);
        const zoomedIn = await getZoomPercent(page);

        // Tap fit-width
        await tapToolbarButton(page, '#zoom-fit-width');
        await page.waitForTimeout(200);

        const fitZoom = await getZoomPercent(page);
        expect(fitZoom).not.toBe(zoomedIn);
        expect(fitZoom).toBeGreaterThan(0);
    });

    test('fit-page sets zoom on mobile', async ({ page }) => {
        // Zoom in first
        await tapToolbarButton(page, '#zoom-in');
        await page.waitForTimeout(100);
        await tapToolbarButton(page, '#zoom-in');
        await page.waitForTimeout(100);
        await tapToolbarButton(page, '#zoom-in');
        await page.waitForTimeout(100);

        // Tap fit-page
        await tapToolbarButton(page, '#zoom-fit-page');
        await page.waitForTimeout(200);

        const fitZoom = await getZoomPercent(page);
        expect(fitZoom).toBeGreaterThan(0);
    });

    test('fit-page zoom is less than or equal to fit-width zoom on mobile', async ({ page }) => {
        // Fit-width
        await tapToolbarButton(page, '#zoom-fit-width');
        await page.waitForTimeout(200);
        const fitWidth = await getZoomPercent(page);

        // Fit-page
        await tapToolbarButton(page, '#zoom-fit-page');
        await page.waitForTimeout(200);
        const fitPage = await getZoomPercent(page);

        expect(fitPage).toBeLessThanOrEqual(fitWidth);
    });

    test('multiple zoom-in taps increase zoom progressively on mobile', async ({ page }) => {
        const initialZoom = await getZoomPercent(page);

        await tapToolbarButton(page, '#zoom-in');
        await page.waitForTimeout(100);
        await tapToolbarButton(page, '#zoom-in');
        await page.waitForTimeout(100);
        await tapToolbarButton(page, '#zoom-in');
        await page.waitForTimeout(200);

        const newZoom = await getZoomPercent(page);
        expect(newZoom).toBeGreaterThan(initialZoom + 15);
    });

    test('page navigation works on mobile', async ({ page }) => {
        // Check page info shows page data (even if element may be hidden on mobile,
        // the underlying data should be correct)
        const pageInfo = page.locator('#page-info');
        const text = await pageInfo.textContent();
        expect(text).toMatch(/\d+\s*\/\s*\d+/);

        // Previous page should be disabled on first page
        const prevBtn = page.locator('#prev-page');
        await expect(prevBtn).toBeDisabled();
    });
});
