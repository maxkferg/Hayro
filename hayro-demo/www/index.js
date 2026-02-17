import init, { PdfViewer } from './hayro_demo.js';

let pdfViewer = null;
let currentImage = null;

// Annotation tool state
let currentTool = 'select';
let currentColor = [1, 0, 0]; // red default
let isDrawing = false;
let drawStartX = 0;
let drawStartY = 0;
let inkPoints = [];
let renderScale = 1.0;
let pageInfo = null;

async function run() {
    await init();

    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const fileSelector = document.getElementById('file-selector');
    const viewer = document.getElementById('viewer');
    const canvas = document.getElementById('pdf-canvas');
    const annotCanvas = document.getElementById('annotation-canvas');
    const prevButton = document.getElementById('prev-page');
    const nextButton = document.getElementById('next-page');
    const pageInfoEl = document.getElementById('page-info');
    const pageInput = document.getElementById('page-input');
    const dropOverlay = document.getElementById('drop-overlay');

    // Tool buttons
    const toolButtons = {
        select: document.getElementById('tool-select'),
        highlight: document.getElementById('tool-highlight'),
        rectangle: document.getElementById('tool-rectangle'),
        ink: document.getElementById('tool-ink'),
        text: document.getElementById('tool-text'),
    };

    // Action buttons
    const btnUndo = document.getElementById('btn-undo');
    const btnSave = document.getElementById('btn-save');
    const annotCountEl = document.getElementById('annot-count');

    // Color buttons
    const colorButtons = document.querySelectorAll('.color-btn');

    // Tool selection
    function setTool(tool) {
        currentTool = tool;
        Object.entries(toolButtons).forEach(([key, btn]) => {
            btn.classList.toggle('active', key === tool);
        });
        annotCanvas.classList.toggle('active', tool !== 'select');
        annotCanvas.style.cursor = tool === 'select' ? 'default' : 
            tool === 'ink' ? 'crosshair' :
            tool === 'text' ? 'text' : 'crosshair';
    }

    Object.entries(toolButtons).forEach(([tool, btn]) => {
        btn.addEventListener('click', () => setTool(tool));
    });

    // Color selection
    colorButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            colorButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentColor = btn.dataset.color.split(',').map(Number);
        });
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT') return;
        
        if (e.ctrlKey && e.key === 'z') {
            e.preventDefault();
            undoAnnotation();
            return;
        }

        switch (e.key.toLowerCase()) {
            case 'v': setTool('select'); break;
            case 'h': setTool('highlight'); break;
            case 'r': setTool('rectangle'); break;
            case 'p': setTool('ink'); break;
            case 't': setTool('text'); break;
            case 'arrowleft':
            case 'arrowup':
                e.preventDefault();
                if (pdfViewer && pdfViewer.previous_page()) renderCurrentPage();
                break;
            case 'arrowright':
            case 'arrowdown':
                e.preventDefault();
                if (pdfViewer && pdfViewer.next_page()) renderCurrentPage();
                break;
        }
    });

    // Undo
    btnUndo.addEventListener('click', undoAnnotation);
    function undoAnnotation() {
        if (pdfViewer && pdfViewer.undo_annotation()) {
            renderCurrentPage();
        }
    }

    // Save
    btnSave.addEventListener('click', () => {
        if (!pdfViewer) return;
        try {
            const bytes = pdfViewer.save();
            const blob = new Blob([bytes], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'annotated.pdf';
            a.click();
            URL.revokeObjectURL(url);
            console.info('PDF saved successfully');
        } catch (error) {
            console.error('Save failed:', error);
        }
    });

    // Annotation drawing on overlay canvas
    annotCanvas.addEventListener('mousedown', onMouseDown);
    annotCanvas.addEventListener('mousemove', onMouseMove);
    annotCanvas.addEventListener('mouseup', onMouseUp);
    annotCanvas.addEventListener('mouseleave', onMouseUp);

    function getCanvasPos(e) {
        const rect = annotCanvas.getBoundingClientRect();
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
    }

    function onMouseDown(e) {
        if (currentTool === 'select') return;
        
        const pos = getCanvasPos(e);
        isDrawing = true;
        drawStartX = pos.x;
        drawStartY = pos.y;
        inkPoints = [[pos.x, pos.y]];

        if (currentTool === 'text') {
            isDrawing = false;
            const text = prompt('Enter text:');
            if (text && text.trim()) {
                addTextAnnotation(pos.x, pos.y, text.trim());
            }
        }
    }

    function onMouseMove(e) {
        if (!isDrawing) return;
        
        const pos = getCanvasPos(e);
        const ctx = annotCanvas.getContext('2d');

        if (currentTool === 'ink') {
            inkPoints.push([pos.x, pos.y]);
            drawInkPreview(ctx);
        } else {
            drawRectPreview(ctx, drawStartX, drawStartY, pos.x, pos.y);
        }
    }

    function onMouseUp(e) {
        if (!isDrawing) return;
        isDrawing = false;
        
        const pos = getCanvasPos(e);
        const ctx = annotCanvas.getContext('2d');
        ctx.clearRect(0, 0, annotCanvas.width, annotCanvas.height);

        if (currentTool === 'ink' && inkPoints.length >= 2) {
            addInkAnnotation(inkPoints);
        } else if (currentTool === 'highlight') {
            addHighlightAnnotation(drawStartX, drawStartY, pos.x, pos.y);
        } else if (currentTool === 'rectangle') {
            addRectangleAnnotation(drawStartX, drawStartY, pos.x, pos.y);
        }

        inkPoints = [];
    }

    function drawInkPreview(ctx) {
        ctx.clearRect(0, 0, annotCanvas.width, annotCanvas.height);
        if (inkPoints.length < 2) return;
        
        ctx.strokeStyle = `rgb(${currentColor[0]*255}, ${currentColor[1]*255}, ${currentColor[2]*255})`;
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(inkPoints[0][0], inkPoints[0][1]);
        for (let i = 1; i < inkPoints.length; i++) {
            ctx.lineTo(inkPoints[i][0], inkPoints[i][1]);
        }
        ctx.stroke();
    }

    function drawRectPreview(ctx, x1, y1, x2, y2) {
        ctx.clearRect(0, 0, annotCanvas.width, annotCanvas.height);
        
        const [r, g, b] = currentColor;
        if (currentTool === 'highlight') {
            ctx.fillStyle = `rgba(${r*255}, ${g*255}, ${b*255}, 0.3)`;
            ctx.fillRect(
                Math.min(x1, x2), Math.min(y1, y2),
                Math.abs(x2 - x1), Math.abs(y2 - y1)
            );
        } else {
            ctx.strokeStyle = `rgb(${r*255}, ${g*255}, ${b*255})`;
            ctx.lineWidth = 2;
            ctx.strokeRect(
                Math.min(x1, x2), Math.min(y1, y2),
                Math.abs(x2 - x1), Math.abs(y2 - y1)
            );
        }
    }

    // Convert screen coordinates to PDF coordinates
    function screenToPdf(screenX, screenY) {
        if (!pageInfo) return [0, 0];
        
        const dpr = window.devicePixelRatio || 1;
        // The annotation canvas is at CSS pixel scale
        // Convert to PDF points by dividing by render scale
        const ptsX = screenX / renderScale;
        const ptsY = screenY / renderScale;
        
        // Screen is y-down, PDF is y-up
        // cropBox: [x0, y0, x1, y1]
        const cropX0 = pageInfo[2];
        const cropY0 = pageInfo[3];
        const cropX1 = pageInfo[4];
        const cropY1 = pageInfo[5];
        const rotation = pageInfo[6];

        if (rotation === 0) {
            return [cropX0 + ptsX, cropY1 - ptsY];
        } else if (rotation === 90) {
            return [cropX0 + ptsY, cropY0 + ptsX];
        } else if (rotation === 180) {
            return [cropX1 - ptsX, cropY0 + ptsY];
        } else {
            return [cropX1 - ptsY, cropY1 - ptsX];
        }
    }

    function addHighlightAnnotation(sx1, sy1, sx2, sy2) {
        if (!pdfViewer) return;
        
        const [px1, py1] = screenToPdf(sx1, sy1);
        const [px2, py2] = screenToPdf(sx2, sy2);
        
        // QuadPoints: 4 corners of the highlighted region
        // Order: top-left, top-right, bottom-left, bottom-right
        const minX = Math.min(px1, px2);
        const minY = Math.min(py1, py2);
        const maxX = Math.max(px1, px2);
        const maxY = Math.max(py1, py2);
        
        const quadPoints = new Float32Array([
            minX, maxY, maxX, maxY,
            minX, minY, maxX, minY
        ]);
        
        pdfViewer.add_highlight(quadPoints, currentColor[0], currentColor[1], currentColor[2]);
        renderCurrentPage();
    }

    function addRectangleAnnotation(sx1, sy1, sx2, sy2) {
        if (!pdfViewer) return;
        
        const [px1, py1] = screenToPdf(sx1, sy1);
        const [px2, py2] = screenToPdf(sx2, sy2);
        
        pdfViewer.add_rectangle(px1, py1, px2, py2, currentColor[0], currentColor[1], currentColor[2]);
        renderCurrentPage();
    }

    function addInkAnnotation(points) {
        if (!pdfViewer || points.length < 2) return;
        
        const pdfPoints = [];
        for (const [sx, sy] of points) {
            const [px, py] = screenToPdf(sx, sy);
            pdfPoints.push(px, py);
        }
        
        const flatPoints = new Float32Array(pdfPoints);
        pdfViewer.add_ink(flatPoints, currentColor[0], currentColor[1], currentColor[2], 2.0);
        renderCurrentPage();
    }

    function addTextAnnotation(sx, sy, text) {
        if (!pdfViewer) return;
        
        const [px, py] = screenToPdf(sx, sy);
        const fontSize = 12;
        const width = Math.max(text.length * fontSize * 0.6, 100);
        const height = fontSize * 2;
        
        pdfViewer.add_freetext(px, py - height, px + width, py, text, fontSize);
        renderCurrentPage();
    }

    // File handling
    dropZone.addEventListener('click', () => fileInput.click());

    const preventDefaults = (e) => {
        e.preventDefault();
        e.stopPropagation();
    };

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        document.addEventListener(eventName, preventDefaults, false);
    });

    function handlePDFDrop(e, files) {
        preventDefaults(e);
        dropZone.classList.remove('dragover');
        dropOverlay.style.display = 'none';
        if (files.length > 0) handleFile(files[0]);
    }

    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, (e) => {
            preventDefaults(e);
            dropZone.classList.add('dragover');
        }, false);
        viewer.addEventListener(eventName, (e) => {
            preventDefaults(e);
            if (pdfViewer) dropOverlay.style.display = 'flex';
        }, false);
    });

    ['dragleave'].forEach(eventName => {
        dropZone.addEventListener(eventName, (e) => {
            preventDefaults(e);
            dropZone.classList.remove('dragover');
        }, false);
        viewer.addEventListener(eventName, (e) => {
            preventDefaults(e);
            if (!viewer.contains(e.relatedTarget)) dropOverlay.style.display = 'none';
        }, false);
    });

    dropZone.addEventListener('drop', (e) => handlePDFDrop(e, e.dataTransfer.files), false);
    viewer.addEventListener('drop', (e) => handlePDFDrop(e, e.dataTransfer.files), false);

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) handleFile(e.target.files[0]);
    });

    prevButton.addEventListener('click', () => {
        if (pdfViewer && pdfViewer.previous_page()) renderCurrentPage();
    });

    nextButton.addEventListener('click', () => {
        if (pdfViewer && pdfViewer.next_page()) renderCurrentPage();
    });

    pageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const pageNum = parseInt(pageInput.value);
            if (pdfViewer && pdfViewer.set_page(pageNum)) {
                renderCurrentPage();
            } else {
                pageInput.value = pdfViewer ? pdfViewer.get_current_page() : 1;
            }
        }
    });

    async function handleFile(file) {
        if (file.type !== 'application/pdf') {
            console.error('Please select a PDF file.');
            return;
        }
        try {
            const arrayBuffer = await file.arrayBuffer();
            const uint8Array = new Uint8Array(arrayBuffer);
            await loadPDFData(uint8Array);
        } catch (error) {
            console.error('Error reading file:', error);
        }
    }

    async function loadPDFData(uint8Array) {
        try {
            pdfViewer = new PdfViewer();
            await pdfViewer.load_pdf(uint8Array);
            
            fileSelector.style.display = 'none';
            viewer.style.display = 'flex';
            
            renderCurrentPage();
        } catch (error) {
            console.error('Error loading PDF:', error);
            pdfViewer = null;
        }
    }

    async function renderCurrentPage() {
        if (!pdfViewer) return;

        try {
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight - 200; // account for toolbar + controls + logs
            const dpr = window.devicePixelRatio || 1;

            const result = pdfViewer.render_current_page(viewportWidth, viewportHeight, dpr);
            const width = result[0];
            const height = result[1];
            const rgbaData = result[2];

            const imageData = new ImageData(new Uint8ClampedArray(rgbaData), width, height);
            currentImage = { imageData, width, height };
            
            // Get page info for coordinate mapping
            pageInfo = pdfViewer.get_page_info();
            const pageWidthPts = pageInfo[0];
            const pageHeightPts = pageInfo[1];
            
            // Calculate render scale (CSS pixels per PDF point)
            const cssWidth = width / dpr;
            const cssHeight = height / dpr;
            renderScale = cssWidth / pageWidthPts;
            
            drawImage();
            updatePageInfo();
            updateAnnotationCount();
        } catch (error) {
            console.error('Error rendering page:', error);
        }
    }

    function drawImage() {
        if (!currentImage) return;

        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;

        canvas.width = currentImage.width;
        canvas.height = currentImage.height;
        canvas.style.width = (currentImage.width / dpr) + 'px';
        canvas.style.height = (currentImage.height / dpr) + 'px';

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.putImageData(currentImage.imageData, 0, 0);

        // Position annotation canvas on top of pdf-canvas
        const cssW = currentImage.width / dpr;
        const cssH = currentImage.height / dpr;
        
        annotCanvas.width = cssW;
        annotCanvas.height = cssH;
        annotCanvas.style.width = cssW + 'px';
        annotCanvas.style.height = cssH + 'px';
        
        // Position it over the PDF canvas
        const pdfRect = canvas.getBoundingClientRect();
        const containerRect = canvas.parentElement.getBoundingClientRect();
        annotCanvas.style.left = (pdfRect.left - containerRect.left) + 'px';
        annotCanvas.style.top = (pdfRect.top - containerRect.top) + 'px';
    }

    function updatePageInfo() {
        if (!pdfViewer) return;
        
        const currentPage = pdfViewer.get_current_page();
        const totalPages = pdfViewer.get_total_pages();
        
        pageInfoEl.textContent = `${currentPage} / ${totalPages}`;
        pageInput.value = currentPage;
        pageInput.max = totalPages;
        
        prevButton.disabled = currentPage === 1;
        nextButton.disabled = currentPage === totalPages;
    }

    function updateAnnotationCount() {
        if (!pdfViewer) return;
        const count = pdfViewer.get_annotation_count();
        annotCountEl.textContent = count > 0 ? `${count} annotation${count > 1 ? 's' : ''}` : '';
        btnUndo.disabled = count === 0;
    }

    window.addEventListener('resize', () => {
        if (currentImage) {
            drawImage();
        }
    });

    setupLogWindow();
}

function setupLogWindow() {
    const logContent = document.getElementById('log-content');
    const clearLogsButton = document.getElementById('clear-logs');

    logContent.innerHTML = '';

    window.addLogEntry = function(level, message) {
        const logEntry = document.createElement('div');
        logEntry.className = `log-entry ${level}`;
        
        const timestamp = new Date().toLocaleTimeString();
        logEntry.innerHTML = `<span class="log-timestamp">[${timestamp}]</span>${message}`;
        
        logContent.appendChild(logEntry);
        logContent.scrollTop = logContent.scrollHeight;
    };

    clearLogsButton.addEventListener('click', () => {
        logContent.innerHTML = '';
    });
    
    window.addLogEntry('info', 'Hayro PDF Demo initialized - Annotation tools available');

    const originalConsole = {
        warn: console.warn,
        error: console.error,
        log: console.log,
        info: console.info
    };

    console.warn = function(...args) {
        originalConsole.warn.apply(console, args);
        window.addLogEntry('warn', args.join(' '));
    };

    console.error = function(...args) {
        originalConsole.error.apply(console, args);
        window.addLogEntry('error', args.join(' '));
    };

    console.log = function(...args) {
        originalConsole.log.apply(console, args);
        window.addLogEntry('info', args.join(' '));
    };

    console.info = function(...args) {
        originalConsole.info.apply(console, args);
        window.addLogEntry('info', args.join(' '));
    };
}

run().catch(console.error);
