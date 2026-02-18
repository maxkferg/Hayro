//! Text extraction utilities.
//!
//! This module exposes a lightweight text extraction pipeline built on top of the
//! interpreter's [`crate::Device`] abstraction. The extraction is based on glyphs
//! encountered during interpretation and returns positioned text spans in page
//! coordinate space.

use crate::font::Glyph;
use crate::{
    BlendMode, ClipPath, Context, Device, GlyphDrawMode, Image, InterpreterSettings, Paint,
    PathDrawMode, SoftMask, interpret_page,
};
use hayro_cmap::BfString;
use hayro_syntax::page::Page;
use kurbo::{Affine, BezPath, Point, Rect, Shape};

/// A text span extracted from a page.
#[derive(Debug, Clone, PartialEq)]
pub struct TextSpan {
    /// The extracted UTF-8 text.
    pub text: String,
    /// The span bounding box in page coordinates: `[x0, y0, x1, y1]`.
    pub bbox: [f32; 4],
    /// Baseline anchor in page coordinates `[x, y]`.
    pub baseline: [f32; 2],
}

/// Extract positioned text spans from a page.
///
/// The resulting coordinates are expressed in page space and can be transformed
/// to screen space by the caller as needed.
pub fn extract_text_spans(page: &Page<'_>, settings: &InterpreterSettings) -> Vec<TextSpan> {
    let crop = page.intersected_crop_box();
    let mut context = Context::new(
        Affine::IDENTITY,
        Rect::new(crop.x0, crop.y0, crop.x1, crop.y1),
        page.xref(),
        settings.clone(),
    );
    let mut extractor = TextExtractor::default();
    interpret_page(page, &mut context, &mut extractor);
    extractor.into_spans()
}

#[derive(Debug, Clone)]
struct GlyphFragment {
    text: String,
    bbox: Rect,
    baseline: Point,
}

#[derive(Default)]
struct TextExtractor {
    fragments: Vec<GlyphFragment>,
}

impl TextExtractor {
    fn into_spans(self) -> Vec<TextSpan> {
        merge_fragments(self.fragments)
            .into_iter()
            .map(|f| TextSpan {
                text: f.text,
                bbox: [
                    f.bbox.x0 as f32,
                    f.bbox.y0 as f32,
                    f.bbox.x1 as f32,
                    f.bbox.y1 as f32,
                ],
                baseline: [f.baseline.x as f32, f.baseline.y as f32],
            })
            .collect()
    }
}

impl Device<'_> for TextExtractor {
    fn set_soft_mask(&mut self, _: Option<SoftMask<'_>>) {}

    fn set_blend_mode(&mut self, _: BlendMode) {}

    fn draw_path(&mut self, _: &BezPath, _: Affine, _: &Paint<'_>, _: &PathDrawMode) {}

    fn push_clip_path(&mut self, _: &ClipPath) {}

    fn push_transparency_group(&mut self, _: f32, _: Option<SoftMask<'_>>, _: BlendMode) {}

    fn draw_glyph(
        &mut self,
        glyph: &Glyph<'_>,
        transform: Affine,
        glyph_transform: Affine,
        _: &Paint<'_>,
        _: &GlyphDrawMode,
    ) {
        let text = glyph_to_text(glyph);
        if text.is_empty() {
            return;
        }

        let full_transform = transform * glyph_transform;
        let baseline = full_transform * Point::ZERO;
        let bbox = glyph_bbox(glyph, full_transform);

        self.fragments.push(GlyphFragment {
            text,
            bbox,
            baseline,
        });
    }

    fn draw_image(&mut self, _: Image<'_, '_>, _: Affine) {}

    fn pop_clip_path(&mut self) {}

    fn pop_transparency_group(&mut self) {}
}

fn glyph_to_text(glyph: &Glyph<'_>) -> String {
    match glyph.as_unicode() {
        Some(BfString::Char(c)) => c.to_string(),
        Some(BfString::String(s)) => s,
        None => String::new(),
    }
}

fn glyph_bbox(glyph: &Glyph<'_>, transform: Affine) -> Rect {
    match glyph {
        Glyph::Outline(outline) => {
            let path = transform * outline.outline();
            let bbox = path.bounding_box();
            if bbox.width() > 0.0 && bbox.height() > 0.0 {
                bbox
            } else {
                fallback_bbox(transform)
            }
        }
        Glyph::Type3(_) => fallback_bbox(transform),
    }
}

fn fallback_bbox(transform: Affine) -> Rect {
    let p0 = transform * Point::new(0.0, 0.0);
    let p1 = transform * Point::new(500.0, 0.0);
    let p2 = transform * Point::new(500.0, 1000.0);
    let p3 = transform * Point::new(0.0, 1000.0);

    let min_x = p0.x.min(p1.x).min(p2.x).min(p3.x);
    let min_y = p0.y.min(p1.y).min(p2.y).min(p3.y);
    let max_x = p0.x.max(p1.x).max(p2.x).max(p3.x);
    let max_y = p0.y.max(p1.y).max(p2.y).max(p3.y);

    Rect::new(min_x, min_y, max_x, max_y)
}

fn merge_fragments(fragments: Vec<GlyphFragment>) -> Vec<GlyphFragment> {
    let mut merged: Vec<GlyphFragment> = Vec::new();

    for fragment in fragments {
        if fragment.text.is_empty() {
            continue;
        }

        let Some(current) = merged.last_mut() else {
            merged.push(fragment);
            continue;
        };

        if should_merge(current, &fragment) {
            current.text.push_str(&fragment.text);
            current.bbox = union_rect(current.bbox, fragment.bbox);
        } else {
            merged.push(fragment);
        }
    }

    merged
}

fn should_merge(lhs: &GlyphFragment, rhs: &GlyphFragment) -> bool {
    let line_tolerance = lhs.bbox.height().max(rhs.bbox.height()) * 0.5;
    let same_line = (lhs.baseline.y - rhs.baseline.y).abs() <= line_tolerance.max(0.5);
    if !same_line {
        return false;
    }

    let max_gap = lhs.bbox.height().max(rhs.bbox.height()) * 2.0;
    let min_gap = -lhs.bbox.height().max(rhs.bbox.height()) * 0.75;
    let gap = rhs.bbox.x0 - lhs.bbox.x1;

    gap >= min_gap && gap <= max_gap
}

fn union_rect(lhs: Rect, rhs: Rect) -> Rect {
    Rect::new(
        lhs.x0.min(rhs.x0),
        lhs.y0.min(rhs.y0),
        lhs.x1.max(rhs.x1),
        lhs.y1.max(rhs.y1),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use hayro_syntax::Pdf;
    use pdf_writer::{Content, Finish, Name, Pdf as WriterPdf, Rect as WriterRect, Ref};

    fn create_single_page_pdf(content: &[u8], rotate: i32) -> Vec<u8> {
        let catalog = Ref::new(1);
        let pages = Ref::new(2);
        let page = Ref::new(3);
        let font = Ref::new(4);
        let stream = Ref::new(5);

        let mut pdf = WriterPdf::new();
        pdf.catalog(catalog).pages(pages);
        pdf.pages(pages).kids([page]).count(1);

        let mut page_writer = pdf.page(page);
        page_writer.parent(pages);
        page_writer.media_box(WriterRect::new(0.0, 0.0, 595.0, 842.0));
        if rotate != 0 {
            page_writer.rotate(rotate);
        }
        page_writer.contents(stream);
        page_writer.resources().fonts().pair(Name(b"F1"), font);
        page_writer.finish();

        pdf.type1_font(font).base_font(Name(b"Helvetica"));
        pdf.stream(stream, content);

        pdf.finish()
    }

    fn parse_first_page(pdf_data: Vec<u8>) -> (Pdf, usize) {
        let pdf = Pdf::new(pdf_data).expect("pdf should parse");
        (pdf, 0)
    }

    #[test]
    fn extracts_simple_text_span() {
        let mut content = Content::new();
        content.begin_text();
        content.set_font(Name(b"F1"), 12.0);
        content.next_line(80.0, 760.0);
        content.show(pdf_writer::Str(b"Hello"));
        content.end_text();
        let pdf_data = create_single_page_pdf(content.finish().as_slice(), 0);
        let (pdf, page_idx) = parse_first_page(pdf_data);
        let page = &pdf.pages()[page_idx];

        let spans = extract_text_spans(page, &InterpreterSettings::default());
        assert!(!spans.is_empty(), "expected at least one span");
        assert!(
            spans.iter().any(|s| s.text.contains("Hello")),
            "expected extracted text to contain Hello, got {spans:?}"
        );
    }

    #[test]
    fn extracts_invisible_text() {
        let content = b"BT /F1 12 Tf 3 Tr 80 760 Td (Invisible) Tj ET";
        let pdf_data = create_single_page_pdf(content, 0);
        let (pdf, page_idx) = parse_first_page(pdf_data);
        let page = &pdf.pages()[page_idx];

        let spans = extract_text_spans(page, &InterpreterSettings::default());
        assert!(
            spans.iter().any(|s| s.text.contains("Invisible")),
            "expected invisible text to be extracted, got {spans:?}"
        );
    }

    #[test]
    fn returns_empty_for_non_text_page() {
        let pdf_data = create_single_page_pdf(b"", 0);
        let (pdf, page_idx) = parse_first_page(pdf_data);
        let page = &pdf.pages()[page_idx];

        let spans = extract_text_spans(page, &InterpreterSettings::default());
        assert!(spans.is_empty(), "expected no spans, got {spans:?}");
    }

    #[test]
    fn extraction_works_on_rotated_page() {
        let content = b"BT /F1 14 Tf 100 700 Td (Rotate) Tj ET";
        let pdf_data = create_single_page_pdf(content, 90);
        let (pdf, page_idx) = parse_first_page(pdf_data);
        let page = &pdf.pages()[page_idx];

        let spans = extract_text_spans(page, &InterpreterSettings::default());
        assert!(
            spans.iter().any(|s| s.text.contains("Rotate")),
            "expected rotated page text to be extracted, got {spans:?}"
        );
    }

    #[test]
    fn merges_adjacent_fragments() {
        let content = b"BT /F1 12 Tf 80 760 Td (Hel) Tj (lo) Tj ET";
        let pdf_data = create_single_page_pdf(content, 0);
        let (pdf, page_idx) = parse_first_page(pdf_data);
        let page = &pdf.pages()[page_idx];

        let spans = extract_text_spans(page, &InterpreterSettings::default());
        assert!(
            spans.iter().any(|s| s.text.contains("Hello")),
            "expected adjacent glyph runs to merge into Hello, got {spans:?}"
        );
    }
}
