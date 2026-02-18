use hayro_annot::Annotation;
use std::collections::BTreeMap;

#[derive(Clone)]
pub(crate) struct ViewerOperation {
    pub(crate) page: usize,
    pub(crate) annotation: Annotation,
}

#[derive(Default)]
pub(crate) struct OperationHistory {
    operations: Vec<ViewerOperation>,
    redo_stack: Vec<ViewerOperation>,
}

impl OperationHistory {
    pub(crate) fn clear(&mut self) {
        self.operations.clear();
        self.redo_stack.clear();
    }

    pub(crate) fn push(&mut self, operation: ViewerOperation) {
        self.operations.push(operation);
        self.redo_stack.clear();
    }

    pub(crate) fn undo(&mut self) -> bool {
        if let Some(operation) = self.operations.pop() {
            self.redo_stack.push(operation);
            true
        } else {
            false
        }
    }

    pub(crate) fn redo(&mut self) -> bool {
        if let Some(operation) = self.redo_stack.pop() {
            self.operations.push(operation);
            true
        } else {
            false
        }
    }

    pub(crate) fn operation_count(&self) -> usize {
        self.operations.len()
    }

    pub(crate) fn redo_count(&self) -> usize {
        self.redo_stack.len()
    }

    pub(crate) fn page_count(&self, page: usize) -> usize {
        self.operations.iter().filter(|op| op.page == page).count()
    }

    pub(crate) fn is_empty(&self) -> bool {
        self.operations.is_empty()
    }

    pub(crate) fn grouped_operations(&self) -> Vec<(usize, Vec<Annotation>)> {
        let mut grouped = BTreeMap::<usize, Vec<Annotation>>::new();
        for op in &self.operations {
            grouped
                .entry(op.page)
                .or_default()
                .push(op.annotation.clone());
        }
        grouped.into_iter().collect()
    }

    /// Get all operations for a specific page as (global_index, &ViewerOperation) pairs.
    pub(crate) fn page_operations(&self, page: usize) -> Vec<(usize, &ViewerOperation)> {
        self.operations
            .iter()
            .enumerate()
            .filter(|(_, op)| op.page == page)
            .collect()
    }

    /// Update the rect (and internal geometry) of the annotation at a global index.
    ///
    /// For annotation types with internal point data (highlights, ink, lines),
    /// the points are transformed to match the new rect.
    pub(crate) fn update_rect_at(&mut self, index: usize, new_rect: [f32; 4]) -> bool {
        let Some(op) = self.operations.get_mut(index) else {
            return false;
        };

        let old_rect = op.annotation.base().rect;
        let old_w = (old_rect[2] - old_rect[0]).max(0.001);
        let old_h = (old_rect[3] - old_rect[1]).max(0.001);
        let new_w = new_rect[2] - new_rect[0];
        let new_h = new_rect[3] - new_rect[1];
        let sx = new_w / old_w;
        let sy = new_h / old_h;
        let dx = new_rect[0] - old_rect[0];
        let dy = new_rect[1] - old_rect[1];

        // Update type-specific internal geometry before changing the base rect.
        match &mut op.annotation {
            Annotation::Highlight(a) => {
                for pt in a.quad_points.chunks_exact_mut(2) {
                    pt[0] = new_rect[0] + (pt[0] - old_rect[0]) * sx;
                    pt[1] = new_rect[1] + (pt[1] - old_rect[1]) * sy;
                }
            }
            Annotation::Underline(a) => {
                for pt in a.quad_points.chunks_exact_mut(2) {
                    pt[0] = new_rect[0] + (pt[0] - old_rect[0]) * sx;
                    pt[1] = new_rect[1] + (pt[1] - old_rect[1]) * sy;
                }
            }
            Annotation::StrikeOut(a) => {
                for pt in a.quad_points.chunks_exact_mut(2) {
                    pt[0] = new_rect[0] + (pt[0] - old_rect[0]) * sx;
                    pt[1] = new_rect[1] + (pt[1] - old_rect[1]) * sy;
                }
            }
            Annotation::Squiggly(a) => {
                for pt in a.quad_points.chunks_exact_mut(2) {
                    pt[0] = new_rect[0] + (pt[0] - old_rect[0]) * sx;
                    pt[1] = new_rect[1] + (pt[1] - old_rect[1]) * sy;
                }
            }
            Annotation::Ink(a) => {
                for path in &mut a.ink_list {
                    for pt in path.iter_mut() {
                        pt[0] = new_rect[0] + (pt[0] - old_rect[0]) * sx;
                        pt[1] = new_rect[1] + (pt[1] - old_rect[1]) * sy;
                    }
                }
            }
            Annotation::Line(a) => {
                a.start[0] = new_rect[0] + (a.start[0] - old_rect[0]) * sx;
                a.start[1] = new_rect[1] + (a.start[1] - old_rect[1]) * sy;
                a.end[0] = new_rect[0] + (a.end[0] - old_rect[0]) * sx;
                a.end[1] = new_rect[1] + (a.end[1] - old_rect[1]) * sy;
            }
            // Types that only have a rect — no extra geometry to update.
            Annotation::FreeText(_)
            | Annotation::Square(_)
            | Annotation::Circle(_)
            | Annotation::Text(_)
            | Annotation::Link(_)
            | Annotation::TextField(_)
            | Annotation::SignatureField(_) => {}
        }

        // Now update the base rect.
        op.annotation.base_mut().rect = new_rect;
        let _ = (dx, dy); // used implicitly through new_rect[0]-old_rect[0]
        self.redo_stack.clear();
        true
    }

    /// Remove the annotation at a global index.
    pub(crate) fn remove_at(&mut self, index: usize) -> bool {
        if index < self.operations.len() {
            self.operations.remove(index);
            self.redo_stack.clear();
            true
        } else {
            false
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use hayro_annot::{AnnotationBase, FreeTextAnnot};

    fn sample_annotation(text: &str) -> Annotation {
        Annotation::FreeText(FreeTextAnnot {
            base: AnnotationBase {
                rect: [0.0, 0.0, 10.0, 10.0],
                ..Default::default()
            },
            text: text.to_string(),
            font_size: 12.0,
            default_appearance: "0 0 0 rg /Helv 12 Tf".to_string(),
        })
    }

    #[test]
    fn undo_redo_roundtrip() {
        let mut history = OperationHistory::default();
        history.push(ViewerOperation {
            page: 0,
            annotation: sample_annotation("A"),
        });
        history.push(ViewerOperation {
            page: 0,
            annotation: sample_annotation("B"),
        });

        assert_eq!(history.operation_count(), 2);
        assert!(history.undo());
        assert_eq!(history.operation_count(), 1);
        assert_eq!(history.redo_count(), 1);
        assert!(history.redo());
        assert_eq!(history.operation_count(), 2);
        assert_eq!(history.redo_count(), 0);
    }

    #[test]
    fn new_push_clears_redo_stack() {
        let mut history = OperationHistory::default();
        history.push(ViewerOperation {
            page: 0,
            annotation: sample_annotation("A"),
        });
        assert!(history.undo());
        assert_eq!(history.redo_count(), 1);

        history.push(ViewerOperation {
            page: 1,
            annotation: sample_annotation("B"),
        });
        assert_eq!(history.redo_count(), 0);
        assert_eq!(history.operation_count(), 1);
    }

    #[test]
    fn page_operations_returns_filtered_entries() {
        let mut history = OperationHistory::default();
        history.push(ViewerOperation {
            page: 0,
            annotation: sample_annotation("A"),
        });
        history.push(ViewerOperation {
            page: 1,
            annotation: sample_annotation("B"),
        });
        history.push(ViewerOperation {
            page: 0,
            annotation: sample_annotation("C"),
        });

        let page0 = history.page_operations(0);
        assert_eq!(page0.len(), 2);
        assert_eq!(page0[0].0, 0); // global index
        assert_eq!(page0[1].0, 2); // global index

        let page1 = history.page_operations(1);
        assert_eq!(page1.len(), 1);
        assert_eq!(page1[0].0, 1);
    }

    #[test]
    fn update_rect_at_changes_base_rect() {
        let mut history = OperationHistory::default();
        history.push(ViewerOperation {
            page: 0,
            annotation: sample_annotation("A"),
        });

        assert!(history.update_rect_at(0, [5.0, 5.0, 20.0, 20.0]));
        let rect = history.page_operations(0)[0].1.annotation.base().rect;
        assert_eq!(rect, [5.0, 5.0, 20.0, 20.0]);
    }

    #[test]
    fn update_rect_at_clears_redo_stack() {
        let mut history = OperationHistory::default();
        history.push(ViewerOperation {
            page: 0,
            annotation: sample_annotation("A"),
        });
        history.push(ViewerOperation {
            page: 0,
            annotation: sample_annotation("B"),
        });
        assert!(history.undo());
        assert_eq!(history.redo_count(), 1);

        assert!(history.update_rect_at(0, [1.0, 1.0, 2.0, 2.0]));
        assert_eq!(history.redo_count(), 0);
    }

    #[test]
    fn update_rect_at_out_of_bounds_returns_false() {
        let mut history = OperationHistory::default();
        assert!(!history.update_rect_at(0, [0.0, 0.0, 1.0, 1.0]));
    }

    #[test]
    fn remove_at_removes_and_clears_redo() {
        let mut history = OperationHistory::default();
        history.push(ViewerOperation {
            page: 0,
            annotation: sample_annotation("A"),
        });
        history.push(ViewerOperation {
            page: 0,
            annotation: sample_annotation("B"),
        });
        history.push(ViewerOperation {
            page: 0,
            annotation: sample_annotation("C"),
        });
        // Undo last so redo stack has 1
        assert!(history.undo());
        assert_eq!(history.redo_count(), 1);

        assert!(history.remove_at(0));
        assert_eq!(history.operation_count(), 1);
        assert_eq!(history.redo_count(), 0); // cleared
    }

    #[test]
    fn remove_at_out_of_bounds_returns_false() {
        let mut history = OperationHistory::default();
        assert!(!history.remove_at(0));
    }

    #[test]
    fn grouped_operations_preserve_page_buckets() {
        let mut history = OperationHistory::default();
        history.push(ViewerOperation {
            page: 1,
            annotation: sample_annotation("A"),
        });
        history.push(ViewerOperation {
            page: 0,
            annotation: sample_annotation("B"),
        });
        history.push(ViewerOperation {
            page: 1,
            annotation: sample_annotation("C"),
        });

        let grouped = history.grouped_operations();
        assert_eq!(grouped.len(), 2);
        assert_eq!(grouped[0].0, 0);
        assert_eq!(grouped[0].1.len(), 1);
        assert_eq!(grouped[1].0, 1);
        assert_eq!(grouped[1].1.len(), 2);
    }
}
