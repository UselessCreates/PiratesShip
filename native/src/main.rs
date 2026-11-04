#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::env;
use std::io::{BufRead, BufReader};
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::mpsc::channel;
use std::thread;
use std::time::Duration;

use tao::dpi::LogicalSize;
use tao::event::{Event, WindowEvent};
use tao::event_loop::{ControlFlow, EventLoop};
use tao::window::WindowBuilder;
use wry::WebViewBuilder;

const CREATE_NO_WINDOW: u32 = 0x0800_0000;
const READY: &str = "PIRATES_READY ";
const FAILED: &str = "PIRATES_ERROR ";
const ENGINE_TIMEOUT: Duration = Duration::from_secs(25);

fn exe_dir() -> PathBuf {
    env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(Path::to_path_buf))
        .unwrap_or_else(|| PathBuf::from("."))
}

fn host_script(start: &Path) -> Option<PathBuf> {
    let mut dir = Some(start);
    for _ in 0..4 {
        let current = dir?;
        let candidate = current.join("host").join("host.mjs");
        if candidate.is_file() {
            return Some(candidate);
        }
        dir = current.parent();
    }
    None
}

fn find_node(dir: &Path) -> PathBuf {
    if let Ok(configured) = env::var("PIRATESHIP_NODE") {
        let path = PathBuf::from(configured);
        if path.is_file() {
            return path;
        }
    }
    for local in [dir.join("runtime").join("node.exe"), dir.join("node.exe")] {
        if local.is_file() {
            return local;
        }
    }
    let mut roots = Vec::new();
    for key in ["ProgramFiles", "ProgramFiles(x86)"] {
        if let Ok(value) = env::var(key) {
            roots.push(PathBuf::from(value).join("nodejs"));
        }
    }
    if let Ok(value) = env::var("LOCALAPPDATA") {
        roots.push(PathBuf::from(value).join("Programs").join("nodejs"));
    }
    for root in roots {
        let candidate = root.join("node.exe");
        if candidate.is_file() {
            return candidate;
        }
    }
    PathBuf::from("node")
}

fn drain(result: std::process::ChildStdout) -> std::sync::mpsc::Receiver<Result<String, String>> {
    let (tx, rx) = channel();
    thread::spawn(move || {
        for line in BufReader::new(result).lines().map_while(Result::ok) {
            if let Some(url) = line.strip_prefix(READY) {
                let _ = tx.send(Ok(url.trim().to_string()));
                return;
            }
            if let Some(message) = line.strip_prefix(FAILED) {
                let _ = tx.send(Err(message.trim().to_string()));
                return;
            }
        }
        let _ = tx.send(Err(String::new()));
    });
    rx
}

fn stderr_tail(stream: std::process::ChildStderr) -> thread::JoinHandle<String> {
    thread::spawn(move || {
        let mut text = String::new();
        for line in BufReader::new(stream).lines().map_while(Result::ok).take(24) {
            text.push_str(&line);
            text.push('\n');
        }
        text
    })
}

fn start_engine(dir: &Path) -> Result<(Child, String), String> {
    let script = host_script(dir).ok_or_else(|| {
        format!(
            "the engine folder is missing. Keep host\\ next to PiratesShip.exe (looked in {}).",
            dir.display()
        )
    })?;
    let node = find_node(dir);
    let mut child = Command::new(&node)
        .arg(&script)
        .arg("--native")
        .current_dir(dir)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|e| {
            format!(
                "Node could not be started ({}). Install Node 18 or newer from nodejs.org, or drop a copy of node.exe into runtime\\ next to PiratesShip.exe.",
                e
            )
        })?;
    let stdout = child.stdout.take().ok_or_else(|| "the engine produced no output.".to_string())?;
    let errors = child.stderr.take().map(stderr_tail);
    let ready = drain(stdout);
    match ready.recv_timeout(ENGINE_TIMEOUT) {
        Ok(Ok(url)) => Ok((child, url)),
        Ok(Err(message)) => {
            let _ = child.kill();
            let tail = errors.map(|h| h.join().unwrap_or_default()).unwrap_or_default();
            let tail = tail.trim();
            Err(if message.is_empty() && tail.is_empty() {
                "the engine stopped before it was ready.".to_string()
            } else if message.is_empty() {
                tail.to_string()
            } else {
                message
            })
        }
        Err(_) => {
            let _ = child.kill();
            Err("the engine did not answer within 25 seconds.".to_string())
        }
    }
}

fn stop_engine(child: &mut Option<Child>) {
    if let Some(mut running) = child.take() {
        let pid = running.id().to_string();
        let _ = Command::new("taskkill")
            .args(["/PID", &pid, "/T", "/F"])
            .creation_flags(CREATE_NO_WINDOW)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
        let _ = running.kill();
        let _ = running.wait();
    }
}

fn error_page(reason: &str, dir: &Path) -> String {
    let escaped = reason
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;");
    let where_ = dir.display().to_string().replace('\\', "/");
    format!(
        r#"<!doctype html><html lang="en"><head><meta charset="utf-8"><title>PiratesShip</title><style>
html,body{{margin:0;height:100%;background:#0b0f14;color:#e8eef5;font:15px/1.55 -apple-system,Segoe UI,system-ui,sans-serif}}
main{{max-width:640px;margin:0 auto;padding:12vh 28px}}
h1{{margin:0 0 14px;font-size:24px;letter-spacing:-.01em}}
p{{margin:0 0 12px;color:#9fb0c3}}
pre{{margin:18px 0;padding:14px 16px;background:#111823;border:1px solid #1d2836;border-radius:10px;color:#c8d4e0;white-space:pre-wrap;font:13px/1.5 ui-monospace,Consolas,monospace}}
code{{color:#cbd8e6}}
a{{color:#7fb6ff}}
small{{display:block;margin-top:22px;color:#6d7f92}}
</style></head><body><main>
<h1>PiratesShip could not start its engine</h1>
<p>The window is fine, but the Node process behind it did not come up.</p>
<pre>{escaped}</pre>
<p>Marina thinks this is fixable: install Node 18 or newer from <a href="https://nodejs.org/en/download">nodejs.org/en/download</a>, then close this window and open <code>PiratesShip.exe</code> again.</p>
<p>If Node is already installed, check that a <code>host</code> folder sits next to the exe and that <code>runtime/node.exe</code> is present in the packaged build.</p>
<small>Looking in {where_}</small>
</main></body></html>"#
    )
}

fn main() {
    let dir = exe_dir();
    let started = start_engine(&dir);
    let event_loop = EventLoop::new();
    let window = match WindowBuilder::new()
        .with_title("PiratesShip")
        .with_inner_size(LogicalSize::new(1280.0, 860.0))
        .with_min_inner_size(LogicalSize::new(960.0, 640.0))
        .build(&event_loop)
    {
        Ok(window) => window,
        Err(e) => {
            eprintln!("window: {e}");
            std::process::exit(1);
        }
    };
    let mut child = None;
    let view = match started {
        Ok((engine, url)) => {
            child = Some(engine);
            WebViewBuilder::new().with_url(url).build(&window)
        }
        Err(reason) => WebViewBuilder::new().with_html(error_page(&reason, &dir)).build(&window),
    };
    let _webview = match view {
        Ok(webview) => webview,
        Err(e) => {
            eprintln!("webview: {e}");
            stop_engine(&mut child);
            std::process::exit(1);
        }
    };
    event_loop.run(move |event, _, control_flow| {
        *control_flow = ControlFlow::Wait;
        match event {
            Event::WindowEvent {
                event: WindowEvent::CloseRequested,
                ..
            } => {
                stop_engine(&mut child);
                *control_flow = ControlFlow::Exit;
            }
            Event::LoopDestroyed => stop_engine(&mut child),
            _ => {}
        }
    });
}
