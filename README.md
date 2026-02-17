# hayro

[![Crates.io](https://img.shields.io/crates/v/hayro.svg)](https://crates.io/crates/hayro)
[![Documentation](https://docs.rs/hayro/badge.svg)](https://docs.rs/hayro)

An experimental, work-in-progress PDF interpreter and renderer.

`hayro` is a Rust crate with a simple task: It allows you to interpret one or many pages of a PDF file to for example convert them into PNG or SVG files. This is a difficult task, as the PDF specification is _huge_ and contains many features. In addition to that, there are millions of PDF files out there with many edge cases, so a solid PDF renderer should be able to handle those as well as possible.

This is not the first attempt at writing a PDF renderer in Rust, but, to the best of my knowledge, this is currently the most feature-complete library. There are still certain features and edge cases that `hayro` currently doesn't support (for example rendering knockout groups or PDFs with non-embedded CID-fonts). However, the vast majority of common features is supported meaning that you should be able to render the "average" PDF file without encountering any issues. This statement is underpinned by the fact that `hayro` is able to handle the 1400+ PDFs in our test suite, which to a large part have been scraped from the `PDFBOX` and `pdf.js` test regression suites.

But, this crate is still in a very development stage, and there are issues that remain to be addressed, most notably performance, which has not been a focus at all so far but will become a priority in the near future.

## Crates
While the main goal of `hayro` is rendering PDF files, the `hayro` project actually encompasses a number of different crates which can in theory used independently. These include:
- [`hayro-syntax`](hayro-syntax): Low-level parsing and reading of PDF files.
- [`hayro-interpret`](hayro-interpret): A PDF interpreter emitting commands into an abstract `Device`.
- [`hayro`](hayro): Rendering PDF pages into bitmaps.
- [`hayro-svg`](hayro-svg): Converting PDF pages into SVG images.
- [`hayro-write`](hayro-write): Writing and editing PDF files.
- [`hayro-annot`](hayro-annot): Annotation support and related data structures.
- [`hayro-jpeg2000`](hayro-jpeg2000): A JPEG2000 image decoder.
- [`hayro-jbig2`](hayro-jbig2): A JBIG2 image decoder (this crate is still WIP and not recommended for external consumption
  yet, but it already is completely functional).
- [`hayro-ccitt`](hayro-ccitt): A decoder for group 3 and group 4 CCITT-encoded images.
- [`hayro-font`](hayro-font): A parser for Type1 and CFF fonts.
- [`hayro-postscript`](hayro-postscript): A lightweight scanner for a specific subset of PostScript.
- [`hayro-cmap`](hayro-cmap): A parser for CMap files in PDFs.
- [`hayro-demo`](hayro-demo): A WASM-based demo application.
- [`hayro-tests`](hayro-tests): Regression tests and PDF test corpus.
- [`hayro-fuzz`](hayro-fuzz): Fuzzing targets used to harden parsing and rendering.

## Folder structure
```text
.
├── hayro/             # Main renderer crate
├── hayro-interpret/   # PDF interpretation layer
├── hayro-syntax/      # Low-level PDF parser
├── hayro-svg/         # SVG output backend
├── hayro-write/       # PDF writing/editing utilities
├── hayro-annot/       # Annotation support
├── hayro-jpeg2000/    # JPEG2000 decoder
├── hayro-jbig2/       # JBIG2 decoder
├── hayro-ccitt/       # CCITT decoder
├── hayro-font/        # Type1/CFF font parsing
├── hayro-postscript/  # PostScript subset scanner
├── hayro-cmap/        # CMap parser
├── hayro-demo/        # WASM demo app
├── hayro-tests/       # Regression tests and fixtures
├── hayro-fuzz/        # Fuzz targets
├── assets/            # Shared assets and resources
└── .github/           # CI and deployment workflows
```

## Demo
A demo tool can be found at https://maxkferg.github.io/Hayro/. The demo is still intentionally lightweight, but now includes multi-page smooth scrolling, zoom controls, text selection, annotation undo/redo, and basic text/signature field authoring so larger workflows can be tested end-to-end.
