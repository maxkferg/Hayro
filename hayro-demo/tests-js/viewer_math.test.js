import assert from 'node:assert/strict';
import test from 'node:test';
import { ZOOM_MIN, ZOOM_MAX, clampZoom, pdfToScreen, screenToPdf } from '../www/viewer_math.js';

// ---------------------------------------------------------------------------
// clampZoom
// ---------------------------------------------------------------------------

test('clampZoom clamps to min and max bounds', () => {
    assert.equal(clampZoom(-1), ZOOM_MIN);
    assert.equal(clampZoom(0.5), 0.5);
    assert.equal(clampZoom(8), ZOOM_MAX);
    assert.equal(clampZoom(Number.NaN), ZOOM_MIN);
});

test('clampZoom with custom min/max arguments', () => {
    assert.equal(clampZoom(0.05, 0.1, 3.0), 0.1);
    assert.equal(clampZoom(4.0, 0.1, 3.0), 3.0);
    assert.equal(clampZoom(1.5, 0.1, 3.0), 1.5);
});

test('clampZoom handles Infinity and -Infinity', () => {
    assert.equal(clampZoom(Number.POSITIVE_INFINITY), ZOOM_MIN);
    assert.equal(clampZoom(Number.NEGATIVE_INFINITY), ZOOM_MIN);
});

test('clampZoom returns exact boundary values', () => {
    assert.equal(clampZoom(ZOOM_MIN), ZOOM_MIN);
    assert.equal(clampZoom(ZOOM_MAX), ZOOM_MAX);
});

// ---------------------------------------------------------------------------
// pdfToScreen / screenToPdf roundtrip — rotation 0
// ---------------------------------------------------------------------------

test('screenToPdf and pdfToScreen are inverse for rotation 0', () => {
    const pageInfo = [595, 842, 0, 0, 595, 842, 0];
    const zoom = 1.75;
    const originalPdf = [120, 640];
    const [sx, sy] = pdfToScreen(pageInfo, zoom, originalPdf[0], originalPdf[1]);
    const [px, py] = screenToPdf(pageInfo, zoom, sx, sy);
    assert.ok(Math.abs(px - originalPdf[0]) < 0.01);
    assert.ok(Math.abs(py - originalPdf[1]) < 0.01);
});

// ---------------------------------------------------------------------------
// pdfToScreen / screenToPdf roundtrip — rotation 90
// ---------------------------------------------------------------------------

test('screenToPdf and pdfToScreen are inverse for rotation 90', () => {
    const pageInfo = [842, 595, 0, 0, 595, 842, 90];
    const zoom = 2.0;
    const originalPdf = [180, 300];
    const [sx, sy] = pdfToScreen(pageInfo, zoom, originalPdf[0], originalPdf[1]);
    const [px, py] = screenToPdf(pageInfo, zoom, sx, sy);
    assert.ok(Math.abs(px - originalPdf[0]) < 0.01);
    assert.ok(Math.abs(py - originalPdf[1]) < 0.01);
});

// ---------------------------------------------------------------------------
// pdfToScreen / screenToPdf roundtrip — rotation 180
// ---------------------------------------------------------------------------

test('screenToPdf and pdfToScreen are inverse for rotation 180', () => {
    const pageInfo = [595, 842, 0, 0, 595, 842, 180];
    const zoom = 1.5;
    const originalPdf = [200, 500];
    const [sx, sy] = pdfToScreen(pageInfo, zoom, originalPdf[0], originalPdf[1]);
    const [px, py] = screenToPdf(pageInfo, zoom, sx, sy);
    assert.ok(Math.abs(px - originalPdf[0]) < 0.01, `px ${px} ≠ ${originalPdf[0]}`);
    assert.ok(Math.abs(py - originalPdf[1]) < 0.01, `py ${py} ≠ ${originalPdf[1]}`);
});

// ---------------------------------------------------------------------------
// pdfToScreen / screenToPdf roundtrip — rotation 270
// ---------------------------------------------------------------------------

test('screenToPdf and pdfToScreen are inverse for rotation 270', () => {
    const pageInfo = [842, 595, 0, 0, 595, 842, 270];
    const zoom = 0.8;
    const originalPdf = [350, 700];
    const [sx, sy] = pdfToScreen(pageInfo, zoom, originalPdf[0], originalPdf[1]);
    const [px, py] = screenToPdf(pageInfo, zoom, sx, sy);
    assert.ok(Math.abs(px - originalPdf[0]) < 0.01, `px ${px} ≠ ${originalPdf[0]}`);
    assert.ok(Math.abs(py - originalPdf[1]) < 0.01, `py ${py} ≠ ${originalPdf[1]}`);
});

// ---------------------------------------------------------------------------
// pdfToScreen with non-zero crop box offsets
// ---------------------------------------------------------------------------

test('pdfToScreen handles non-zero crop box offsets (rotation 0)', () => {
    // Crop box starts at (50, 100) and ends at (545, 742)
    const pageInfo = [495, 642, 50, 100, 545, 742, 0];
    const zoom = 1.0;
    // Point at crop origin (50, 742) should map to screen (0, 0) for rotation 0
    const [sx, sy] = pdfToScreen(pageInfo, zoom, 50, 742);
    assert.ok(Math.abs(sx) < 0.01, `sx should be ~0 but got ${sx}`);
    assert.ok(Math.abs(sy) < 0.01, `sy should be ~0 but got ${sy}`);
});

test('screenToPdf handles non-zero crop box offsets (rotation 0)', () => {
    const pageInfo = [495, 642, 50, 100, 545, 742, 0];
    const zoom = 1.0;
    // Screen origin (0, 0) should map to crop top-left corner in PDF space
    const [px, py] = screenToPdf(pageInfo, zoom, 0, 0);
    assert.ok(Math.abs(px - 50) < 0.01, `px should be ~50 but got ${px}`);
    assert.ok(Math.abs(py - 742) < 0.01, `py should be ~742 but got ${py}`);
});

// ---------------------------------------------------------------------------
// Boundary zoom values
// ---------------------------------------------------------------------------

test('pdfToScreen at ZOOM_MIN produces valid coordinates', () => {
    const pageInfo = [595, 842, 0, 0, 595, 842, 0];
    const [sx, sy] = pdfToScreen(pageInfo, ZOOM_MIN, 100, 400);
    assert.ok(Number.isFinite(sx), `sx should be finite but got ${sx}`);
    assert.ok(Number.isFinite(sy), `sy should be finite but got ${sy}`);
    assert.ok(sx >= 0, `sx should be non-negative at ZOOM_MIN`);
    assert.ok(sy >= 0, `sy should be non-negative at ZOOM_MIN`);
});

test('pdfToScreen at ZOOM_MAX produces valid coordinates', () => {
    const pageInfo = [595, 842, 0, 0, 595, 842, 0];
    const [sx, sy] = pdfToScreen(pageInfo, ZOOM_MAX, 100, 400);
    assert.ok(Number.isFinite(sx));
    assert.ok(Number.isFinite(sy));
    // At 5x zoom, screenX = (100 - 0) * 5 = 500
    assert.ok(Math.abs(sx - 500) < 0.01);
});

// ---------------------------------------------------------------------------
// pdfToScreen / screenToPdf roundtrip with non-zero crop + rotation
// ---------------------------------------------------------------------------

test('roundtrip with non-zero crop box and rotation 90', () => {
    const pageInfo = [642, 495, 50, 100, 545, 742, 90];
    const zoom = 1.3;
    const originalPdf = [200, 400];
    const [sx, sy] = pdfToScreen(pageInfo, zoom, originalPdf[0], originalPdf[1]);
    const [px, py] = screenToPdf(pageInfo, zoom, sx, sy);
    assert.ok(Math.abs(px - originalPdf[0]) < 0.01, `px ${px} ≠ ${originalPdf[0]}`);
    assert.ok(Math.abs(py - originalPdf[1]) < 0.01, `py ${py} ≠ ${originalPdf[1]}`);
});
