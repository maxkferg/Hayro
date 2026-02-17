/*!
A crate for creating and writing PDF annotations.

This crate provides the ability to create various types of PDF annotations
(highlights, ink drawings, text boxes, shapes, etc.) and serialize them
into valid PDF data via incremental save.

It is designed to work with the `hayro` ecosystem of PDF crates, building
on `hayro-syntax` for reading existing PDF structure and `pdf-writer` for
generating new PDF objects.
*/

#![forbid(unsafe_code)]
#![deny(missing_docs)]

mod appearance;
mod coord;
mod types;
mod writer;

pub use appearance::*;
pub use coord::*;
pub use types::*;
pub use writer::*;
