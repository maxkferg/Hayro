import assert from 'node:assert/strict';
import test from 'node:test';
import { clampZoom, pdfToScreen, screenToPdf } from '../www/viewer_math.js';

test('clampZoom clamps to min and max bounds', () => {
    assert.equal(clampZoom(-1), 0.25);
    assert.equal(clampZoom(0.5), 0.5);
    assert.equal(clampZoom(8), 5);
    assert.equal(clampZoom(Number.NaN), 0.25);
});

test('screenToPdf and pdfToScreen are inverse for rotation 0', () => {
    const pageInfo = [595, 842, 0, 0, 595, 842, 0];
    const zoom = 1.75;
    const originalPdf = [120, 640];
    const [sx, sy] = pdfToScreen(pageInfo, zoom, originalPdf[0], originalPdf[1]);
    const [px, py] = screenToPdf(pageInfo, zoom, sx, sy);
    assert.ok(Math.abs(px - originalPdf[0]) < 0.01);
    assert.ok(Math.abs(py - originalPdf[1]) < 0.01);
});

test('screenToPdf and pdfToScreen are inverse for rotation 90', () => {
    const pageInfo = [842, 595, 0, 0, 595, 842, 90];
    const zoom = 2.0;
    const originalPdf = [180, 300];
    const [sx, sy] = pdfToScreen(pageInfo, zoom, originalPdf[0], originalPdf[1]);
    const [px, py] = screenToPdf(pageInfo, zoom, sx, sy);
    assert.ok(Math.abs(px - originalPdf[0]) < 0.01);
    assert.ok(Math.abs(py - originalPdf[1]) < 0.01);
});
