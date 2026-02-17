pub(crate) fn rect_from_quad_points(quad_points: &[f32]) -> [f32; 4] {
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

pub(crate) fn rect_from_points(points: &[[f32; 2]], padding: f32) -> [f32; 4] {
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn quad_points_rect_normalizes() {
        let rect = rect_from_quad_points(&[5.0, 7.0, 1.0, 8.0, 0.0, 2.0, 9.0, 1.0]);
        assert_eq!(rect, [0.0, 1.0, 9.0, 8.0]);
    }

    #[test]
    fn rect_from_points_applies_padding() {
        let rect = rect_from_points(&[[2.0, 3.0], [10.0, 8.0], [4.0, 7.0]], 2.0);
        assert_eq!(rect, [0.0, 1.0, 12.0, 10.0]);
    }
}
