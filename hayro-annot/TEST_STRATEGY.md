# PDF Annotation Persistence Test Strategy

## Goal

Ensure that creating annotations in the demo and library:

1. Persists annotations after creation (no flash/disappear behavior).
2. Produces structurally valid PDFs (valid `startxref` and xref table).
3. Works for both simple and real-world page dictionaries.

## Automated Coverage

### 1) Unit/Integration tests (`hayro-annot/tests/roundtrip.rs`)

- **Roundtrip tests per annotation type**
  - Highlight, ink, square, free text, and multiple annotations.
  - Verify:
    - `save_annotations` succeeds.
    - Output parses via `hayro_syntax::Pdf::new`.
    - Page `/Annots` is present and count is expected.

- **Xref integrity checks**
  - Assert final `startxref` points to an `xref` section in generated output.
  - Guards against post-processing that invalidates offsets.

- **Nested page dictionary regression**
  - Build a PDF page with nested `/Resources` dictionaries.
  - Add annotation and verify output remains valid with `/Annots`.
  - Specifically guards against inserting `/Annots` at the wrong `>>`.

### 2) Optional fixture regression extension (recommended)

Add one or more real-world PDFs from `hayro-tests/pdfs/custom` as fixtures for:

- complex resources
- malformed original xref (recoverable)
- image-heavy pages

For each fixture:

- run `save_annotations`
- parse output
- verify `/Annots` and `startxref` correctness

## Manual QA (Demo / Browser)

Run the PDF demo and verify:

1. Load a simple PDF and create each annotation type (highlight, rectangle, ink, text).
2. Ensure annotation remains visible after mouse-up (no disappearance).
3. Navigate pages and return; annotation remains visible.
4. Use **Undo** and confirm only latest annotation is removed.
5. Use **Save**, reopen saved PDF in demo and external reader; annotation persists.
6. Repeat with at least one complex PDF that previously emitted xref/stream warnings.

## CI Expectations

- Run: `cargo +nightly test -p hayro-annot`
- Block merges on any failing `roundtrip` tests.
- Keep nested-dictionary + xref integrity checks mandatory (non-optional).

## Regression Signals to Watch

- Repeated parser warnings immediately after annotation creation:
  - `xref table was invalid`
  - stream parse fallback warnings
- Annotation count increases but rendered annotation disappears.
- Saved file opens with repair warnings in external PDF readers.
