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

/**
 * Scroll a toolbar button into view and tap it on mobile.
 * The toolbar may overflow horizontally, so we ensure the button is visible first.
 */
async function tapToolbarButton(page, selector) {
    const btn = page.locator(selector);
    await btn.scrollIntoViewIfNeeded();
    await btn.tap();
}

test.describe('Mobile: Annotation tools', () => {
    test.beforeEach(async ({ page }) => {
        await waitForAppReady(page);
        await uploadPdf(page, SINGLE_PAGE_PDF);
        await page.waitForTimeout(500);
    });

    test('tool buttons are visible and tappable on mobile', async ({ page }) => {
        // The select tool should be active by default
        const selectBtn = page.locator('#tool-select');
        await expect(selectBtn).toHaveClass(/active/);

        // Tap the rectangle tool
        await tapToolbarButton(page, '#tool-rectangle');
        await expect(page.locator('#tool-rectangle')).toHaveClass(/active/);
        await expect(selectBtn).not.toHaveClass(/active/);

        // Tap the ink tool
        await tapToolbarButton(page, '#tool-ink');
        await expect(page.locator('#tool-ink')).toHaveClass(/active/);
        await expect(page.locator('#tool-rectangle')).not.toHaveClass(/active/);
    });

    test('drawing a rectangle annotation on mobile updates edit count', async ({ page }) => {
        const annotCount = page.locator('#annot-count');

        // Select Rectangle tool
        await tapToolbarButton(page, '#tool-rectangle');

        // Draw a rectangle on the annotation layer
        await drawOnAnnotationLayer(page, 30, 30, 150, 100);

        // Check the edit count
        await expect(annotCount).toContainText('Total edits: 1');
    });

    test('drawing an ink annotation on mobile updates edit count', async ({ page }) => {
        const annotCount = page.locator('#annot-count');

        // Select Pencil tool
        await tapToolbarButton(page, '#tool-ink');

        // Draw a freehand stroke
        await drawInkOnAnnotationLayer(page, [
            [40, 40],
            [70, 60],
            [100, 50],
            [130, 80],
        ]);

        await expect(annotCount).toContainText('Total edits: 1');
    });

    test('drawing a highlight annotation on mobile updates edit count', async ({ page }) => {
        const annotCount = page.locator('#annot-count');

        // Select Highlight tool
        await tapToolbarButton(page, '#tool-highlight');

        // Draw a highlight
        await drawOnAnnotationLayer(page, 20, 20, 180, 45);

        await expect(annotCount).toContainText('Total edits: 1');
    });

    test('undo and redo buttons work on mobile', async ({ page }) => {
        const annotCount = page.locator('#annot-count');
        const undoBtn = page.locator('#btn-undo');
        const redoBtn = page.locator('#btn-redo');

        // Draw a rectangle
        await tapToolbarButton(page, '#tool-rectangle');
        await drawOnAnnotationLayer(page, 30, 30, 150, 100);
        await expect(annotCount).toContainText('Total edits: 1');

        // Undo via tap
        await tapToolbarButton(page, '#btn-undo');
        await page.waitForTimeout(300);
        await expect(annotCount).toHaveText('No pending edits');

        // Redo via tap
        await tapToolbarButton(page, '#btn-redo');
        await page.waitForTimeout(300);
        await expect(annotCount).toContainText('Total edits: 1');
    });

    test('color selection works on mobile', async ({ page }) => {
        // Red should be active by default
        const redBtn = page.locator('.color-btn[data-color="1,0.2,0.2"]');
        await expect(redBtn).toHaveClass(/active/);

        // Tap blue color
        const blueBtn = page.locator('.color-btn[data-color="0.2,0.45,1"]');
        await blueBtn.scrollIntoViewIfNeeded();
        await blueBtn.tap();
        await expect(blueBtn).toHaveClass(/active/);
        await expect(redBtn).not.toHaveClass(/active/);
    });

    test('multiple annotation types can be drawn in sequence on mobile', async ({ page }) => {
        const annotCount = page.locator('#annot-count');

        // Draw a rectangle
        await tapToolbarButton(page, '#tool-rectangle');
        await drawOnAnnotationLayer(page, 30, 30, 150, 80);
        await expect(annotCount).toContainText('Total edits: 1');

        // Draw an ink stroke
        await tapToolbarButton(page, '#tool-ink');
        await drawInkOnAnnotationLayer(page, [
            [40, 100],
            [80, 120],
            [120, 110],
        ]);
        await expect(annotCount).toContainText('Total edits: 2');

        // Draw a highlight
        await tapToolbarButton(page, '#tool-highlight');
        await drawOnAnnotationLayer(page, 20, 140, 170, 160);
        await expect(annotCount).toContainText('Total edits: 3');
    });

    test('annotation layer becomes active when drawing tool is selected on mobile', async ({ page }) => {
        const annotLayer = page.locator('.annotation-layer').first();

        // Default: select-active
        await expect(annotLayer).toHaveClass(/select-active/);

        // Tap rectangle tool
        await tapToolbarButton(page, '#tool-rectangle');

        // Annotation layer should have 'active' class (not 'select-active')
        await expect(annotLayer).not.toHaveClass(/select-active/);
        const classAfterRect = await annotLayer.getAttribute('class');
        expect(classAfterRect.split(/\s+/)).toContain('active');

        // Tap back to select
        await tapToolbarButton(page, '#tool-select');
        await expect(annotLayer).toHaveClass(/select-active/);
    });
});
