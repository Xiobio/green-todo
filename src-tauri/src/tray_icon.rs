use std::f64::consts::PI;

/// Pet state definition
#[derive(Clone)]
pub struct PetState {
    pub id: &'static str,
    pub plant: &'static str,
    pub eyes: &'static str,
    pub mouth: &'static str,
    pub _blush: bool,
    pub _zzz: bool,
}

pub const PET_STATES: &[PetState] = &[
    PetState { id: "sleep_normal",   plant: "seed",    eyes: "arc",      mouth: "smile",  _blush: true,  _zzz: false },
    PetState { id: "sleep_zzz",      plant: "seed",    eyes: "closed",   mouth: "o",      _blush: true,  _zzz: true },
    PetState { id: "tired_droopy",   plant: "sprout",  eyes: "half",     mouth: "line",   _blush: true,  _zzz: false },
    PetState { id: "tired_yawn",     plant: "sprout",  eyes: "closed",   mouth: "o",      _blush: true,  _zzz: false },
    PetState { id: "meh_blink",      plant: "twoLeaf", eyes: "wink",     mouth: "line",   _blush: false, _zzz: false },
    PetState { id: "meh_normal",     plant: "twoLeaf", eyes: "dot",      mouth: "line",   _blush: false, _zzz: false },
    PetState { id: "okay_normal",    plant: "twoLeaf", eyes: "dot",      mouth: "smile",  _blush: false, _zzz: false },
    PetState { id: "okay_curious",   plant: "twoLeaf", eyes: "dotUp",    mouth: "o",      _blush: false, _zzz: false },
    PetState { id: "happy_smile",    plant: "bigLeaf", eyes: "arc",      mouth: "smile",  _blush: true,  _zzz: false },
    PetState { id: "happy_tongue",   plant: "bigLeaf", eyes: "arc",      mouth: "tongue", _blush: true,  _zzz: false },
    PetState { id: "happy_wink",     plant: "bigLeaf", eyes: "winkHappy",mouth: "grin",   _blush: true,  _zzz: false },
    PetState { id: "excited_sparkle",plant: "bud",     eyes: "big",      mouth: "grin",   _blush: true,  _zzz: false },
    PetState { id: "excited_star",   plant: "bud",     eyes: "star",     mouth: "grin",   _blush: true,  _zzz: false },
    PetState { id: "celebrate_wow",  plant: "flower",  eyes: "huge",     mouth: "huge",   _blush: true,  _zzz: false },
    PetState { id: "celebrate_love", plant: "flower",  eyes: "heart",    mouth: "huge",   _blush: true,  _zzz: false },
];

pub fn get_pet_state_id(total: u32, completed: u32) -> &'static str {
    if total == 0 {
        return "happy_smile";
    }
    let pct = completed as f64 / total as f64;
    let pool: Vec<&PetState> = if pct >= 1.0 {
        PET_STATES.iter().filter(|s| s.plant == "flower").collect()
    } else if pct >= 0.8 {
        PET_STATES.iter().filter(|s| s.plant == "bud").collect()
    } else if pct >= 0.55 {
        PET_STATES.iter().filter(|s| s.plant == "bigLeaf").collect()
    } else if pct >= 0.35 {
        PET_STATES.iter().filter(|s| s.id.starts_with("okay")).collect()
    } else if pct >= 0.15 {
        PET_STATES.iter().filter(|s| s.id.starts_with("meh")).collect()
    } else if pct > 0.0 {
        PET_STATES.iter().filter(|s| s.plant == "sprout").collect()
    } else {
        PET_STATES.iter().filter(|s| s.plant == "seed").collect()
    };

    // Pick variant based on today's date
    let day = chrono_free_date_hash();
    let idx = (day.unsigned_abs() as usize) % pool.len();
    pool[idx].id
}

/// Simple date hash without chrono dependency
fn chrono_free_date_hash() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs();
    let day_num = secs / 86400; // days since epoch
    let mut hash: i64 = 0;
    let day_str = format!("{}", day_num);
    for b in day_str.bytes() {
        hash = hash.wrapping_mul(31).wrapping_add(b as i64);
    }
    hash
}

// ---- RGBA pixel drawing ----

pub struct IconBuffer {
    pub data: Vec<u8>,
    pub width: u32,
    pub height: u32,
}

impl IconBuffer {
    pub fn new(w: u32, h: u32) -> Self {
        Self { data: vec![0u8; (w * h * 4) as usize], width: w, height: h }
    }

    fn set_pixel_blend(&mut self, x: i32, y: i32, r: u8, g: u8, b: u8, a: u8) {
        if x < 0 || y < 0 || x >= self.width as i32 || y >= self.height as i32 { return; }
        let i = ((y as u32 * self.width + x as u32) * 4) as usize;
        if i + 3 >= self.data.len() { return; }
        let src_a = a as f64 / 255.0;
        let dst_a = self.data[i + 3] as f64 / 255.0;
        let out_a = src_a + dst_a * (1.0 - src_a);
        if out_a > 0.0 {
            self.data[i]     = ((r as f64 * src_a + self.data[i]     as f64 * dst_a * (1.0 - src_a)) / out_a) as u8;
            self.data[i + 1] = ((g as f64 * src_a + self.data[i + 1] as f64 * dst_a * (1.0 - src_a)) / out_a) as u8;
            self.data[i + 2] = ((b as f64 * src_a + self.data[i + 2] as f64 * dst_a * (1.0 - src_a)) / out_a) as u8;
            self.data[i + 3] = (out_a * 255.0) as u8;
        }
    }

    fn erase_pixel(&mut self, x: i32, y: i32) {
        if x < 0 || y < 0 || x >= self.width as i32 || y >= self.height as i32 { return; }
        let i = ((y as u32 * self.width + x as u32) * 4) as usize;
        if i + 3 < self.data.len() { self.data[i + 3] = 0; }
    }

    pub fn fill_circle(&mut self, cx: f64, cy: f64, r: f64, cr: u8, cg: u8, cb: u8, ca: u8) {
        let y0 = (cy - r - 1.0).max(0.0) as i32;
        let y1 = (cy + r + 1.0).min(self.height as f64 - 1.0) as i32;
        let x0 = (cx - r - 1.0).max(0.0) as i32;
        let x1 = (cx + r + 1.0).min(self.width as f64 - 1.0) as i32;
        for y in y0..=y1 {
            for x in x0..=x1 {
                let d = ((x as f64 + 0.5 - cx).powi(2) + (y as f64 + 0.5 - cy).powi(2)).sqrt();
                if d <= r + 0.8 {
                    let a = if d <= r { ca } else { (ca as f64 * (1.0 - (d - r) / 0.8).max(0.0)) as u8 };
                    if a > 0 { self.set_pixel_blend(x, y, cr, cg, cb, a); }
                }
            }
        }
    }

    pub fn erase_circle(&mut self, cx: f64, cy: f64, r: f64) {
        let y0 = (cy - r - 1.0).max(0.0) as i32;
        let y1 = (cy + r + 1.0) as i32;
        let x0 = (cx - r - 1.0).max(0.0) as i32;
        let x1 = (cx + r + 1.0) as i32;
        for y in y0..=y1 {
            for x in x0..=x1 {
                let d = ((x as f64 + 0.5 - cx).powi(2) + (y as f64 + 0.5 - cy).powi(2)).sqrt();
                if d <= r {
                    self.erase_pixel(x, y);
                } else if d <= r + 0.8 {
                    let i = ((y as u32 * self.width + x as u32) * 4) as usize;
                    if i + 3 < self.data.len() {
                        let keep = ((d - r) / 0.8 * 255.0) as u8;
                        self.data[i + 3] = self.data[i + 3].min(keep);
                    }
                }
            }
        }
    }

        #[allow(dead_code)]
    pub fn erase_line(&mut self, x0: i32, x1: i32, y: i32) {
        for x in x0..=x1 { self.erase_pixel(x, y); }
    }

    pub fn fill_round_rect(&mut self, x0: i32, y0: i32, w: i32, h: i32, _r: i32, cr: u8, cg: u8, cb: u8, ca: u8) {
        for y in y0..y0+h {
            for x in x0..x0+w {
                self.set_pixel_blend(x, y, cr, cg, cb, ca);
            }
        }
    }
}

/// Render a pet icon for a given state. Returns RGBA buffer + dimensions.
pub fn render_pet_icon(total: u32, completed: u32) -> IconBuffer {
    let state_id = get_pet_state_id(total, completed);
    let state = PET_STATES.iter().find(|s| s.id == state_id).unwrap_or(&PET_STATES[0]);
    render_pet_icon_for_state(state, total, completed)
}

pub fn render_pet_icon_for_state(state: &PetState, total: u32, completed: u32) -> IconBuffer {
    let cells = total.min(5) as i32;
    let filled = if total <= 5 { completed as i32 } else { ((completed as f64 / total as f64) * 5.0).round() as i32 };

    // 54×54 pixels ≈ 27pt @2x Retina, slightly larger for better visibility
    let w: u32 = 54;
    let h: u32 = 54;
    let k: u8 = 255; // white
    let cx = 27.0f64;
    let body_cy = 32.0f64;
    let body_r = 15.0f64;

    let mut buf = IconBuffer::new(w, h);

    // Body circle
    buf.fill_circle(cx, body_cy, body_r, k, k, k, 255);

    // Plant on top
    let sb = body_cy - body_r;
    draw_plant(&mut buf, state.plant, cx, sb, k, k, k);

    // Eyes (with blush for cute states)
    let eye_y = body_cy - 2.5;
    let eye_s = 7.5;
    draw_eyes(&mut buf, state.eyes, cx, eye_y, eye_s, k, state._blush);

    // Mouth
    let m_y = body_cy + 6.0;
    draw_mouth(&mut buf, state.mouth, cx, m_y);

    // Battery bar at bottom
    if cells > 0 {
        let cell_w = 6i32;
        let cell_h = 4i32;
        let cell_gap = 2i32;
        let bat_w = cells * (cell_w + cell_gap) - cell_gap;
        let bat_x = ((w as i32 - bat_w) / 2) as i32;
        let bat_y = 48i32;
        for c in 0..cells {
            let bx = bat_x + c * (cell_w + cell_gap);
            if c < filled {
                buf.fill_round_rect(bx, bat_y, cell_w, cell_h, 1, k, k, k, 220);
            } else {
                // outline only
                for y in bat_y..bat_y + cell_h {
                    for x in bx..bx + cell_w {
                        if y == bat_y || y == bat_y + cell_h - 1 || x == bx || x == bx + cell_w - 1 {
                            buf.set_pixel_blend(x, y, k, k, k, 100);
                        }
                    }
                }
            }
        }
    }

    buf
}

/// Draw a thick line between two points
fn draw_thick_line(buf: &mut IconBuffer, x0: f64, y0: f64, x1: f64, y1: f64, thickness: f64, r: u8, g: u8, b: u8, a: u8) {
    let dx = x1 - x0;
    let dy = y1 - y0;
    let len = (dx * dx + dy * dy).sqrt();
    let steps = (len * 2.0) as i32;
    for i in 0..=steps {
        let t = i as f64 / steps as f64;
        let px = x0 + dx * t;
        let py = y0 + dy * t;
        buf.fill_circle(px, py, thickness, r, g, b, a);
    }
}

fn draw_plant(buf: &mut IconBuffer, plant: &str, cx: f64, sb: f64, kr: u8, kg: u8, kb: u8) {
    match plant {
        "seed" => {
            buf.fill_circle(cx, sb - 3.0, 3.0, kr, kg, kb, 255);
        }
        "sprout" => {
            draw_thick_line(buf, cx, sb, cx, sb - 9.0, 1.5, kr, kg, kb, 255);
            buf.fill_circle(cx + 5.5, sb - 9.5, 3.7, kr, kg, kb, 255);
        }
        "twoLeaf" => {
            draw_thick_line(buf, cx, sb, cx, sb - 9.0, 1.5, kr, kg, kb, 255);
            buf.fill_circle(cx - 6.0, sb - 10.5, 3.7, kr, kg, kb, 255);
            buf.fill_circle(cx + 6.0, sb - 10.5, 3.7, kr, kg, kb, 255);
        }
        "bigLeaf" => {
            draw_thick_line(buf, cx, sb, cx, sb - 10.0, 1.8, kr, kg, kb, 255);
            buf.fill_circle(cx - 7.5, sb - 12.0, 5.2, kr, kg, kb, 255);
            buf.fill_circle(cx + 7.5, sb - 12.0, 5.2, kr, kg, kb, 255);
        }
        "bud" | "flower" => {
            draw_thick_line(buf, cx, sb, cx, sb - 10.0, 1.8, kr, kg, kb, 255);
            let fy = sb - 14.0;
            for a in 0..3 {
                let angle = -PI / 2.0 + (a as f64 * PI * 2.0 / 3.0);
                buf.fill_circle(cx + angle.cos() * 5.5, fy + angle.sin() * 5.5, 4.3, kr, kg, kb, 255);
            }
            if plant == "flower" {
                buf.erase_circle(cx, fy, 2.5);
                buf.fill_circle(cx, fy, 2.5, kr, kg, kb, 120);
            }
        }
        _ => {}
    }
}

/// Cute blush marks on cheeks
fn draw_blush(buf: &mut IconBuffer, cx: f64, cy: f64, eye_s: f64) {
    for s in [-1.0f64, 1.0] {
        let bx = cx + s * (eye_s + 2.5);
        let by = cy + 3.5;
        buf.fill_circle(bx, by, 2.5, 255, 255, 255, 55);
    }
}

fn draw_eyes(buf: &mut IconBuffer, eyes: &str, cx: f64, eye_y: f64, eye_s: f64, k: u8, blush: bool) {
    if blush { draw_blush(buf, cx, eye_y, eye_s); }
    match eyes {
        "closed" | "arc" | "winkHappy" => {
            // Happy squint ^_^ — upside-down U arcs
            for s in [-1.0f64, 1.0] {
                let ex = cx + s * eye_s;
                if eyes == "winkHappy" && s > 0.0 {
                    // Right eye: single dash wink
                    for dx in -2..=2 {
                        buf.erase_pixel(ex as i32 + dx, eye_y as i32);
                    }
                } else {
                    for ix in -3..=3 {
                        let t = ix as f64 / 3.0;
                        let dy = -(t * t) * 2.0;
                        buf.erase_circle(ex + ix as f64, eye_y + dy, 0.9);
                    }
                }
            }
        }
        "half" => {
            // Sleepy — horizontal dashes
            for s in [-1.0f64, 1.0] {
                let ex = cx + s * eye_s;
                for dx in -2..=2 {
                    buf.erase_pixel(ex as i32 + dx, eye_y as i32);
                    buf.erase_pixel(ex as i32 + dx, eye_y as i32 + 1);
                }
            }
        }
        "dot" | "dotUp" => {
            // Round kawaii eyes with highlight sparkle
            for s in [-1.0f64, 1.0] {
                let ex = cx + s * eye_s;
                let ey = if eyes == "dotUp" { eye_y - 1.5 } else { eye_y };
                buf.erase_circle(ex, ey, 3.8);
                buf.fill_circle(ex + 0.3, ey + 0.5, 2.0, k, k, k, 255);
                buf.erase_circle(ex + 1.2, ey - 1.0, 1.0); // sparkle
            }
        }
        "wink" => {
            // Left: round eye, right: playful wink arc
            let lx = cx - eye_s;
            buf.erase_circle(lx, eye_y, 3.8);
            buf.fill_circle(lx + 0.3, eye_y + 0.5, 2.0, k, k, k, 255);
            buf.erase_circle(lx + 1.2, eye_y - 1.0, 1.0);
            let rx = cx + eye_s;
            for ix in -3..=3 {
                let t = ix as f64 / 3.0;
                buf.erase_circle(rx + ix as f64, eye_y - (t * t) * 2.0, 0.9);
            }
        }
        "big" | "star" | "huge" => {
            // Extra sparkly big eyes
            let r = if eyes == "huge" { 5.0 } else { 4.5 };
            for s in [-1.0f64, 1.0] {
                let ex = cx + s * eye_s;
                buf.erase_circle(ex, eye_y, r);
                buf.fill_circle(ex + 0.3, eye_y + 0.5, 2.5, k, k, k, 255);
                buf.erase_circle(ex + 1.5, eye_y - 1.5, 1.2); // big sparkle
                buf.erase_circle(ex - 1.0, eye_y + 1.5, 0.6); // small sparkle
            }
        }
        "heart" => {
            // Heart eyes ♥
            for s in [-1.0f64, 1.0] {
                let ex = cx + s * eye_s;
                buf.erase_circle(ex - 1.8, eye_y - 1.2, 2.3);
                buf.erase_circle(ex + 1.8, eye_y - 1.2, 2.3);
                for dy in 0..6 {
                    let hw = (4.5 - dy as f64 * 0.9).max(0.0);
                    for dxi in 0..=(hw as i32 * 2) {
                        buf.erase_pixel(ex as i32 - (hw as i32) + dxi, eye_y as i32 + dy);
                    }
                }
            }
        }
        _ => {}
    }
}

fn draw_mouth(buf: &mut IconBuffer, mouth: &str, cx: f64, m_y: f64) {
    match mouth {
        "frown" => {
            // Cute pout — gentle upward arc
            for ix in -3..=3 {
                let t = ix as f64 / 3.0;
                buf.erase_circle(cx + ix as f64, m_y - t * t * 1.5, 0.8);
            }
        }
        "line" => {
            // Cat mouth ω — cuter than a straight line
            for ix in -4..=4 {
                let t = ix as f64;
                let dy = if t.abs() < 1.5 { -1.0 } else { (t.abs() - 1.5) * 0.5 };
                buf.erase_circle(cx + t, m_y + dy, 0.8);
            }
        }
        "o" | "O" => {
            let r = if mouth == "O" { 3.2 } else { 2.3 };
            buf.erase_circle(cx, m_y, r);
        }
        "smile" | "grin" => {
            // Big happy U-smile
            let w = if mouth == "grin" { 7.0 } else { 5.5 };
            let depth = if mouth == "grin" { 4.0 } else { 3.0 };
            let steps = (w * 2.0) as i32;
            for ix in (-steps)..=steps {
                let t = ix as f64 / steps as f64;
                buf.erase_circle(cx + t * w, m_y + t * t * depth, 1.0);
            }
        }
        "tongue" => {
            // Playful :P
            let steps = 10i32;
            for ix in (-steps)..=steps {
                let t = ix as f64 / steps as f64;
                buf.erase_circle(cx + t * 5.0, m_y + t * t * 3.0, 1.0);
            }
            buf.erase_circle(cx, m_y + 4.0, 2.0); // tongue
        }
        "huge" => {
            // Wide excited open mouth
            buf.erase_circle(cx, m_y + 1.5, 5.0);
        }
        _ => {} // "none"
    }
}

