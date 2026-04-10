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
    PetState { id: "sleep_normal",   plant: "seed",    eyes: "closed",   mouth: "none",   _blush: true,  _zzz: false },
    PetState { id: "sleep_zzz",      plant: "seed",    eyes: "closed",   mouth: "none",   _blush: true,  _zzz: true },
    PetState { id: "tired_droopy",   plant: "sprout",  eyes: "half",     mouth: "frown",  _blush: false, _zzz: false },
    PetState { id: "tired_yawn",     plant: "sprout",  eyes: "closed",   mouth: "O",      _blush: false, _zzz: false },
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

    // Render at 18×18 pixels — fits macOS ~22pt menu bar without cropping
    let w: u32 = 18;
    let h: u32 = 18;
    let k: u8 = 0; // black on transparent
    let cx = 9.0f64;
    let body_cy = 11.0f64;
    let body_r = 5.0f64;

    let mut buf = IconBuffer::new(w, h);

    // Body circle
    buf.fill_circle(cx, body_cy, body_r, k, k, k, 255);

    // Plant on top
    let sb = body_cy - body_r; // ~6.0
    draw_plant_small(&mut buf, state.plant, cx, sb, k);

    // Eyes — erase transparent holes in the body
    let eye_y = body_cy - 1.0;
    let eye_s = 2.5;
    draw_eyes_small(&mut buf, state.eyes, cx, eye_y, eye_s, k);

    // Mouth
    let m_y = body_cy + 2.0;
    draw_mouth_small(&mut buf, state.mouth, cx, m_y, k);

    // Battery bar (2px tall cells at bottom)
    if cells > 0 {
        let cell_w = 2i32;
        let cell_h = 2i32;
        let cell_gap = 1i32;
        let bat_w = cells * (cell_w + cell_gap) - cell_gap;
        let bat_x = ((w as i32 - bat_w) / 2) as i32;
        let bat_y = 16i32;
        for c in 0..cells {
            let bx = bat_x + c * (cell_w + cell_gap);
            if c < filled {
                buf.fill_round_rect(bx, bat_y, cell_w, cell_h, 0, k, k, k, 220);
            } else {
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

fn draw_plant_small(buf: &mut IconBuffer, plant: &str, cx: f64, sb: f64, k: u8) {
    match plant {
        "seed" => {
            // 2px dot on top
            buf.fill_circle(cx, sb - 1.0, 1.0, k, k, k, 255);
        }
        "sprout" => {
            // stem + one leaf
            buf.set_pixel_blend(cx as i32, sb as i32 - 2, k, k, k, 255);
            buf.set_pixel_blend(cx as i32, sb as i32 - 3, k, k, k, 255);
            buf.fill_circle(cx + 2.0, sb - 3.0, 1.2, k, k, k, 255);
        }
        "twoLeaf" => {
            // stem + two small leaves
            buf.set_pixel_blend(cx as i32, sb as i32 - 2, k, k, k, 255);
            buf.set_pixel_blend(cx as i32, sb as i32 - 3, k, k, k, 255);
            buf.fill_circle(cx - 2.0, sb - 3.5, 1.2, k, k, k, 255);
            buf.fill_circle(cx + 2.0, sb - 3.5, 1.2, k, k, k, 255);
        }
        "bigLeaf" => {
            // stem + two bigger circles
            buf.set_pixel_blend(cx as i32, sb as i32 - 2, k, k, k, 255);
            buf.set_pixel_blend(cx as i32, sb as i32 - 3, k, k, k, 255);
            buf.fill_circle(cx - 2.5, sb - 4.0, 1.8, k, k, k, 255);
            buf.fill_circle(cx + 2.5, sb - 4.0, 1.8, k, k, k, 255);
        }
        "bud" | "flower" => {
            // stem
            buf.set_pixel_blend(cx as i32, sb as i32 - 2, k, k, k, 255);
            buf.set_pixel_blend(cx as i32, sb as i32 - 3, k, k, k, 255);
            // 3-circle flower
            let fy = sb - 4.5;
            for a in 0..3 {
                let angle = -PI / 2.0 + (a as f64 * PI * 2.0 / 3.0);
                buf.fill_circle(cx + angle.cos() * 2.0, fy + angle.sin() * 2.0, 1.5, k, k, k, 255);
            }
            // erase center for flower
            if plant == "flower" {
                buf.erase_circle(cx, fy, 0.8);
                buf.fill_circle(cx, fy, 0.8, k, k, k, 120);
            }
        }
        _ => {}
    }
}

fn draw_eyes_small(buf: &mut IconBuffer, eyes: &str, cx: f64, eye_y: f64, eye_s: f64, k: u8) {
    match eyes {
        "closed" | "arc" | "winkHappy" => {
            // 1px horizontal lines (arcs) as eyes
            for s in [-1.0f64, 1.0] {
                let ex = cx + s * eye_s;
                buf.erase_pixel(ex as i32, eye_y as i32);
            }
        }
        "half" => {
            for s in [-1.0f64, 1.0] {
                buf.erase_pixel((cx + s * eye_s) as i32, eye_y as i32);
            }
        }
        "dot" | "dotUp" => {
            // transparent circle + 1px pupil
            for s in [-1.0f64, 1.0] {
                let ex = cx + s * eye_s;
                let ey = if eyes == "dotUp" { eye_y - 0.5 } else { eye_y };
                buf.erase_circle(ex, ey, 1.2);
                buf.fill_circle(ex, ey + 0.3, 0.5, k, k, k, 255);
            }
        }
        "wink" => {
            // left: dot, right: arc
            let lx = cx - eye_s;
            buf.erase_circle(lx, eye_y, 1.2);
            buf.fill_circle(lx, eye_y + 0.3, 0.5, k, k, k, 255);
            buf.erase_pixel((cx + eye_s) as i32, eye_y as i32);
        }
        "big" | "star" | "huge" => {
            // larger transparent eyes with pupil
            for s in [-1.0f64, 1.0] {
                let ex = cx + s * eye_s;
                buf.erase_circle(ex, eye_y, 1.5);
                buf.fill_circle(ex, eye_y + 0.3, 0.7, k, k, k, 255);
            }
        }
        "heart" => {
            for s in [-1.0f64, 1.0] {
                buf.erase_pixel((cx + s * eye_s) as i32, eye_y as i32);
                buf.erase_pixel((cx + s * eye_s) as i32, eye_y as i32 - 1);
            }
        }
        _ => {}
    }
}

fn draw_mouth_small(buf: &mut IconBuffer, mouth: &str, cx: f64, m_y: f64, _k: u8) {
    match mouth {
        "frown" => {
            buf.erase_pixel(cx as i32, m_y as i32);
        }
        "line" => {
            buf.erase_pixel(cx as i32 - 1, m_y as i32);
            buf.erase_pixel(cx as i32, m_y as i32);
            buf.erase_pixel(cx as i32 + 1, m_y as i32);
        }
        "o" | "O" => {
            buf.erase_circle(cx, m_y, 0.8);
        }
        "smile" | "grin" => {
            buf.erase_pixel(cx as i32 - 1, m_y as i32);
            buf.erase_pixel(cx as i32, m_y as i32 + 1);
            buf.erase_pixel(cx as i32 + 1, m_y as i32);
        }
        "tongue" => {
            buf.erase_pixel(cx as i32 - 1, m_y as i32);
            buf.erase_pixel(cx as i32, m_y as i32 + 1);
            buf.erase_pixel(cx as i32 + 1, m_y as i32);
        }
        "huge" => {
            buf.erase_pixel(cx as i32 - 1, m_y as i32);
            buf.erase_pixel(cx as i32, m_y as i32);
            buf.erase_pixel(cx as i32 + 1, m_y as i32);
            buf.erase_pixel(cx as i32, m_y as i32 + 1);
        }
        _ => {} // "none"
    }
}

