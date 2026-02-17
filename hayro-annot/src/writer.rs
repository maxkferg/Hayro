//! Incremental save writer for PDF annotations.
//!
//! This module implements the core pipeline for appending new annotation objects
//! to an existing PDF file using incremental save. The original PDF data is
//! preserved and new objects (annotation dictionaries, appearance streams) are
//! appended at the end, along with a new cross-reference table and trailer.

use crate::appearance::generate_appearance;
use crate::types::*;
use flate2::Compression;
use flate2::write::ZlibEncoder;
use pdf_writer::{Chunk, Filter, Finish, Name, Rect, Ref};
use std::collections::BTreeMap;
use std::io::Write;

/// An error that occurred during annotation saving.
#[derive(Debug)]
pub enum SaveError {
    /// The original PDF could not be parsed.
    InvalidPdf,
    /// An invalid page index was specified.
    InvalidPageIndex(usize),
    /// An I/O error occurred.
    IoError(String),
}

impl core::fmt::Display for SaveError {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        match self {
            Self::InvalidPdf => write!(f, "invalid PDF"),
            Self::InvalidPageIndex(i) => write!(f, "invalid page index: {i}"),
            Self::IoError(s) => write!(f, "I/O error: {s}"),
        }
    }
}

/// Deflate-compress data.
fn deflate_encode(data: &[u8]) -> Vec<u8> {
    let mut e = ZlibEncoder::new(Vec::new(), Compression::new(6));
    e.write_all(data).unwrap();
    e.finish().unwrap()
}

/// A reference allocator that tracks the next available object number.
struct RefAllocator {
    next: i32,
}

impl RefAllocator {
    fn new(start: i32) -> Self {
        Self { next: start }
    }

    fn alloc(&mut self) -> Ref {
        let r = Ref::new(self.next);
        self.next += 1;
        r
    }
}

/// Save annotations to a PDF by creating a brand new PDF with the original
/// page content plus new annotations.
///
/// This approach re-extracts the pages using `hayro-write` and then adds
/// annotations on top. For simplicity and correctness, rather than implementing
/// a full incremental save (which requires rewriting xref tables), we create a
/// new standalone PDF that includes all original pages and the new annotations.
///
/// # Arguments
/// * `original_data` — the original PDF file bytes
/// * `page_annotations` — list of `(page_index, annotations)` to add
///
/// # Returns
/// Complete PDF bytes of the new document.
pub fn save_annotations(
    original_data: &[u8],
    page_annotations: &[(usize, Vec<Annotation>)],
) -> Result<Vec<u8>, SaveError> {
    use hayro_syntax::Pdf;

    let pdf = Pdf::new(original_data.to_vec()).map_err(|_| SaveError::InvalidPdf)?;
    let pages = pdf.pages();
    let num_pages = pages.len();

    // Validate all page indices
    for (page_idx, _) in page_annotations {
        if *page_idx >= num_pages {
            return Err(SaveError::InvalidPageIndex(*page_idx));
        }
    }

    // Use hayro-write to extract all pages, then add annotations on top
    let mut next_ref = Ref::new(1);
    let mut alloc = || {
        let r = next_ref;
        next_ref = Ref::new(next_ref.get() + 1);
        r
    };

    let catalog_ref = alloc();
    let page_tree_ref = alloc();

    // Extract all pages using hayro-write
    let queries: Vec<hayro_write::ExtractionQuery> = (0..num_pages)
        .map(hayro_write::ExtractionQuery::new_page)
        .collect();

    let extracted = hayro_write::extract(
        &pdf,
        Box::new(|| {
            let r = next_ref;
            next_ref = Ref::new(next_ref.get() + 1);
            r
        }),
        &queries,
    )
    .map_err(|_| SaveError::InvalidPdf)?;

    // Build the output PDF
    let mut out_pdf = pdf_writer::Pdf::new();

    // Write catalog
    out_pdf.catalog(catalog_ref).pages(page_tree_ref);

    // Collect page refs
    let page_refs: Vec<Ref> = extracted
        .root_refs
        .iter()
        .map(|r| r.as_ref().map_err(|_| SaveError::InvalidPdf).copied())
        .collect::<Result<Vec<_>, _>>()?;

    // For each page that has annotations, write the annotation objects
    // and create /Annots arrays
    let mut page_annot_arrays: std::collections::HashMap<usize, Ref> =
        std::collections::HashMap::new();

    // Use a chunk for annotation objects since we need fresh refs
    let mut annot_chunk = Chunk::new();
    let mut annot_refs_allocator = RefAllocator::new(next_ref.get());

    for (page_idx, annots) in page_annotations {
        let mut this_page_annot_refs: Vec<Ref> = Vec::new();

        for annot in annots.iter() {
            let annot_ref = annot_refs_allocator.alloc();
            let ap_stream_ref = annot_refs_allocator.alloc();

            // Generate appearance stream
            let ap_content = generate_appearance(annot);

            if !ap_content.is_empty() {
                let encoded = deflate_encode(&ap_content);
                let base = annot.base();
                let bbox = Rect::new(
                    0.0,
                    0.0,
                    base.rect[2] - base.rect[0],
                    base.rect[3] - base.rect[1],
                );

                let mut xobj = annot_chunk.form_xobject(ap_stream_ref, &encoded);
                xobj.bbox(bbox);
                xobj.filter(Filter::FlateDecode);

                // For FreeText annotations, include Helvetica font resource
                if matches!(annot, Annotation::FreeText(_)) {
                    let font_ref = annot_refs_allocator.alloc();
                    xobj.resources().fonts().pair(Name(b"Helv"), font_ref);
                    xobj.finish();

                    // Write Helvetica font dictionary
                    let mut font_dict = annot_chunk.indirect(font_ref).dict();
                    font_dict.pair(Name(b"Type"), Name(b"Font"));
                    font_dict.pair(Name(b"Subtype"), Name(b"Type1"));
                    font_dict.pair(Name(b"BaseFont"), Name(b"Helvetica"));
                    font_dict.finish();
                } else {
                    xobj.finish();
                }
            }

            // Write annotation dictionary
            write_annotation_dict(
                &mut annot_chunk,
                annot_ref,
                annot,
                ap_stream_ref,
                !ap_content.is_empty(),
            );

            this_page_annot_refs.push(annot_ref);
        }

        // Write /Annots array for this page
        if !this_page_annot_refs.is_empty() {
            let annots_arr_ref = annot_refs_allocator.alloc();
            let mut arr = annot_chunk.indirect(annots_arr_ref).array();
            for r in &this_page_annot_refs {
                arr.item(*r);
            }
            arr.finish();
            page_annot_arrays.insert(*page_idx, annots_arr_ref);
        }
    }

    // Write page tree
    let count = page_refs.len() as i32;
    out_pdf
        .pages(page_tree_ref)
        .kids(page_refs.iter().copied())
        .count(count);

    // Extend with extracted page content
    out_pdf.extend(&extracted.chunk);

    // Extend with annotation objects
    out_pdf.extend(&annot_chunk);

    // Add /Annots to extracted page dictionaries in a post-processing pass.
    // We then append a fresh xref/trailer section with corrected offsets.

    let mut pdf_bytes = out_pdf.finish();

    // Post-process: inject /Annots references into page dictionaries.
    // This modifies object byte lengths, so we append an updated cross-reference
    // table/trailer afterwards to keep offsets valid.
    for (page_idx, annots_ref) in &page_annot_arrays {
        let page_ref = page_refs[*page_idx];
        if !inject_annots_into_page(&mut pdf_bytes, page_ref, *annots_ref) {
            return Err(SaveError::InvalidPdf);
        }
    }

    if !page_annot_arrays.is_empty() {
        append_updated_xref_and_trailer(&mut pdf_bytes, catalog_ref);
    }

    Ok(pdf_bytes)
}

/// Inject an /Annots reference into a page dictionary in the raw PDF bytes.
///
/// This searches for the page object by its reference number and inserts
/// the /Annots key before the end of the dictionary.
fn inject_annots_into_page(pdf_bytes: &mut Vec<u8>, page_ref: Ref, annots_ref: Ref) -> bool {
    let page_obj_marker = format!("{} 0 obj", page_ref.get());
    let annots_entry = format!("/Annots {} 0 R", annots_ref.get());

    // Find the page object
    let Some(obj_pos) = find_bytes(pdf_bytes, page_obj_marker.as_bytes()) else {
        return false;
    };

    let search_start = obj_pos + page_obj_marker.len();
    let Some(dict_start_rel) = find_bytes(&pdf_bytes[search_start..], b"<<") else {
        return false;
    };
    let dict_start = search_start + dict_start_rel;

    let Some(dict_end) = find_matching_dict_end(pdf_bytes, dict_start) else {
        return false;
    };

    // Don't duplicate /Annots if this page dictionary already has one.
    if find_bytes(&pdf_bytes[dict_start..dict_end], b"/Annots").is_some() {
        return true;
    }

    // Insert /Annots before the dictionary's matching closing ">>".
    let insert_bytes = format!("\n  {annots_entry}\n").into_bytes();
    let old_len = pdf_bytes.len();
    pdf_bytes.resize(old_len + insert_bytes.len(), 0);
    pdf_bytes.copy_within(dict_end..old_len, dict_end + insert_bytes.len());
    pdf_bytes[dict_end..dict_end + insert_bytes.len()].copy_from_slice(&insert_bytes);
    true
}

/// Find the byte index of the matching closing ">>" for a dictionary.
///
/// Returns the position of the first '>' in the closing ">>".
fn find_matching_dict_end(bytes: &[u8], dict_start: usize) -> Option<usize> {
    let mut idx = dict_start;
    let mut depth = 0_i32;

    while idx + 1 < bytes.len() {
        if bytes[idx] == b'<' && bytes[idx + 1] == b'<' {
            depth += 1;
            idx += 2;
            continue;
        }

        if bytes[idx] == b'>' && bytes[idx + 1] == b'>' {
            depth -= 1;
            let close_pos = idx;
            idx += 2;
            if depth == 0 {
                return Some(close_pos);
            }
            continue;
        }

        idx += 1;
    }

    None
}

/// Append a fresh xref/trailer section with corrected object offsets.
///
/// This keeps the output valid even after post-processing object bytes.
fn append_updated_xref_and_trailer(pdf_bytes: &mut Vec<u8>, catalog_ref: Ref) {
    let obj_offsets = collect_object_offsets(pdf_bytes);
    if obj_offsets.is_empty() {
        return;
    }

    let xref_len = 1 + obj_offsets.keys().next_back().copied().unwrap_or(0);
    let offsets = obj_offsets
        .iter()
        .map(|(id, offset)| (*id, *offset))
        .collect::<Vec<_>>();
    let prev_startxref = find_last_startxref(pdf_bytes);

    let xref_offset = pdf_bytes.len() + 1;
    pdf_bytes.push(b'\n');
    pdf_bytes.extend_from_slice(format!("xref\n0 {xref_len}\n").as_bytes());

    // Reconstruct a complete free-list and in-use table (same layout as pdf-writer).
    let mut written = 0_i32;
    if offsets.is_empty() {
        pdf_bytes.extend_from_slice(b"0000000000 65535 f\r\n");
    }

    for (idx, (object_id, offset)) in offsets.iter().enumerate() {
        let start = written;
        for free_id in start..*object_id {
            let mut next = free_id + 1;
            if next == *object_id {
                for (used_id, _) in &offsets[idx..] {
                    if next < *used_id {
                        break;
                    }
                    next = *used_id + 1;
                }
            }

            let generation = if free_id == 0 { "65535" } else { "00000" };
            pdf_bytes.extend_from_slice(
                format!("{:010} {} f\r\n", next % xref_len, generation).as_bytes(),
            );
            written += 1;
        }

        pdf_bytes.extend_from_slice(format!("{offset:010} 00000 n\r\n").as_bytes());
        written += 1;
    }

    pdf_bytes.extend_from_slice(b"trailer\n<<\n");
    pdf_bytes.extend_from_slice(format!("  /Size {xref_len}\n").as_bytes());
    pdf_bytes.extend_from_slice(format!("  /Root {} 0 R\n", catalog_ref.get()).as_bytes());
    if let Some(prev) = prev_startxref {
        pdf_bytes.extend_from_slice(format!("  /Prev {prev}\n").as_bytes());
    }
    pdf_bytes.extend_from_slice(b">>\n");
    pdf_bytes.extend_from_slice(b"startxref\n");
    pdf_bytes.extend_from_slice(format!("{xref_offset}\n").as_bytes());
    pdf_bytes.extend_from_slice(b"%%EOF");
}

/// Collect all indirect object offsets by scanning object headers.
fn collect_object_offsets(pdf_bytes: &[u8]) -> BTreeMap<i32, usize> {
    let mut offsets = BTreeMap::new();
    let mut line_start = 0;
    let mut idx = 0;

    while idx <= pdf_bytes.len() {
        let line_end = idx == pdf_bytes.len() || pdf_bytes[idx] == b'\n' || pdf_bytes[idx] == b'\r';
        if !line_end {
            idx += 1;
            continue;
        }

        if let Some(id) = parse_obj_header(&pdf_bytes[line_start..idx]) {
            offsets.insert(id, line_start);
        }

        if idx < pdf_bytes.len()
            && pdf_bytes[idx] == b'\r'
            && idx + 1 < pdf_bytes.len()
            && pdf_bytes[idx + 1] == b'\n'
        {
            idx += 2;
            line_start = idx;
            continue;
        }

        idx += 1;
        line_start = idx;
    }

    offsets
}

/// Parse an indirect object header line like "12 0 obj".
fn parse_obj_header(line: &[u8]) -> Option<i32> {
    let mut i = 0;
    while i < line.len() && line[i].is_ascii_whitespace() {
        i += 1;
    }

    if i >= line.len() || !line[i].is_ascii_digit() {
        return None;
    }

    let id_start = i;
    while i < line.len() && line[i].is_ascii_digit() {
        i += 1;
    }
    let id = std::str::from_utf8(&line[id_start..i])
        .ok()?
        .parse::<i32>()
        .ok()?;

    if i + 6 > line.len() || &line[i..i + 6] != b" 0 obj" {
        return None;
    }
    i += 6;

    while i < line.len() {
        if !line[i].is_ascii_whitespace() {
            return None;
        }
        i += 1;
    }

    Some(id)
}

/// Parse the last startxref value from the current PDF bytes.
fn find_last_startxref(pdf_bytes: &[u8]) -> Option<usize> {
    let marker = b"startxref";
    let marker_pos = pdf_bytes.windows(marker.len()).rposition(|w| w == marker)?;
    let mut idx = marker_pos + marker.len();

    while idx < pdf_bytes.len() && pdf_bytes[idx].is_ascii_whitespace() {
        idx += 1;
    }

    let start = idx;
    while idx < pdf_bytes.len() && pdf_bytes[idx].is_ascii_digit() {
        idx += 1;
    }

    if start == idx {
        return None;
    }

    std::str::from_utf8(&pdf_bytes[start..idx])
        .ok()?
        .parse()
        .ok()
}

/// Find the position of a byte pattern in a byte slice.
fn find_bytes(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    haystack.windows(needle.len()).position(|w| w == needle)
}

/// Write an annotation dictionary to a chunk.
fn write_annotation_dict(
    chunk: &mut Chunk,
    annot_ref: Ref,
    annot: &Annotation,
    ap_stream_ref: Ref,
    has_appearance: bool,
) {
    let mut annot_dict = chunk.annotation(annot_ref);
    let base = annot.base();

    annot_dict.rect(Rect::new(
        base.rect[0],
        base.rect[1],
        base.rect[2],
        base.rect[3],
    ));
    annot_dict.flags(pdf_writer::types::AnnotationFlags::from_bits_truncate(
        base.flags,
    ));

    if let Some(color) = &base.color {
        annot_dict.color_rgb(color.r, color.g, color.b);
    }

    if let Some(author) = &base.author {
        annot_dict.author(pdf_writer::TextStr(author));
    }

    if let Some(contents) = &base.contents {
        annot_dict.contents(pdf_writer::TextStr(contents));
    }

    if base.opacity < 1.0 {
        annot_dict.pair(Name(b"CA"), base.opacity);
    }

    if has_appearance {
        annot_dict.appearance().normal().stream(ap_stream_ref);
    }

    match annot {
        Annotation::Highlight(h) => {
            annot_dict.subtype(pdf_writer::types::AnnotationType::Highlight);
            if !h.quad_points.is_empty() {
                annot_dict.quad_points(h.quad_points.iter().copied());
            }
        }
        Annotation::Underline(u) => {
            annot_dict.subtype(pdf_writer::types::AnnotationType::Underline);
            if !u.quad_points.is_empty() {
                annot_dict.quad_points(u.quad_points.iter().copied());
            }
        }
        Annotation::StrikeOut(s) => {
            annot_dict.subtype(pdf_writer::types::AnnotationType::StrikeOut);
            if !s.quad_points.is_empty() {
                annot_dict.quad_points(s.quad_points.iter().copied());
            }
        }
        Annotation::Squiggly(s) => {
            annot_dict.subtype(pdf_writer::types::AnnotationType::Squiggly);
            if !s.quad_points.is_empty() {
                annot_dict.quad_points(s.quad_points.iter().copied());
            }
        }
        Annotation::FreeText(ft) => {
            annot_dict.pair(Name(b"Subtype"), Name(b"FreeText"));
            annot_dict.pair(
                Name(b"DA"),
                pdf_writer::Str(ft.default_appearance.as_bytes()),
            );
        }
        Annotation::Ink(ink) => {
            annot_dict.pair(Name(b"Subtype"), Name(b"Ink"));
            let mut ink_list_arr = annot_dict.insert(Name(b"InkList")).array();
            for path in &ink.ink_list {
                let mut path_arr = ink_list_arr.push().array();
                for point in path {
                    path_arr.item(point[0]);
                    path_arr.item(point[1]);
                }
            }
            ink_list_arr.finish();
        }
        Annotation::Square(shape) => {
            annot_dict.subtype(pdf_writer::types::AnnotationType::Square);
            if let Some(ic) = &shape.interior_color {
                annot_dict
                    .insert(Name(b"IC"))
                    .array()
                    .items([ic.r, ic.g, ic.b]);
            }
            annot_dict.border_style().width(shape.line_width);
        }
        Annotation::Circle(shape) => {
            annot_dict.subtype(pdf_writer::types::AnnotationType::Circle);
            if let Some(ic) = &shape.interior_color {
                annot_dict
                    .insert(Name(b"IC"))
                    .array()
                    .items([ic.r, ic.g, ic.b]);
            }
            annot_dict.border_style().width(shape.line_width);
        }
        Annotation::Line(line) => {
            annot_dict.subtype(pdf_writer::types::AnnotationType::Line);
            annot_dict.line_to(line.start[0], line.start[1], line.end[0], line.end[1]);
            annot_dict.border_style().width(line.line_width);
        }
        Annotation::Text(text) => {
            annot_dict.subtype(pdf_writer::types::AnnotationType::Text);
            if text.open {
                annot_dict.pair(Name(b"Open"), true);
            }
            let icon = match text.icon.as_str() {
                "Comment" => pdf_writer::types::AnnotationIcon::Comment,
                "Key" => pdf_writer::types::AnnotationIcon::Key,
                "Help" => pdf_writer::types::AnnotationIcon::Help,
                "NewParagraph" => pdf_writer::types::AnnotationIcon::NewParagraph,
                "Paragraph" => pdf_writer::types::AnnotationIcon::Paragraph,
                "Insert" => pdf_writer::types::AnnotationIcon::Insert,
                _ => pdf_writer::types::AnnotationIcon::Note,
            };
            annot_dict.icon(icon);
        }
        Annotation::Link(link) => {
            annot_dict.subtype(pdf_writer::types::AnnotationType::Link);
            if let Some(uri) = &link.uri {
                let mut action = annot_dict.action();
                action.action_type(pdf_writer::types::ActionType::Uri);
                action.pair(Name(b"URI"), pdf_writer::Str(uri.as_bytes()));
            }
        }
    }

    annot_dict.finish();
}
