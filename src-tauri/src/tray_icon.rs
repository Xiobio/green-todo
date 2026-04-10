use std::f64::consts::PI;

/// Pet state definition
#[derive(Clone)]
pub struct PetState {
    pub id: &'static str,
    pub plant: &'static str,
    pub eyes: &'static str,
    pub mouth: &'static str,
    pub blush: bool,
    pub zzz: bool,
}

pub const PET_STATES: &[PetState] = &[
    PetState { id: "sleep_normal",   plant: "seed",    eyes: "closed",   mouth: "none",   blush: true,  zzz: false },
    PetState { id: "sleep_zzz",      plant: "seed",    eyes: "closed",   mouth: "none",   blush: true,  zzz: true },
    PetState { id: "tired_droopy",   plant: "sprout",  eyes: "half",     mouth: "frown",  blush: false, zzz: false },
    PetState { id: "tired_yawn",     plant: "sprout",  eyes: "closed",   mouth: "O",      blush: false, zzz: false },
    PetState { id: "meh_blink",      plant: "twoLeaf", eyes: "wink",     mouth: "line",   blush: false, zzz: false },
    PetState { id: "meh_normal",     plant: "twoLeaf", eyes: "dot",      mouth: "line",   blush: false, zzz: false },
    PetState { id: "okay_normal",    plant: "twoLeaf", eyes: "dot",      mouth: "smile",  blush: false, zzz: false },
    PetState { id: "okay_curious",   plant: "twoLeaf", eyes: "dotUp",    mouth: "o",      blush: false, zzz: false },
    PetState { id: "happy_smile",    plant: "bigLeaf", eyes: "arc",      mouth: "smile",  blush: true,  zzz: false },
    PetState { id: "happy_tongue",   plant: "bigLeaf", eyes: "arc",      mouth: "tongue", blush: true,  zzz: false },
    PetState { id: "happy_wink",     plant: "bigLeaf", eyes: "winkHappy",mouth: "grin",   blush: true,  zzz: false },
    PetState { id: "excited_sparkle",plant: "bud",     eyes: "big",      mouth: "grin",   blush: true,  zzz: false },
    PetState { id: "excited_star",   plant: "bud",     eyes: "star",     mouth: "grin",   blush: true,  zzz: false },
    PetState { id: "celebrate_wow",  plant: "flower",  eyes: "huge",     mouth: "huge",   blush: true,  zzz: false },
    PetState { id: "celebrate_love", plant: "flower",  eyes: "heart",    mouth: "huge",   blush: true,  zzz: false },
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
    let cells = total.min(10) as i32;
    let filled = if total <= 10 { completed as i32 } else { ((completed as f64 / total as f64) * 10.0).round() as i32 };

    // Render at @2x (44x44) same as Electron — macOS handles HiDPI scaling
    let cell_w = 5i32; let cell_h = 4i32; let cell_gap = 2i32;
    let bat_w = if cells > 0 { cells * (cell_w + cell_gap) - cell_gap } else { 0 };
    let w = 44i32.max(bat_w + 4) as u32;
    let bat_y = 40i32;
    let h = if cells > 0 { (bat_y + cell_h + 1) as u32 } else { 40 };
    let k: u8 = 0;
    let cx = (w / 2) as f64;
    let body_r = 13.0f64;
    let body_y = 26.0f64;

    let mut buf = IconBuffer::new(w, h);

    // Body
    buf.fill_circle(cx, body_y, body_r, k, k, k, 255);
    buf.erase_circle(cx - 4.0, body_y - 5.0, 3.0);
    buf.fill_circle(cx - 4.0, body_y - 5.0, 3.0, k, k, k, 80);
    // Feet
    buf.fill_circle(cx - 5.0, body_y + body_r - 1.0, 3.0, k, k, k, 255);
    buf.fill_circle(cx + 5.0, body_y + body_r - 1.0, 3.0, k, k, k, 255);

    // Plant
    let sb = body_y - body_r;
    draw_plant(&mut buf, state.plant, cx, sb, k, w, h);

    // Eyes
    let eye_y = body_y - 3.0;
    let eye_s = 5.0;
    draw_eyes(&mut buf, state.eyes, cx, eye_y, eye_s, k);

    // Mouth
    let m_y = body_y + 5.0;
    draw_mouth(&mut buf, state.mouth, cx, m_y, body_y, body_r, k);

    // Blush
    if state.blush {
        buf.fill_circle(cx - 9.0, body_y + 1.0, 2.5, k, k, k, 50);
        buf.fill_circle(cx + 9.0, body_y + 1.0, 2.5, k, k, k, 50);
    }

    // Zzz
    if state.zzz {
        buf.fill_circle(cx + 14.0, sb - 4.0, 2.0, k, k, k, 180);
        buf.fill_circle(cx + 17.0, sb - 7.0, 1.5, k, k, k, 140);
    }

    // Battery bar
    if cells > 0 {
        let bat_x = ((w as i32 - bat_w) / 2) as i32;
        for c in 0..cells {
            let bx = bat_x + c * (cell_w + cell_gap);
            if c < filled {
                buf.fill_round_rect(bx, bat_y, cell_w, cell_h, 1, k, k, k, 220);
            } else {
                for y in bat_y..bat_y+cell_h {
                    for x in bx..bx+cell_w {
                        if y == bat_y || y == bat_y+cell_h-1 || x == bx || x == bx+cell_w-1 {
                            buf.set_pixel_blend(x, y, k, k, k, 100);
                        }
                    }
                }
            }
        }
    }

    buf
}

fn draw_plant(buf: &mut IconBuffer, plant: &str, cx: f64, sb: f64, k: u8, _w: u32, _h: u32) {
    match plant {
        "seed" => { buf.fill_circle(cx, sb - 2.0, 3.5, k, k, k, 255); }
        "sprout" => {
            for y in (sb as i32 - 8)..=(sb as i32) { buf.fill_circle(cx, y as f64, 1.5, k, k, k, 255); }
            buf.fill_circle(cx + 4.0, sb - 6.0, 3.5, k, k, k, 255);
            buf.fill_circle(cx + 2.0, sb - 5.0, 2.5, k, k, k, 255);
        }
        "twoLeaf" => {
            for y in (sb as i32 - 9)..=(sb as i32) { buf.fill_circle(cx, y as f64, 1.8, k, k, k, 255); }
            buf.fill_circle(cx - 4.0, sb - 7.0, 3.5, k, k, k, 255); buf.fill_circle(cx - 2.0, sb - 5.0, 2.5, k, k, k, 255);
            buf.fill_circle(cx + 4.0, sb - 7.0, 3.5, k, k, k, 255); buf.fill_circle(cx + 2.0, sb - 5.0, 2.5, k, k, k, 255);
        }
        "bigLeaf" => {
            for y in (sb as i32 - 10)..=(sb as i32) { buf.fill_circle(cx, y as f64, 2.0, k, k, k, 255); }
            buf.fill_circle(cx - 7.0, sb - 9.0, 5.0, k, k, k, 255); buf.fill_circle(cx - 4.0, sb - 6.0, 3.0, k, k, k, 255);
            buf.fill_circle(cx + 7.0, sb - 9.0, 5.0, k, k, k, 255); buf.fill_circle(cx + 4.0, sb - 6.0, 3.0, k, k, k, 255);
        }
        "bud" => {
            for y in (sb as i32 - 9)..=(sb as i32) { buf.fill_circle(cx, y as f64, 2.0, k, k, k, 255); }
            buf.fill_circle(cx - 4.0, sb - 4.0, 3.0, k, k, k, 255); buf.fill_circle(cx + 4.0, sb - 4.0, 3.0, k, k, k, 255);
            let bud_cy = sb - 13.0;
            for y in 0.._h as i32 {
                for x in 0.._w as i32 {
                    let dx = (x as f64 + 0.5 - cx) / 4.0;
                    let dy = (y as f64 + 0.5 - bud_cy) / 6.0;
                    if dx * dx + dy * dy <= 1.0 { buf.set_pixel_blend(x, y, k, k, k, 255); }
                }
            }
        }
        "flower" => {
            for y in (sb as i32 - 8)..=(sb as i32) { buf.fill_circle(cx, y as f64, 2.0, k, k, k, 255); }
            buf.fill_circle(cx - 4.0, sb - 4.0, 3.0, k, k, k, 255); buf.fill_circle(cx + 4.0, sb - 4.0, 3.0, k, k, k, 255);
            let fy = sb - 13.0;
            for a in 0..5 {
                let angle = -PI / 2.0 + (a as f64 * PI * 2.0 / 5.0);
                buf.fill_circle(cx + angle.cos() * 7.0, fy + angle.sin() * 6.0, 4.5, k, k, k, 255);
            }
            buf.erase_circle(cx, fy, 3.0);
            buf.fill_circle(cx, fy, 3.0, k, k, k, 160);
        }
        _ => {}
    }
}

fn eye_arc(buf: &mut IconBuffer, ex: f64, ey: f64, dir: i32) {
    for dx in -3i32..=3 {
        let dy = if dx.abs() <= 1 { dir } else { 0 };
        buf.erase_pixel(ex as i32 + dx, ey as i32 + dy);
        buf.erase_pixel(ex as i32 + dx, ey as i32 + dy + dir);
    }
}

fn draw_eyes(buf: &mut IconBuffer, eyes: &str, cx: f64, eye_y: f64, eye_s: f64, k: u8) {
    match eyes {
        "closed" => { for s in [-1.0, 1.0] { eye_arc(buf, cx + s * eye_s, eye_y, 1); } }
        "half" => {
            for s in [-1.0, 1.0] { buf.erase_circle(cx + s * eye_s, eye_y, 2.0); }
        }
        "dot" => {
            for s in [-1.0, 1.0] { buf.erase_circle(cx + s * eye_s, eye_y, 3.5); buf.fill_circle(cx + s * eye_s, eye_y + 0.5, 1.5, k, k, k, 255); }
        }
        "dotUp" => {
            for s in [-1.0, 1.0] { let ex = cx + s * eye_s; buf.erase_circle(ex, eye_y, 3.5); buf.fill_circle(ex, eye_y - 1.0, 1.5, k, k, k, 255); }
        }
        "wink" => {
            buf.erase_circle(cx - eye_s, eye_y, 3.5); buf.fill_circle(cx - eye_s, eye_y + 0.5, 1.5, k, k, k, 255);
            eye_arc(buf, cx + eye_s, eye_y, 1);
        }
        "winkHappy" => {
            eye_arc(buf, cx - eye_s, eye_y, -1);
            eye_arc(buf, cx + eye_s, eye_y, 1);
        }
        "arc" => { for s in [-1.0, 1.0] { eye_arc(buf, cx + s * eye_s, eye_y, -1); } }
        "big" => {
            for s in [-1.0, 1.0] { let ex = cx + s * eye_s;
                buf.erase_circle(ex, eye_y, 4.5); buf.fill_circle(ex, eye_y + 0.5, 2.2, k, k, k, 255); buf.erase_circle(ex - 1.5, eye_y - 1.5, 1.0);
            }
        }
        "star" => {
            for s in [-1.0, 1.0] { let ex = cx + s * eye_s;
                buf.erase_circle(ex, eye_y, 4.5); buf.fill_circle(ex, eye_y + 0.5, 2.2, k, k, k, 255);
                buf.erase_circle(ex - 1.5, eye_y - 1.5, 1.2); buf.erase_circle(ex + 1.0, eye_y + 1.0, 0.8);
            }
        }
        "huge" => {
            for s in [-1.0, 1.0] { let ex = cx + s * eye_s;
                buf.erase_circle(ex, eye_y, 5.0); buf.fill_circle(ex, eye_y + 0.5, 2.5, k, k, k, 255); buf.erase_circle(ex - 2.0, eye_y - 2.0, 1.2);
            }
        }
        "heart" => {
            for s in [-1.0, 1.0] { let ex = cx + s * eye_s;
                buf.erase_circle(ex - 1.5, eye_y - 0.5, 2.0); buf.erase_circle(ex + 1.5, eye_y - 0.5, 2.0);
            }
        }
        _ => {}
    }
}

fn draw_mouth(buf: &mut IconBuffer, mouth: &str, cx: f64, m_y: f64, body_y: f64, body_r: f64, k: u8) {
    match mouth {
        "frown" => {
            for dx in -3i32..=3 { let dy = if dx.abs() <= 1 { 0 } else { -1 }; buf.erase_pixel(cx as i32 + dx, m_y as i32 + dy); }
        }
        "line" => { buf.erase_line(cx as i32 - 3, cx as i32 + 3, m_y as i32); }
        "o" => { buf.erase_circle(cx, m_y, 1.5); }
        "O" => { buf.erase_circle(cx, m_y, 2.5); }
        "smile" => {
            for dx in -4i32..=4 { let dy = if dx.abs() <= 1 { 2 } else if dx.abs() <= 3 { 1 } else { 0 };
                buf.erase_pixel(cx as i32 + dx, m_y as i32 + dy); }
        }
        "grin" => {
            for dx in -5i32..=5 { let dy = if dx.abs() <= 2 { 2 } else if dx.abs() <= 4 { 1 } else { 0 };
                buf.erase_pixel(cx as i32 + dx, m_y as i32 + dy); }
        }
        "tongue" => {
            for dx in -4i32..=4 { let dy = if dx.abs() <= 1 { 2 } else if dx.abs() <= 3 { 1 } else { 0 };
                buf.erase_pixel(cx as i32 + dx, m_y as i32 + dy); }
            buf.fill_circle(cx, body_y + body_r + 2.0, 2.5, k, k, k, 200);
        }
        "huge" => {
            for dx in -5i32..=5 { let dy = if dx.abs() <= 2 { 3 } else if dx.abs() <= 4 { 2 } else { 1 };
                for d in 0..=dy { buf.erase_pixel(cx as i32 + dx, m_y as i32 + d); } }
        }
        _ => {} // "none"
    }
}
