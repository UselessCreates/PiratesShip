

use std::path::{Path, PathBuf};
use std::process::Command;

fn subdirs(dir: &Path) -> Vec<PathBuf> {
    let mut list: Vec<PathBuf> = std::fs::read_dir(dir)
        .map(|rd| rd.filter_map(|e| e.ok().map(|e| e.path())).filter(|p| p.is_dir()).collect())
        .unwrap_or_default();
    list.sort();
    list.reverse();
    list
}

fn candidates() -> Vec<PathBuf> {
    let mut out = Vec::new();
    if let Ok(rc) = std::env::var("RC") {
        out.push(PathBuf::from(rc));
    }
    out.push(PathBuf::from("rc.exe"));
    out.push(PathBuf::from("rc"));

    for key in ["ProgramFiles(x86)", "ProgramFiles"] {
        if let Ok(pf) = std::env::var(key) {
            let kits = PathBuf::from(pf).join("Windows Kits").join("10").join("bin");
            for version in subdirs(&kits) {
                for arch in ["x64", "x86", "arm64"] {
                    out.push(version.join(arch).join("rc.exe"));
                }
            }
        }
    }

    for key in ["ProgramFiles", "ProgramFiles(x86)"] {
        if let Ok(pf) = std::env::var(key) {
            for year in subdirs(&PathBuf::from(pf).join("Microsoft Visual Studio")) {
                for edition in subdirs(&year) {
                    let tools = edition.join("VC").join("Tools").join("MSVC");
                    for version in subdirs(&tools) {
                        for host in ["Hostx64", "Hostx86"] {
                            out.push(version.join("bin").join(host).join("x64").join("rc.exe"));
                        }
                    }
                }
            }
        }
    }
    out
}

fn main() {
    println!("cargo:rerun-if-changed=app.rc");
    println!("cargo:rerun-if-changed=app.ico");
    println!("cargo:rerun-if-changed=app-icon.rgba");

    let manifest = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").expect("manifest dir"));
    let out_dir = PathBuf::from(std::env::var("OUT_DIR").expect("out dir"));

    let rgba = manifest.join("app-icon.rgba");
    let icon_rs = out_dir.join("icon_data.rs");
    let usable = std::fs::metadata(&rgba).map(|m| m.len() == 64 * 64 * 4).unwrap_or(false);
    if usable {
        let _ = std::fs::copy(&rgba, out_dir.join("app_icon.rgba"));
        let _ = std::fs::write(
            &icon_rs,
            "pub const ICON_RGBA: &[u8] = include_bytes!(\"app_icon.rgba\");\npub const ICON_SIZE: u32 = 64;\n",
        );
    } else {
        let _ = std::fs::write(
            &icon_rs,
            "pub const ICON_RGBA: &[u8] = &[];\npub const ICON_SIZE: u32 = 0;\n",
        );
    }

    if !manifest.join("app.rc").is_file() || !manifest.join("app.ico").is_file() {
        return;
    }

    let res = out_dir.join("app.res");

    for exe in candidates() {
        if exe.is_absolute() && !exe.is_file() {
            continue;
        }
        let ok = Command::new(&exe)
            .current_dir(&manifest)
            .args(["/nologo", "/fo"])
            .arg(&res)
            .arg("app.rc")
            .status()
            .map(|s| s.success())
            .unwrap_or(false);
        if ok {
            println!("cargo:rustc-link-arg={}", res.display());
            return;
        }
    }

    println!("cargo:warning=no resource compiler found - building without the icon");
}
