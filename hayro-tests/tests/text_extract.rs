use hayro::hayro_interpret::font::{FontData, FontQuery, StandardFont};
use hayro::hayro_interpret::{InterpreterSettings, extract_text_spans};
use hayro_syntax::Pdf;
use pdf_writer::{Finish, Name, Pdf as WriterPdf, Rect, Ref};
use std::sync::Arc;

fn make_single_page_pdf(content: &[u8], rotate: i32) -> Vec<u8> {
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
    page_writer.media_box(Rect::new(0.0, 0.0, 595.0, 842.0));
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

fn parse_page(pdf_data: Vec<u8>) -> Pdf {
    Pdf::new(pdf_data).expect("generated test PDF should parse")
}

fn test_settings() -> InterpreterSettings {
    let pick = |font: &StandardFont| -> FontData {
        let bytes: &'static [u8] = match font {
            StandardFont::Helvetica => {
                &include_bytes!("../../hayro-interpret/assets/FoxitSans.pfb")[..]
            }
            StandardFont::HelveticaBold => {
                &include_bytes!("../../hayro-interpret/assets/FoxitSansBold.pfb")[..]
            }
            StandardFont::HelveticaOblique => {
                &include_bytes!("../../hayro-interpret/assets/FoxitSansItalic.pfb")[..]
            }
            StandardFont::HelveticaBoldOblique => {
                &include_bytes!("../../hayro-interpret/assets/FoxitSansBoldItalic.pfb")[..]
            }
            StandardFont::Courier => {
                &include_bytes!("../../hayro-interpret/assets/FoxitFixed.pfb")[..]
            }
            StandardFont::CourierBold => {
                &include_bytes!("../../hayro-interpret/assets/FoxitFixedBold.pfb")[..]
            }
            StandardFont::CourierOblique => {
                &include_bytes!("../../hayro-interpret/assets/FoxitFixedItalic.pfb")[..]
            }
            StandardFont::CourierBoldOblique => {
                &include_bytes!("../../hayro-interpret/assets/FoxitFixedBoldItalic.pfb")[..]
            }
            StandardFont::TimesRoman => {
                &include_bytes!("../../hayro-interpret/assets/FoxitSerif.pfb")[..]
            }
            StandardFont::TimesBold => {
                &include_bytes!("../../hayro-interpret/assets/FoxitSerifBold.pfb")[..]
            }
            StandardFont::TimesItalic => {
                &include_bytes!("../../hayro-interpret/assets/FoxitSerifItalic.pfb")[..]
            }
            StandardFont::TimesBoldItalic => {
                &include_bytes!("../../hayro-interpret/assets/FoxitSerifBoldItalic.pfb")[..]
            }
            StandardFont::ZapfDingBats => {
                &include_bytes!("../../hayro-interpret/assets/FoxitDingbats.pfb")[..]
            }
            StandardFont::Symbol => {
                &include_bytes!("../../hayro-interpret/assets/FoxitSymbol.pfb")[..]
            }
        };
        Arc::new(bytes)
    };

    InterpreterSettings {
        font_resolver: Arc::new(move |query| match query {
            FontQuery::Standard(s) => Some((pick(s), 0)),
            FontQuery::Fallback(f) => Some((pick(&f.pick_standard_font()), 0)),
        }),
        ..Default::default()
    }
}

#[test]
fn text_extraction_happy_path() {
    let pdf = parse_page(make_single_page_pdf(
        b"BT /F1 12 Tf 72 700 Td (Hello Hayro) Tj ET",
        0,
    ));

    let spans = extract_text_spans(&pdf.pages()[0], &test_settings());
    assert!(
        spans.iter().any(|span| span.text.contains("Hello Hayro")),
        "expected extracted span to contain text, got {spans:?}"
    );
    assert!(
        spans.iter().all(|span| span.bbox[2] >= span.bbox[0] && span.bbox[3] >= span.bbox[1]),
        "expected normalized span bboxes, got {spans:?}"
    );
}

#[test]
fn text_extraction_includes_invisible_text() {
    let pdf = parse_page(make_single_page_pdf(
        b"BT /F1 11 Tf 3 Tr 72 680 Td (Invisible Layer) Tj ET",
        0,
    ));

    let spans = extract_text_spans(&pdf.pages()[0], &test_settings());
    assert!(
        spans.iter().any(|span| span.text.contains("Invisible Layer")),
        "expected invisible text to be extracted, got {spans:?}"
    );
}

#[test]
fn text_extraction_handles_rotation() {
    let pdf = parse_page(make_single_page_pdf(
        b"BT /F1 12 Tf 72 700 Td (Rotate Me) Tj ET",
        90,
    ));

    let spans = extract_text_spans(&pdf.pages()[0], &test_settings());
    assert!(
        spans.iter().any(|span| span.text.contains("Rotate Me")),
        "expected rotated-page extraction to include text, got {spans:?}"
    );
}

#[test]
fn text_extraction_empty_content_yields_no_spans() {
    let pdf = parse_page(make_single_page_pdf(b"", 0));
    let spans = extract_text_spans(&pdf.pages()[0], &test_settings());
    assert!(spans.is_empty(), "expected empty spans, got {spans:?}");
}
