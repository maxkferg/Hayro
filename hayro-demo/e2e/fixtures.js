import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Absolute path to a small single-page test PDF.
 */
export const SINGLE_PAGE_PDF = path.resolve(
    __dirname,
    '../../hayro-tests/pdfs/custom/path_rendering_1.pdf'
);

/**
 * Absolute path to a multi-page test PDF.
 */
export const MULTI_PAGE_PDF = path.resolve(
    __dirname,
    '../../hayro-tests/pdfs/custom/animated-distributions.pdf'
);

/**
 * Upload a PDF file to the demo app via the hidden file input.
 *
 * @param {import('@playwright/test').Page} page — Playwright page
 * @param {string} pdfPath — absolute path to the PDF file
 */
export async function uploadPdf(page, pdfPath) {
    const fileInput = page.locator('#file-input');
    await fileInput.setInputFiles(pdfPath);
    // Wait for the viewer to become visible (PDF loaded)
    await page.locator('#viewer:not([hidden])').waitFor({ state: 'visible', timeout: 30_000 });
}

/**
 * Wait until the WASM module has finished initializing.
 * The app logs "Hayro PDF Studio ready" when init completes.
 */
export async function waitForAppReady(page) {
    await page.goto('/');
    // Wait for the empty state to be visible (indicates app has loaded)
    await page.locator('#empty-state').waitFor({ state: 'visible', timeout: 30_000 });
}
