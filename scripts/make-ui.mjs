/** Generates the property-inspector pages (ui/*.html) plus the shared common.js / common.css. */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const uiDir = join(dirname(fileURLToPath(import.meta.url)), "..", "com.mjp.simplypuffco.sdPlugin", "ui");
mkdirSync(uiDir, { recursive: true });

const head = `<!DOCTYPE html>
<html>
<head lang="en">
  <meta charset="utf-8" />
  <title>Simply Peak</title>
  <script src="https://sdpi-components.dev/releases/v4/sdpi-components.js"></script>
  <link rel="stylesheet" href="common.css" />
  <script src="common.js"></script>
</head>
<body>
  <div id="status"></div>
  <hr />
`;
const foot = `</body>
</html>
`;
const opts = (list, def) =>
  list
    .map((o) => {
      const [v, l] = o.split("|");
      return `      <option value="${v}"${v === def ? " selected" : ""}>${l}</option>`;
    })
    .join("\n");
const select = (label, setting, list, def, global = false) => `  <sdpi-item label="${label}">
    <sdpi-select setting="${setting}" default="${def}"${global ? " global" : ""}>
${opts(list, def)}
    </sdpi-select>
  </sdpi-item>
`;
const check = (label, setting, text, def) => `  <sdpi-item label="${label}">
    <sdpi-checkbox setting="${setting}"${def ? ` default="true"` : ""} label="${text}"></sdpi-checkbox>
  </sdpi-item>
`;
const help = (text) => `  <div class="sd-help">${text}</div>\n`;

const unit = select("Temperature", "unit", ["f|Fahrenheit", "c|Celsius"], "f", true);
const hold = check("Start", "hold", "Hold for a moment to start (a press still stops instantly)", true);

const pages = {
  "simple.html": unit,
  "power.html":
    select("Action", "mode", ["sleep|Sleep (wakes with the button)", "off|Power off"], "sleep") +
    check("Hold", "hold", "Hold for a moment instead of a single press", true),
  "heat.html": hold + unit + help("Holding guards against a brushed key lighting the chamber. The device still enforces its own temperature and time limits."),
  "profile.html":
    select("Profile", "slot", ["1|Profile 1", "2|Profile 2", "3|Profile 3", "4|Profile 4"], "1") +
    select("On press", "press", ["select|Select the profile", "select-start|Select and start heating"], "select") +
    unit +
    help("Put four Profile keys side by side. The active profile is outlined; while heating, the outline follows the session colour."),
  "session.html":
    select("Rotate", "rotate", ["temp|Profile temperature", "time|Profile time", "profile|Switch profile"], "temp") +
    select("Temperature step", "step", ["1|1°", "5|5°", "10|10°"], "5") +
    select("Touch tap", "tap", ["boost|Boost", "none|Nothing"], "boost") +
    hold +
    unit +
    help("Rotating changes the active profile's temperature on the device (saved after you stop turning). Press to start or stop, tap the strip to boost."),
  "strip.html":
    select("Segment", "segment", ["auto|Automatic (by dial position)", "1|1 (left)", "2|2", "3|3", "4|4 (right)"], "auto") +
    select("Rotate", "rotate", ["temp|Profile temperature", "time|Profile time", "profile|Switch profile"], "temp") +
    select("Temperature step", "step", ["1|1°", "5|5°", "10|10°"], "5") +
    select("Touch tap", "tap", ["boost|Boost", "none|Nothing"], "boost") +
    hold +
    unit +
    help("Drop this action on all four dials. Each one draws its quarter of a single bar across the strip, picked from its position automatically."),
  "status.html":
    `  <sdpi-item label="Device name">
    <sdpi-textfield setting="nameFilter" global placeholder="any Peak Pro"></sdpi-textfield>
  </sdpi-item>
` +
    unit +
    `  <sdpi-item label="">
    <button id="reconnect">Reconnect</button>
  </sdpi-item>
` +
    help("Leave the name empty to connect to the first Peak Pro found. If you renamed yours in the Puffco app, you can type part of that name here. The phone app must be disconnected: a Peak only talks to one controller at a time."),
};

for (const [file, body] of Object.entries(pages)) writeFileSync(join(uiDir, file), head + body + foot);

writeFileSync(
  join(uiDir, "common.css"),
  `body { padding: 6px 0 12px; }
.sd-status { display: flex; align-items: center; gap: 8px; font-size: 12px; }
.sd-status .dot { width: 9px; height: 9px; border-radius: 50%; background: #8a8a8a; flex: none; }
.sd-status.ok .dot { background: #3ad47e; box-shadow: 0 0 6px #3ad47eaa; }
.sd-status.warn .dot { background: #e5a53a; animation: sd-pulse 1s infinite alternate; }
.sd-status.bad .dot { background: #ff4f5e; }
@keyframes sd-pulse { from { opacity: 0.4; } to { opacity: 1; } }
.sd-note { font-size: 11px; color: #9aa0a6; line-height: 1.45; margin-top: 4px; }
.sd-help { font-size: 11px; color: #8a8a8a; line-height: 1.4; margin-top: 2px; }
button { background: #2b2b2b; color: #eee; border: 1px solid #444; border-radius: 4px; padding: 5px 12px; font-size: 12px; cursor: pointer; }
button:hover { background: #3a3a3a; }
hr { border: 0; border-top: 1px solid #333; margin: 8px 0; }
`,
);

writeFileSync(
  join(uiDir, "common.js"),
  `/* Shared property-inspector logic: device status line at the top of every page, reconnect button. */
(function () {
  const client = () => window.SDPIComponents && window.SDPIComponents.streamDeckClient;
  let status = null;
  function el(tag, attrs, children) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === "text") n.textContent = v;
      else if (k === "html") n.innerHTML = v;
      else n.setAttribute(k, v);
    }
    for (const c of children || []) n.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    return n;
  }
  function render() {
    const host = document.getElementById("status");
    if (!host) return;
    host.innerHTML = "";
    const s = status;
    let cls = "warn", text = "Waiting for the plugin…";
    if (s) {
      switch (s.link) {
        case "adapter-off": cls = "bad"; text = "Bluetooth is off (" + s.adapter + "). Turn it on in Windows settings."; break;
        case "scanning": cls = "warn"; text = "Searching for a Peak Pro… power it on and make sure the phone app is disconnected."; break;
        case "connecting": cls = "warn"; text = "Connecting to " + (s.name || "device") + "…"; break;
        case "authenticating": cls = "warn"; text = "Pairing with " + (s.name || "device") + "… accept the Windows prompt if one appears."; break;
        case "error": cls = "bad"; text = "Error: " + (s.error || "unknown"); break;
        default: cls = "ok"; text = "Connected: " + (s.name || "") + (s.model ? " (" + s.model + ")" : "") + (s.battery != null ? " · " + s.battery + "%" : "");
      }
    }
    host.appendChild(el("sdpi-item", { label: "Peak Pro" }, [el("div", { class: "sd-status " + cls }, [el("span", { class: "dot" }), el("span", { text })])]));
    if (s && s.link === "scanning" && s.seen && s.seen.length) {
      const names = s.seen.filter((d) => d.name).map((d) => d.name).slice(-6).join(", ");
      if (names) host.appendChild(el("sdpi-item", { label: "" }, [el("div", { class: "sd-note", text: "Seen nearby: " + names })]));
    }
  }
  function connect() {
    const c = client();
    if (!c) return setTimeout(connect, 100);
    c.sendToPropertyInspector.subscribe((msg) => {
      const p = msg && msg.payload && msg.payload.event ? msg.payload : msg;
      if (p && p.event === "status") { status = p; render(); }
    });
    c.send("sendToPlugin", { event: "get-status" });
    const btn = document.getElementById("reconnect");
    if (btn) btn.addEventListener("click", () => c.send("sendToPlugin", { event: "reconnect" }));
  }
  document.addEventListener("DOMContentLoaded", () => { render(); connect(); });
})();
`,
);
console.log("ui written");
