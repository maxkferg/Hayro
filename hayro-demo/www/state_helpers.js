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
