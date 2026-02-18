import { test, expect } from '@playwright/test';
import { SINGLE_PAGE_PDF, uploadPdf, waitForAppReady } from './fixtures.js';

/**
 * Read the current zoom percentage from the zoom input field.
 */
async function getZoomPercent(page) {
    const value = await page.locator('#zoom-input').inputValue();
    return parseInt(value, 10);
}

test.describe('Zoom in and zoom out', () => {
    test.beforeEach(async ({ page }) => {
        await waitForAppReady(page);
        await uploadPdf(page, SINGLE_PAGE_PDF);
        // Wait for initial render and fit-width zoom
        await page.waitForTimeout(500);
    });

    test('initial zoom is set after loading a PDF', async ({ page }) => {
        const zoom = await getZoomPercent(page);
        // After fit-width, zoom should be > 0 and likely > 50%
        expect(zoom).toBeGreaterThan(0);
        expect(zoom).toBeLessThanOrEqual(500);
    });

    test('zoom in button increases the zoom level', async ({ page }) => {
        const initialZoom = await getZoomPercent(page);

        await page.click('#zoom-in');
        await page.waitForTimeout(200);

        const newZoom = await getZoomPercent(page);
        expect(newZoom).toBeGreaterThan(initialZoom);
    });

    test('zoom out button decreases the zoom level', async ({ page }) => {
        const initialZoom = await getZoomPercent(page);

        await page.click('#zoom-out');
        await page.waitForTimeout(200);

        const newZoom = await getZoomPercent(page);
        expect(newZoom).toBeLessThan(initialZoom);
    });

    test('multiple zoom-in clicks increase zoom progressively', async ({ page }) => {
        const initialZoom = await getZoomPercent(page);

        await page.click('#zoom-in');
        await page.waitForTimeout(100);
        await page.click('#zoom-in');
        await page.waitForTimeout(100);
        await page.click('#zoom-in');
        await page.waitForTimeout(200);

        const newZoom = await getZoomPercent(page);
        expect(newZoom).toBeGreaterThan(initialZoom + 15);
    });

    test('fit-width sets zoom to match viewport width', async ({ page }) => {
        // First zoom in a lot
        for (let i = 0; i < 5; i++) {
            await page.click('#zoom-in');
            await page.waitForTimeout(50);
        }
        const zoomedIn = await getZoomPercent(page);

        // Click fit-width
        await page.click('#zoom-fit-width');
        await page.waitForTimeout(200);

        const fitZoom = await getZoomPercent(page);
        // Fit-width zoom should be different from the zoomed-in level
        expect(fitZoom).not.toBe(zoomedIn);
        expect(fitZoom).toBeGreaterThan(0);
    });

    test('fit-page sets zoom to fit entire page in viewport', async ({ page }) => {
        // First zoom in a lot
        for (let i = 0; i < 5; i++) {
            await page.click('#zoom-in');
            await page.waitForTimeout(50);
        }

        // Click fit-page
        await page.click('#zoom-fit-page');
        await page.waitForTimeout(200);

        const fitZoom = await getZoomPercent(page);
        expect(fitZoom).toBeGreaterThan(0);
        // Fit-page should generally result in a smaller zoom than fit-width
        // (since it has to fit both dimensions)
    });

    test('fit-page zoom is less than or equal to fit-width zoom', async ({ page }) => {
        // Click fit-width
        await page.click('#zoom-fit-width');
        await page.waitForTimeout(200);
        const fitWidth = await getZoomPercent(page);

        // Click fit-page
        await page.click('#zoom-fit-page');
        await page.waitForTimeout(200);
        const fitPage = await getZoomPercent(page);

        expect(fitPage).toBeLessThanOrEqual(fitWidth);
    });

    test('typing a value in zoom input changes the zoom', async ({ page }) => {
        const zoomInput = page.locator('#zoom-input');

        // Clear and type a new zoom value
        await zoomInput.fill('200');
        await zoomInput.dispatchEvent('change');
        await page.waitForTimeout(200);

        const newZoom = await getZoomPercent(page);
        expect(newZoom).toBe(200);
    });

    test('zoom is clamped to minimum bound (25%)', async ({ page }) => {
        const zoomInput = page.locator('#zoom-input');

        // Try to set zoom to 10% (below minimum of 25%)
        await zoomInput.fill('10');
        await zoomInput.dispatchEvent('change');
        await page.waitForTimeout(200);

        const clampedZoom = await getZoomPercent(page);
        expect(clampedZoom).toBeGreaterThanOrEqual(25);
    });

    test('zoom is clamped to maximum bound (500%)', async ({ page }) => {
        const zoomInput = page.locator('#zoom-input');

        // Try to set zoom to 800% (above maximum of 500%)
        await zoomInput.fill('800');
        await zoomInput.dispatchEvent('change');
        await page.waitForTimeout(200);

        const clampedZoom = await getZoomPercent(page);
        expect(clampedZoom).toBeLessThanOrEqual(500);
    });

    test('keyboard shortcut Ctrl+= zooms in', async ({ page }) => {
        const initialZoom = await getZoomPercent(page);

        await page.keyboard.press('Control+=');
        await page.waitForTimeout(200);

        const newZoom = await getZoomPercent(page);
        expect(newZoom).toBeGreaterThan(initialZoom);
    });

    test('keyboard shortcut Ctrl+- zooms out', async ({ page }) => {
        const initialZoom = await getZoomPercent(page);

        await page.keyboard.press('Control+-');
        await page.waitForTimeout(200);

        const newZoom = await getZoomPercent(page);
        expect(newZoom).toBeLessThan(initialZoom);
    });

    test('keyboard shortcut Ctrl+0 resets to fit-width', async ({ page }) => {
        // Zoom in first
        for (let i = 0; i < 3; i++) {
            await page.click('#zoom-in');
            await page.waitForTimeout(50);
        }
        const zoomedIn = await getZoomPercent(page);

        // Ctrl+0 resets to fit-width
        await page.keyboard.press('Control+0');
        await page.waitForTimeout(200);

        const resetZoom = await getZoomPercent(page);
        // Should change from the zoomed-in value
        expect(resetZoom).not.toBe(zoomedIn);
        expect(resetZoom).toBeGreaterThan(0);
    });
});
