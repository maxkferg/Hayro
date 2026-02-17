use console_error_panic_hook;
use hayro::RenderSettings;
use hayro::hayro_interpret::InterpreterSettings;
use hayro::hayro_syntax::Pdf;
use hayro_annot::{
    AnnotColor, Annotation, AnnotationBase, FreeTextAnnot, HighlightAnnot, InkAnnot, ShapeAnnot,
};
use js_sys;
use vello_cpu::color::palette::css::WHITE;
use wasm_bindgen::prelude::*;

struct ConsoleLogger;

impl log::Log for ConsoleLogger {
    fn enabled(&self, metadata: &log::Metadata) -> bool {
        metadata.level() <= log::LevelFilter::Warn
    }

    fn log(&self, record: &log::Record) {
        if self.enabled(record.metadata()) {
            let message = format!(
                "[{}:{}] {}",
                record.target(),
                record.line().unwrap_or(0),
                record.args()
            );

            let level_str = match record.level() {
                log::Level::Error => "error",
                log::Level::Warn => "warn",
                log::Level::Info => "info",
                log::Level::Debug => "debug",
                log::Level::Trace => "trace",
            };

            match record.level() {
                log::Level::Error => web_sys::console::error_1(&message.clone().into()),
                log::Level::Warn => web_sys::console::warn_1(&message.clone().into()),
                _ => web_sys::console::log_1(&message.clone().into()),
            }

            if let Some(window) = web_sys::window() {
                if let Ok(add_log_entry) = js_sys::Reflect::get(&window, &"addLogEntry".into()) {
                    if add_log_entry.is_function() {
                        let function = js_sys::Function::from(add_log_entry);
                        let _ = function.call2(&window, &level_str.into(), &message.into());
                    }
                }
            }
        }
    }

    fn flush(&self) {}
}

static LOGGER: ConsoleLogger = ConsoleLogger;

#[wasm_bindgen]
pub struct PdfViewer {
    pdf: Option<Pdf>,
    pdf_data: Vec<u8>,
    current_page: usize,
    total_pages: usize,
    pending_annotations: Vec<(usize, Vec<Annotation>)>,
}

#[wasm_bindgen]
impl PdfViewer {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        console_error_panic_hook::set_once();

        if log::set_logger(&LOGGER).is_ok() {
            log::set_max_level(log::LevelFilter::Warn);
        }

        Self {
            pdf: None,
            pdf_data: Vec::new(),
            current_page: 0,
            total_pages: 0,
            pending_annotations: Vec::new(),
        }
    }

    #[wasm_bindgen]
    pub fn load_pdf(&mut self, data: &[u8]) -> Result<(), JsValue> {
        let pdf = Pdf::new(data.to_vec()).map_err(|_| JsValue::from_str("Failed to parse PDF"))?;

        let pages = pdf.pages();

        self.total_pages = pages.len();
        self.pdf_data = data.to_vec();
        self.pdf = Some(pdf);
        self.current_page = 0;
        self.pending_annotations.clear();

        Ok(())
    }

    #[wasm_bindgen]
    pub fn render_current_page(
        &self,
        viewport_width: f32,
        viewport_height: f32,
        device_pixel_ratio: f32,
    ) -> Result<js_sys::Array, JsValue> {
        let pdf = self.pdf.as_ref().ok_or("No PDF loaded")?;
        let page = pdf
            .pages()
            .get(self.current_page)
            .ok_or("Page out of bounds")?;

        let interpreter_settings = InterpreterSettings::default();
        let (base_width, base_height) = page.render_dimensions();

        // Calculate scale to fit in viewport (accounting for device pixel ratio)
        let target_width = viewport_width * device_pixel_ratio;
        let target_height = viewport_height * device_pixel_ratio;

        let scale_x = target_width / base_width;
        let scale_y = target_height / base_height;
        let scale = scale_x.min(scale_y);

        // Render at the calculated scale
        let render_settings = RenderSettings {
            x_scale: scale,
            y_scale: scale,
            bg_color: WHITE,
            ..Default::default()
        };

        let pixmap = hayro::render(page, &interpreter_settings, &render_settings);

        // Return array: [width, height, pixel_data]
        let result = js_sys::Array::new_with_length(3);
        result.set(0, JsValue::from(pixmap.width()));
        result.set(1, JsValue::from(pixmap.height()));

        // Cast Vec<Rgba8> to Vec<u8>
        let rgba_data = pixmap.take_unpremultiplied();
        let byte_data: Vec<u8> = bytemuck::cast_vec(rgba_data);
        result.set(2, JsValue::from(byte_data));

        Ok(result)
    }

    #[wasm_bindgen]
    pub fn next_page(&mut self) -> bool {
        if self.current_page + 1 < self.total_pages {
            self.current_page += 1;
            true
        } else {
            false
        }
    }

    #[wasm_bindgen]
    pub fn previous_page(&mut self) -> bool {
        if self.current_page > 0 {
            self.current_page -= 1;
            true
        } else {
            false
        }
    }

    #[wasm_bindgen]
    pub fn set_page(&mut self, page: usize) -> bool {
        if page > 0 && page <= self.total_pages {
            self.current_page = page - 1;
            true
        } else {
            false
        }
    }

    #[wasm_bindgen]
    pub fn get_current_page(&self) -> usize {
        self.current_page + 1
    }

    #[wasm_bindgen]
    pub fn get_total_pages(&self) -> usize {
        self.total_pages
    }

    /// Get page info for coordinate mapping.
    /// Returns [width_pts, height_pts, crop_x0, crop_y0, crop_x1, crop_y1, rotation].
    #[wasm_bindgen]
    pub fn get_page_info(&self) -> Result<js_sys::Float32Array, JsValue> {
        let pdf = self.pdf.as_ref().ok_or("No PDF loaded")?;
        let page = pdf
            .pages()
            .get(self.current_page)
            .ok_or("Page out of bounds")?;

        let (width, height) = page.render_dimensions();
        let crop_box = page.intersected_crop_box();
        let rotation = match page.rotation() {
            hayro::hayro_syntax::page::Rotation::None => 0.0_f32,
            hayro::hayro_syntax::page::Rotation::Horizontal => 90.0,
            hayro::hayro_syntax::page::Rotation::Flipped => 180.0,
            hayro::hayro_syntax::page::Rotation::FlippedHorizontal => 270.0,
        };

        let data = [
            width,
            height,
            crop_box.x0 as f32,
            crop_box.y0 as f32,
            crop_box.x1 as f32,
            crop_box.y1 as f32,
            rotation,
        ];

        Ok(js_sys::Float32Array::from(&data[..]))
    }

    /// Add a highlight annotation to the current page.
    /// quad_points: flat array of coordinates [x1,y1,x2,y2,...] in PDF space.
    #[wasm_bindgen]
    pub fn add_highlight(
        &mut self,
        quad_points: &[f32],
        r: f32,
        g: f32,
        b: f32,
    ) -> bool {
        if self.pdf.is_none() {
            return false;
        }

        // Calculate bounding rect from quad points
        let rect = rect_from_quad_points(quad_points);

        let annot = Annotation::Highlight(HighlightAnnot {
            base: AnnotationBase {
                rect,
                color: Some(AnnotColor::new(r, g, b)),
                flags: 4, // Print
                opacity: 0.5,
                ..Default::default()
            },
            quad_points: quad_points.to_vec(),
        });

        self.add_annotation_to_page(annot);
        true
    }

    /// Add an ink (freehand) annotation to the current page.
    /// points: flat array [x1,y1,x2,y2,...] in PDF space.
    #[wasm_bindgen]
    pub fn add_ink(
        &mut self,
        points: &[f32],
        r: f32,
        g: f32,
        b: f32,
        line_width: f32,
    ) -> bool {
        if self.pdf.is_none() || points.len() < 4 {
            return false;
        }

        let ink_path: Vec<[f32; 2]> = points.chunks(2).map(|c| [c[0], c[1]]).collect();
        let rect = rect_from_points(&ink_path, line_width);

        let annot = Annotation::Ink(InkAnnot {
            base: AnnotationBase {
                rect,
                color: Some(AnnotColor::new(r, g, b)),
                flags: 4,
                ..Default::default()
            },
            ink_list: vec![ink_path],
            line_width,
        });

        self.add_annotation_to_page(annot);
        true
    }

    /// Add a rectangle annotation to the current page.
    /// Coordinates in PDF space.
    #[wasm_bindgen]
    pub fn add_rectangle(
        &mut self,
        x0: f32,
        y0: f32,
        x1: f32,
        y1: f32,
        r: f32,
        g: f32,
        b: f32,
    ) -> bool {
        if self.pdf.is_none() {
            return false;
        }

        let rect = [x0.min(x1), y0.min(y1), x0.max(x1), y0.max(y1)];

        let annot = Annotation::Square(ShapeAnnot {
            base: AnnotationBase {
                rect,
                color: Some(AnnotColor::new(r, g, b)),
                flags: 4,
                ..Default::default()
            },
            interior_color: None,
            line_width: 2.0,
            is_circle: false,
        });

        self.add_annotation_to_page(annot);
        true
    }

    /// Add a free text annotation to the current page.
    #[wasm_bindgen]
    pub fn add_freetext(
        &mut self,
        x0: f32,
        y0: f32,
        x1: f32,
        y1: f32,
        text: &str,
        font_size: f32,
    ) -> bool {
        if self.pdf.is_none() || text.is_empty() {
            return false;
        }

        let rect = [x0.min(x1), y0.min(y1), x0.max(x1), y0.max(y1)];

        let annot = Annotation::FreeText(FreeTextAnnot {
            base: AnnotationBase {
                rect,
                color: Some(AnnotColor::black()),
                flags: 4,
                ..Default::default()
            },
            text: text.to_string(),
            font_size,
            default_appearance: format!("0 0 0 rg /Helv {} Tf", font_size),
        });

        self.add_annotation_to_page(annot);
        true
    }

    /// Remove the last annotation added to the current page (undo).
    #[wasm_bindgen]
    pub fn undo_annotation(&mut self) -> bool {
        let page = self.current_page;

        if let Some(entry) = self
            .pending_annotations
            .iter_mut()
            .find(|(idx, _)| *idx == page)
        {
            if entry.1.pop().is_some() {
                if entry.1.is_empty() {
                    self.pending_annotations.retain(|(idx, _)| *idx != page);
                }
                // Reload the PDF from the original data to reset rendering
                if let Ok(pdf) = Pdf::new(self.pdf_data.clone()) {
                    self.pdf = Some(pdf);
                }
                return true;
            }
        }
        false
    }

    /// Save the PDF with all pending annotations and return the bytes.
    #[wasm_bindgen]
    pub fn save(&self) -> Result<Vec<u8>, JsValue> {
        if self.pdf.is_none() {
            return Err(JsValue::from_str("No PDF loaded"));
        }

        if self.pending_annotations.is_empty() {
            // No annotations — return original data
            return Ok(self.pdf_data.clone());
        }

        let page_annots: Vec<(usize, Vec<Annotation>)> = self
            .pending_annotations
            .iter()
            .map(|(idx, annots)| (*idx, annots.clone()))
            .collect();

        hayro_annot::save_annotations(&self.pdf_data, &page_annots)
            .map_err(|e| JsValue::from_str(&format!("Save failed: {e}")))
    }

    /// Get the number of pending annotations on the current page.
    #[wasm_bindgen]
    pub fn get_annotation_count(&self) -> usize {
        self.pending_annotations
            .iter()
            .find(|(idx, _)| *idx == self.current_page)
            .map(|(_, annots)| annots.len())
            .unwrap_or(0)
    }

    fn add_annotation_to_page(&mut self, annot: Annotation) {
        let page = self.current_page;

        if let Some(entry) = self
            .pending_annotations
            .iter_mut()
            .find(|(idx, _)| *idx == page)
        {
            entry.1.push(annot);
        } else {
            self.pending_annotations.push((page, vec![annot]));
        }

        // Rebuild PDF with annotations to show them immediately
        self.rebuild_pdf_with_annotations();
    }

    fn rebuild_pdf_with_annotations(&mut self) {
        let page_annots: Vec<(usize, Vec<Annotation>)> = self
            .pending_annotations
            .iter()
            .map(|(idx, annots)| (*idx, annots.clone()))
            .collect();

        match hayro_annot::save_annotations(&self.pdf_data, &page_annots) {
            Ok(new_data) => {
                if let Ok(new_pdf) = Pdf::new(new_data) {
                    self.pdf = Some(new_pdf);
                }
            }
            Err(e) => {
                log::warn!("Failed to rebuild PDF with annotations: {e}");
            }
        }
    }
}

/// Calculate a bounding rect from quad points.
fn rect_from_quad_points(quad_points: &[f32]) -> [f32; 4] {
    if quad_points.len() < 8 {
        return [0.0, 0.0, 0.0, 0.0];
    }

    let mut min_x = f32::MAX;
    let mut min_y = f32::MAX;
    let mut max_x = f32::MIN;
    let mut max_y = f32::MIN;

    for chunk in quad_points.chunks(2) {
        if chunk.len() == 2 {
            min_x = min_x.min(chunk[0]);
            min_y = min_y.min(chunk[1]);
            max_x = max_x.max(chunk[0]);
            max_y = max_y.max(chunk[1]);
        }
    }

    [min_x, min_y, max_x, max_y]
}

/// Calculate a bounding rect from a list of points with padding.
fn rect_from_points(points: &[[f32; 2]], padding: f32) -> [f32; 4] {
    if points.is_empty() {
        return [0.0, 0.0, 0.0, 0.0];
    }

    let mut min_x = f32::MAX;
    let mut min_y = f32::MAX;
    let mut max_x = f32::MIN;
    let mut max_y = f32::MIN;

    for p in points {
        min_x = min_x.min(p[0]);
        min_y = min_y.min(p[1]);
        max_x = max_x.max(p[0]);
        max_y = max_y.max(p[1]);
    }

    [
        min_x - padding,
        min_y - padding,
        max_x + padding,
        max_y + padding,
    ]
}
