//! Coordinate space mapping utilities.
//!
//! PDF uses a coordinate system with the origin at the bottom-left of the page,
//! y-axis pointing up, measured in points (1/72 inch). Screens use a coordinate
//! system with the origin at the top-left, y-axis pointing down, measured in pixels.
//!
//! These utilities convert between the two coordinate systems.

/// Convert screen coordinates to PDF coordinates.
///
/// # Arguments
/// * `screen_x`, `screen_y` — position in screen pixels (y-down, origin top-left)
/// * `page_width_pts`, `page_height_pts` — the page dimensions in PDF points
/// * `crop_box` — the page's crop box `[x0, y0, x1, y1]` in PDF coordinates
/// * `rotation` — page rotation in degrees (0, 90, 180, 270)
/// * `scale` — the scale factor used when rendering (pixels per point)
///
/// # Returns
/// `(pdf_x, pdf_y)` in the PDF coordinate system.
pub fn screen_to_pdf(
    screen_x: f32,
    screen_y: f32,
    _page_width_pts: f32,
    _page_height_pts: f32,
    crop_box: [f32; 4],
    rotation: u32,
    scale: f32,
) -> (f32, f32) {
    // Convert from screen pixels to points (unscale)
    let x_pts = screen_x / scale;
    let y_pts = screen_y / scale;

    // The rendered image has page_width_pts × page_height_pts at scale=1.
    // Screen origin is top-left, PDF origin is bottom-left of crop box.
    // Also need to handle rotation.
    match rotation % 360 {
        0 => {
            let pdf_x = crop_box[0] + x_pts;
            let pdf_y = crop_box[3] - y_pts;
            (pdf_x, pdf_y)
        }
        90 => {
            // 90° rotation: screen x maps to pdf y, screen y maps to pdf x
            let pdf_x = crop_box[0] + y_pts;
            let pdf_y = crop_box[1] + x_pts;
            (pdf_x, pdf_y)
        }
        180 => {
            let pdf_x = crop_box[2] - x_pts;
            let pdf_y = crop_box[1] + y_pts;
            (pdf_x, pdf_y)
        }
        270 => {
            let pdf_x = crop_box[2] - y_pts;
            let pdf_y = crop_box[3] - x_pts;
            (pdf_x, pdf_y)
        }
        _ => {
            // Fallback: treat as 0
            let pdf_x = crop_box[0] + x_pts;
            let pdf_y = crop_box[3] - y_pts;
            (pdf_x, pdf_y)
        }
    }
}

/// Convert a screen-space rectangle to a PDF-space rectangle.
///
/// The input `screen_rect` is `[x0, y0, x1, y1]` in screen pixels.
/// Returns `[x0, y0, x1, y1]` in PDF coordinates (normalized so x0 < x1, y0 < y1).
pub fn screen_rect_to_pdf_rect(
    screen_rect: [f32; 4],
    page_width_pts: f32,
    page_height_pts: f32,
    crop_box: [f32; 4],
    rotation: u32,
    scale: f32,
) -> [f32; 4] {
    let (x0, y0) = screen_to_pdf(
        screen_rect[0],
        screen_rect[1],
        page_width_pts,
        page_height_pts,
        crop_box,
        rotation,
        scale,
    );
    let (x1, y1) = screen_to_pdf(
        screen_rect[2],
        screen_rect[3],
        page_width_pts,
        page_height_pts,
        crop_box,
        rotation,
        scale,
    );

    // Normalize so x0 < x1, y0 < y1
    [x0.min(x1), y0.min(y1), x0.max(x1), y0.max(y1)]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn screen_to_pdf_no_rotation() {
        // A4 page: 595 x 842 points, crop box at origin, scale 1.0
        let crop_box = [0.0, 0.0, 595.0, 842.0];
        let (px, py) = screen_to_pdf(0.0, 0.0, 595.0, 842.0, crop_box, 0, 1.0);
        // Top-left of screen → left edge, top of PDF
        assert!((px - 0.0).abs() < 0.01, "px={px}");
        assert!((py - 842.0).abs() < 0.01, "py={py}");

        let (px, py) = screen_to_pdf(595.0, 842.0, 595.0, 842.0, crop_box, 0, 1.0);
        // Bottom-right of screen → right edge, bottom of PDF
        assert!((px - 595.0).abs() < 0.01, "px={px}");
        assert!((py - 0.0).abs() < 0.01, "py={py}");
    }

    #[test]
    fn screen_to_pdf_with_scale() {
        let crop_box = [0.0, 0.0, 595.0, 842.0];
        let (px, py) = screen_to_pdf(100.0, 200.0, 595.0, 842.0, crop_box, 0, 2.0);
        // At scale 2.0, 100px = 50pts, 200px = 100pts
        assert!((px - 50.0).abs() < 0.01, "px={px}");
        assert!((py - (842.0 - 100.0)).abs() < 0.01, "py={py}");
    }

    #[test]
    fn screen_to_pdf_with_crop_offset() {
        let crop_box = [50.0, 50.0, 545.0, 792.0];
        let (px, py) = screen_to_pdf(0.0, 0.0, 495.0, 742.0, crop_box, 0, 1.0);
        assert!((px - 50.0).abs() < 0.01, "px={px}");
        assert!((py - 792.0).abs() < 0.01, "py={py}");
    }

    #[test]
    fn screen_rect_normalized() {
        let crop_box = [0.0, 0.0, 595.0, 842.0];
        let result = screen_rect_to_pdf_rect(
            [10.0, 10.0, 100.0, 100.0],
            595.0,
            842.0,
            crop_box,
            0,
            1.0,
        );
        // x0 < x1, y0 < y1
        assert!(result[0] < result[2], "x0 < x1: {:?}", result);
        assert!(result[1] < result[3], "y0 < y1: {:?}", result);
    }

    #[test]
    fn screen_to_pdf_rotation_90() {
        let crop_box = [0.0, 0.0, 595.0, 842.0];
        let (px, py) = screen_to_pdf(0.0, 0.0, 842.0, 595.0, crop_box, 90, 1.0);
        // At 90° rotation, screen top-left maps to PDF bottom-left
        assert!((px - 0.0).abs() < 0.01, "px={px}");
        assert!((py - 0.0).abs() < 0.01, "py={py}");
    }
}
