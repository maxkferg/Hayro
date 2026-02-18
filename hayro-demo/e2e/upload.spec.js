import { test, expect } from '@playwright/test';
import { SINGLE_PAGE_PDF, uploadPdf, waitForAppReady } from './fixtures.js';

test.describe('Upload a document', () => {
    test.beforeEach(async ({ page }) => {
        await waitForAppReady(page);
    });

    test('shows empty state on initial load', async ({ page }) => {
        const emptyState = page.locator('#empty-state');
        await expect(emptyState).toBeVisible();
        await expect(emptyState).toContainText('Open a PDF to start');

        const viewer = page.locator('#viewer');
        await expect(viewer).toBeHidden();
    });

    test('uploads a PDF via file input and shows viewer', async ({ page }) => {
        await uploadPdf(page, SINGLE_PAGE_PDF);

        // Empty state should be hidden
        const emptyState = page.locator('#empty-state');
        await expect(emptyState).toBeHidden();

        // Viewer should be visible
        const viewer = page.locator('#viewer');
        await expect(viewer).toBeVisible();

        // Page info should show page count
        const pageInfo = page.locator('#page-info');
        await expect(pageInfo).toHaveText(/1\s*\/\s*\d+/);

        // At least one page shell should exist
        const pageShells = page.locator('.page-shell');
        await expect(pageShells.first()).toBeVisible();
    });

    test('page shell contains a canvas element', async ({ page }) => {
        await uploadPdf(page, SINGLE_PAGE_PDF);

        const canvas = page.locator('.page-shell .pdf-canvas');
        await expect(canvas.first()).toBeVisible();
    });

    test('log window shows load confirmation', async ({ page }) => {
        await uploadPdf(page, SINGLE_PAGE_PDF);

        // The app logs info about the loaded file
        const logContent = page.locator('#log-content');
        await expect(logContent).toContainText(/Loaded|ready/i);
    });
});
