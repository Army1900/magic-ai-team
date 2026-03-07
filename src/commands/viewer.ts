import fs from "node:fs";
import path from "node:path";
import { Command } from "commander";
import { exportManifestPath } from "../core/project-files";
import { readWorklogEvents } from "../core/worklog";
import { banner, info, kv, success, warn } from "../core/ui";
import { toJsonString } from "../core/json-output";

function safeReadJson(filePath: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function renderViewerHtml(payload: { project: string; manifest: unknown; events: unknown[] }): string {
  const json = JSON.stringify(payload).replace(/</g, "\\u003c");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>OpenTeam Viewer</title>
  <style>
    :root { --bg:#f6f5f2; --panel:#ffffff; --text:#111; --muted:#58606b; --ok:#1f8f45; --warn:#a46900; --fail:#b42318; --accent:#0f62fe; --border:#e3e6eb; --radius:12px; --space:12px; }
    body { margin:0; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Arial; background:var(--bg); color:var(--text); }
    .wrap { max-width:1100px; margin:0 auto; padding:24px; }
    .card { background:var(--panel); border:1px solid var(--border); border-radius:var(--radius); padding:16px; margin-bottom:12px; }
    .title { font-size:20px; font-weight:700; margin-bottom:8px; }
    .muted { color:var(--muted); }
    .row { display:flex; gap:10px; flex-wrap:wrap; }
    .pill { border:1px solid var(--border); border-radius:999px; padding:4px 10px; font-size:12px; }
    .ok { color:var(--ok); } .warn { color:var(--warn); } .fail { color:var(--fail); }
    table { width:100%; border-collapse: collapse; font-size:13px; }
    th, td { border-bottom:1px solid var(--border); text-align:left; padding:8px; vertical-align: top; }
    pre { margin:0; white-space: pre-wrap; word-break: break-word; font-size:12px; }
    .tabs { display:flex; gap:8px; margin-bottom:8px; }
    button.tab { border:1px solid var(--border); background:#fff; border-radius:8px; padding:6px 10px; cursor:pointer; }
    button.tab.active { border-color:var(--accent); color:var(--accent); }
    .hidden { display:none; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <div class="title">OpenTeam Viewer</div>
      <div class="muted" id="project"></div>
    </div>
    <div class="card">
      <div class="tabs">
        <button class="tab active" data-tab="conversation">Conversation</button>
        <button class="tab" data-tab="execution">Execution</button>
        <button class="tab" data-tab="history">History</button>
      </div>
      <div id="conversation"></div>
      <div id="execution" class="hidden"></div>
      <div id="history" class="hidden"></div>
    </div>
  </div>
  <script>
    const data = ${json};
    const events = Array.isArray(data.events) ? data.events : [];
    const manifest = data.manifest || null;
    document.getElementById('project').textContent = 'Project: ' + data.project;
    const conv = document.getElementById('conversation');
    const exec = document.getElementById('execution');
    const hist = document.getElementById('history');
    const recent = events.slice(-20).reverse();
    const runEvents = events.filter(e => e && (e.type === 'run' || e.type === 'run_step')).slice(-100).reverse();

    conv.innerHTML =
      '<div class="row">' +
      '<span class="pill">events=' + events.length + '</span>' +
      '<span class="pill">runs=' + events.filter(e=>e.type==="run").length + '</span>' +
      '<span class="pill">starts=' + events.filter(e=>e.type==="start").length + '</span>' +
      '</div>' +
      '<table><thead><tr><th>ts</th><th>type</th><th>status</th><th>note</th></tr></thead><tbody>' +
      recent.map(e => '<tr><td>'+ (e.ts||'-') +'</td><td>'+ (e.type||'-') +'</td><td>'+ (e.status||'-') +'</td><td>'+ (e.note||'-') +'</td></tr>').join('') +
      '</tbody></table>';

    exec.innerHTML =
      '<div class="row">' +
      '<span class="pill">manifest=' + (manifest ? 'yes' : 'no') + '</span>' +
      '</div>' +
      '<table><thead><tr><th>ts</th><th>agent</th><th>type</th><th>status</th><th>cost</th><th>tokens</th></tr></thead><tbody>' +
      runEvents.map(e => '<tr><td>'+ (e.ts||'-') +'</td><td>'+ (e.agent||'-') +'</td><td>'+ (e.type||'-') +'</td><td>'+ (e.status||'-') +'</td><td>'+ (e.cost_usd??'-') +'</td><td>'+ (e.tokens??'-') +'</td></tr>').join('') +
      '</tbody></table>' +
      '<div style="margin-top:10px"><pre>' + JSON.stringify(manifest, null, 2) + '</pre></div>';

    hist.innerHTML =
      '<div class="muted">Raw worklog events (latest 50)</div>' +
      '<pre>' + JSON.stringify(events.slice(-50), null, 2) + '</pre>';

    document.querySelectorAll('button.tab').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('button.tab').forEach(x => x.classList.remove('active'));
        btn.classList.add('active');
        const tab = btn.getAttribute('data-tab');
        [conv, exec, hist].forEach(el => el.classList.add('hidden'));
        document.getElementById(tab).classList.remove('hidden');
      });
    });
  </script>
</body>
</html>`;
}

export function registerViewerCommand(program: Command): void {
  program
    .command("viewer")
    .description("Generate a static web viewer from .openteam/worklog + export manifest")
    .option("--project <path>", "project path", ".")
    .option("--out <file>", "output html path")
    .option("--json", "json output mode", false)
    .action((options) => {
      const project = path.resolve(String(options.project ?? "."));
      const manifestPath = exportManifestPath(project);
      const events = readWorklogEvents(project);
      const manifest = safeReadJson(manifestPath);
      const out = path.resolve(options.out ?? path.join(project, ".openteam", "viewer", "index.html"));
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, renderViewerHtml({ project, manifest, events }), "utf8");

      if (options.json) {
        console.log(
          toJsonString({
            output: out,
            project,
            manifest_found: Boolean(manifest),
            events: events.length
          })
        );
        return;
      }
      banner("Viewer Generated", "static html");
      kv("project", project);
      kv("output", out);
      kv("events", events.length);
      if (!manifest) {
        warn("Export manifest not found; viewer still generated with worklog-only data.");
      }
      info(`Open in browser: ${out}`);
      success("Viewer generation complete.");
    });
}

