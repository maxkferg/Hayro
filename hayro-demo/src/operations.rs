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
