/* Shared property-inspector logic: device status line at the top of every page, reconnect button. */
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
