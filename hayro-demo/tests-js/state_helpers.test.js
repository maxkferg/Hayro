import assert from 'node:assert/strict';
import test from 'node:test';
import {
    ZOOM_STEP,
    computePageLayout,
    computeFitZoom,
    computeToolbarState,
    computeHistoryState,
    findActivePageFromScroll,
} from '../www/state_helpers.js';

// ---------------------------------------------------------------------------
// ZOOM_STEP constant
// ---------------------------------------------------------------------------

test('ZOOM_STEP is 0.1', () => {
    assert.equal(ZOOM_STEP, 0.1);
});

// ---------------------------------------------------------------------------
// computePageLayout
// ---------------------------------------------------------------------------

test('computePageLayout at zoom 1.0, dpr 1', () => {
    const pageInfo = [595, 842]; // A4 in points
    const layout = computePageLayout(pageInfo, 1.0, 1);
    assert.equal(layout.cssWidth, 595);
    assert.equal(layout.cssHeight, 842);
    assert.equal(layout.canvasWidth, 595);
    assert.equal(layout.canvasHeight, 842);
});

test('computePageLayout at zoom 2.0, dpr 1', () => {
    const pageInfo = [595, 842];
    const layout = computePageLayout(pageInfo, 2.0, 1);
    assert.equal(layout.cssWidth, 1190);
    assert.equal(layout.cssHeight, 1684);
    assert.equal(layout.canvasWidth, 1190);
    assert.equal(layout.canvasHeight, 1684);
});

test('computePageLayout at zoom 1.0, dpr 2', () => {
    const pageInfo = [595, 842];
    const layout = computePageLayout(pageInfo, 1.0, 2);
    assert.equal(layout.cssWidth, 595);
    assert.equal(layout.cssHeight, 842);
    assert.equal(layout.canvasWidth, 1190);
    assert.equal(layout.canvasHeight, 1684);
});

test('computePageLayout at zoom 0.5, dpr 1.5', () => {
    const pageInfo = [400, 600];
    const layout = computePageLayout(pageInfo, 0.5, 1.5);
    assert.equal(layout.cssWidth, 200);
    assert.equal(layout.cssHeight, 300);
    assert.equal(layout.canvasWidth, 300);
    assert.equal(layout.canvasHeight, 450);
});

test('computePageLayout enforces minimum dimension of 1', () => {
    const pageInfo = [1, 1];
    const layout = computePageLayout(pageInfo, 0.25, 1);
    assert.ok(layout.cssWidth >= 1, 'cssWidth should be at least 1');
    assert.ok(layout.cssHeight >= 1, 'cssHeight should be at least 1');
});

// ---------------------------------------------------------------------------
// computeFitZoom
// ---------------------------------------------------------------------------

test('computeFitZoom width mode fits page width to viewport', () => {
    const pageInfo = [595, 842];
    const zoom = computeFitZoom('width', pageInfo, 595, 1000);
    assert.ok(Math.abs(zoom - 1.0) < 0.01, `expected ~1.0 but got ${zoom}`);
});

test('computeFitZoom width mode scales down for narrow viewport', () => {
    const pageInfo = [595, 842];
    const zoom = computeFitZoom('width', pageInfo, 300, 1000);
    // safeWidth = max(300, 300) = 300; zoom = 300/595 ≈ 0.504
    assert.ok(zoom < 1.0, 'zoom should be less than 1.0');
    assert.ok(Math.abs(zoom - 300 / 595) < 0.01);
});

test('computeFitZoom page mode uses min of width and height fit', () => {
    const pageInfo = [595, 842];
    // Viewport that is taller than needed → width-constrained
    const zoom = computeFitZoom('page', pageInfo, 595, 1500);
    assert.ok(Math.abs(zoom - 1.0) < 0.01);
});

test('computeFitZoom page mode constrains by height when viewport is short', () => {
    const pageInfo = [595, 842];
    // Narrow and short → should pick the smaller of the two
    const zoom = computeFitZoom('page', pageInfo, 595, 421);
    // safeWidth = max(300, 595) = 595; safeHeight = max(300, 421) = 421
    // widthZoom = 595/595 = 1.0; heightZoom = 421/842 ≈ 0.5
    assert.ok(Math.abs(zoom - 421 / 842) < 0.01, `expected ~0.5 but got ${zoom}`);
});

test('computeFitZoom enforces minimum viewport of 300px', () => {
    const pageInfo = [595, 842];
    const zoom = computeFitZoom('width', pageInfo, 50, 50);
    // safeWidth = max(300, 50) = 300
    assert.ok(Math.abs(zoom - 300 / 595) < 0.01);
});

// ---------------------------------------------------------------------------
// computeToolbarState
// ---------------------------------------------------------------------------

test('computeToolbarState for first page', () => {
    const state = computeToolbarState(1, 10, 1.0);
    assert.equal(state.pageText, '1 / 10');
    assert.equal(state.prevDisabled, true);
    assert.equal(state.nextDisabled, false);
    assert.equal(state.zoomPercent, 100);
});

test('computeToolbarState for last page', () => {
    const state = computeToolbarState(10, 10, 1.5);
    assert.equal(state.pageText, '10 / 10');
    assert.equal(state.prevDisabled, false);
    assert.equal(state.nextDisabled, true);
    assert.equal(state.zoomPercent, 150);
});

test('computeToolbarState for middle page', () => {
    const state = computeToolbarState(5, 10, 0.75);
    assert.equal(state.pageText, '5 / 10');
    assert.equal(state.prevDisabled, false);
    assert.equal(state.nextDisabled, false);
    assert.equal(state.zoomPercent, 75);
});

test('computeToolbarState for single page document', () => {
    const state = computeToolbarState(1, 1, 2.0);
    assert.equal(state.pageText, '1 / 1');
    assert.equal(state.prevDisabled, true);
    assert.equal(state.nextDisabled, true);
    assert.equal(state.zoomPercent, 200);
});

// ---------------------------------------------------------------------------
// computeHistoryState
// ---------------------------------------------------------------------------

test('computeHistoryState with no edits', () => {
    const state = computeHistoryState(0, 0, 0);
    assert.equal(state.undoDisabled, true);
    assert.equal(state.redoDisabled, true);
    assert.equal(state.annotCountText, 'No pending edits');
});

test('computeHistoryState with some edits, no redo', () => {
    const state = computeHistoryState(2, 5, 0);
    assert.equal(state.undoDisabled, false);
    assert.equal(state.redoDisabled, true);
    assert.equal(state.annotCountText, 'Page edits: 2 · Total edits: 5');
});

test('computeHistoryState with edits and redo available', () => {
    const state = computeHistoryState(1, 3, 2);
    assert.equal(state.undoDisabled, false);
    assert.equal(state.redoDisabled, false);
    assert.equal(state.annotCountText, 'Page edits: 1 · Total edits: 3');
});

test('computeHistoryState with zero total but nonzero redo', () => {
    const state = computeHistoryState(0, 0, 3);
    assert.equal(state.undoDisabled, true);
    assert.equal(state.redoDisabled, false);
    assert.equal(state.annotCountText, 'No pending edits');
});

// ---------------------------------------------------------------------------
// findActivePageFromScroll
// ---------------------------------------------------------------------------

test('findActivePageFromScroll returns fallback when no pages', () => {
    assert.equal(findActivePageFromScroll([], 200, 1), 1);
});

test('findActivePageFromScroll picks closest page to anchor', () => {
    const pages = [
        { page: 1, top: 100 },
        { page: 2, top: 300 },
        { page: 3, top: 500 },
    ];
    // Anchor at 290 → closest to page 2 (top=300, distance=10)
    assert.equal(findActivePageFromScroll(pages, 290, 1), 2);
});

test('findActivePageFromScroll picks first page when anchor is above all pages', () => {
    const pages = [
        { page: 1, top: 200 },
        { page: 2, top: 400 },
    ];
    assert.equal(findActivePageFromScroll(pages, 50, 1), 1);
});

test('findActivePageFromScroll picks last page when anchor is below all pages', () => {
    const pages = [
        { page: 1, top: 100 },
        { page: 2, top: 300 },
        { page: 3, top: 500 },
    ];
    assert.equal(findActivePageFromScroll(pages, 1000, 1), 3);
});

test('findActivePageFromScroll breaks ties by taking first encountered', () => {
    const pages = [
        { page: 1, top: 100 },
        { page: 2, top: 200 },
    ];
    // Anchor at 150 → equidistant from both (50 each), but page 1 is encountered first
    assert.equal(findActivePageFromScroll(pages, 150, 5), 1);
});
