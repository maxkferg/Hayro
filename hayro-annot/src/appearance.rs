//! Appearance stream generation for annotations.
//!
//! Each annotation type needs a visual representation stored as a PDF content
//! stream in the `/AP` → `/N` (Normal appearance) entry. These functions
//! generate those content streams.

use crate::types::*;
use pdf_writer::Content;

/// Generate the appearance stream for a highlight annotation.
///
/// Draws a semi-transparent colored rectangle over the annotation rect.
pub fn generate_highlight_appearance(annot: &HighlightAnnot) -> Vec<u8> {
    let color = annot.base.color.unwrap_or(AnnotColor::yellow());
    let rect = &annot.base.rect;
    let width = rect[2] - rect[0];
    let height = rect[3] - rect[1];

    let mut content = Content::new();
    content
        .set_fill_rgb(color.r, color.g, color.b)
        .rect(0.0, 0.0, width, height)
        .fill_nonzero();

    content.finish().into_vec()
}

/// Generate the appearance stream for an underline annotation.
///
/// Draws a colored line at the bottom of the annotation rect.
pub fn generate_underline_appearance(annot: &UnderlineAnnot) -> Vec<u8> {
    let color = annot.base.color.unwrap_or(AnnotColor::red());
    let rect = &annot.base.rect;
    let width = rect[2] - rect[0];

    let mut content = Content::new();
    content
        .set_stroke_rgb(color.r, color.g, color.b)
        .set_line_width(1.0)
        .move_to(0.0, 0.5)
        .line_to(width, 0.5)
        .stroke();

    content.finish().into_vec()
}

/// Generate the appearance stream for a strikeout annotation.
///
/// Draws a colored line through the middle of the annotation rect.
pub fn generate_strikeout_appearance(annot: &StrikeOutAnnot) -> Vec<u8> {
    let color = annot.base.color.unwrap_or(AnnotColor::red());
    let rect = &annot.base.rect;
    let width = rect[2] - rect[0];
    let height = rect[3] - rect[1];
    let mid_y = height / 2.0;

    let mut content = Content::new();
    content
        .set_stroke_rgb(color.r, color.g, color.b)
        .set_line_width(1.0)
        .move_to(0.0, mid_y)
        .line_to(width, mid_y)
        .stroke();

    content.finish().into_vec()
}

/// Generate the appearance stream for a squiggly underline annotation.
///
/// Draws a wavy colored line at the bottom of the annotation rect.
pub fn generate_squiggly_appearance(annot: &SquigglyAnnot) -> Vec<u8> {
    let color = annot.base.color.unwrap_or(AnnotColor::red());
    let rect = &annot.base.rect;
    let width = rect[2] - rect[0];

    let mut content = Content::new();
    content
        .set_stroke_rgb(color.r, color.g, color.b)
        .set_line_width(0.5);

    // Draw a wavy line using small segments
    let wave_height = 1.5_f32;
    let wave_length = 4.0_f32;
    let num_waves = (width / wave_length).ceil() as i32;

    content.move_to(0.0, 1.0);
    for i in 0..num_waves {
        let x_start = i as f32 * wave_length;
        let x_mid = x_start + wave_length / 2.0;
        let x_end = (x_start + wave_length).min(width);
        content.cubic_to(
            x_mid,
            1.0 + wave_height,
            x_mid,
            1.0 - wave_height,
            x_end,
            1.0,
        );
    }
    content.stroke();

    content.finish().into_vec()
}

/// Generate the appearance stream for an ink (freehand) annotation.
///
/// Strokes the ink paths.
pub fn generate_ink_appearance(annot: &InkAnnot) -> Vec<u8> {
    let color = annot.base.color.unwrap_or(AnnotColor::black());
    let rect = &annot.base.rect;
    let x_offset = rect[0];
    let y_offset = rect[1];

    let mut content = Content::new();
    content
        .set_stroke_rgb(color.r, color.g, color.b)
        .set_line_width(annot.line_width)
        .set_line_cap(pdf_writer::types::LineCapStyle::RoundCap)
        .set_line_join(pdf_writer::types::LineJoinStyle::RoundJoin);

    for path in &annot.ink_list {
        if let Some(first) = path.first() {
            content.move_to(first[0] - x_offset, first[1] - y_offset);
            for point in path.iter().skip(1) {
                content.line_to(point[0] - x_offset, point[1] - y_offset);
            }
            content.stroke();
        }
    }

    content.finish().into_vec()
}

/// Generate the appearance stream for a free text annotation.
///
/// Draws a white background with optional border, then renders text.
pub fn generate_freetext_appearance(annot: &FreeTextAnnot) -> Vec<u8> {
    let rect = &annot.base.rect;
    let width = rect[2] - rect[0];
    let height = rect[3] - rect[1];
    let color = annot.base.color.unwrap_or(AnnotColor::black());

    let mut content = Content::new();

    // Draw white background
    content
        .set_fill_rgb(1.0, 1.0, 1.0)
        .rect(0.0, 0.0, width, height)
        .fill_nonzero();

    // Draw border
    content
        .set_stroke_rgb(0.0, 0.0, 0.0)
        .set_line_width(0.5)
        .rect(0.0, 0.0, width, height)
        .stroke();

    // Draw text
    let font_size = annot.font_size;
    let margin = 2.0_f32;
    let text_y = height - font_size - margin;

    content.begin_text();
    content.set_font(pdf_writer::Name(b"Helv"), font_size);
    content.set_fill_rgb(color.r, color.g, color.b);
    content.next_line(margin, text_y);
    content.show(pdf_writer::Str(annot.text.as_bytes()));
    content.end_text();

    content.finish().into_vec()
}

/// Generate the appearance stream for a square (rectangle) annotation.
pub fn generate_square_appearance(annot: &ShapeAnnot) -> Vec<u8> {
    let rect = &annot.base.rect;
    let width = rect[2] - rect[0];
    let height = rect[3] - rect[1];
    let color = annot.base.color.unwrap_or(AnnotColor::black());
    let half_lw = annot.line_width / 2.0;

    let mut content = Content::new();

    // Fill interior if color specified
    if let Some(ic) = &annot.interior_color {
        content
            .set_fill_rgb(ic.r, ic.g, ic.b)
            .rect(
                half_lw,
                half_lw,
                width - annot.line_width,
                height - annot.line_width,
            )
            .fill_nonzero();
    }

    // Stroke border
    content
        .set_stroke_rgb(color.r, color.g, color.b)
        .set_line_width(annot.line_width)
        .rect(
            half_lw,
            half_lw,
            width - annot.line_width,
            height - annot.line_width,
        )
        .stroke();

    content.finish().into_vec()
}

/// Generate the appearance stream for a circle (ellipse) annotation.
///
/// Approximates an ellipse using four cubic Bézier curves.
pub fn generate_circle_appearance(annot: &ShapeAnnot) -> Vec<u8> {
    let rect = &annot.base.rect;
    let width = rect[2] - rect[0];
    let height = rect[3] - rect[1];
    let color = annot.base.color.unwrap_or(AnnotColor::black());

    let cx = width / 2.0;
    let cy = height / 2.0;
    let rx = (width - annot.line_width) / 2.0;
    let ry = (height - annot.line_width) / 2.0;

    // Magic number for Bézier circle approximation: 4/3 * (sqrt(2) - 1) ≈ 0.5523
    let kappa = 0.5523_f32;
    let kx = rx * kappa;
    let ky = ry * kappa;

    let mut content = Content::new();

    let draw_ellipse = |content: &mut Content| {
        content.move_to(cx + rx, cy);
        content.cubic_to(cx + rx, cy + ky, cx + kx, cy + ry, cx, cy + ry);
        content.cubic_to(cx - kx, cy + ry, cx - rx, cy + ky, cx - rx, cy);
        content.cubic_to(cx - rx, cy - ky, cx - kx, cy - ry, cx, cy - ry);
        content.cubic_to(cx + kx, cy - ry, cx + rx, cy - ky, cx + rx, cy);
        content.close_path();
    };

    // Fill interior if color specified
    if let Some(ic) = &annot.interior_color {
        content.set_fill_rgb(ic.r, ic.g, ic.b);
        draw_ellipse(&mut content);
        content.fill_nonzero();
    }

    // Stroke border
    content
        .set_stroke_rgb(color.r, color.g, color.b)
        .set_line_width(annot.line_width);
    draw_ellipse(&mut content);
    content.stroke();

    content.finish().into_vec()
}

/// Generate the appearance stream for a line annotation.
pub fn generate_line_appearance(annot: &LineAnnot) -> Vec<u8> {
    let color = annot.base.color.unwrap_or(AnnotColor::black());
    let rect = &annot.base.rect;
    let x_off = rect[0];
    let y_off = rect[1];

    let mut content = Content::new();
    content
        .set_stroke_rgb(color.r, color.g, color.b)
        .set_line_width(annot.line_width)
        .set_line_cap(pdf_writer::types::LineCapStyle::RoundCap)
        .move_to(annot.start[0] - x_off, annot.start[1] - y_off)
        .line_to(annot.end[0] - x_off, annot.end[1] - y_off)
        .stroke();

    content.finish().into_vec()
}

/// Generate the appearance stream for a text (sticky note) annotation.
///
/// Draws a simple note icon — a small yellow square with a folded corner.
pub fn generate_text_appearance(_annot: &TextAnnot) -> Vec<u8> {
    let size = 24.0_f32;

    let mut content = Content::new();

    // Yellow background
    content
        .set_fill_rgb(1.0, 1.0, 0.8)
        .rect(0.5, 0.5, size - 1.0, size - 1.0)
        .fill_nonzero();

    // Border
    content
        .set_stroke_rgb(0.5, 0.5, 0.0)
        .set_line_width(0.5)
        .rect(0.5, 0.5, size - 1.0, size - 1.0)
        .stroke();

    // Folded corner triangle
    let fold = 5.0_f32;
    content
        .set_fill_rgb(0.9, 0.9, 0.7)
        .move_to(size - fold - 0.5, size - 0.5)
        .line_to(size - 0.5, size - 0.5)
        .line_to(size - 0.5, size - fold - 0.5)
        .close_path()
        .fill_nonzero();

    // Fold line
    content
        .set_stroke_rgb(0.5, 0.5, 0.0)
        .move_to(size - fold - 0.5, size - 0.5)
        .line_to(size - fold - 0.5, size - fold - 0.5)
        .line_to(size - 0.5, size - fold - 0.5)
        .stroke();

    content.finish().into_vec()
}

/// Generate appearance for a text form field widget.
pub fn generate_text_field_appearance(annot: &TextFieldAnnot) -> Vec<u8> {
    let rect = &annot.base.rect;
    let width = (rect[2] - rect[0]).max(1.0);
    let height = (rect[3] - rect[1]).max(1.0);
    let text = annot.value.as_deref().unwrap_or_default();

    let mut content = Content::new();
    content
        .set_fill_rgb(1.0, 1.0, 1.0)
        .rect(0.0, 0.0, width, height)
        .fill_nonzero()
        .set_stroke_rgb(0.2, 0.2, 0.2)
        .set_line_width(1.0)
        .rect(0.5, 0.5, width - 1.0, height - 1.0)
        .stroke();

    if !text.is_empty() {
        content.begin_text();
        content.set_font(pdf_writer::Name(b"Helv"), 10.0);
        content.set_fill_rgb(0.0, 0.0, 0.0);
        content.next_line(3.0, (height - 12.0).max(2.0));
        content.show(pdf_writer::Str(text.as_bytes()));
        content.end_text();
    }

    content.finish().into_vec()
}

/// Generate appearance for a signature form field widget.
pub fn generate_signature_field_appearance(annot: &SignatureFieldAnnot) -> Vec<u8> {
    let rect = &annot.base.rect;
    let width = (rect[2] - rect[0]).max(1.0);
    let height = (rect[3] - rect[1]).max(1.0);

    let mut content = Content::new();
    content
        .set_fill_rgb(1.0, 1.0, 1.0)
        .rect(0.0, 0.0, width, height)
        .fill_nonzero()
        .set_stroke_rgb(0.1, 0.2, 0.5)
        .set_line_width(1.2)
        .rect(0.6, 0.6, width - 1.2, height - 1.2)
        .stroke();

    // Signature line.
    let line_y = (height * 0.35).max(8.0).min(height - 4.0);
    content
        .set_stroke_rgb(0.3, 0.3, 0.3)
        .set_line_width(0.8)
        .move_to(6.0, line_y)
        .line_to((width - 6.0).max(6.0), line_y)
        .stroke();

    content.begin_text();
    content.set_font(pdf_writer::Name(b"Helv"), 8.0);
    content.set_fill_rgb(0.2, 0.2, 0.2);
    content.next_line(6.0, (line_y + 2.0).min(height - 10.0));
    content.show(pdf_writer::Str(b"Sign here"));
    content.end_text();

    content.finish().into_vec()
}

/// Generate the appearance stream for any annotation type.
pub fn generate_appearance(annot: &Annotation) -> Vec<u8> {
    match annot {
        Annotation::Highlight(a) => generate_highlight_appearance(a),
        Annotation::Underline(a) => generate_underline_appearance(a),
        Annotation::StrikeOut(a) => generate_strikeout_appearance(a),
        Annotation::Squiggly(a) => generate_squiggly_appearance(a),
        Annotation::FreeText(a) => generate_freetext_appearance(a),
        Annotation::Ink(a) => generate_ink_appearance(a),
        Annotation::Square(a) => generate_square_appearance(a),
        Annotation::Circle(a) => generate_circle_appearance(a),
        Annotation::Line(a) => generate_line_appearance(a),
        Annotation::Text(a) => generate_text_appearance(a),
        Annotation::TextField(a) => generate_text_field_appearance(a),
        Annotation::SignatureField(a) => generate_signature_field_appearance(a),
        Annotation::Link(_) => {
            // Links typically don't have visible appearance streams
            Vec::new()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn highlight_appearance_contains_fill() {
        let annot = HighlightAnnot {
            base: AnnotationBase {
                rect: [100.0, 200.0, 300.0, 220.0],
                color: Some(AnnotColor::yellow()),
                ..Default::default()
            },
            quad_points: vec![],
        };
        let bytes = generate_highlight_appearance(&annot);
        let s = String::from_utf8_lossy(&bytes);
        assert!(s.contains("rg"), "should set fill color: {s}");
        assert!(s.contains("re"), "should draw rectangle: {s}");
        assert!(s.contains("f"), "should fill: {s}");
    }

    #[test]
    fn ink_appearance_contains_stroke() {
        let annot = InkAnnot {
            base: AnnotationBase {
                rect: [50.0, 50.0, 150.0, 150.0],
                color: Some(AnnotColor::red()),
                ..Default::default()
            },
            ink_list: vec![vec![[60.0, 60.0], [100.0, 100.0], [140.0, 60.0]]],
            line_width: 2.0,
        };
        let bytes = generate_ink_appearance(&annot);
        let s = String::from_utf8_lossy(&bytes);
        assert!(s.contains("RG"), "should set stroke color: {s}");
        assert!(s.contains("m"), "should have moveto: {s}");
        assert!(s.contains("l"), "should have lineto: {s}");
        assert!(s.contains("S"), "should stroke: {s}");
    }

    #[test]
    fn square_appearance_contains_rect() {
        let annot = ShapeAnnot {
            base: AnnotationBase {
                rect: [100.0, 100.0, 200.0, 200.0],
                color: Some(AnnotColor::black()),
                ..Default::default()
            },
            interior_color: None,
            line_width: 1.0,
            is_circle: false,
        };
        let bytes = generate_square_appearance(&annot);
        let s = String::from_utf8_lossy(&bytes);
        assert!(s.contains("re"), "should draw rectangle: {s}");
        assert!(s.contains("S"), "should stroke: {s}");
    }

    #[test]
    fn circle_appearance_contains_curves() {
        let annot = ShapeAnnot {
            base: AnnotationBase {
                rect: [100.0, 100.0, 200.0, 200.0],
                color: Some(AnnotColor::black()),
                ..Default::default()
            },
            interior_color: None,
            line_width: 1.0,
            is_circle: true,
        };
        let bytes = generate_circle_appearance(&annot);
        let s = String::from_utf8_lossy(&bytes);
        assert!(s.contains("c"), "should have cubic curves: {s}");
        assert!(s.contains("S"), "should stroke: {s}");
    }

    #[test]
    fn freetext_appearance_contains_text() {
        let annot = FreeTextAnnot {
            base: AnnotationBase {
                rect: [100.0, 100.0, 300.0, 140.0],
                ..Default::default()
            },
            text: "Hello".to_string(),
            font_size: 12.0,
            default_appearance: "0 0 0 rg /Helv 12 Tf".to_string(),
        };
        let bytes = generate_freetext_appearance(&annot);
        let s = String::from_utf8_lossy(&bytes);
        assert!(s.contains("BT"), "should begin text: {s}");
        assert!(s.contains("ET"), "should end text: {s}");
        assert!(s.contains("Tf"), "should set font: {s}");
        assert!(s.contains("Tj"), "should show text: {s}");
    }

    #[test]
    fn line_appearance_contains_line() {
        let annot = LineAnnot {
            base: AnnotationBase {
                rect: [100.0, 100.0, 300.0, 200.0],
                color: Some(AnnotColor::red()),
                ..Default::default()
            },
            start: [100.0, 100.0],
            end: [300.0, 200.0],
            line_width: 2.0,
        };
        let bytes = generate_line_appearance(&annot);
        let s = String::from_utf8_lossy(&bytes);
        assert!(s.contains("m"), "should have moveto: {s}");
        assert!(s.contains("l"), "should have lineto: {s}");
        assert!(s.contains("S"), "should stroke: {s}");
    }

    #[test]
    fn text_appearance_generates_icon() {
        let annot = TextAnnot {
            base: AnnotationBase {
                rect: [100.0, 100.0, 124.0, 124.0],
                ..Default::default()
            },
            open: false,
            icon: "Note".to_string(),
        };
        let bytes = generate_text_appearance(&annot);
        let s = String::from_utf8_lossy(&bytes);
        assert!(!s.is_empty(), "should generate something");
        assert!(s.contains("re"), "should draw rectangle: {s}");
    }

    #[test]
    fn text_field_appearance_contains_border() {
        let annot = TextFieldAnnot {
            base: AnnotationBase {
                rect: [100.0, 100.0, 260.0, 132.0],
                ..Default::default()
            },
            field_name: "name".to_string(),
            value: Some("Alice".to_string()),
            default_value: None,
            max_len: Some(32),
            default_appearance: "0 0 0 rg /Helv 10 Tf".to_string(),
            read_only: false,
            required: false,
            multiline: false,
        };
        let bytes = generate_text_field_appearance(&annot);
        let s = String::from_utf8_lossy(&bytes);
        assert!(s.contains("re"), "should draw rectangle: {s}");
        assert!(s.contains("Tj"), "should render text: {s}");
    }

    #[test]
    fn signature_field_appearance_contains_label() {
        let annot = SignatureFieldAnnot {
            base: AnnotationBase {
                rect: [100.0, 100.0, 300.0, 160.0],
                ..Default::default()
            },
            field_name: "signature".to_string(),
            tooltip: None,
            required: false,
        };
        let bytes = generate_signature_field_appearance(&annot);
        let s = String::from_utf8_lossy(&bytes);
        assert!(s.contains("re"), "should draw border: {s}");
        assert!(s.contains("Sign here"), "should include helper label: {s}");
    }
}
