/**
 * Pure helper functions for canvas drawing previews and coordinate mapping.
 * Extracted from index.js for testability.
 */

/**
 * Convert a normalized [r, g, b] color (0–1 range) to a CSS rgb() string.
 * @param {number[]} color — [r, g, b] each in 0–1
 * @returns {string}
 */
export function colorToCssRgb(color) {
    const [r, g, b] = color;
    return `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
}

/**
 * Convert a normalized [r, g, b] color to a CSS rgba() string with opacity.
 * @param {number[]} color — [r, g, b] each in 0–1
 * @param {number} alpha — opacity 0–1
 * @returns {string}
 */
export function colorToCssRgba(color, alpha) {
    const [r, g, b] = color;
    return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${alpha})`;
}

/**
 * Compute pointer position relative to a layer's bounding rect.
 * @param {{ left: number, top: number }} layerRect — result of getBoundingClientRect()
 * @param {number} clientX — event.clientX
 * @param {number} clientY — event.clientY
 * @returns {[number, number]}
 */
export function localPointer(layerRect, clientX, clientY) {
    return [clientX - layerRect.left, clientY - layerRect.top];
}

/**
 * Clear the entire canvas.
 * @param {CanvasRenderingContext2D} ctx
 */
export function clearCanvas(ctx) {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
}

/**
 * Draw a freehand ink preview on the canvas.
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array<[number, number]>} points
 * @param {number[]} color — [r, g, b] normalized
 */
export function drawInkPreview(ctx, points, color) {
    if (points.length < 2) return;
    clearCanvas(ctx);
    ctx.strokeStyle = colorToCssRgb(color);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i += 1) {
        ctx.lineTo(points[i][0], points[i][1]);
    }
    ctx.stroke();
}

/**
 * Draw a rectangle preview (highlight or stroke).
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} tool — 'highlight' uses fill; anything else uses stroke
 * @param {number} x0 — start X
 * @param {number} y0 — start Y
 * @param {number} x1 — end X
 * @param {number} y1 — end Y
 * @param {number[]} color — [r, g, b] normalized
 */
export function drawRectPreview(ctx, tool, x0, y0, x1, y1, color) {
    clearCanvas(ctx);
    const rx = Math.min(x0, x1);
    const ry = Math.min(y0, y1);
    const rw = Math.abs(x1 - x0);
    const rh = Math.abs(y1 - y0);

    if (tool === 'highlight') {
        ctx.fillStyle = colorToCssRgba(color, 0.3);
        ctx.fillRect(rx, ry, rw, rh);
    } else {
        ctx.strokeStyle = colorToCssRgb(color);
        ctx.lineWidth = 2;
        ctx.strokeRect(rx, ry, rw, rh);
    }
}

// ---------------------------------------------------------------------------
// Selection overlay drawing
// ---------------------------------------------------------------------------

/**
 * Draw a selection overlay around a rect: dashed blue border + 8 resize handles.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x0 — left
 * @param {number} y0 — top
 * @param {number} x1 — right
 * @param {number} y1 — bottom
 * @param {number} [handleSize=8] — side length of handle squares
 */
export function drawSelectionOverlay(ctx, x0, y0, x1, y1, handleSize = 8) {
    const rx = Math.min(x0, x1);
    const ry = Math.min(y0, y1);
    const rw = Math.abs(x1 - x0);
    const rh = Math.abs(y1 - y0);
    const mx = rx + rw / 2;
    const my = ry + rh / 2;
    const hs = handleSize / 2;

    // Dashed selection border
    ctx.save();
    ctx.strokeStyle = '#3f5cff';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(rx, ry, rw, rh);
    ctx.restore();

    // Resize handles — filled white squares with blue border
    const handles = [
        [rx, ry],           // nw
        [mx, ry],           // n
        [rx + rw, ry],      // ne
        [rx + rw, my],      // e
        [rx + rw, ry + rh], // se
        [mx, ry + rh],      // s
        [rx, ry + rh],      // sw
        [rx, my],           // w
    ];

    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#3f5cff';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([]);
    for (const [hx, hy] of handles) {
        ctx.fillRect(hx - hs, hy - hs, handleSize, handleSize);
        ctx.strokeRect(hx - hs, hy - hs, handleSize, handleSize);
    }
}

/**
 * Draw subtle outlines for all annotation rects (shown while the select tool
 * is active so the user can see clickable regions).
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array<[number,number,number,number]>} rects — screen rects [x0,y0,x1,y1]
 */
export function drawAnnotationOutlines(ctx, rects) {
    if (rects.length === 0) return;
    ctx.save();
    ctx.strokeStyle = 'rgba(63, 92, 255, 0.35)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 2]);
    for (const [x0, y0, x1, y1] of rects) {
        const rx = Math.min(x0, x1);
        const ry = Math.min(y0, y1);
        ctx.strokeRect(rx, ry, Math.abs(x1 - x0), Math.abs(y1 - y0));
    }
    ctx.restore();
}
