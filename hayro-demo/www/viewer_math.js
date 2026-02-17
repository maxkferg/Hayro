export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 5.0;

export function clampZoom(value, min = ZOOM_MIN, max = ZOOM_MAX) {
    if (!Number.isFinite(value)) {
        return min;
    }
    return Math.min(max, Math.max(min, value));
}

export function pdfToScreen(pageInfo, zoom, pdfX, pdfY) {
    const cropX0 = pageInfo[2];
    const cropY0 = pageInfo[3];
    const cropX1 = pageInfo[4];
    const cropY1 = pageInfo[5];
    const rotation = pageInfo[6];

    if (rotation === 0) {
        return [(pdfX - cropX0) * zoom, (cropY1 - pdfY) * zoom];
    }
    if (rotation === 90) {
        return [(pdfY - cropY0) * zoom, (pdfX - cropX0) * zoom];
    }
    if (rotation === 180) {
        return [(cropX1 - pdfX) * zoom, (pdfY - cropY0) * zoom];
    }
    return [(cropY1 - pdfY) * zoom, (cropX1 - pdfX) * zoom];
}

export function screenToPdf(pageInfo, zoom, screenX, screenY) {
    const cropX0 = pageInfo[2];
    const cropY0 = pageInfo[3];
    const cropX1 = pageInfo[4];
    const cropY1 = pageInfo[5];
    const rotation = pageInfo[6];
    const ptsX = screenX / zoom;
    const ptsY = screenY / zoom;

    if (rotation === 0) {
        return [cropX0 + ptsX, cropY1 - ptsY];
    }
    if (rotation === 90) {
        return [cropX0 + ptsY, cropY0 + ptsX];
    }
    if (rotation === 180) {
        return [cropX1 - ptsX, cropY0 + ptsY];
    }
    return [cropX1 - ptsY, cropY1 - ptsX];
}
