use std::env;
use std::path::PathBuf;

fn word(value: u16) -> [u8; 2] {
    value.to_le_bytes()
}

fn dword(value: u32) -> [u8; 4] {
    value.to_le_bytes()
}

fn block(type_id: u16, name_id: u16, payload: &[u8]) -> Vec<u8> {
    let mut out = Vec::new();
    out.extend_from_slice(&dword(payload.len() as u32));
    out.extend_from_slice(&dword(20));
    out.extend_from_slice(&word(0xFFFF));
    out.extend_from_slice(&word(type_id));
    out.extend_from_slice(&word(0xFFFF));
    out.extend_from_slice(&word(name_id));
    out.extend_from_slice(&dword(0));
    out.extend_from_slice(&word(0x1030));
    out.extend_from_slice(&word(0x0409));
    out.extend_from_slice(&dword(0));
    out.extend_from_slice(&dword(0));
    out.extend_from_slice(payload);
    let pad = (4 - payload.len() % 4) % 4;
    out.extend(std::iter::repeat_n(0u8, pad));
    out
}

fn main() {
    println!("cargo:rerun-if-changed=app.ico");
    let manifest = PathBuf::from(env::var("CARGO_MANIFEST_DIR").expect("manifest dir"));
    let out = PathBuf::from(env::var("OUT_DIR").expect("out dir"));
    let bytes = match std::fs::read(manifest.join("app.ico")) {
        Ok(data) => data,
        Err(_) => return,
    };
    if bytes.len() < 6 {
        return;
    }
    let count = u16::from_le_bytes([bytes[4], bytes[5]]) as usize;
    if count == 0 || bytes.len() < 6 + count * 16 {
        return;
    }
    let mut group = Vec::new();
    group.extend_from_slice(&word(0));
    group.extend_from_slice(&word(1));
    group.extend_from_slice(&word(count as u16));
    let mut images: Vec<(u16, Vec<u8>)> = Vec::new();
    for index in 0..count {
        let at = 6 + index * 16;
        let width = bytes[at];
        let height = bytes[at + 1];
        let colours = bytes[at + 2];
        let reserved = bytes[at + 3];
        let planes = u16::from_le_bytes([bytes[at + 4], bytes[at + 5]]);
        let bits = u16::from_le_bytes([bytes[at + 6], bytes[at + 7]]);
        let size = u32::from_le_bytes([bytes[at + 8], bytes[at + 9], bytes[at + 10], bytes[at + 11]]) as usize;
        let offset = u32::from_le_bytes([bytes[at + 12], bytes[at + 13], bytes[at + 14], bytes[at + 15]]) as usize;
        if offset + size > bytes.len() || size == 0 {
            return;
        }
        let id = (index + 1) as u16;
        group.extend_from_slice(&[width, height, colours, reserved]);
        group.extend_from_slice(&word(planes));
        group.extend_from_slice(&word(bits));
        group.extend_from_slice(&dword(size as u32));
        group.extend_from_slice(&word(id));
        images.push((id, bytes[offset..offset + size].to_vec()));
    }
    let mut resource = Vec::with_capacity(32);
    resource.extend_from_slice(&dword(0));
    resource.extend_from_slice(&dword(32));
    resource.extend_from_slice(&[0u8; 24]);
    for (id, data) in &images {
        resource.extend_from_slice(&block(3, *id, data));
    }
    resource.extend_from_slice(&block(14, 1, &group));
    let target = out.join("app.res");
    if std::fs::write(&target, resource).is_err() {
        return;
    }
    println!("cargo:rustc-link-arg={}", target.display());
}
