//! Annotation type definitions.

/// An RGB color with components in the 0.0..1.0 range.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct AnnotColor {
    /// Red component.
    pub r: f32,
    /// Green component.
    pub g: f32,
    /// Blue component.
    pub b: f32,
}

impl AnnotColor {
    /// Create a new color.
    pub fn new(r: f32, g: f32, b: f32) -> Self {
        Self { r, g, b }
    }

    /// Yellow color (default for highlights).
    pub fn yellow() -> Self {
        Self::new(1.0, 1.0, 0.0)
    }

    /// Red color.
    pub fn red() -> Self {
        Self::new(1.0, 0.0, 0.0)
    }

    /// Black color.
    pub fn black() -> Self {
        Self::new(0.0, 0.0, 0.0)
    }
}

/// Base annotation fields shared by all annotation types.
#[derive(Debug, Clone)]
pub struct AnnotationBase {
    /// The annotation rectangle in PDF coordinates `[x0, y0, x1, y1]`.
    pub rect: [f32; 4],
    /// The annotation color (used for border/background depending on type).
    pub color: Option<AnnotColor>,
    /// The author/title of the annotation.
    pub author: Option<String>,
    /// The text contents of the annotation.
    pub contents: Option<String>,
    /// The modification date as a PDF date string.
    pub modified: Option<String>,
    /// Annotation flags bitmask (see PDF spec Table 165).
    /// Bit 2 (value 4) = Print flag.
    pub flags: u32,
    /// Opacity from 0.0 (transparent) to 1.0 (opaque). Default is 1.0.
    pub opacity: f32,
}

impl Default for AnnotationBase {
    fn default() -> Self {
        Self {
            rect: [0.0, 0.0, 0.0, 0.0],
            color: None,
            author: None,
            contents: None,
            modified: None,
            flags: 4, // Print flag set by default
            opacity: 1.0,
        }
    }
}

/// A PDF annotation that can be created and written.
#[derive(Debug, Clone)]
pub enum Annotation {
    /// A highlight markup annotation.
    Highlight(HighlightAnnot),
    /// An underline markup annotation.
    Underline(UnderlineAnnot),
    /// A strikeout markup annotation.
    StrikeOut(StrikeOutAnnot),
    /// A squiggly underline markup annotation.
    Squiggly(SquigglyAnnot),
    /// A free text (text box) annotation.
    FreeText(FreeTextAnnot),
    /// An ink (freehand drawing) annotation.
    Ink(InkAnnot),
    /// A square (rectangle) annotation.
    Square(ShapeAnnot),
    /// A circle (ellipse) annotation.
    Circle(ShapeAnnot),
    /// A line annotation.
    Line(LineAnnot),
    /// A text (sticky note) annotation.
    Text(TextAnnot),
    /// A link annotation.
    Link(LinkAnnot),
}

impl Annotation {
    /// Get the base annotation data.
    pub fn base(&self) -> &AnnotationBase {
        match self {
            Self::Highlight(a) => &a.base,
            Self::Underline(a) => &a.base,
            Self::StrikeOut(a) => &a.base,
            Self::Squiggly(a) => &a.base,
            Self::FreeText(a) => &a.base,
            Self::Ink(a) => &a.base,
            Self::Square(a) => &a.base,
            Self::Circle(a) => &a.base,
            Self::Line(a) => &a.base,
            Self::Text(a) => &a.base,
            Self::Link(a) => &a.base,
        }
    }
}

/// A highlight markup annotation.
#[derive(Debug, Clone)]
pub struct HighlightAnnot {
    /// Base annotation fields.
    pub base: AnnotationBase,
    /// QuadPoints — groups of 8 floats defining the highlighted regions.
    /// Each group of 8 defines 4 points (x1,y1, x2,y2, x3,y3, x4,y4).
    pub quad_points: Vec<f32>,
}

/// An underline markup annotation.
#[derive(Debug, Clone)]
pub struct UnderlineAnnot {
    /// Base annotation fields.
    pub base: AnnotationBase,
    /// QuadPoints — groups of 8 floats.
    pub quad_points: Vec<f32>,
}

/// A strikeout markup annotation.
#[derive(Debug, Clone)]
pub struct StrikeOutAnnot {
    /// Base annotation fields.
    pub base: AnnotationBase,
    /// QuadPoints — groups of 8 floats.
    pub quad_points: Vec<f32>,
}

/// A squiggly underline markup annotation.
#[derive(Debug, Clone)]
pub struct SquigglyAnnot {
    /// Base annotation fields.
    pub base: AnnotationBase,
    /// QuadPoints — groups of 8 floats.
    pub quad_points: Vec<f32>,
}

/// A free text (text box) annotation.
#[derive(Debug, Clone)]
pub struct FreeTextAnnot {
    /// Base annotation fields.
    pub base: AnnotationBase,
    /// The text content to display.
    pub text: String,
    /// Font size in points.
    pub font_size: f32,
    /// Default appearance string (e.g. `"0 0 0 rg /Helv 12 Tf"`).
    pub default_appearance: String,
}

/// An ink (freehand drawing) annotation.
#[derive(Debug, Clone)]
pub struct InkAnnot {
    /// Base annotation fields.
    pub base: AnnotationBase,
    /// List of ink paths. Each path is a list of `[x, y]` points.
    pub ink_list: Vec<Vec<[f32; 2]>>,
    /// The stroke line width.
    pub line_width: f32,
}

/// A shape (square or circle) annotation.
#[derive(Debug, Clone)]
pub struct ShapeAnnot {
    /// Base annotation fields.
    pub base: AnnotationBase,
    /// Optional interior (fill) color.
    pub interior_color: Option<AnnotColor>,
    /// The border line width.
    pub line_width: f32,
    /// Whether this is a circle (`true`) or square (`false`).
    pub is_circle: bool,
}

/// A line annotation.
#[derive(Debug, Clone)]
pub struct LineAnnot {
    /// Base annotation fields.
    pub base: AnnotationBase,
    /// Start point `[x, y]` in PDF coordinates.
    pub start: [f32; 2],
    /// End point `[x, y]` in PDF coordinates.
    pub end: [f32; 2],
    /// The stroke line width.
    pub line_width: f32,
}

/// A text (sticky note) annotation.
#[derive(Debug, Clone)]
pub struct TextAnnot {
    /// Base annotation fields.
    pub base: AnnotationBase,
    /// Whether the popup is initially open.
    pub open: bool,
    /// The icon name (e.g. `"Note"`, `"Comment"`, `"Key"`).
    pub icon: String,
}

/// A link annotation.
#[derive(Debug, Clone)]
pub struct LinkAnnot {
    /// Base annotation fields.
    pub base: AnnotationBase,
    /// The URI to link to.
    pub uri: Option<String>,
    /// The destination page index (0-based).
    pub dest_page: Option<usize>,
}
