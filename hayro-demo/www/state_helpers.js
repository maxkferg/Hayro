/**
 * Pure state computation helpers for the PDF viewer.
 * Extracted from index.js for testability.
 */

export const ZOOM_STEP = 0.1;

/**
 * Compute page shell and canvas dimensions for a given page, zoom, and device pixel ratio.
 *
 * @param {number[]} pageInfo — [width_pts, height_pts, ...] from PdfViewer.get_page_info_for
 * @param {number} zoom — zoom factor (e.g. 1.0 = 100%)
 * @param {number} dpr — device pixel ratio (e.g. 1 or 2)
 * @returns {{ cssWidth: number, cssHeight: number, canvasWidth: number, canvasHeight: number }}
 */
export function computePageLayout(pageInfo, zoom, dpr) {
    const cssWidth = Math.max(1, Math.floor(pageInfo[0] * zoom));
    const cssHeight = Math.max(1, Math.floor(pageInfo[1] * zoom));
    const canvasWidth = Math.round(cssWidth * dpr);
    const canvasHeight = Math.round(cssHeight * dpr);
    return { cssWidth, cssHeight, canvasWidth, canvasHeight };
}

/**
 * Compute the zoom value that fits a page in the given viewport.
 *
 * @param {'width' | 'page'} mode — fit mode
 * @param {number[]} pageInfo — [width_pts, height_pts, ...]
 * @param {number} viewportWidth — available viewport width in CSS pixels
 * @param {number} viewportHeight — available viewport height in CSS pixels
 * @returns {number} the zoom factor
 */
export function computeFitZoom(mode, pageInfo, viewportWidth, viewportHeight) {
    const safeWidth = Math.max(300, viewportWidth);
    const safeHeight = Math.max(300, viewportHeight);
    const pageWidth = pageInfo[0];
    const pageHeight = pageInfo[1];

    if (mode === 'page') {
        return Math.min(safeWidth / pageWidth, safeHeight / pageHeight);
    }
    // mode === 'width'
    return safeWidth / pageWidth;
}

/**
 * Compute the toolbar display state.
 *
 * @param {number} activePage — 1-based current page
 * @param {number} totalPages — total number of pages
 * @param {number} zoom — current zoom factor
 * @returns {{ pageText: string, prevDisabled: boolean, nextDisabled: boolean, zoomPercent: number }}
 */
export function computeToolbarState(activePage, totalPages, zoom) {
    return {
        pageText: `${activePage} / ${totalPages}`,
        prevDisabled: activePage <= 1,
        nextDisabled: activePage >= totalPages,
        zoomPercent: Math.round(zoom * 100),
    };
}

/**
 * Compute the history panel display state.
 *
 * @param {number} currentPageCount — annotations on current page
 * @param {number} totalCount — total operations across all pages
 * @param {number} redoCount — available redo operations
 * @returns {{ undoDisabled: boolean, redoDisabled: boolean, annotCountText: string }}
 */
export function computeHistoryState(currentPageCount, totalCount, redoCount) {
    return {
        undoDisabled: totalCount === 0,
        redoDisabled: redoCount === 0,
        annotCountText:
            totalCount === 0
                ? 'No pending edits'
                : `Page edits: ${currentPageCount} · Total edits: ${totalCount}`,
    };
}

/**
 * Find the active page number based on scroll position.
 * Selects the page whose shell top is closest to the anchor position.
 *
 * @param {Array<{ page: number, top: number }>} pagePositions — array of {page, top} where top is the shell's getBoundingClientRect().top
 * @param {number} anchorY — the Y coordinate to measure distance from (typically containerRect.top + 80)
 * @param {number} fallbackPage — the page to return if no pages are provided
 * @returns {number} the 1-based page number closest to the anchor
 */
export function findActivePageFromScroll(pagePositions, anchorY, fallbackPage) {
    if (pagePositions.length === 0) return fallbackPage;

    let bestPage = fallbackPage;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const { page, top } of pagePositions) {
        const distance = Math.abs(top - anchorY);
        if (distance < bestDistance) {
            bestDistance = distance;
            bestPage = page;
        }
    }

    return bestPage;
}

// ---------------------------------------------------------------------------
// Annotation selection helpers
// ---------------------------------------------------------------------------

/**
 * Hit-test a point against a list of annotation screen rects.
 *
 * Returns the *last* (topmost) annotation whose screen rect contains the
 * point (expanded by `tolerance` pixels), or -1 if nothing was hit.
 *
 * @param {Array<{idx: number, screenRect: [number,number,number,number]}>} annotations
 * @param {number} x — screen X relative to the annotation layer
 * @param {number} y — screen Y relative to the annotation layer
 * @param {number} [tolerance=4] — extra pixels added to each side of the rect
 * @returns {number} the array-position of the hit annotation, or -1
 */
export function hitTestAnnotations(annotations, x, y, tolerance = 4) {
    // Iterate backwards so the topmost (last-drawn) annotation wins.
    for (let i = annotations.length - 1; i >= 0; i--) {
        const [rx0, ry0, rx1, ry1] = annotations[i].screenRect;
        if (
            x >= rx0 - tolerance &&
            x <= rx1 + tolerance &&
            y >= ry0 - tolerance &&
            y <= ry1 + tolerance
        ) {
            return i;
        }
    }
    return -1;
}

/**
 * Determine which resize handle (if any) a point is over.
 *
 * Eight handles are placed at the corners and edge midpoints of the rect.
 * Each handle is a square of `handleSize` × `handleSize` pixels centred on
 * the handle position.
 *
 * @param {[number,number,number,number]} rect — screen rect [x0, y0, x1, y1]
 * @param {number} x
 * @param {number} y
 * @param {number} [handleSize=8]
 * @returns {string|null} — one of 'nw','n','ne','e','se','s','sw','w', or null
 */
export function hitTestHandle(rect, x, y, handleSize = 8) {
    const [x0, y0, x1, y1] = rect;
    const mx = (x0 + x1) / 2;
    const my = (y0 + y1) / 2;
    const hs = handleSize / 2;

    const handles = [
        ['nw', x0, y0],
        ['n', mx, y0],
        ['ne', x1, y0],
        ['e', x1, my],
        ['se', x1, y1],
        ['s', mx, y1],
        ['sw', x0, y1],
        ['w', x0, my],
    ];

    for (const [name, hx, hy] of handles) {
        if (x >= hx - hs && x <= hx + hs && y >= hy - hs && y <= hy + hs) {
            return name;
        }
    }
    return null;
}

/**
 * Compute a new rect after a resize drag from a given handle.
 *
 * The handle determines which edges move. A minimum dimension of `minSize`
 * is enforced on both axes.
 *
 * @param {[number,number,number,number]} originalRect — [x0, y0, x1, y1]
 * @param {string} handle — 'nw','n','ne','e','se','s','sw','w'
 * @param {number} dx — pointer delta X since drag start
 * @param {number} dy — pointer delta Y since drag start
 * @param {number} [minSize=10]
 * @returns {[number,number,number,number]}
 */
export function computeResizedRect(originalRect, handle, dx, dy, minSize = 10) {
    let [x0, y0, x1, y1] = originalRect;

    if (handle.includes('w')) x0 += dx;
    if (handle.includes('e')) x1 += dx;
    if (handle.includes('n')) y0 += dy;
    if (handle.includes('s')) y1 += dy;

    // Enforce minimum size
    if (x1 - x0 < minSize) {
        if (handle.includes('w')) x0 = x1 - minSize;
        else x1 = x0 + minSize;
    }
    if (y1 - y0 < minSize) {
        if (handle.includes('n')) y0 = y1 - minSize;
        else y1 = y0 + minSize;
    }

    return [x0, y0, x1, y1];
}

/**
 * Compute a new rect after a move drag.
 *
 * @param {[number,number,number,number]} originalRect — [x0, y0, x1, y1]
 * @param {number} dx
 * @param {number} dy
 * @returns {[number,number,number,number]}
 */
export function computeMovedRect(originalRect, dx, dy) {
    return [
        originalRect[0] + dx,
        originalRect[1] + dy,
        originalRect[2] + dx,
        originalRect[3] + dy,
    ];
}

/**
 * Map a handle name to a CSS cursor value.
 *
 * @param {string|null} handle — 'nw','n','ne','e','se','s','sw','w', or null
 * @returns {string}
 */
export function cursorForHandle(handle) {
    const map = {
        nw: 'nwse-resize',
        se: 'nwse-resize',
        ne: 'nesw-resize',
        sw: 'nesw-resize',
        n: 'ns-resize',
        s: 'ns-resize',
        e: 'ew-resize',
        w: 'ew-resize',
    };
    return map[handle] || 'default';
}
