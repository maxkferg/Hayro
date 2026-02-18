import { test, expect } from '@playwright/test';
import { SINGLE_PAGE_PDF, uploadPdf, waitForAppReady } from './fixtures.js';

/**
 * Draw on the first page's annotation layer by dispatching PointerEvents.
 * Coordinates are relative to the annotation layer's top-left corner.
 */
async function drawOnAnnotationLayer(page, startX, startY, endX, endY) {
    await page.evaluate(
        ({ sx, sy, ex, ey }) => {
            return new Promise((resolve) => {
                const layer = document.querySelector('.annotation-layer');
                if (!layer) {
                    resolve();
                    return;
                }
                const rect = layer.getBoundingClientRect();

                layer.dispatchEvent(
                    new PointerEvent('pointerdown', {
                        clientX: rect.left + sx,
                        clientY: rect.top + sy,
                        bubbles: true,
                        pointerId: 1,
                    })
                );
                layer.dispatchEvent(
                    new PointerEvent('pointermove', {
                        clientX: rect.left + ex,
                        clientY: rect.top + ey,
                        bubbles: true,
                        pointerId: 1,
                    })
                );
                layer.dispatchEvent(
                    new PointerEvent('pointerup', {
                        clientX: rect.left + ex,
                        clientY: rect.top + ey,
                        bubbles: true,
                        pointerId: 1,
                    })
                );

                setTimeout(resolve, 300);
            });
        },
        { sx: startX, sy: startY, ex: endX, ey: endY }
    );
}

/**
 * Draw an ink stroke on the first page's annotation layer.
 */
async function drawInkOnAnnotationLayer(page, points) {
    await page.evaluate(
        (pts) => {
            return new Promise((resolve) => {
                const layer = document.querySelector('.annotation-layer');
                if (!layer) {
                    resolve();
                    return;
                }
                const rect = layer.getBoundingClientRect();

                layer.dispatchEvent(
                    new PointerEvent('pointerdown', {
                        clientX: rect.left + pts[0][0],
                        clientY: rect.top + pts[0][1],
                        bubbles: true,
                        pointerId: 1,
                    })
                );

                for (let i = 1; i < pts.length; i++) {
                    layer.dispatchEvent(
                        new PointerEvent('pointermove', {
                            clientX: rect.left + pts[i][0],
                            clientY: rect.top + pts[i][1],
                            bubbles: true,
                            pointerId: 1,
                        })
                    );
                }

                const last = pts[pts.length - 1];
                layer.dispatchEvent(
                    new PointerEvent('pointerup', {
                        clientX: rect.left + last[0],
                        clientY: rect.top + last[1],
                        bubbles: true,
                        pointerId: 1,
                    })
                );

                setTimeout(resolve, 300);
            });
        },
        points
    );
}

test.describe('Draw annotations', () => {
    test.beforeEach(async ({ page }) => {
        await waitForAppReady(page);
        await uploadPdf(page, SINGLE_PAGE_PDF);
        // Wait for the first page to render
        await page.waitForTimeout(500);
    });

    test('tool buttons switch active state', async ({ page }) => {
        // Initially, Select tool should be active
        const selectBtn = page.locator('#tool-select');
        await expect(selectBtn).toHaveClass(/active/);

        // Click Rectangle tool
        const rectBtn = page.locator('#tool-rectangle');
        await rectBtn.click();
        await expect(rectBtn).toHaveClass(/active/);
        await expect(selectBtn).not.toHaveClass(/active/);

        // Click Pencil tool
        const inkBtn = page.locator('#tool-ink');
        await inkBtn.click();
        await expect(inkBtn).toHaveClass(/active/);
        await expect(rectBtn).not.toHaveClass(/active/);
    });

    test('keyboard shortcuts switch tools', async ({ page }) => {
        // Press 'r' for Rectangle
        await page.keyboard.press('r');
        await expect(page.locator('#tool-rectangle')).toHaveClass(/active/);

        // Press 'p' for Pencil
        await page.keyboard.press('p');
        await expect(page.locator('#tool-ink')).toHaveClass(/active/);

        // Press 'h' for Highlight
        await page.keyboard.press('h');
        await expect(page.locator('#tool-highlight')).toHaveClass(/active/);

        // Press 'v' for Select
        await page.keyboard.press('v');
        await expect(page.locator('#tool-select')).toHaveClass(/active/);

        // Press 't' for Text
        await page.keyboard.press('t');
        await expect(page.locator('#tool-text')).toHaveClass(/active/);

        // Press 'f' for Text Field
        await page.keyboard.press('f');
        await expect(page.locator('#tool-text-field')).toHaveClass(/active/);

        // Press 's' for Signature
        await page.keyboard.press('s');
        await expect(page.locator('#tool-signature-field')).toHaveClass(/active/);
    });

    test('annotation layer becomes active when a drawing tool is selected', async ({ page }) => {
        // Select tool → annotation layer should NOT be active
        const annotLayer = page.locator('.annotation-layer').first();
        await expect(annotLayer).not.toHaveClass(/active/);

        // Switch to Rectangle tool
        await page.locator('#tool-rectangle').click();
        await expect(annotLayer).toHaveClass(/active/);

        // Switch back to Select
        await page.locator('#tool-select').click();
        await expect(annotLayer).not.toHaveClass(/active/);
    });

    test('drawing a rectangle annotation updates the edit count', async ({ page }) => {
        const annotCount = page.locator('#annot-count');
        await expect(annotCount).toHaveText('No pending edits');

        // Select Rectangle tool
        await page.locator('#tool-rectangle').click();

        // Perform a drag gesture on the annotation layer using dispatchEvent
        await drawOnAnnotationLayer(page, 50, 50, 200, 150);

        // Check the edit count has updated
        await expect(annotCount).toContainText('Total edits: 1');
    });

    test('drawing an ink (pencil) annotation updates the edit count', async ({ page }) => {
        const annotCount = page.locator('#annot-count');

        // Select Pencil tool
        await page.locator('#tool-ink').click();

        // Perform a multi-point drag (freehand drawing)
        await drawInkOnAnnotationLayer(page, [
            [60, 60],
            [90, 80],
            [120, 70],
            [150, 100],
        ]);

        await expect(annotCount).toContainText('Total edits: 1');
    });

    test('drawing a highlight annotation updates the edit count', async ({ page }) => {
        const annotCount = page.locator('#annot-count');

        // Select Highlight tool
        await page.locator('#tool-highlight').click();

        // Perform a drag gesture
        await drawOnAnnotationLayer(page, 40, 40, 250, 70);

        await expect(annotCount).toContainText('Total edits: 1');
    });

    test('undo removes the last annotation', async ({ page }) => {
        const annotCount = page.locator('#annot-count');
        const undoBtn = page.locator('#btn-undo');
        const redoBtn = page.locator('#btn-redo');

        // Undo should be disabled initially
        await expect(undoBtn).toBeDisabled();

        // Draw a rectangle annotation
        await page.locator('#tool-rectangle').click();
        await drawOnAnnotationLayer(page, 50, 50, 200, 150);

        // Should have 1 edit
        await expect(annotCount).toContainText('Total edits: 1');
        await expect(undoBtn).toBeEnabled();

        // Click Undo
        await undoBtn.click();
        await page.waitForTimeout(300);

        // Should have 0 edits
        await expect(annotCount).toHaveText('No pending edits');
        await expect(undoBtn).toBeDisabled();
        await expect(redoBtn).toBeEnabled();
    });

    test('redo restores the undone annotation', async ({ page }) => {
        const annotCount = page.locator('#annot-count');
        const undoBtn = page.locator('#btn-undo');
        const redoBtn = page.locator('#btn-redo');

        // Draw a rectangle annotation
        await page.locator('#tool-rectangle').click();
        await drawOnAnnotationLayer(page, 50, 50, 200, 150);

        // Undo
        await undoBtn.click();
        await page.waitForTimeout(300);
        await expect(annotCount).toHaveText('No pending edits');

        // Redo
        await redoBtn.click();
        await page.waitForTimeout(300);
        await expect(annotCount).toContainText('Total edits: 1');
        await expect(redoBtn).toBeDisabled();
    });

    test('keyboard undo/redo shortcuts work', async ({ page }) => {
        const annotCount = page.locator('#annot-count');

        // Draw a rectangle annotation
        await page.locator('#tool-rectangle').click();
        await drawOnAnnotationLayer(page, 50, 50, 200, 150);

        await expect(annotCount).toContainText('Total edits: 1');

        // Ctrl+Z to undo
        await page.keyboard.press('Control+z');
        await page.waitForTimeout(300);
        await expect(annotCount).toHaveText('No pending edits');

        // Ctrl+Shift+Z to redo
        await page.keyboard.press('Control+Shift+z');
        await page.waitForTimeout(300);
        await expect(annotCount).toContainText('Total edits: 1');
    });

    test('color selection changes the active color button', async ({ page }) => {
        // Red should be active by default
        const redBtn = page.locator('.color-btn[data-color="1,0.2,0.2"]');
        await expect(redBtn).toHaveClass(/active/);

        // Click blue
        const blueBtn = page.locator('.color-btn[data-color="0.2,0.45,1"]');
        await blueBtn.click();
        await expect(blueBtn).toHaveClass(/active/);
        await expect(redBtn).not.toHaveClass(/active/);
    });
});
