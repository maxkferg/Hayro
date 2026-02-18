import assert from 'node:assert/strict';
import test from 'node:test';
import {
    colorToCssRgb,
    colorToCssRgba,
    drawAnnotationOutlines,
    drawSelectionOverlay,
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

// ---------------------------------------------------------------------------
// drawSelectionOverlay (mock context)
// ---------------------------------------------------------------------------

function createFullMockContext(canvasWidth, canvasHeight) {
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
        save() { calls.push({ method: 'save' }); },
        restore() { calls.push({ method: 'restore' }); },
        setLineDash(v) { calls.push({ method: 'setLineDash', args: [v] }); },
        set strokeStyle(v) { calls.push({ method: 'set:strokeStyle', value: v }); },
        set fillStyle(v) { calls.push({ method: 'set:fillStyle', value: v }); },
        set lineWidth(v) { calls.push({ method: 'set:lineWidth', value: v }); },
        set lineCap(v) { calls.push({ method: 'set:lineCap', value: v }); },
        set lineJoin(v) { calls.push({ method: 'set:lineJoin', value: v }); },
        _calls: calls,
    };
}

test('drawSelectionOverlay draws dashed border and 8 handles', () => {
    const ctx = createFullMockContext(400, 400);
    drawSelectionOverlay(ctx, 50, 50, 200, 150);

    const methodNames = ctx._calls.map((c) => c.method);

    // Should call save/restore for the dashed border
    assert.ok(methodNames.includes('save'), 'should save context');
    assert.ok(methodNames.includes('restore'), 'should restore context');

    // Should call setLineDash for the dashed border
    assert.ok(methodNames.includes('setLineDash'), 'should set line dash');

    // Should have strokeRect calls (1 for border + 8 for handle outlines)
    const strokeRectCalls = ctx._calls.filter((c) => c.method === 'strokeRect');
    assert.ok(strokeRectCalls.length >= 9, `expected >= 9 strokeRect calls, got ${strokeRectCalls.length}`);

    // Should have 8 fillRect calls for handle backgrounds
    const fillRectCalls = ctx._calls.filter((c) => c.method === 'fillRect');
    assert.equal(fillRectCalls.length, 8, 'should draw 8 handle fills');
});

test('drawSelectionOverlay uses blue colors', () => {
    const ctx = createFullMockContext(400, 400);
    drawSelectionOverlay(ctx, 10, 10, 100, 100);

    const styleValues = ctx._calls
        .filter((c) => c.method === 'set:strokeStyle')
        .map((c) => c.value);
    assert.ok(styleValues.some((v) => v.includes('3f5cff')), 'should use blue stroke color');
});

// ---------------------------------------------------------------------------
// drawAnnotationOutlines (mock context)
// ---------------------------------------------------------------------------

test('drawAnnotationOutlines does nothing with empty rects', () => {
    const ctx = createFullMockContext(400, 400);
    drawAnnotationOutlines(ctx, []);
    assert.equal(ctx._calls.length, 0);
});

test('drawAnnotationOutlines draws one strokeRect per annotation', () => {
    const ctx = createFullMockContext(400, 400);
    drawAnnotationOutlines(ctx, [
        [10, 10, 100, 50],
        [20, 60, 200, 120],
        [30, 130, 150, 200],
    ]);

    const strokeRectCalls = ctx._calls.filter((c) => c.method === 'strokeRect');
    assert.equal(strokeRectCalls.length, 3, 'should draw 3 outline rects');
});

test('drawAnnotationOutlines uses dashed line style', () => {
    const ctx = createFullMockContext(400, 400);
    drawAnnotationOutlines(ctx, [[10, 10, 100, 100]]);

    const dashCalls = ctx._calls.filter((c) => c.method === 'setLineDash');
    assert.ok(dashCalls.length > 0, 'should call setLineDash');
    assert.ok(dashCalls[0].args[0].length > 0, 'dash pattern should not be empty');
});
