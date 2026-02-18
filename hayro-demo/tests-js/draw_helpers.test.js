import assert from 'node:assert/strict';
import test from 'node:test';
import {
    colorToCssRgb,
    colorToCssRgba,
    localPointer,
    clearCanvas,
    drawInkPreview,
    drawRectPreview,
} from '../www/draw_helpers.js';

// ---------------------------------------------------------------------------
// colorToCssRgb
// ---------------------------------------------------------------------------

test('colorToCssRgb converts normalized [0,0,0] to black', () => {
    assert.equal(colorToCssRgb([0, 0, 0]), 'rgb(0, 0, 0)');
});

test('colorToCssRgb converts normalized [1,1,1] to white', () => {
    assert.equal(colorToCssRgb([1, 1, 1]), 'rgb(255, 255, 255)');
});

test('colorToCssRgb converts normalized fractional values', () => {
    assert.equal(colorToCssRgb([1, 0.2, 0.2]), 'rgb(255, 51, 51)');
});

test('colorToCssRgb converts mid-range values', () => {
    assert.equal(colorToCssRgb([0.5, 0.5, 0.5]), 'rgb(128, 128, 128)');
});

// ---------------------------------------------------------------------------
// colorToCssRgba
// ---------------------------------------------------------------------------

test('colorToCssRgba includes alpha value', () => {
    assert.equal(colorToCssRgba([1, 1, 0], 0.3), 'rgba(255, 255, 0, 0.3)');
});

test('colorToCssRgba with zero alpha', () => {
    assert.equal(colorToCssRgba([0, 0, 0], 0), 'rgba(0, 0, 0, 0)');
});

// ---------------------------------------------------------------------------
// localPointer
// ---------------------------------------------------------------------------

test('localPointer computes relative coordinates from bounding rect', () => {
    const layerRect = { left: 100, top: 200 };
    const [x, y] = localPointer(layerRect, 150, 250);
    assert.equal(x, 50);
    assert.equal(y, 50);
});

test('localPointer returns zero when client matches layer origin', () => {
    const layerRect = { left: 300, top: 400 };
    const [x, y] = localPointer(layerRect, 300, 400);
    assert.equal(x, 0);
    assert.equal(y, 0);
});

test('localPointer handles negative relative positions', () => {
    const layerRect = { left: 500, top: 600 };
    const [x, y] = localPointer(layerRect, 490, 580);
    assert.equal(x, -10);
    assert.equal(y, -20);
});

// ---------------------------------------------------------------------------
// clearCanvas (mock context)
// ---------------------------------------------------------------------------

function createMockContext(canvasWidth, canvasHeight) {
    const calls = [];
    return {
        canvas: { width: canvasWidth, height: canvasHeight },
        clearRect(...args) { calls.push({ method: 'clearRect', args }); },
        fillRect(...args) { calls.push({ method: 'fillRect', args }); },
        strokeRect(...args) { calls.push({ method: 'strokeRect', args }); },
        beginPath() { calls.push({ method: 'beginPath' }); },
        moveTo(...args) { calls.push({ method: 'moveTo', args }); },
        lineTo(...args) { calls.push({ method: 'lineTo', args }); },
        stroke() { calls.push({ method: 'stroke' }); },
        set strokeStyle(v) { calls.push({ method: 'set:strokeStyle', value: v }); },
        set fillStyle(v) { calls.push({ method: 'set:fillStyle', value: v }); },
        set lineWidth(v) { calls.push({ method: 'set:lineWidth', value: v }); },
        set lineCap(v) { calls.push({ method: 'set:lineCap', value: v }); },
        set lineJoin(v) { calls.push({ method: 'set:lineJoin', value: v }); },
        _calls: calls,
    };
}

test('clearCanvas calls clearRect with full canvas dimensions', () => {
    const ctx = createMockContext(800, 600);
    clearCanvas(ctx);
    assert.equal(ctx._calls.length, 1);
    assert.equal(ctx._calls[0].method, 'clearRect');
    assert.deepEqual(ctx._calls[0].args, [0, 0, 800, 600]);
});

// ---------------------------------------------------------------------------
// drawInkPreview (mock context)
// ---------------------------------------------------------------------------

test('drawInkPreview does nothing with fewer than 2 points', () => {
    const ctx = createMockContext(100, 100);
    drawInkPreview(ctx, [[10, 20]], [1, 0, 0]);
    assert.equal(ctx._calls.length, 0);
});

test('drawInkPreview draws a stroke path for 3 points', () => {
    const ctx = createMockContext(200, 200);
    const points = [[10, 20], [30, 40], [50, 60]];
    drawInkPreview(ctx, points, [0, 0, 1]);

    // Should call: clearRect, then set stroke style/width/cap/join, beginPath, moveTo, 2x lineTo, stroke
    const methodNames = ctx._calls.map((c) => c.method);
    assert.ok(methodNames.includes('clearRect'), 'should clear canvas first');
    assert.ok(methodNames.includes('beginPath'), 'should begin path');
    assert.ok(methodNames.includes('moveTo'), 'should moveTo first point');
    assert.ok(methodNames.includes('stroke'), 'should stroke the path');

    // Verify moveTo is called with first point
    const moveToCall = ctx._calls.find((c) => c.method === 'moveTo');
    assert.deepEqual(moveToCall.args, [10, 20]);

    // Verify lineTo is called for subsequent points
    const lineToCalls = ctx._calls.filter((c) => c.method === 'lineTo');
    assert.equal(lineToCalls.length, 2);
    assert.deepEqual(lineToCalls[0].args, [30, 40]);
    assert.deepEqual(lineToCalls[1].args, [50, 60]);
});

// ---------------------------------------------------------------------------
// drawRectPreview (mock context)
// ---------------------------------------------------------------------------

test('drawRectPreview uses fillRect for highlight tool', () => {
    const ctx = createMockContext(400, 400);
    drawRectPreview(ctx, 'highlight', 10, 20, 110, 120, [1, 1, 0]);

    const methodNames = ctx._calls.map((c) => c.method);
    assert.ok(methodNames.includes('clearRect'), 'should clear canvas');
    assert.ok(methodNames.includes('fillRect'), 'highlight should use fillRect');
    assert.ok(!methodNames.includes('strokeRect'), 'highlight should NOT use strokeRect');

    const fillCall = ctx._calls.find((c) => c.method === 'fillRect');
    assert.deepEqual(fillCall.args, [10, 20, 100, 100]);
});

test('drawRectPreview uses strokeRect for rectangle tool', () => {
    const ctx = createMockContext(400, 400);
    drawRectPreview(ctx, 'rectangle', 10, 20, 110, 120, [1, 0, 0]);

    const methodNames = ctx._calls.map((c) => c.method);
    assert.ok(methodNames.includes('strokeRect'), 'rectangle should use strokeRect');
    assert.ok(!methodNames.includes('fillRect'), 'rectangle should NOT use fillRect');

    const strokeCall = ctx._calls.find((c) => c.method === 'strokeRect');
    assert.deepEqual(strokeCall.args, [10, 20, 100, 100]);
});

test('drawRectPreview normalizes reversed coordinates', () => {
    const ctx = createMockContext(400, 400);
    // End point is before start point (dragged up-left)
    drawRectPreview(ctx, 'rectangle', 200, 200, 100, 100, [0, 1, 0]);

    const strokeCall = ctx._calls.find((c) => c.method === 'strokeRect');
    // Should normalize: min(200,100)=100, min(200,100)=100, abs(100-200)=100, abs(100-200)=100
    assert.deepEqual(strokeCall.args, [100, 100, 100, 100]);
});
