

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::mpsc;
use std::time::Duration;

use tao::dpi::LogicalSize;
use tao::event::{Event, WindowEvent};
use tao::event_loop::{ControlFlow, EventLoop};
use tao::window::{Icon, WindowBuilder};
use wry::WebViewBuilder;

include!(concat!(env!("OUT_DIR"), "/icon_data.rs"));

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

fn exe_dir() -> PathBuf {
    std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(Path::to_path_buf))
        .unwrap_or_else(|| PathBuf::from("."))
}

fn find_host_dir() -> Option<PathBuf> {
    let dir = exe_dir();
    let mut candidates = vec![
        dir.join("host"),
        dir.join("..").join("host"),
        dir.join("..").join("..").join("host"),
        dir.join("..").join("..").join("..").join("host"),
        dir.join("..").join("..").join("..").join("..").join("host"),
    ];
    candidates.push(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..").join("host"));
    candidates
        .into_iter()
        .map(|c| c.canonicalize().unwrap_or(c))
        .find(|c| c.join("host.mjs").is_file())
}

fn which(cmd: &str) -> Option<PathBuf> {
    let out = Command::new("where").arg(cmd).output().ok()?;
    if !out.status.success() {
        return None;
    }
    String::from_utf8_lossy(&out.stdout)
        .lines()
        .map(str::trim)
        .filter(|l| !l.is_empty())
        .map(PathBuf::from)
        .find(|p| p.is_file())
}

fn find_node() -> Option<PathBuf> {
    if let Ok(custom) = std::env::var("PIRATESHIP_NODE") {
        let p = PathBuf::from(custom);
        if p.is_file() {
            return Some(p);
        }
    }

    let bundled = exe_dir().join("runtime").join("node.exe");
    if bundled.is_file() {
        return Some(bundled);
    }
    if let Some(p) = which("node") {
        return Some(p);
    }
    let mut common = Vec::new();
    if let Ok(pf) = std::env::var("ProgramFiles") {
        common.push(PathBuf::from(pf).join("nodejs").join("node.exe"));
    }
    if let Ok(pf) = std::env::var("ProgramFiles(x86)") {
        common.push(PathBuf::from(pf).join("nodejs").join("node.exe"));
    }
    if let Ok(la) = std::env::var("LOCALAPPDATA") {
        common.push(PathBuf::from(la).join("Programs").join("nodejs").join("node.exe"));
    }
    common.into_iter().find(|p| p.is_file())
}

fn spawn_engine(host_dir: &Path, node: &Path) -> Option<(Child, String)> {
    let mut cmd = Command::new(node);
    cmd.arg("host.mjs")
        .arg("--native")
        .current_dir(host_dir)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let mut child = cmd.spawn().ok()?;
    let stdout = child.stdout.take()?;
    let stderr = child.stderr.take();

    let (tx, rx) = mpsc::channel::<String>();
    std::thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines().map_while(|l| l.ok()) {
            if let Some(url) = line.strip_prefix("PIRATES_READY ") {
                let _ = tx.send(url.trim().to_string());
            }
        }
    });

    std::thread::spawn(move || {
        if let Some(err) = stderr {
            let reader = BufReader::new(err);
            for line in reader.lines().map_while(Result::ok) {
                eprintln!("[engine] {line}");
            }
        }
    });

    match rx.recv_timeout(Duration::from_secs(45)) {
        Ok(url) => Some((child, url)),
        Err(_) => {
            let _ = child.kill();
            None
        }
    }
}

#[allow(unused_mut)]
fn kill_tree(child: &mut Child) {
    #[cfg(windows)]
    {
        let pid = child.id().to_string();
        let mut cmd = Command::new("taskkill");
        cmd.args(["/PID", pid.as_str(), "/T", "/F"]);
        cmd.creation_flags(CREATE_NO_WINDOW);
        let _ = cmd.output();
    }
    let _ = child.kill();
}

fn error_page(message: &str) -> String {
    let safe = message
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;");
    format!(
        r#"<!doctype html><html><head><meta charset="utf-8"><title>PiratesShip</title>
<style>
  html,body{{height:100%;margin:0;background:#08080a;color:#e9e9ee;
    font:14px/1.65 ui-monospace,"Cascadia Mono",Consolas,monospace}}
  .wrap{{max-width:680px;margin:0 auto;padding:64px 28px}}
  h1{{font-size:18px;font-weight:600;letter-spacing:.02em;margin:0 0 6px}}
  .sub{{color:#7d818e;margin:0 0 26px}}
  pre{{background:#101014;border:1px solid #22232b;border-radius:8px;padding:16px;
    white-space:pre-wrap;color:#f5a97f;font-size:12.5px}}
  ol{{color:#a9adb8;padding-left:20px}} li{{margin:6px 0}}
  code{{background:#15151b;border:1px solid #22232b;border-radius:4px;padding:1px 5px;color:#e9e9ee}}
  a{{color:#f5a97f}}
</style></head><body><div class="wrap">
<h1>PiratesShip could not start its engine</h1>
<p class="sub">The window is fine — Node.js was not found, or the host folder is missing.</p>
<pre>{safe}</pre>
<ol>
  <li>Install Node.js LTS: <a href="https://nodejs.org/en/download">nodejs.org/en/download</a>
      (or <code>winget install --exact --id OpenJS.NodeJS.LTS</code>), then reopen this app.</li>
  <li>Keep <code>host\</code> and <code>ui\</code> next to <code>PiratesShip.exe</code>.</li>
  <li>Or run it from source in a terminal: <code>npm start</code>.</li>
</ol>
</div></body></html>"#
    )
}

fn main() {
    let mut engine: Option<(Child, String)> = None;
    let mut failure: Option<String> = None;

    let host_dir = find_host_dir();
    let node = find_node();

    match (&host_dir, &node) {
        (Some(h), Some(n)) => match spawn_engine(h, n) {
            Some(pair) => engine = Some(pair),
            None => {
                failure = Some(format!(
                    "Engine handshake failed.\n  host: {}\n  node: {}",
                    h.display(),
                    n.display()
                ))
            }
        },
        (None, _) => {
            failure = Some(format!(
                "Could not find host\\host.mjs.\nLooked next to: {}",
                exe_dir().display()
            ))
        }
        (_, None) => {
            failure = Some("Could not find node.exe (PATH, runtime\\node.exe, Program Files).".to_string())
        }
    }

    let event_loop = EventLoop::new();
    let mut window_builder = WindowBuilder::new()
        .with_title("PiratesShip")
        .with_inner_size(LogicalSize::new(1240.0, 860.0))
        .with_min_inner_size(LogicalSize::new(900.0, 620.0));

    if !ICON_RGBA.is_empty() {
        if let Ok(icon) = Icon::from_rgba(ICON_RGBA.to_vec(), ICON_SIZE, ICON_SIZE) {
            window_builder = window_builder.with_window_icon(Some(icon));
        }
    }
    let window = window_builder
        .build(&event_loop)
        .expect("failed to create the PiratesShip window");

    let target = match &engine {
        Some((_, url)) => url.clone(),
        None => String::new(),
    };

    let builder = WebViewBuilder::new();
    let webview = if target.is_empty() {
        builder.with_html(error_page(&failure.unwrap_or_default()))
    } else {
        builder.with_url(target)
    }
    .build(&window)
    .expect("failed to create the WebView2 view");

    event_loop.run(move |event, _, control_flow| {
        *control_flow = ControlFlow::Wait;
        if let Event::WindowEvent {
            event: WindowEvent::CloseRequested,
            ..
        } = event
        {
            if let Some((mut child, _)) = engine.take() {
                kill_tree(&mut child);
            }
            *control_flow = ControlFlow::Exit;
        }
        let _keep_alive = &webview;
    });
}
