//! Pink macro-block grid on captures. The agent picks 1-based blockX/blockY (each block is
//! 10×10 small squares = 160×160 px). We convert to capture pixels internally.

use screenshots::image::RgbaImage;

/// Small squares per macro block edge (160px blocks on a 16px fine grid).
pub const BLOCK_SQUARES: u32 = 10;

pub const GRID_CELL_PX: u32 = 16;

pub const BLOCK_PX: u32 = BLOCK_SQUARES * GRID_CELL_PX;

const GRID_MINOR_RGBA: [u8; 4] = [0, 220, 255, 70];
const GRID_MAJOR_RGBA: [u8; 4] = [255, 60, 200, 180];
const LABEL_RGBA: [u8; 4] = [255, 255, 80, 230];

pub fn block_dimensions(image_width: u32, image_height: u32) -> (u32, u32) {
    (
        image_width.div_ceil(BLOCK_PX),
        image_height.div_ceil(BLOCK_PX),
    )
}

pub fn block_center_px(block_x: i32, block_y: i32) -> (i32, i32) {
    let half = (BLOCK_PX / 2) as i32;
    (
        (block_x - 1) * BLOCK_PX as i32 + half,
        (block_y - 1) * BLOCK_PX as i32 + half,
    )
}

pub fn capture_px_to_block(image_x: i32, image_y: i32) -> (i32, i32) {
    let col = (image_x / BLOCK_PX as i32).max(0);
    let row = (image_y / BLOCK_PX as i32).max(0);
    (col + 1, row + 1)
}

pub fn clamp_block(
    block_x: i32,
    block_y: i32,
    block_columns: u32,
    block_rows: u32,
) -> (i32, i32) {
    (
        block_x.clamp(1, block_columns as i32),
        block_y.clamp(1, block_rows as i32),
    )
}

fn blend_pixel(img: &mut RgbaImage, x: u32, y: u32, color: [u8; 4]) {
    if x >= img.width() || y >= img.height() {
        return;
    }
    let pixel = img.get_pixel_mut(x, y);
    let alpha = color[3] as f32 / 255.0;
    for i in 0..3 {
        pixel.0[i] =
            ((1.0 - alpha) * pixel.0[i] as f32 + alpha * color[i] as f32).round() as u8;
    }
}

fn set_pixel_opaque(img: &mut RgbaImage, x: u32, y: u32, color: [u8; 4]) {
    if x >= img.width() || y >= img.height() {
        return;
    }
    img.get_pixel_mut(x, y).0 = color;
}

fn draw_vertical_line(img: &mut RgbaImage, x: u32, color: [u8; 4], thickness: u32) {
    let height = img.height();
    for offset in 0..thickness {
        let line_x = x.saturating_add(offset);
        if line_x >= img.width() {
            break;
        }
        for y in 0..height {
            blend_pixel(img, line_x, y, color);
        }
    }
}

fn draw_horizontal_line(img: &mut RgbaImage, y: u32, color: [u8; 4], thickness: u32) {
    let width = img.width();
    for offset in 0..thickness {
        let line_y = y.saturating_add(offset);
        if line_y >= img.height() {
            break;
        }
        for x in 0..width {
            blend_pixel(img, x, line_y, color);
        }
    }
}

const DIGIT_3X5: [[u8; 15]; 10] = [
    [1, 1, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 1, 1],
    [0, 1, 0, 1, 1, 0, 0, 1, 0, 0, 1, 0, 1, 1, 1],
    [1, 1, 1, 0, 0, 1, 1, 1, 1, 1, 0, 0, 1, 1, 1],
    [1, 1, 1, 0, 0, 1, 1, 1, 1, 0, 0, 1, 1, 1, 1],
    [1, 0, 1, 1, 0, 1, 1, 1, 1, 0, 0, 1, 0, 0, 1],
    [1, 1, 1, 1, 0, 0, 1, 1, 1, 0, 0, 1, 1, 1, 1],
    [1, 1, 1, 1, 0, 0, 1, 1, 1, 1, 0, 1, 1, 1, 1],
    [1, 1, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
    [1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1],
    [1, 1, 1, 1, 0, 1, 1, 1, 1, 0, 0, 1, 1, 1, 1],
];

fn draw_digit(img: &mut RgbaImage, origin_x: u32, origin_y: u32, digit: u8) {
    if digit > 9 {
        return;
    }
    let pattern = DIGIT_3X5[digit as usize];
    for row in 0..5u32 {
        for col in 0..3u32 {
            if pattern[(row * 3 + col) as usize] == 1 {
                set_pixel_opaque(img, origin_x + col, origin_y + row, LABEL_RGBA);
            }
        }
    }
}

fn draw_number(img: &mut RgbaImage, origin_x: u32, origin_y: u32, mut value: u32) {
    if value == 0 {
        draw_digit(img, origin_x, origin_y, 0);
        return;
    }
    let mut digits = Vec::new();
    while value > 0 {
        digits.push((value % 10) as u8);
        value /= 10;
    }
    digits.reverse();
    for (index, digit) in digits.iter().enumerate() {
        draw_digit(img, origin_x + index as u32 * 4, origin_y, *digit);
    }
}

/// Label blockX on the top row of blocks, blockY on the left column — matches agent coordinates.
fn draw_block_labels(img: &mut RgbaImage, block_columns: u32, block_rows: u32) {
    for block_x in 1..=block_columns {
        let px = (block_x - 1) * BLOCK_PX + BLOCK_PX / 2 - 4;
        draw_number(img, px, 4, block_x);
    }
    for block_y in 1..=block_rows {
        let py = (block_y - 1) * BLOCK_PX + BLOCK_PX / 2 - 2;
        draw_number(img, 4, py, block_y);
    }
}

/// Pink macro-block grid. Agent uses blockX/blockY (1-based); ignore fine blue lines when picking.
pub fn composite_grid_overlay(img: &mut RgbaImage) {
    let width = img.width();
    let height = img.height();
    if width == 0 || height == 0 {
        return;
    }

    let (block_columns, block_rows) = block_dimensions(width, height);
    let fine_columns = width.div_ceil(GRID_CELL_PX);
    let fine_rows = height.div_ceil(GRID_CELL_PX);

    for col in 0..=fine_columns {
        let x = col.saturating_mul(GRID_CELL_PX).min(width.saturating_sub(1));
        let is_major = col % BLOCK_SQUARES == 0;
        let (color, thickness) = if is_major {
            (GRID_MAJOR_RGBA, 2)
        } else {
            (GRID_MINOR_RGBA, 1)
        };
        draw_vertical_line(img, x, color, thickness);
    }

    for row in 0..=fine_rows {
        let y = row.saturating_mul(GRID_CELL_PX).min(height.saturating_sub(1));
        let is_major = row % BLOCK_SQUARES == 0;
        let (color, thickness) = if is_major {
            (GRID_MAJOR_RGBA, 2)
        } else {
            (GRID_MINOR_RGBA, 1)
        };
        draw_horizontal_line(img, y, color, thickness);
    }

    draw_block_labels(img, block_columns, block_rows);
}

#[cfg(test)]
mod tests {
    use super::{
        block_center_px, block_dimensions, capture_px_to_block, clamp_block, BLOCK_PX,
    };

    #[test]
    fn block_dimensions_for_2560x1440() {
        assert_eq!(block_dimensions(2560, 1440), (16, 9));
    }

    #[test]
    fn block_center_is_middle_of_block() {
        assert_eq!(block_center_px(1, 1), (80, 80));
        assert_eq!(block_center_px(1, 3), (80, 400));
    }

    #[test]
    fn capture_px_to_block_is_one_based() {
        assert_eq!(capture_px_to_block(0, 0), (1, 1));
        assert_eq!(capture_px_to_block(BLOCK_PX as i32, BLOCK_PX as i32 * 2), (2, 3));
    }

    #[test]
    fn clamp_block_respects_bounds() {
        assert_eq!(clamp_block(0, 99, 16, 9), (1, 9));
        assert_eq!(clamp_block(3, 4, 16, 9), (3, 4));
    }
}
