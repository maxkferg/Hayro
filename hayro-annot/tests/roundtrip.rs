//! Integration tests for annotation write/read roundtrips.

use hayro_annot::*;

/// Create a minimal blank PDF using pdf-writer for testing.
fn create_blank_pdf() -> Vec<u8> {
    use pdf_writer::{Finish, Pdf, Rect, Ref};

    let catalog_id = Ref::new(1);
    let page_tree_id = Ref::new(2);
    let page_id = Ref::new(3);

    let mut pdf = Pdf::new();
    pdf.catalog(catalog_id).pages(page_tree_id);
    pdf.pages(page_tree_id).kids([page_id]).count(1);

    let mut page = pdf.page(page_id);
    page.parent(page_tree_id);
    page.media_box(Rect::new(0.0, 0.0, 595.0, 842.0));
    page.resources();
    page.finish();

    pdf.finish()
}

#[test]
fn roundtrip_highlight_annotation() {
    let pdf_data = create_blank_pdf();

    // Verify the blank PDF is valid
    let pdf = hayro_syntax::Pdf::new(pdf_data.clone()).expect("blank PDF should be valid");
    assert_eq!(pdf.pages().len(), 1);

    // Add a highlight annotation
    let highlight = Annotation::Highlight(HighlightAnnot {
        base: AnnotationBase {
            rect: [100.0, 700.0, 300.0, 720.0],
            color: Some(AnnotColor::yellow()),
            contents: Some("Test highlight".to_string()),
            ..Default::default()
        },
        quad_points: vec![
            100.0, 720.0, 300.0, 720.0, 100.0, 700.0, 300.0, 700.0,
        ],
    });

    let result = save_annotations(&pdf_data, &[(0, vec![highlight])]);
    assert!(result.is_ok(), "save should succeed: {:?}", result.err());

    let new_pdf_data = result.unwrap();
    assert!(new_pdf_data.len() > pdf_data.len(), "new PDF should be larger");

    // Verify the new PDF can be parsed
    let new_pdf = hayro_syntax::Pdf::new(new_pdf_data.clone());
    assert!(new_pdf.is_ok(), "new PDF should be valid: {:?}", new_pdf.err());

    let new_pdf = new_pdf.unwrap();
    assert_eq!(new_pdf.pages().len(), 1, "should still have 1 page");

    // Verify the page has annotations
    let page = &new_pdf.pages()[0];
    let raw = page.raw();
    let has_annots = raw.get::<hayro_syntax::object::Array<'_>>(
        hayro_syntax::object::dict::keys::ANNOTS as &[u8],
    );
    assert!(has_annots.is_some(), "page should have /Annots array");

    if let Some(annots) = has_annots {
        let count = annots.raw_iter().count();
        assert!(count >= 1, "should have at least 1 annotation, got {count}");
    }
}

#[test]
fn roundtrip_ink_annotation() {
    let pdf_data = create_blank_pdf();

    let ink = Annotation::Ink(InkAnnot {
        base: AnnotationBase {
            rect: [50.0, 400.0, 200.0, 500.0],
            color: Some(AnnotColor::red()),
            ..Default::default()
        },
        ink_list: vec![vec![
            [60.0, 410.0],
            [100.0, 450.0],
            [150.0, 420.0],
            [190.0, 490.0],
        ]],
        line_width: 2.0,
    });

    let result = save_annotations(&pdf_data, &[(0, vec![ink])]);
    assert!(result.is_ok(), "save should succeed: {:?}", result.err());

    let new_pdf_data = result.unwrap();
    let new_pdf = hayro_syntax::Pdf::new(new_pdf_data);
    assert!(new_pdf.is_ok(), "new PDF should be valid");
}

#[test]
fn roundtrip_square_annotation() {
    let pdf_data = create_blank_pdf();

    let square = Annotation::Square(ShapeAnnot {
        base: AnnotationBase {
            rect: [200.0, 300.0, 400.0, 500.0],
            color: Some(AnnotColor::new(0.0, 0.0, 1.0)),
            ..Default::default()
        },
        interior_color: Some(AnnotColor::new(0.9, 0.9, 1.0)),
        line_width: 2.0,
        is_circle: false,
    });

    let result = save_annotations(&pdf_data, &[(0, vec![square])]);
    assert!(result.is_ok(), "save should succeed: {:?}", result.err());

    let new_pdf_data = result.unwrap();
    let new_pdf = hayro_syntax::Pdf::new(new_pdf_data);
    assert!(new_pdf.is_ok(), "new PDF should be valid");
}

#[test]
fn roundtrip_multiple_annotations() {
    let pdf_data = create_blank_pdf();

    let highlight = Annotation::Highlight(HighlightAnnot {
        base: AnnotationBase {
            rect: [100.0, 700.0, 300.0, 720.0],
            color: Some(AnnotColor::yellow()),
            ..Default::default()
        },
        quad_points: vec![
            100.0, 720.0, 300.0, 720.0, 100.0, 700.0, 300.0, 700.0,
        ],
    });

    let ink = Annotation::Ink(InkAnnot {
        base: AnnotationBase {
            rect: [50.0, 400.0, 200.0, 500.0],
            color: Some(AnnotColor::red()),
            ..Default::default()
        },
        ink_list: vec![vec![[60.0, 410.0], [100.0, 450.0]]],
        line_width: 2.0,
    });

    let square = Annotation::Square(ShapeAnnot {
        base: AnnotationBase {
            rect: [200.0, 300.0, 400.0, 500.0],
            color: Some(AnnotColor::black()),
            ..Default::default()
        },
        interior_color: None,
        line_width: 1.0,
        is_circle: false,
    });

    let result = save_annotations(&pdf_data, &[(0, vec![highlight, ink, square])]);
    assert!(result.is_ok(), "save should succeed: {:?}", result.err());

    let new_pdf_data = result.unwrap();
    let new_pdf = hayro_syntax::Pdf::new(new_pdf_data.clone());
    assert!(new_pdf.is_ok(), "new PDF should be valid");

    // Verify multiple annotations present
    let new_pdf = new_pdf.unwrap();
    let page = &new_pdf.pages()[0];
    let raw = page.raw();
    let annots = raw.get::<hayro_syntax::object::Array<'_>>(
        hayro_syntax::object::dict::keys::ANNOTS as &[u8],
    );
    assert!(annots.is_some(), "page should have /Annots array");
    if let Some(annots) = annots {
        let count = annots.raw_iter().count();
        assert_eq!(count, 3, "should have 3 annotations, got {count}");
    }
}

#[test]
fn roundtrip_freetext_annotation() {
    let pdf_data = create_blank_pdf();

    let freetext = Annotation::FreeText(FreeTextAnnot {
        base: AnnotationBase {
            rect: [100.0, 600.0, 300.0, 640.0],
            ..Default::default()
        },
        text: "Hello World".to_string(),
        font_size: 12.0,
        default_appearance: "0 0 0 rg /Helv 12 Tf".to_string(),
    });

    let result = save_annotations(&pdf_data, &[(0, vec![freetext])]);
    assert!(result.is_ok(), "save should succeed: {:?}", result.err());

    let new_pdf_data = result.unwrap();
    let new_pdf = hayro_syntax::Pdf::new(new_pdf_data);
    assert!(new_pdf.is_ok(), "new PDF should be valid");
}

#[test]
fn invalid_page_index_returns_error() {
    let pdf_data = create_blank_pdf();

    let annot = Annotation::Highlight(HighlightAnnot {
        base: AnnotationBase {
            rect: [0.0, 0.0, 100.0, 100.0],
            ..Default::default()
        },
        quad_points: vec![],
    });

    let result = save_annotations(&pdf_data, &[(5, vec![annot])]);
    assert!(result.is_err(), "should fail with invalid page index");
}

#[test]
fn empty_annotations_no_change() {
    let pdf_data = create_blank_pdf();

    let result = save_annotations(&pdf_data, &[]);
    assert!(result.is_ok(), "save with no annotations should succeed");

    let new_pdf_data = result.unwrap();
    let new_pdf = hayro_syntax::Pdf::new(new_pdf_data);
    assert!(new_pdf.is_ok(), "new PDF should be valid");
}
