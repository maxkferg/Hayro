import { test, expect } from '@playwright/test';
import { SINGLE_PAGE_PDF, uploadPdf, waitForAppReady } from './fixtures.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Draw a rectangle annotation on the first page's annotation layer.
 * Coordinates are relative to the annotation layer's top-left corner.
 */
async function drawRectAnnotation(page, startX, startY, endX, endY) {
    await page.evaluate(
        ({ sx, sy, ex, ey }) => {
            return new Promise((resolve) => {
                const layer = document.querySelector('.annotation-layer');
                if (!layer) { resolve(); return; }
                const rect = layer.getBoundingClientRect();

                layer.dispatchEvent(
                    new PointerEvent('pointerdown', {
                        clientX: rect.left + sx, clientY: rect.top + sy,
                        bubbles: true, pointerId: 1,
                    })
                );
                layer.dispatchEvent(
                    new PointerEvent('pointermove', {
                        clientX: rect.left + ex, clientY: rect.top + ey,
                        bubbles: true, pointerId: 1,
                    })
                );
                layer.dispatchEvent(
                    new PointerEvent('pointerup', {
                        clientX: rect.left + ex, clientY: rect.top + ey,
                        bubbles: true, pointerId: 1,
                    })
                );
                setTimeout(resolve, 300);
            });
        },
        { sx: startX, sy: startY, ex: endX, ey: endY }
    );
}

/**
 * Click on the annotation layer at (x, y) while the select tool is active.
 * This dispatches pointerdown + pointerup (a click) to select or deselect.
 */
async function clickAnnotationLayer(page, x, y) {
    await page.evaluate(
        ({ cx, cy }) => {
            return new Promise((resolve) => {
                const layer = document.querySelector('.annotation-layer');
                if (!layer) { resolve(); return; }
                const rect = layer.getBoundingClientRect();
                layer.dispatchEvent(
                    new PointerEvent('pointerdown', {
                        clientX: rect.left + cx, clientY: rect.top + cy,
                        bubbles: true, pointerId: 1,
                    })
                );
                layer.dispatchEvent(
                    new PointerEvent('pointerup', {
                        clientX: rect.left + cx, clientY: rect.top + cy,
                        bubbles: true, pointerId: 1,
                    })
                );
                setTimeout(resolve, 300);
            });
        },
        { cx: x, cy: y }
    );
}

/**
 * Drag on the annotation layer from (fromX, fromY) to (toX, toY).
 * Used for moving or resizing a selected annotation.
 */
async function dragOnAnnotationLayer(page, fromX, fromY, toX, toY) {
    await page.evaluate(
        ({ fx, fy, tx, ty }) => {
            return new Promise((resolve) => {
                const layer = document.querySelector('.annotation-layer');
                if (!layer) { resolve(); return; }
                const rect = layer.getBoundingClientRect();
                layer.dispatchEvent(
                    new PointerEvent('pointerdown', {
                        clientX: rect.left + fx, clientY: rect.top + fy,
                        bubbles: true, pointerId: 1,
                    })
                );
                // Intermediate move events for smoother drag
                const steps = 5;
                for (let i = 1; i <= steps; i++) {
                    const ratio = i / steps;
                    layer.dispatchEvent(
                        new PointerEvent('pointermove', {
                            clientX: rect.left + fx + (tx - fx) * ratio,
                            clientY: rect.top + fy + (ty - fy) * ratio,
                            bubbles: true, pointerId: 1,
                        })
                    );
                }
                layer.dispatchEvent(
                    new PointerEvent('pointerup', {
                        clientX: rect.left + tx, clientY: rect.top + ty,
                        bubbles: true, pointerId: 1,
                    })
                );
                setTimeout(resolve, 400);
            });
        },
        { fx: fromX, fy: fromY, tx: toX, ty: toY }
    );
}

/**
 * Read the current selection state from the app.
 * Returns { selected: boolean, page?: number, globalIdx?: number, screenRect?: number[] }
 */
async function getSelectionState(page) {
    return page.evaluate(() => {
        // Access the app state through the global scope isn't possible with ES modules.
        // Instead we check whether the annotation canvas has selection drawn on it
        // by checking the annotation layer for non-empty pixel data.
        const layer = document.querySelector('.annotation-layer');
        if (!layer) return { selected: false };
        const ctx = layer.getContext('2d');
        if (!ctx) return { selected: false };
        const data = ctx.getImageData(0, 0, layer.width, layer.height).data;
        let nonEmptyPixels = 0;
        for (let i = 3; i < data.length; i += 4) {
            if (data[i] > 0) nonEmptyPixels++;
        }
        return { hasOverlayPixels: nonEmptyPixels > 0, nonEmptyPixels };
    });
}

/**
 * Helper: draw a rectangle, switch to select, then click inside it to select.
 * Returns the center of the drawn rectangle for further interactions.
 */
async function drawAndSelectRect(page, x0, y0, x1, y1) {
    // Select Rectangle tool and draw
    await page.locator('#tool-rectangle').click();
    await drawRectAnnotation(page, x0, y0, x1, y1);
    await page.waitForTimeout(500);

    // Switch to Select tool
    await page.locator('#tool-select').click();
    await page.waitForTimeout(300);

    // Click inside the rectangle to select it
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    await clickAnnotationLayer(page, cx, cy);
    await page.waitForTimeout(300);

    return { cx, cy };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Annotation selection, move, resize, and delete', () => {
    test.beforeEach(async ({ page }) => {
        await waitForAppReady(page);
        await uploadPdf(page, SINGLE_PAGE_PDF);
        await page.waitForTimeout(500);
    });

    test('clicking an annotation with select tool shows selection overlay', async ({ page }) => {
        // Draw a rectangle annotation
        await page.locator('#tool-rectangle').click();
        await drawRectAnnotation(page, 50, 50, 200, 150);
        await page.waitForTimeout(500);

        // Get baseline overlay state
        const before = await getSelectionState(page);

        // Switch to Select tool
        await page.locator('#tool-select').click();
        await page.waitForTimeout(300);

        // The annotation outlines should now be drawn
        const afterToolSwitch = await getSelectionState(page);
        expect(afterToolSwitch.hasOverlayPixels).toBe(true);

        // Click inside the rectangle to select it
        await clickAnnotationLayer(page, 125, 100);
        await page.waitForTimeout(300);

        // Selection overlay should have more pixels (dashed border + handles)
        const afterSelect = await getSelectionState(page);
        expect(afterSelect.hasOverlayPixels).toBe(true);
        expect(afterSelect.nonEmptyPixels).toBeGreaterThan(afterToolSwitch.nonEmptyPixels);
    });

    test('Escape key deselects the annotation', async ({ page }) => {
        await drawAndSelectRect(page, 50, 50, 200, 150);

        // Verify something is selected (overlay has pixels)
        const selected = await getSelectionState(page);
        expect(selected.hasOverlayPixels).toBe(true);
        const pixelsBefore = selected.nonEmptyPixels;

        // Press Escape
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);

        // Overlay should have fewer pixels (just outlines, no selection handles)
        const afterEscape = await getSelectionState(page);
        expect(afterEscape.nonEmptyPixels).toBeLessThan(pixelsBefore);
    });

    test('clicking empty area deselects the annotation', async ({ page }) => {
        await drawAndSelectRect(page, 50, 50, 200, 150);
        const selectedState = await getSelectionState(page);
        const pixelsBefore = selectedState.nonEmptyPixels;

        // Click far away from the annotation
        await clickAnnotationLayer(page, 400, 400);
        await page.waitForTimeout(300);

        const afterDeselect = await getSelectionState(page);
        expect(afterDeselect.nonEmptyPixels).toBeLessThan(pixelsBefore);
    });

    test('Delete key removes the selected annotation', async ({ page }) => {
        const annotCount = page.locator('#annot-count');

        // Draw and select
        await drawAndSelectRect(page, 50, 50, 200, 150);
        await expect(annotCount).toContainText('Total edits: 1');

        // Press Delete
        await page.keyboard.press('Delete');
        await page.waitForTimeout(500);

        // Annotation should be removed
        await expect(annotCount).toHaveText('No pending edits');
    });

    test('Backspace key removes the selected annotation', async ({ page }) => {
        const annotCount = page.locator('#annot-count');

        await drawAndSelectRect(page, 50, 50, 200, 150);
        await expect(annotCount).toContainText('Total edits: 1');

        // Press Backspace
        await page.keyboard.press('Backspace');
        await page.waitForTimeout(500);

        await expect(annotCount).toHaveText('No pending edits');
    });

    test('Delete does nothing when no annotation is selected', async ({ page }) => {
        const annotCount = page.locator('#annot-count');

        // Draw a rectangle but do NOT select it
        await page.locator('#tool-rectangle').click();
        await drawRectAnnotation(page, 50, 50, 200, 150);
        await page.waitForTimeout(300);
        await expect(annotCount).toContainText('Total edits: 1');

        // Switch to select tool but don't click any annotation
        await page.locator('#tool-select').click();
        await page.waitForTimeout(200);

        // Press Delete
        await page.keyboard.press('Delete');
        await page.waitForTimeout(300);

        // Annotation should still exist
        await expect(annotCount).toContainText('Total edits: 1');
    });

    test('Escape does nothing when no annotation is selected', async ({ page }) => {
        const consoleErrors = [];
        page.on('console', (msg) => {
            if (msg.type() === 'error') consoleErrors.push(msg.text());
        });

        // Switch to select tool with no annotations
        await page.locator('#tool-select').click();
        await page.waitForTimeout(200);

        // Press Escape — should not throw
        await page.keyboard.press('Escape');
        await page.waitForTimeout(200);

        // No JS errors
        expect(consoleErrors.filter(m => !m.includes('Failed to load'))).toHaveLength(0);
    });

    test('switching tools deselects the annotation', async ({ page }) => {
        await drawAndSelectRect(page, 50, 50, 200, 150);
        const selectedState = await getSelectionState(page);
        expect(selectedState.hasOverlayPixels).toBe(true);

        // Switch to Rectangle tool
        await page.locator('#tool-rectangle').click();
        await page.waitForTimeout(300);

        // Switch back to Select — should have no selection (just outlines)
        await page.locator('#tool-select').click();
        await page.waitForTimeout(300);

        const afterSwitch = await getSelectionState(page);
        // There should be fewer pixels since no annotation is selected (only outlines)
        expect(afterSwitch.nonEmptyPixels).toBeLessThan(selectedState.nonEmptyPixels);
    });

    test('dragging inside a selected annotation moves it', async ({ page }) => {
        // Capture baseline canvas pixels
        const pixelsBefore = await page.evaluate(() => {
            const canvas = document.querySelector('.pdf-canvas');
            const ctx = canvas.getContext('2d');
            const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
            let sum = 0;
            for (let i = 0; i < data.length; i++) sum += data[i];
            return sum;
        });

        // Draw a rectangle
        const { cx, cy } = await drawAndSelectRect(page, 50, 50, 200, 150);

        // Wait for render
        await page.waitForTimeout(500);

        const pixelsAfterDraw = await page.evaluate(() => {
            const canvas = document.querySelector('.pdf-canvas');
            const ctx = canvas.getContext('2d');
            const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
            let sum = 0;
            for (let i = 0; i < data.length; i++) sum += data[i];
            return sum;
        });

        // Drag the annotation to a new position
        await dragOnAnnotationLayer(page, cx, cy, cx + 80, cy + 80);
        await page.waitForTimeout(800);

        const pixelsAfterMove = await page.evaluate(() => {
            const canvas = document.querySelector('.pdf-canvas');
            const ctx = canvas.getContext('2d');
            const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
            let sum = 0;
            for (let i = 0; i < data.length; i++) sum += data[i];
            return sum;
        });

        // Canvas should be different after the move (annotation in a new position)
        expect(pixelsAfterMove).not.toBe(pixelsAfterDraw);
    });

    test('move preserves annotation count', async ({ page }) => {
        const annotCount = page.locator('#annot-count');

        const { cx, cy } = await drawAndSelectRect(page, 50, 50, 200, 150);
        await expect(annotCount).toContainText('Total edits: 1');

        // Move the annotation
        await dragOnAnnotationLayer(page, cx, cy, cx + 50, cy + 50);
        await page.waitForTimeout(500);

        // Count should still be 1 (move doesn't add new annotations)
        await expect(annotCount).toContainText('Total edits: 1');
    });

    test('selecting one of multiple annotations only selects one', async ({ page }) => {
        const annotCount = page.locator('#annot-count');

        // Draw two rectangles
        await page.locator('#tool-rectangle').click();
        await drawRectAnnotation(page, 50, 50, 150, 100);
        await page.waitForTimeout(300);
        await drawRectAnnotation(page, 50, 150, 150, 200);
        await page.waitForTimeout(300);

        await expect(annotCount).toContainText('Total edits: 2');

        // Switch to Select and click inside the first rectangle
        await page.locator('#tool-select').click();
        await page.waitForTimeout(300);
        await clickAnnotationLayer(page, 100, 75);
        await page.waitForTimeout(300);

        // Delete should only remove one
        await page.keyboard.press('Delete');
        await page.waitForTimeout(500);

        await expect(annotCount).toContainText('Total edits: 1');
    });

    test('dragging a corner handle resizes the annotation', async ({ page }) => {
        // Draw a large rectangle
        const { cx, cy } = await drawAndSelectRect(page, 50, 50, 250, 200);
        await page.waitForTimeout(500);

        const pixelsBeforeResize = await page.evaluate(() => {
            const canvas = document.querySelector('.pdf-canvas');
            const ctx = canvas.getContext('2d');
            const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
            let sum = 0;
            for (let i = 0; i < data.length; i++) sum += data[i];
            return sum;
        });

        // Drag the SE corner (250, 200) to make it larger
        await dragOnAnnotationLayer(page, 250, 200, 350, 300);
        await page.waitForTimeout(800);

        const pixelsAfterResize = await page.evaluate(() => {
            const canvas = document.querySelector('.pdf-canvas');
            const ctx = canvas.getContext('2d');
            const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
            let sum = 0;
            for (let i = 0; i < data.length; i++) sum += data[i];
            return sum;
        });

        // Canvas should change after resize
        expect(pixelsAfterResize).not.toBe(pixelsBeforeResize);
    });

    test('annotation layer has select-active class when select tool is chosen', async ({ page }) => {
        const annotLayer = page.locator('.annotation-layer').first();

        // Initially select tool is active
        await expect(annotLayer).toHaveClass(/select-active/);

        // Switch to rectangle
        await page.locator('#tool-rectangle').click();
        await expect(annotLayer).not.toHaveClass(/select-active/);
        await expect(annotLayer).toHaveClass(/active/);

        // Switch back to select
        await page.locator('#tool-select').click();
        await expect(annotLayer).toHaveClass(/select-active/);
    });

    test('no NaN warnings during select/move/resize interactions', async ({ page }) => {
        const consoleMessages = [];
        page.on('console', (msg) => consoleMessages.push(msg.text()));

        const { cx, cy } = await drawAndSelectRect(page, 50, 50, 200, 150);

        // Move
        await dragOnAnnotationLayer(page, cx, cy, cx + 30, cy + 30);
        await page.waitForTimeout(400);

        // Resize (drag SE corner)
        await clickAnnotationLayer(page, cx + 30, cy + 30);
        await page.waitForTimeout(200);
        await dragOnAnnotationLayer(page, 230, 180, 280, 230);
        await page.waitForTimeout(400);

        // Deselect
        await page.keyboard.press('Escape');
        await page.waitForTimeout(200);

        const nanWarnings = consoleMessages.filter((m) => m.includes('NaN'));
        expect(nanWarnings).toHaveLength(0);
    });
});
