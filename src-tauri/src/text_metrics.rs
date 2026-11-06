//! VCL Font.Height is a GDI cell height, not a CSS em size.
use serde::{Deserialize, Serialize};
use std::ffi::c_void;
type Handle = *mut c_void;

#[derive(Deserialize)]
pub struct TextRequest {
    family: String,
    height: i32,
    bold: bool,
    italic: bool,
    text: String,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TextMetrics {
    family: String,
    em_size: i32,
    height: i32,
    baseline: i32,
    width: i32,
}
#[repr(C)]
#[derive(Default)]
struct NativeMetrics {
    height: i32,
    ascent: i32,
    descent: i32,
    internal_leading: i32,
    external_leading: i32,
    average_width: i32,
    maximum_width: i32,
    weight: i32,
    overhang: i32,
    aspect_x: i32,
    aspect_y: i32,
    first: u16,
    last: u16,
    default_char: u16,
    break_char: u16,
    italic: u8,
    underlined: u8,
    struck_out: u8,
    pitch: u8,
    charset: u8,
}
#[repr(C)]
#[derive(Default)]
struct Size {
    x: i32,
    y: i32,
}
#[link(name = "gdi32")]
extern "system" {
    fn CreateCompatibleDC(dc: Handle) -> Handle;
    fn DeleteDC(dc: Handle) -> i32;
    fn CreateFontW(
        height: i32,
        width: i32,
        escapement: i32,
        orientation: i32,
        weight: i32,
        italic: u32,
        underline: u32,
        strikeout: u32,
        charset: u32,
        output: u32,
        clip: u32,
        quality: u32,
        pitch: u32,
        face: *const u16,
    ) -> Handle;
    fn SelectObject(dc: Handle, object: Handle) -> Handle;
    fn DeleteObject(object: Handle) -> i32;
    fn GetTextMetricsW(dc: Handle, metrics: *mut NativeMetrics) -> i32;
    fn GetTextExtentPoint32W(dc: Handle, text: *const u16, count: i32, size: *mut Size) -> i32;
    fn GetTextFaceW(dc: Handle, count: i32, face: *mut u16) -> i32;
}
struct Dc(Handle);
impl Drop for Dc {
    fn drop(&mut self) {
        unsafe {
            DeleteDC(self.0);
        }
    }
}
struct Font(Handle);
impl Drop for Font {
    fn drop(&mut self) {
        unsafe {
            DeleteObject(self.0);
        }
    }
}

#[tauri::command]
pub fn measure_rbs_text(requests: Vec<TextRequest>) -> Result<Vec<TextMetrics>, String> {
    if requests.len() > 2048 {
        return Err("Zu viele Schriftmessungen.".into());
    }
    let dc = Dc(unsafe { CreateCompatibleDC(std::ptr::null_mut()) });
    if dc.0.is_null() {
        return Err("Windows-Schriftmessung nicht verfügbar.".into());
    }
    let mut result = Vec::with_capacity(requests.len());
    for r in requests {
        if r.height == 0 || r.height.unsigned_abs() > 4096 || r.text.len() > 100_000 {
            return Err("Ungültige Schriftmessung.".into());
        }
        let family: Vec<u16> = r.family.encode_utf16().take(31).chain(Some(0)).collect();
        let font = Font(unsafe {
            CreateFontW(
                r.height,
                0,
                0,
                0,
                if r.bold { 700 } else { 400 },
                r.italic as u32,
                0,
                0,
                1,
                0,
                0,
                0,
                0,
                family.as_ptr(),
            )
        });
        if font.0.is_null() {
            return Err("Windows-Schrift konnte nicht geladen werden.".into());
        }
        let old = unsafe { SelectObject(dc.0, font.0) };
        if old.is_null() || old as isize == -1 {
            return Err("Windows-Schrift konnte nicht gewählt werden.".into());
        }
        let mut metrics = NativeMetrics::default();
        let mut size = Size::default();
        let mut face = [0u16; 128];
        let text: Vec<u16> = r.text.encode_utf16().collect();
        let valid = unsafe {
            let valid = GetTextMetricsW(dc.0, &mut metrics) != 0
                && GetTextExtentPoint32W(dc.0, text.as_ptr(), text.len() as i32, &mut size) != 0;
            GetTextFaceW(dc.0, face.len() as i32, face.as_mut_ptr());
            SelectObject(dc.0, old);
            valid
        };
        if !valid {
            return Err("Windows konnte den Text nicht messen.".into());
        }
        let end = face.iter().position(|c| *c == 0).unwrap_or(face.len());
        result.push(TextMetrics {
            family: String::from_utf16_lossy(&face[..end]),
            em_size: metrics.height - metrics.internal_leading,
            height: metrics.height,
            baseline: metrics.ascent,
            width: size.x,
        });
    }
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    // Optional bridge for rendering a complete local RBS with real GDI metrics
    // in the automated WebView/browser comparison. No production test switch.
    #[test]
    fn export_requested_metrics_for_visual_comparison() {
        let Ok(input) = std::env::var("RBS_METRICS_REQUESTS") else {
            return;
        };
        let output = std::env::var("RBS_METRICS_OUTPUT").unwrap();
        let requests: Vec<TextRequest> =
            serde_json::from_slice(&std::fs::read(input).unwrap()).unwrap();
        let metrics = measure_rbs_text(requests).unwrap();
        std::fs::write(output, serde_json::to_vec_pretty(&metrics).unwrap()).unwrap();
    }
    fn request(height: i32, text: &str) -> TextRequest {
        TextRequest {
            family: "Arial".into(),
            height,
            bold: true,
            italic: false,
            text: text.into(),
        }
    }
    #[test]
    fn cell_height_baseline_and_signed_height_match_windows() {
        let result = measure_rbs_text(vec![
            request(40, "99,999"),
            request(-40, "99,999"),
            request(40, ""),
            request(96, "9999"),
            request(72, "MMM"),
            request(160, "120:00"),
        ])
        .unwrap();
        let cell = &result[0];
        let em = &result[1];
        assert_eq!(cell.height, 40);
        assert!(cell.em_size < 40 && cell.em_size > 30);
        assert!(cell.baseline < cell.height && cell.baseline > cell.em_size / 2);
        assert_eq!(em.em_size, 40);
        assert!(em.height > cell.height && em.width > cell.width);
        assert_eq!(result[2].width, 0);
        // Cp-6S-07: the supplied Cockpit Designer screenshot shows these field
        // bounds at 1:1. In particular, fh=96 is an 83px em, not a 96px em.
        assert_eq!(
            (
                result[3].em_size,
                result[3].height,
                result[3].baseline,
                result[3].width
            ),
            (83, 96, 77, 184)
        );
        assert_eq!((result[4].height, result[4].width), (72, 159));
        assert_eq!((result[5].height, result[5].width), (160, 432));
        println!("GDI reference: {result:?}");
    }
}
