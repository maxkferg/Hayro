import init, { PdfViewer } from './hayro_demo.js';
import { ZOOM_MAX, ZOOM_MIN, clampZoom, pdfToScreen, screenToPdf } from './viewer_math.js';
import {
    clearCanvas as clearCanvasHelper,
    colorToCssRgb,
    colorToCssRgba,
    drawInkPreview as drawInkPreviewHelper,
    drawRectPreview as drawRectPreviewHelper,
    localPointer as localPointerHelper,
} from './draw_helpers.js';
import {
    ZOOM_STEP,
    computePageLayout,
    computeFitZoom,
    computeToolbarState,
    computeHistoryState,
    findActivePageFromScroll,
} from './state_helpers.js';

const state = {
    pdfViewer: null,
    pageInfos: [],
    pageNodes: new Map(),
    visiblePages: new Set(),
    renderCache: new Map(),
    renderEpoch: 0,
    renderScheduled: false,
    zoom: 1,
    activePage: 1,
    tool: 'select',
    color: [1, 0.2, 0.2],
    drawSession: null,
    observer: null,
};

let ui = null;

async function run() {
    await init();
    bindUi();
    bindFileLoading();
    bindToolbar();
    bindTools();
    bindHistory();
    setupLogWindow();
    setTool('select');
}

function bindUi() {
    ui = {
        openPdfButton: document.getElementById('open-pdf-btn'),
        saveButton: document.getElementById('btn-save'),
        fileInput: document.getElementById('file-input'),
        emptyState: document.getElementById('empty-state'),
        dropZone: document.getElementById('drop-zone'),
        viewer: document.getElementById('viewer'),
        viewerScroll: document.getElementById('viewer-scroll'),
        dropOverlay: document.getElementById('drop-overlay'),
        pageInfo: document.getElementById('page-info'),
        pageInput: document.getElementById('page-input'),
        prevPage: document.getElementById('prev-page'),
        nextPage: document.getElementById('next-page'),
        zoomIn: document.getElementById('zoom-in'),
        zoomOut: document.getElementById('zoom-out'),
        zoomInput: document.getElementById('zoom-input'),
        zoomFitWidth: document.getElementById('zoom-fit-width'),
        zoomFitPage: document.getElementById('zoom-fit-page'),
        undoButton: document.getElementById('btn-undo'),
        redoButton: document.getElementById('btn-redo'),
        annotCount: document.getElementById('annot-count'),
        clearLogs: document.getElementById('clear-logs'),
        toolButtons: {
            select: document.getElementById('tool-select'),
            highlight: document.getElementById('tool-highlight'),
            rectangle: document.getElementById('tool-rectangle'),
            ink: document.getElementById('tool-ink'),
            text: document.getElementById('tool-text'),
            textField: document.getElementById('tool-text-field'),
            signatureField: document.getElementById('tool-signature-field'),
        },
        colorButtons: document.querySelectorAll('.color-btn'),
    };
}

function bindFileLoading() {
    ui.openPdfButton.addEventListener('click', () => ui.fileInput.click());
    ui.dropZone.addEventListener('click', () => ui.fileInput.click());
    ui.fileInput.addEventListener('change', async (event) => {
        if (event.target.files.length > 0) {
            await handleFile(event.target.files[0]);
        }
    });

    const preventDefaults = (event) => {
        event.preventDefault();
        event.stopPropagation();
    };

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach((name) => {
        document.addEventListener(name, preventDefaults);
    });

    ['dragenter', 'dragover'].forEach((name) => {
        document.addEventListener(name, (event) => {
            preventDefaults(event);
            if (state.pdfViewer) {
                ui.dropOverlay.hidden = false;
            }
        });
    });

    ['dragleave', 'drop'].forEach((name) => {
        document.addEventListener(name, () => {
            ui.dropOverlay.hidden = true;
        });
    });

    document.addEventListener('drop', async (event) => {
        preventDefaults(event);
        const files = event.dataTransfer?.files;
        if (files && files.length > 0) {
            await handleFile(files[0]);
        }
    });
}

function bindToolbar() {
    ui.prevPage.addEventListener('click', () => scrollToPage(state.activePage - 1));
    ui.nextPage.addEventListener('click', () => scrollToPage(state.activePage + 1));
    ui.pageInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') {
            const page = parseInt(ui.pageInput.value, 10);
            scrollToPage(page);
        }
    });

    ui.zoomIn.addEventListener('click', () => setZoom(state.zoom + ZOOM_STEP));
    ui.zoomOut.addEventListener('click', () => setZoom(state.zoom - ZOOM_STEP));
    ui.zoomFitWidth.addEventListener('click', () => fitZoom('width'));
    ui.zoomFitPage.addEventListener('click', () => fitZoom('page'));
    ui.zoomInput.addEventListener('change', () => {
        const inputZoom = parseFloat(ui.zoomInput.value) / 100;
        setZoom(inputZoom);
    });

    ui.viewerScroll.addEventListener('scroll', () => {
        updateActivePageFromScroll();
    });

    ui.viewerScroll.addEventListener(
        'wheel',
        (event) => {
            if (!state.pdfViewer) return;
            if (!(event.ctrlKey || event.metaKey)) return;
            event.preventDefault();

            const rect = ui.viewerScroll.getBoundingClientRect();
            const cursorX = event.clientX - rect.left + ui.viewerScroll.scrollLeft;
            const cursorY = event.clientY - rect.top + ui.viewerScroll.scrollTop;
            const oldZoom = state.zoom;
            const factor = event.deltaY < 0 ? 1.1 : 0.9;
            setZoom(state.zoom * factor);
            const scaleRatio = state.zoom / oldZoom;
            ui.viewerScroll.scrollLeft = cursorX * scaleRatio - (event.clientX - rect.left);
            ui.viewerScroll.scrollTop = cursorY * scaleRatio - (event.clientY - rect.top);
        },
        { passive: false }
    );

    window.addEventListener('resize', () => {
        if (!state.pdfViewer) return;
        requestRenderVisible();
    });

    document.addEventListener('keydown', (event) => {
        if (!state.pdfViewer) return;
        if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') return;

        if ((event.ctrlKey || event.metaKey) && event.key === '=') {
            event.preventDefault();
            setZoom(state.zoom + ZOOM_STEP);
            return;
        }
        if ((event.ctrlKey || event.metaKey) && event.key === '-') {
            event.preventDefault();
            setZoom(state.zoom - ZOOM_STEP);
            return;
        }
        if ((event.ctrlKey || event.metaKey) && event.key === '0') {
            event.preventDefault();
            fitZoom('width');
            return;
        }

        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
            event.preventDefault();
            if (event.shiftKey) {
                redo();
            } else {
                undo();
            }
            return;
        }

        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
            event.preventDefault();
            redo();
            return;
        }

        switch (event.key.toLowerCase()) {
            case 'v':
                setTool('select');
                break;
            case 'h':
                setTool('highlight');
                break;
            case 'r':
                setTool('rectangle');
                break;
            case 'p':
                setTool('ink');
                break;
            case 't':
                setTool('text');
                break;
            case 'f':
                setTool('textField');
                break;
            case 's':
                setTool('signatureField');
                break;
            default:
                break;
        }
    });
}

function bindTools() {
    Object.entries(ui.toolButtons).forEach(([tool, button]) => {
        button.addEventListener('click', () => setTool(tool));
    });

    ui.colorButtons.forEach((button) => {
        button.addEventListener('click', () => {
            ui.colorButtons.forEach((candidate) => candidate.classList.remove('active'));
            button.classList.add('active');
            state.color = button.dataset.color.split(',').map(Number);
        });
    });

    ui.saveButton.addEventListener('click', saveDocument);
}

function bindHistory() {
    ui.undoButton.addEventListener('click', undo);
    ui.redoButton.addEventListener('click', redo);
}

async function handleFile(file) {
    if (file.type !== 'application/pdf') {
        console.error('Please choose a PDF file.');
        return;
    }

    try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        await loadPdfData(bytes);
        console.info(`Loaded ${file.name}`);
    } catch (error) {
        console.error('Failed to load PDF:', error);
    }
}

async function loadPdfData(bytes) {
    state.pdfViewer = new PdfViewer();
    state.pdfViewer.load_pdf(bytes);
    state.pageInfos = [];
    state.pageNodes.clear();
    state.visiblePages.clear();
    state.renderCache.clear();
    state.renderEpoch += 1;
    state.activePage = 1;

    const totalPages = state.pdfViewer.get_total_pages();
    for (let page = 1; page <= totalPages; page += 1) {
        const info = Array.from(state.pdfViewer.get_page_info_for(page));
        state.pageInfos.push(info);
    }

    ui.emptyState.hidden = true;
    ui.viewer.hidden = false;
    initializePageShells();
    layoutPages();
    fitZoom('width');
    updateToolbarState();
    updateHistoryState();
}

function initializePageShells() {
    if (state.observer) {
        state.observer.disconnect();
    }

    ui.viewerScroll.innerHTML = '';
    state.pageNodes.clear();
    state.visiblePages.clear();

    const observer = new IntersectionObserver(
        (entries) => {
            for (const entry of entries) {
                const page = parseInt(entry.target.dataset.page, 10);
                if (entry.isIntersecting) {
                    state.visiblePages.add(page);
                } else {
                    state.visiblePages.delete(page);
                }
            }
            requestRenderVisible();
        },
        {
            root: ui.viewerScroll,
            rootMargin: '500px',
            threshold: 0.01,
        }
    );
    state.observer = observer;

    for (let page = 1; page <= state.pageInfos.length; page += 1) {
        const shell = document.createElement('div');
        shell.className = 'page-shell';
        shell.dataset.page = String(page);

        const label = document.createElement('div');
        label.className = 'page-label';
        label.textContent = `Page ${page}`;

        const paper = document.createElement('div');
        paper.className = 'page-paper';

        const canvas = document.createElement('canvas');
        canvas.className = 'pdf-canvas';

        const textLayer = document.createElement('div');
        textLayer.className = 'text-layer';

        const annotationLayer = document.createElement('canvas');
        annotationLayer.className = 'annotation-layer';
        bindAnnotationLayer(annotationLayer, page);

        paper.appendChild(canvas);
        paper.appendChild(textLayer);
        paper.appendChild(annotationLayer);
        shell.appendChild(label);
        shell.appendChild(paper);
        ui.viewerScroll.appendChild(shell);

        observer.observe(shell);
        if (page <= 3) {
            state.visiblePages.add(page);
        }
        state.pageNodes.set(page, {
            shell,
            paper,
            canvas,
            textLayer,
            annotationLayer,
            renderedZoom: null,
            textZoom: null,
        });
    }
}

function bindAnnotationLayer(layer, page) {
    layer.addEventListener('pointerdown', (event) => {
        if (!state.pdfViewer || state.tool === 'select') return;

        const [x, y] = localPointer(layer, event);
        state.drawSession = {
            page,
            startX: x,
            startY: y,
            points: [[x, y]],
        };

        if (state.tool === 'text') {
            state.drawSession = null;
            const text = window.prompt('Text annotation content');
            if (text && text.trim()) {
                addTextAnnotation(page, x, y, text.trim());
            }
        }

        layer.setPointerCapture(event.pointerId);
    });

    layer.addEventListener('pointermove', (event) => {
        if (!state.drawSession || state.drawSession.page !== page) return;
        const [x, y] = localPointer(layer, event);
        const ctx = layer.getContext('2d');
        if (!ctx) return;

        if (state.tool === 'ink') {
            state.drawSession.points.push([x, y]);
            drawInkPreview(ctx, state.drawSession.points);
        } else {
            drawRectPreview(ctx, state.drawSession.startX, state.drawSession.startY, x, y);
        }
    });

    layer.addEventListener('pointerup', () => finishDraw(layer, page));
    layer.addEventListener('pointercancel', () => finishDraw(layer, page));
    layer.addEventListener('pointerleave', () => finishDraw(layer, page));
}

function finishDraw(layer, page) {
    if (!state.drawSession || state.drawSession.page !== page) return;
    const session = state.drawSession;
    state.drawSession = null;

    const ctx = layer.getContext('2d');
    if (ctx) {
        ctx.clearRect(0, 0, layer.width, layer.height);
    }

    if (state.tool === 'ink' && session.points.length >= 2) {
        addInkAnnotation(page, session.points);
        return;
    }

    if (session.points.length === 0) return;
    const [endX, endY] = session.points[session.points.length - 1];
    if (state.tool === 'highlight') {
        addHighlightAnnotation(page, session.startX, session.startY, endX, endY);
    } else if (state.tool === 'rectangle') {
        addRectangleAnnotation(page, session.startX, session.startY, endX, endY);
    } else if (state.tool === 'textField') {
        addTextField(page, session.startX, session.startY, endX, endY);
    } else if (state.tool === 'signatureField') {
        addSignatureField(page, session.startX, session.startY, endX, endY);
    }
}

function drawInkPreview(ctx, points) {
    drawInkPreviewHelper(ctx, points, state.color);
}

function drawRectPreview(ctx, x0, y0, x1, y1) {
    drawRectPreviewHelper(ctx, state.tool, x0, y0, x1, y1, state.color);
}

function clearCanvas(ctx) {
    clearCanvasHelper(ctx);
}

function localPointer(layer, event) {
    return localPointerHelper(layer.getBoundingClientRect(), event.clientX, event.clientY);
}

function setTool(tool) {
    state.tool = tool;
    Object.entries(ui.toolButtons).forEach(([name, button]) => {
        button.classList.toggle('active', name === tool);
    });

    for (const pageNode of state.pageNodes.values()) {
        pageNode.annotationLayer.classList.toggle('active', tool !== 'select');
        pageNode.textLayer.style.pointerEvents = tool === 'select' ? 'auto' : 'none';
    }
}

function setZoom(zoom) {
    if (!state.pdfViewer) return;
    const clamped = clampZoom(zoom);
    if (Math.abs(clamped - state.zoom) < 0.0001) return;
    state.zoom = clamped;
    state.renderCache.clear();
    state.renderEpoch += 1;
    layoutPages();
    updateToolbarState();
    requestRenderVisible();
}

function fitZoom(mode) {
    if (!state.pdfViewer || state.pageInfos.length === 0) return;
    const pageInfo = state.pageInfos[state.activePage - 1] ?? state.pageInfos[0];
    const viewportWidth = ui.viewerScroll.clientWidth - 40;
    const viewportHeight = ui.viewerScroll.clientHeight - 50;
    setZoom(computeFitZoom(mode, pageInfo, viewportWidth, viewportHeight));
}

function layoutPages() {
    const dpr = window.devicePixelRatio || 1;
    for (let page = 1; page <= state.pageInfos.length; page += 1) {
        const info = state.pageInfos[page - 1];
        const layout = computePageLayout(info, state.zoom, dpr);
        const node = state.pageNodes.get(page);
        if (!node) continue;

        node.shell.style.width = `${layout.cssWidth}px`;
        node.shell.style.height = `${layout.cssHeight}px`;
        node.paper.style.width = `${layout.cssWidth}px`;
        node.paper.style.height = `${layout.cssHeight}px`;
        node.canvas.style.width = `${layout.cssWidth}px`;
        node.canvas.style.height = `${layout.cssHeight}px`;
        node.canvas.width = layout.canvasWidth;
        node.canvas.height = layout.canvasHeight;
        node.annotationLayer.style.width = `${layout.cssWidth}px`;
        node.annotationLayer.style.height = `${layout.cssHeight}px`;
        node.annotationLayer.width = layout.cssWidth;
        node.annotationLayer.height = layout.cssHeight;
    }
}

function requestRenderVisible() {
    if (!state.pdfViewer) return;
    if (state.renderScheduled) return;
    state.renderScheduled = true;
    requestAnimationFrame(() => {
        state.renderScheduled = false;
        renderVisiblePages();
    });
}

function renderVisiblePages() {
    const visible = Array.from(state.visiblePages).sort((a, b) => a - b);
    for (const page of visible) {
        renderPage(page);
    }
}

function renderPage(page) {
    const node = state.pageNodes.get(page);
    if (!node || !state.pdfViewer) return;

    const dpr = window.devicePixelRatio || 1;
    const cacheKey = `${page}@${state.zoom.toFixed(4)}@${dpr.toFixed(2)}`;
    const cached = state.renderCache.get(cacheKey);

    if (cached) {
        drawCachedBitmap(node.canvas, cached, dpr);
        if (node.textZoom !== state.zoom) {
            renderTextLayer(page, node);
        }
        node.annotationLayer.classList.toggle('active', state.tool !== 'select');
        return;
    }

    try {
        const result = state.pdfViewer.render_page_scaled(page, state.zoom, dpr);
        const width = result[0];
        const height = result[1];
        const rgbaData = result[2];
        const imageData = new ImageData(new Uint8ClampedArray(rgbaData), width, height);
        state.renderCache.set(cacheKey, imageData);
        drawCachedBitmap(node.canvas, imageData, dpr);
        renderTextLayer(page, node);
        node.annotationLayer.classList.toggle('active', state.tool !== 'select');
    } catch (error) {
        console.error(`Failed to render page ${page}:`, error);
    }
}

function drawCachedBitmap(canvas, imageData, dpr) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = imageData.width;
    canvas.height = imageData.height;
    canvas.style.width = `${imageData.width / dpr}px`;
    canvas.style.height = `${imageData.height / dpr}px`;
    ctx.putImageData(imageData, 0, 0);
}

function renderTextLayer(page, node) {
    if (!state.pdfViewer) return;
    const pageInfo = state.pageInfos[page - 1];
    if (!pageInfo) return;

    const spans = state.pdfViewer.get_text_spans(page);
    node.textLayer.innerHTML = '';
    for (const spanData of spans) {
        const text = spanData[0];
        if (!text || !String(text).trim()) continue;

        const x0 = spanData[1];
        const y0 = spanData[2];
        const x1 = spanData[3];
        const y1 = spanData[4];
        const [screenRectX0, screenRectY0, screenRectX1, screenRectY1] = pdfRectToScreen(
            pageInfo,
            x0,
            y0,
            x1,
            y1
        );

        const span = document.createElement('span');
        span.className = 'text-span';
        span.textContent = text;
        span.style.left = `${screenRectX0}px`;
        span.style.top = `${screenRectY0}px`;
        span.style.width = `${Math.max(1, screenRectX1 - screenRectX0)}px`;
        span.style.height = `${Math.max(1, screenRectY1 - screenRectY0)}px`;
        span.style.fontSize = `${Math.max(8, screenRectY1 - screenRectY0)}px`;
        node.textLayer.appendChild(span);
    }

    node.textZoom = state.zoom;
}

function pdfRectToScreen(pageInfo, x0, y0, x1, y1) {
    const corners = [
        pdfToScreen(pageInfo, state.zoom, x0, y0),
        pdfToScreen(pageInfo, state.zoom, x1, y0),
        pdfToScreen(pageInfo, state.zoom, x0, y1),
        pdfToScreen(pageInfo, state.zoom, x1, y1),
    ];
    const xs = corners.map((entry) => entry[0]);
    const ys = corners.map((entry) => entry[1]);
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

function ensureCurrentPage(page) {
    if (!state.pdfViewer) return false;
    state.activePage = page;
    return state.pdfViewer.set_page(page);
}

function addHighlightAnnotation(page, sx0, sy0, sx1, sy1) {
    if (!state.pdfViewer || !ensureCurrentPage(page)) return;
    const pageInfo = state.pageInfos[page - 1];
    const [x0, y0] = screenToPdf(pageInfo, state.zoom, sx0, sy0);
    const [x1, y1] = screenToPdf(pageInfo, state.zoom, sx1, sy1);
    const minX = Math.min(x0, x1);
    const maxX = Math.max(x0, x1);
    const minY = Math.min(y0, y1);
    const maxY = Math.max(y0, y1);
    const quadPoints = new Float32Array([minX, maxY, maxX, maxY, minX, minY, maxX, minY]);
    state.pdfViewer.add_highlight(quadPoints, state.color[0], state.color[1], state.color[2]);
    refreshAfterMutation();
}

function addRectangleAnnotation(page, sx0, sy0, sx1, sy1) {
    if (!state.pdfViewer || !ensureCurrentPage(page)) return;
    const pageInfo = state.pageInfos[page - 1];
    const [x0, y0] = screenToPdf(pageInfo, state.zoom, sx0, sy0);
    const [x1, y1] = screenToPdf(pageInfo, state.zoom, sx1, sy1);
    state.pdfViewer.add_rectangle(x0, y0, x1, y1, state.color[0], state.color[1], state.color[2]);
    refreshAfterMutation();
}

function addInkAnnotation(page, points) {
    if (!state.pdfViewer || !ensureCurrentPage(page) || points.length < 2) return;
    const pageInfo = state.pageInfos[page - 1];
    const mapped = [];
    for (const [x, y] of points) {
        const [px, py] = screenToPdf(pageInfo, state.zoom, x, y);
        mapped.push(px, py);
    }
    state.pdfViewer.add_ink(new Float32Array(mapped), state.color[0], state.color[1], state.color[2], 2.0);
    refreshAfterMutation();
}

function addTextAnnotation(page, screenX, screenY, text) {
    if (!state.pdfViewer || !ensureCurrentPage(page)) return;
    const pageInfo = state.pageInfos[page - 1];
    const [x, y] = screenToPdf(pageInfo, state.zoom, screenX, screenY);
    const fontSize = 12;
    const width = Math.max(100, text.length * fontSize * 0.58);
    const height = fontSize * 2;
    state.pdfViewer.add_freetext(x, y - height, x + width, y, text, fontSize);
    refreshAfterMutation();
}

function addTextField(page, sx0, sy0, sx1, sy1) {
    if (!state.pdfViewer || !ensureCurrentPage(page)) return;
    const name = window.prompt('Text field name');
    if (!name || !name.trim()) return;
    const value = window.prompt('Initial value (optional)') ?? '';
    const pageInfo = state.pageInfos[page - 1];
    const [x0, y0] = screenToPdf(pageInfo, state.zoom, sx0, sy0);
    const [x1, y1] = screenToPdf(pageInfo, state.zoom, sx1, sy1);
    state.pdfViewer.add_text_field(x0, y0, x1, y1, name.trim(), value);
    refreshAfterMutation();
}

function addSignatureField(page, sx0, sy0, sx1, sy1) {
    if (!state.pdfViewer || !ensureCurrentPage(page)) return;
    const name = window.prompt('Signature field name');
    if (!name || !name.trim()) return;
    const pageInfo = state.pageInfos[page - 1];
    const [x0, y0] = screenToPdf(pageInfo, state.zoom, sx0, sy0);
    const [x1, y1] = screenToPdf(pageInfo, state.zoom, sx1, sy1);
    state.pdfViewer.add_signature_field(x0, y0, x1, y1, name.trim());
    refreshAfterMutation();
}

function refreshAfterMutation() {
    state.renderCache.clear();
    state.renderEpoch += 1;
    requestRenderVisible();
    updateHistoryState();
}

function undo() {
    if (!state.pdfViewer) return;
    if (state.pdfViewer.undo_annotation()) {
        refreshAfterMutation();
    }
}

function redo() {
    if (!state.pdfViewer) return;
    if (state.pdfViewer.redo_annotation()) {
        refreshAfterMutation();
    }
}

function scrollToPage(page) {
    if (!state.pdfViewer) return;
    const normalized = Math.max(1, Math.min(state.pageInfos.length, page));
    const node = state.pageNodes.get(normalized);
    if (!node) return;
    node.shell.scrollIntoView({ behavior: 'smooth', block: 'start' });
    state.activePage = normalized;
    state.pdfViewer.set_page(normalized);
    updateToolbarState();
}

function updateActivePageFromScroll() {
    if (!state.pdfViewer) return;
    const containerRect = ui.viewerScroll.getBoundingClientRect();
    const anchorY = containerRect.top + 80;

    const pagePositions = [];
    for (const [page, node] of state.pageNodes.entries()) {
        pagePositions.push({ page, top: node.shell.getBoundingClientRect().top });
    }

    const bestPage = findActivePageFromScroll(pagePositions, anchorY, state.activePage);

    if (bestPage !== state.activePage) {
        state.activePage = bestPage;
        state.pdfViewer.set_page(bestPage);
        updateToolbarState();
    }
}

function updateToolbarState() {
    if (!state.pdfViewer) return;
    const total = state.pageInfos.length;
    const tbState = computeToolbarState(state.activePage, total, state.zoom);
    ui.pageInfo.textContent = tbState.pageText;
    ui.pageInput.value = state.activePage;
    ui.pageInput.max = total;
    ui.prevPage.disabled = tbState.prevDisabled;
    ui.nextPage.disabled = tbState.nextDisabled;
    ui.zoomInput.value = tbState.zoomPercent;
}

function updateHistoryState() {
    if (!state.pdfViewer) {
        ui.undoButton.disabled = true;
        ui.redoButton.disabled = true;
        ui.annotCount.textContent = 'No pending edits';
        return;
    }

    const currentPageCount = state.pdfViewer.get_annotation_count();
    const totalCount = state.pdfViewer.get_operation_count();
    const redoCount = state.pdfViewer.get_redo_count();
    const histState = computeHistoryState(currentPageCount, totalCount, redoCount);
    ui.undoButton.disabled = histState.undoDisabled;
    ui.redoButton.disabled = histState.redoDisabled;
    ui.annotCount.textContent = histState.annotCountText;
}

function saveDocument() {
    if (!state.pdfViewer) return;
    try {
        const bytes = state.pdfViewer.save();
        const blob = new Blob([bytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'hayro-edited.pdf';
        link.click();
        URL.revokeObjectURL(url);
        console.info('Saved edited PDF');
    } catch (error) {
        console.error('Save failed:', error);
    }
}

function setupLogWindow() {
    const logContent = document.getElementById('log-content');
    logContent.innerHTML = '';
    window.addLogEntry = function addLogEntry(level, message) {
        const line = document.createElement('div');
        line.className = `log-entry ${level}`;
        const timestamp = new Date().toLocaleTimeString();
        line.innerHTML = `<span class="log-timestamp">[${timestamp}]</span>${message}`;
        logContent.appendChild(line);
        logContent.scrollTop = logContent.scrollHeight;
    };

    ui.clearLogs.addEventListener('click', () => {
        logContent.innerHTML = '';
    });

    const original = {
        log: console.log,
        info: console.info,
        warn: console.warn,
        error: console.error,
    };

    console.log = (...args) => {
        original.log(...args);
        window.addLogEntry('info', args.join(' '));
    };
    console.info = (...args) => {
        original.info(...args);
        window.addLogEntry('info', args.join(' '));
    };
    console.warn = (...args) => {
        original.warn(...args);
        window.addLogEntry('warn', args.join(' '));
    };
    console.error = (...args) => {
        original.error(...args);
        window.addLogEntry('error', args.join(' '));
    };

    window.addLogEntry('info', 'Hayro PDF Studio ready');
}

run().catch((error) => {
    console.error(error);
});
