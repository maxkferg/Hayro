//! Spec-focused integration tests for annotation writing.

use hayro_annot::*;
use hayro_syntax::object::dict::keys::ANNOTS;
use hayro_syntax::object::{Array, Dict, MaybeRef, Name, ObjRef, Object, String as PdfString};

fn create_blank_pdf(page_count: usize) -> Vec<u8> {
    use pdf_writer::{Finish, Pdf, Rect, Ref};

    assert!(page_count > 0, "test helper requires at least one page");

    let catalog_id = Ref::new(1);
    let page_tree_id = Ref::new(2);
    let mut next_ref = 3;

    let mut page_refs = Vec::with_capacity(page_count);
    for _ in 0..page_count {
        page_refs.push(Ref::new(next_ref));
        next_ref += 1;
    }

    let mut pdf = Pdf::new();
    pdf.catalog(catalog_id).pages(page_tree_id);
    pdf.pages(page_tree_id)
        .kids(page_refs.iter().copied())
        .count(page_count as i32);

    for page_ref in page_refs {
        let mut page = pdf.page(page_ref);
        page.parent(page_tree_id);
        page.media_box(Rect::new(0.0, 0.0, 595.0, 842.0));
        page.resources();
        page.finish();
    }

    pdf.finish()
}

fn save_and_parse(
    input_pdf: &[u8],
    page_annotations: &[(usize, Vec<Annotation>)],
) -> hayro_syntax::Pdf {
    let saved = save_annotations(input_pdf, page_annotations)
        .unwrap_or_else(|e| panic!("save_annotations failed: {e}"));
    hayro_syntax::Pdf::new(saved).expect("saved PDF should parse")
}

fn page_annotation_dicts<'a>(pdf: &'a hayro_syntax::Pdf, page_idx: usize) -> Vec<Dict<'a>> {
    let annots = pdf.pages()[page_idx]
        .raw()
        .get::<Array<'_>>(ANNOTS as &[u8])
        .expect("page should have /Annots");
    annots.iter::<Dict<'_>>().collect()
}

fn subtype_bytes(dict: &Dict<'_>) -> Vec<u8> {
    dict.get::<Name>(b"Subtype".as_ref())
        .expect("annotation should have /Subtype")
        .as_ref()
        .to_vec()
}

#[test]
fn markup_quadpoints_are_truncated_to_multiple_of_eight() {
    let input = create_blank_pdf(1);
    let highlight = Annotation::Highlight(HighlightAnnot {
        base: AnnotationBase {
            rect: [10.0, 10.0, 100.0, 30.0],
            ..Default::default()
        },
        quad_points: vec![1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0],
    });

    let pdf = save_and_parse(&input, &[(0, vec![highlight])]);
    let dicts = page_annotation_dicts(&pdf, 0);
    let quad = dicts[0]
        .get::<Vec<f32>>(b"QuadPoints".as_ref())
        .expect("highlight should have /QuadPoints");
    assert_eq!(
        quad.len(),
        8,
        "quadpoints should be truncated to full groups"
    );
}

#[test]
fn markup_subtypes_are_written() {
    let input = create_blank_pdf(1);
    let annots = vec![
        Annotation::Underline(UnderlineAnnot {
            base: AnnotationBase {
                rect: [10.0, 10.0, 100.0, 20.0],
                ..Default::default()
            },
            quad_points: vec![10.0, 20.0, 100.0, 20.0, 10.0, 10.0, 100.0, 10.0],
        }),
        Annotation::StrikeOut(StrikeOutAnnot {
            base: AnnotationBase {
                rect: [20.0, 30.0, 120.0, 40.0],
                ..Default::default()
            },
            quad_points: vec![20.0, 40.0, 120.0, 40.0, 20.0, 30.0, 120.0, 30.0],
        }),
        Annotation::Squiggly(SquigglyAnnot {
            base: AnnotationBase {
                rect: [30.0, 50.0, 130.0, 60.0],
                ..Default::default()
            },
            quad_points: vec![30.0, 60.0, 130.0, 60.0, 30.0, 50.0, 130.0, 50.0],
        }),
    ];

    let pdf = save_and_parse(&input, &[(0, annots)]);
    let dicts = page_annotation_dicts(&pdf, 0);
    let subtypes = dicts.iter().map(subtype_bytes).collect::<Vec<_>>();

    assert!(subtypes.iter().any(|s| s.as_slice() == b"Underline"));
    assert!(subtypes.iter().any(|s| s.as_slice() == b"StrikeOut"));
    assert!(subtypes.iter().any(|s| s.as_slice() == b"Squiggly"));
}

#[test]
fn freetext_sets_contents_fallback_when_missing() {
    let input = create_blank_pdf(1);
    let freetext = Annotation::FreeText(FreeTextAnnot {
        base: AnnotationBase {
            rect: [40.0, 40.0, 200.0, 90.0],
            contents: None,
            ..Default::default()
        },
        text: "hello free text".to_string(),
        font_size: 12.0,
        default_appearance: "0 0 0 rg /Helv 12 Tf".to_string(),
    });

    let pdf = save_and_parse(&input, &[(0, vec![freetext])]);
    let dict = &page_annotation_dicts(&pdf, 0)[0];
    assert_eq!(subtype_bytes(dict), b"FreeText");

    let contents = dict
        .get::<PdfString>(b"Contents".as_ref())
        .expect("FreeText should have /Contents");
    assert_eq!(contents.as_bytes(), b"hello free text");
    assert!(
        dict.contains_key(b"DA".as_ref()),
        "FreeText should include /DA"
    );
}

#[test]
fn text_annotation_writes_icon_and_open_flag() {
    let input = create_blank_pdf(1);
    let text = Annotation::Text(TextAnnot {
        base: AnnotationBase {
            rect: [100.0, 100.0, 124.0, 124.0],
            ..Default::default()
        },
        open: true,
        icon: "Key".to_string(),
    });

    let pdf = save_and_parse(&input, &[(0, vec![text])]);
    let dict = &page_annotation_dicts(&pdf, 0)[0];
    assert_eq!(subtype_bytes(dict), b"Text");
    assert_eq!(dict.get::<bool>(b"Open".as_ref()), Some(true));
    let icon = dict
        .get::<Name>(b"Name".as_ref())
        .expect("Text annotation should include /Name icon");
    assert_eq!(icon.as_ref(), b"Key");
}

#[test]
fn ink_annotation_writes_inklist_and_border_style_width() {
    let input = create_blank_pdf(1);
    let ink = Annotation::Ink(InkAnnot {
        base: AnnotationBase {
            rect: [50.0, 50.0, 180.0, 180.0],
            ..Default::default()
        },
        ink_list: vec![vec![[60.0, 60.0], [80.0, 80.0], [120.0, 90.0]]],
        line_width: 2.5,
    });

    let pdf = save_and_parse(&input, &[(0, vec![ink])]);
    let dict = &page_annotation_dicts(&pdf, 0)[0];
    assert_eq!(subtype_bytes(dict), b"Ink");

    let ink_list = dict
        .get::<Array<'_>>(b"InkList".as_ref())
        .expect("Ink annotation should have /InkList");
    assert_eq!(ink_list.raw_iter().count(), 1);

    let bs = dict
        .get::<Dict<'_>>(b"BS".as_ref())
        .expect("Ink should have /BS");
    assert_eq!(bs.get::<f32>(b"W".as_ref()), Some(2.5));
}

#[test]
fn square_and_circle_write_ic_and_border_style() {
    let input = create_blank_pdf(1);
    let square = Annotation::Square(ShapeAnnot {
        base: AnnotationBase {
            rect: [10.0, 10.0, 100.0, 100.0],
            ..Default::default()
        },
        interior_color: Some(AnnotColor::new(0.1, 0.2, 0.3)),
        line_width: 3.0,
        is_circle: false,
    });
    let circle = Annotation::Circle(ShapeAnnot {
        base: AnnotationBase {
            rect: [120.0, 120.0, 200.0, 200.0],
            ..Default::default()
        },
        interior_color: Some(AnnotColor::new(0.4, 0.5, 0.6)),
        line_width: 1.5,
        is_circle: true,
    });

    let pdf = save_and_parse(&input, &[(0, vec![square, circle])]);
    let dicts = page_annotation_dicts(&pdf, 0);

    for dict in dicts {
        assert!(
            dict.contains_key(b"IC".as_ref()),
            "shape annotation should include interior color"
        );
        let bs = dict
            .get::<Dict<'_>>(b"BS".as_ref())
            .expect("shape should have /BS");
        assert!(
            bs.get::<f32>(b"W".as_ref()).is_some(),
            "shape border style should include width"
        );
    }
}

#[test]
fn line_annotation_writes_l_and_border_style() {
    let input = create_blank_pdf(1);
    let line = Annotation::Line(LineAnnot {
        base: AnnotationBase {
            rect: [50.0, 50.0, 200.0, 200.0],
            ..Default::default()
        },
        start: [60.0, 60.0],
        end: [190.0, 180.0],
        line_width: 4.0,
    });

    let pdf = save_and_parse(&input, &[(0, vec![line])]);
    let dict = &page_annotation_dicts(&pdf, 0)[0];
    assert_eq!(subtype_bytes(dict), b"Line");
    assert_eq!(
        dict.get::<Vec<f32>>(b"L".as_ref())
            .expect("Line annotation should have /L")
            .len(),
        4
    );
    let bs = dict
        .get::<Dict<'_>>(b"BS".as_ref())
        .expect("line should have /BS");
    assert_eq!(bs.get::<f32>(b"W".as_ref()), Some(4.0));
}

#[test]
fn link_uri_annotation_writes_uri_action() {
    let input = create_blank_pdf(1);
    let link = Annotation::Link(LinkAnnot {
        base: AnnotationBase {
            rect: [10.0, 10.0, 200.0, 30.0],
            ..Default::default()
        },
        uri: Some("https://example.com".to_string()),
        dest_page: None,
    });

    let pdf = save_and_parse(&input, &[(0, vec![link])]);
    let dict = &page_annotation_dicts(&pdf, 0)[0];
    assert_eq!(subtype_bytes(dict), b"Link");

    let action = dict
        .get::<Dict<'_>>(b"A".as_ref())
        .expect("Link should have /A");
    assert_eq!(
        action
            .get::<Name>(b"S".as_ref())
            .expect("action should have /S")
            .as_ref(),
        b"URI"
    );
    assert_eq!(
        action
            .get::<PdfString>(b"URI".as_ref())
            .expect("action should have /URI")
            .as_bytes(),
        b"https://example.com"
    );
}

#[test]
fn link_destination_page_writes_dest_array() {
    let input = create_blank_pdf(3);
    let link = Annotation::Link(LinkAnnot {
        base: AnnotationBase {
            rect: [10.0, 10.0, 200.0, 30.0],
            ..Default::default()
        },
        uri: None,
        dest_page: Some(2),
    });

    let pdf = save_and_parse(&input, &[(0, vec![link])]);
    let dict = &page_annotation_dicts(&pdf, 0)[0];
    assert!(
        dict.contains_key(b"Dest".as_ref()),
        "Link should include /Dest"
    );

    let dest = dict
        .get::<Array<'_>>(b"Dest".as_ref())
        .expect("Link /Dest should be an array");
    let mut iter = dest.raw_iter();

    let page_ref = iter
        .next()
        .and_then(|r| r.as_obj_ref())
        .expect("first /Dest entry should be a page reference");
    let fit = iter.next().expect("second /Dest entry should exist");
    let MaybeRef::NotRef(Object::Name(fit_name)) = fit else {
        panic!("second /Dest entry should be /Fit");
    };
    assert_eq!(fit_name.as_ref(), b"Fit");

    let expected_page_obj_id = pdf.pages()[2]
        .raw()
        .obj_id()
        .expect("page should be an indirect object");
    assert_eq!(page_ref, ObjRef::from(expected_page_obj_id));
}

#[test]
fn invalid_destination_page_returns_error() {
    let input = create_blank_pdf(1);
    let link = Annotation::Link(LinkAnnot {
        base: AnnotationBase {
            rect: [10.0, 10.0, 200.0, 30.0],
            ..Default::default()
        },
        uri: None,
        dest_page: Some(9),
    });

    let result = save_annotations(&input, &[(0, vec![link])]);
    assert!(matches!(result, Err(SaveError::InvalidDestinationPage(9))));
}

#[test]
fn modified_author_contents_and_flags_are_serialized() {
    let input = create_blank_pdf(1);
    let text = Annotation::Text(TextAnnot {
        base: AnnotationBase {
            rect: [10.0, 10.0, 30.0, 30.0],
            author: Some("qa".to_string()),
            contents: Some("hello".to_string()),
            modified: Some("D:20260217120000Z".to_string()),
            flags: 5,
            ..Default::default()
        },
        open: false,
        icon: "Note".to_string(),
    });

    let pdf = save_and_parse(&input, &[(0, vec![text])]);
    let dict = &page_annotation_dicts(&pdf, 0)[0];
    assert_eq!(
        dict.get::<PdfString>(b"T".as_ref())
            .expect("author should be written")
            .as_bytes(),
        b"qa"
    );
    assert_eq!(
        dict.get::<PdfString>(b"Contents".as_ref())
            .expect("contents should be written")
            .as_bytes(),
        b"hello"
    );
    assert_eq!(
        dict.get::<PdfString>(b"M".as_ref())
            .expect("modified date should be written")
            .as_bytes(),
        b"D:20260217120000Z"
    );
    assert_eq!(dict.get::<i32>(b"F".as_ref()), Some(5));
}

#[test]
fn rect_color_and_opacity_are_normalized_and_clamped() {
    let input = create_blank_pdf(1);
    let highlight = Annotation::Highlight(HighlightAnnot {
        base: AnnotationBase {
            rect: [150.0, 100.0, 50.0, 20.0],
            color: Some(AnnotColor::new(-0.5, 2.0, 0.25)),
            opacity: -0.4,
            ..Default::default()
        },
        quad_points: vec![50.0, 100.0, 150.0, 100.0, 50.0, 20.0, 150.0, 20.0],
    });

    let pdf = save_and_parse(&input, &[(0, vec![highlight])]);
    let dict = &page_annotation_dicts(&pdf, 0)[0];

    assert_eq!(
        dict.get::<[f32; 4]>(b"Rect".as_ref())
            .expect("rect should be written in annotation"),
        [50.0, 20.0, 150.0, 100.0]
    );
    assert_eq!(
        dict.get::<Vec<f32>>(b"C".as_ref())
            .expect("color should be present for highlight"),
        vec![0.0, 1.0, 0.25]
    );
    assert_eq!(
        dict.get::<f32>(b"CA".as_ref())
            .expect("opacity should be present"),
        0.0
    );
}

#[test]
fn duplicate_page_entries_are_merged() {
    let input = create_blank_pdf(1);
    let first = Annotation::Highlight(HighlightAnnot {
        base: AnnotationBase {
            rect: [10.0, 10.0, 100.0, 30.0],
            ..Default::default()
        },
        quad_points: vec![10.0, 30.0, 100.0, 30.0, 10.0, 10.0, 100.0, 10.0],
    });
    let second = Annotation::Underline(UnderlineAnnot {
        base: AnnotationBase {
            rect: [20.0, 40.0, 110.0, 60.0],
            ..Default::default()
        },
        quad_points: vec![20.0, 60.0, 110.0, 60.0, 20.0, 40.0, 110.0, 40.0],
    });

    let pdf = save_and_parse(&input, &[(0, vec![first]), (0, vec![second])]);
    let dicts = page_annotation_dicts(&pdf, 0);
    assert_eq!(dicts.len(), 2, "both page entries should be preserved");
}

#[test]
fn multi_page_annotations_are_applied_to_correct_pages() {
    let input = create_blank_pdf(3);
    let p0 = Annotation::Text(TextAnnot {
        base: AnnotationBase {
            rect: [10.0, 10.0, 30.0, 30.0],
            ..Default::default()
        },
        open: false,
        icon: "Note".to_string(),
    });
    let p2a = Annotation::Square(ShapeAnnot {
        base: AnnotationBase {
            rect: [50.0, 50.0, 120.0, 120.0],
            ..Default::default()
        },
        interior_color: None,
        line_width: 1.0,
        is_circle: false,
    });
    let p2b = Annotation::Line(LineAnnot {
        base: AnnotationBase {
            rect: [130.0, 130.0, 230.0, 220.0],
            ..Default::default()
        },
        start: [130.0, 130.0],
        end: [230.0, 220.0],
        line_width: 2.0,
    });

    let pdf = save_and_parse(&input, &[(0, vec![p0]), (2, vec![p2a, p2b])]);
    assert_eq!(page_annotation_dicts(&pdf, 0).len(), 1);
    assert_eq!(page_annotation_dicts(&pdf, 2).len(), 2);
    assert!(
        pdf.pages()[1]
            .raw()
            .get::<Array<'_>>(ANNOTS as &[u8])
            .is_none(),
        "untouched page should not gain /Annots"
    );
}

#[test]
fn all_annotation_types_can_be_written_together() {
    let input = create_blank_pdf(1);
    let annotations = vec![
        Annotation::Highlight(HighlightAnnot {
            base: AnnotationBase {
                rect: [10.0, 10.0, 100.0, 30.0],
                ..Default::default()
            },
            quad_points: vec![10.0, 30.0, 100.0, 30.0, 10.0, 10.0, 100.0, 10.0],
        }),
        Annotation::Underline(UnderlineAnnot {
            base: AnnotationBase {
                rect: [20.0, 35.0, 110.0, 45.0],
                ..Default::default()
            },
            quad_points: vec![20.0, 45.0, 110.0, 45.0, 20.0, 35.0, 110.0, 35.0],
        }),
        Annotation::StrikeOut(StrikeOutAnnot {
            base: AnnotationBase {
                rect: [20.0, 50.0, 110.0, 60.0],
                ..Default::default()
            },
            quad_points: vec![20.0, 60.0, 110.0, 60.0, 20.0, 50.0, 110.0, 50.0],
        }),
        Annotation::Squiggly(SquigglyAnnot {
            base: AnnotationBase {
                rect: [20.0, 65.0, 110.0, 75.0],
                ..Default::default()
            },
            quad_points: vec![20.0, 75.0, 110.0, 75.0, 20.0, 65.0, 110.0, 65.0],
        }),
        Annotation::FreeText(FreeTextAnnot {
            base: AnnotationBase {
                rect: [120.0, 20.0, 260.0, 70.0],
                ..Default::default()
            },
            text: "hello".to_string(),
            font_size: 12.0,
            default_appearance: "0 0 0 rg /Helv 12 Tf".to_string(),
        }),
        Annotation::Ink(InkAnnot {
            base: AnnotationBase {
                rect: [20.0, 100.0, 140.0, 180.0],
                ..Default::default()
            },
            ink_list: vec![vec![[30.0, 110.0], [80.0, 160.0], [120.0, 120.0]]],
            line_width: 1.5,
        }),
        Annotation::Square(ShapeAnnot {
            base: AnnotationBase {
                rect: [150.0, 100.0, 220.0, 170.0],
                ..Default::default()
            },
            interior_color: None,
            line_width: 1.0,
            is_circle: false,
        }),
        Annotation::Circle(ShapeAnnot {
            base: AnnotationBase {
                rect: [230.0, 100.0, 300.0, 170.0],
                ..Default::default()
            },
            interior_color: None,
            line_width: 1.0,
            is_circle: true,
        }),
        Annotation::Line(LineAnnot {
            base: AnnotationBase {
                rect: [20.0, 200.0, 160.0, 260.0],
                ..Default::default()
            },
            start: [20.0, 200.0],
            end: [160.0, 260.0],
            line_width: 2.0,
        }),
        Annotation::Text(TextAnnot {
            base: AnnotationBase {
                rect: [170.0, 200.0, 194.0, 224.0],
                ..Default::default()
            },
            open: false,
            icon: "Note".to_string(),
        }),
        Annotation::Link(LinkAnnot {
            base: AnnotationBase {
                rect: [200.0, 200.0, 320.0, 220.0],
                ..Default::default()
            },
            uri: Some("https://example.com".to_string()),
            dest_page: None,
        }),
    ];

    let pdf = save_and_parse(&input, &[(0, annotations)]);
    let dicts = page_annotation_dicts(&pdf, 0);
    assert_eq!(dicts.len(), 11, "all annotations should be present");
}
