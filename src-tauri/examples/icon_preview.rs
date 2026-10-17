// Render the exact native tray pixels against light/dark taskbars at shell sizes.
// cargo run --example icon_preview -- tray-icons.png
#[allow(dead_code)]
#[path = "../src/tray_icon.rs"]
mod tray_icon;

fn main() {
    let path = std::env::args().nth(1).expect("output PNG path required");
    let width = tray_icon::PET_STATES.len() as u32 * 124;
    let height = 240u32;
    let mut pixels = vec![0u8; (width * height * 4) as usize];
    for y in 0..height {
        let bg = if y < 120 { 255 } else { 24 };
        for x in 0..width {
            let i = ((y * width + x) * 4) as usize;
            pixels[i..i + 4].copy_from_slice(&[bg, bg, bg, 255]);
        }
    }
    for (col, state) in tray_icon::PET_STATES.iter().enumerate() {
        let icon = tray_icon::render_pet_icon_for_state(state, 5, (col as u32).min(5));
        for row in 0..2 {
            for (size, ox, oy) in [(54, 35, 8), (16, 8, 90), (20, 30, 88), (24, 56, 86), (32, 86, 82)] {
                for y in 0..size {
                    for x in 0..size {
                        let tx = col as u32 * 124 + ox + x;
                        let ty = row * 120 + oy + y;
                        let dest = ((ty * width + tx) * 4) as usize;
                        // Premultiplied area sampling keeps transparent edges from turning black.
                        let mut rgb = [0.0f64; 3];
                        let mut alpha = 0.0;
                        for sy in 0..8 {
                            for sx in 0..8 {
                                let px = ((x as f64 + (sx as f64 + 0.5) / 8.0) * icon.width as f64 / size as f64) as u32;
                                let py = ((y as f64 + (sy as f64 + 0.5) / 8.0) * icon.height as f64 / size as f64) as u32;
                                let src = ((py * icon.width + px) * 4) as usize;
                                let a = icon.data[src + 3] as f64 / 255.0 / 64.0;
                                alpha += a;
                                for c in 0..3 { rgb[c] += icon.data[src + c] as f64 * a; }
                            }
                        }
                        for c in 0..3 { pixels[dest + c] = (rgb[c] + pixels[dest + c] as f64 * (1.0 - alpha)).round() as u8; }
                    }
                }
            }
        }
    }
    if let Some(parent) = std::path::Path::new(&path).parent().filter(|p| !p.as_os_str().is_empty()) {
        std::fs::create_dir_all(parent).unwrap();
    }
    let file = std::fs::File::create(path).unwrap();
    let mut encoder = png::Encoder::new(file, width, height);
    encoder.set_color(png::ColorType::Rgba);
    encoder.set_depth(png::BitDepth::Eight);
    encoder.write_header().unwrap().write_image_data(&pixels).unwrap();
}
