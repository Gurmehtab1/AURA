/* AURA — main application (vanilla JS, hash routing). */
(function () {
  const D = window.AURA_DATA, E = window.AURA_ENGINE;
  let S = E.load();
  const ui = { selected: null, filter: "All", search: "", manageSel: null, maps: {}, layers: {}, simTimer: null, userLocation: null, routeDestination: null, routeDestinationQuery: "" };
  const $ = (s, r = document) => r.querySelector(s);
  const app = $("#app");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const ago = (t) => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? "just now" : m < 60 ? m + " min ago" : Math.floor(m / 60) + "h " + (m % 60) + "m ago"; };
  const sevColor = { Critical: "#ff4d6d", High: "#ff9f43", Medium: "#ffd23f", Low: "#3ddc97" };
  const resp = (id) => S.responders.find((r) => r.id === id);
  const inc = (id) => S.incidents.find((i) => i.id === id);

  function commit(note) {
    if (note) { S.notifications.unshift({ t: Date.now(), msg: note, read: false }); S.notifications = S.notifications.slice(0, 40); }
    E.save(S); renderNotifs(); render();
  }
  function toast(msg, kind = "") {
    const el = document.createElement("div"); el.className = "toast " + kind; el.textContent = msg;
    $("#toasts").appendChild(el); setTimeout(() => el.remove(), 3800);
  }
  function log(i, msg) { i.history.push({ t: Date.now(), msg }); }

  /* ---------- MODALS ---------- */
  let modalClose = null;
  function openModal(html, onClose) { $("#modalBody").innerHTML = html; $("#modal").hidden = false; modalClose = onClose || null; setTimeout(() => { const f = $("#modalBody").querySelector("input,textarea,select,button"); f && f.focus(); }, 30); }
  function closeModal() { $("#modal").hidden = true; $("#modalBody").innerHTML = ""; modalClose && modalClose(); modalClose = null; }
  function confirmBox(title, msg, onYes, danger) {
    openModal(`<h2>${esc(title)}</h2><p class="muted">${esc(msg)}</p><div class="modal-actions"><button class="btn" data-action="modal-close">Cancel</button><button class="btn ${danger ? "btn-danger" : "btn-primary"}" id="cfYes">Confirm</button></div>`);
    $("#cfYes").onclick = () => { closeModal(); onYes(); };
  }
  $("#modal").addEventListener("click", (e) => { if (e.target.id === "modal") closeModal(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#modal").hidden) closeModal(); });

  /* ---------- NOTIFICATIONS ---------- */
  function renderNotifs() {
    const n = S.notifications.filter((x) => !x.read).length;
    const b = $("#notifCount"); b.hidden = !n; b.textContent = n;
    $("#notifPanel").innerHTML = `<div class="row between" style="padding:6px 8px 10px"><b>Notifications</b><button class="btn btn-sm btn-ghost" data-action="clear-notifs">Clear all</button></div>` +
      (S.notifications.length ? S.notifications.map((x) => `<div class="notif-item">${esc(x.msg)}<div class="muted small">${ago(x.t)}</div></div>`).join("") : `<div class="empty">No notifications yet</div>`);
  }

  /* ---------- ROUTER ---------- */
  const routes = { "": landing, command, manage, citizen, responder, routing, traffic };
  function route() { return (location.hash.replace(/^#\/?/, "").split("?")[0]) || ""; }
  function render() {
    const r = route();
    updateLocationStatus();
    Object.values(ui.maps).forEach((m) => m.remove()); ui.maps = {}; ui.layers = {};
    document.querySelectorAll(".nav-links a").forEach((a) => a.classList.toggle("active", a.dataset.route === r));
    (routes[r] || landing)();
  }
  window.addEventListener("hashchange", () => { $("#navLinks").classList.remove("open"); window.scrollTo(0, 0); render(); });

  /* ---------- SHARED ---------- */
  const typeIcon = (t) => D.TYPES[t].icon;
  function stats() {
    const A = S.incidents.map((i) => ({ i, a: E.assess(S, i) }));
    return {
      total: S.incidents.length,
      critical: A.filter((x) => x.a.severity === "Critical" && x.i.status !== "Resolved").length,
      active: S.incidents.filter((i) => i.status !== "Resolved").length,
      avail: S.responders.filter((r) => r.available && !r.assignment).length,
      resolved: S.incidents.filter((i) => i.status === "Resolved").length,
    };
  }
  function incCard(i, sel) {
    const a = E.assess(S, i);
    return `<button class="inc ${sel ? "sel" : ""}" data-action="select" data-id="${i.id}">
      <div class="row between"><span class="mono small muted">${i.id}</span><span class="pill sev-${a.severity}">${a.severity}</span></div>
      <div class="t">${typeIcon(i.type)} ${esc(i.type)}</div>
      <div class="meta"><span>📍 ${esc(i.location)}</span><span>${ago(i.createdAt)}</span></div>
      <div class="meta" style="margin-top:6px"><span>${i.reportIds.length} report${i.reportIds.length > 1 ? "s" : ""}</span>
      <span class="${i.verified ? "pill-ok" : "pill-warn"}">${i.verified ? "✓ Verified" : "Unverified"}</span>
      <span>${i.responders.length ? "🚑 " + esc(i.responders.map((r) => resp(r)?.name).join(", ")) : "No responder"}</span>
      <span class="pill-cyan">${i.status}</span>${a.needsAssessment ? `<span class="pill pill-warn">Needs assessment</span>` : ""}</div></button>`;
  }
  function filtered() {
    const q = ui.search.toLowerCase().trim();
    return S.incidents.filter((i) => {
      const a = E.assess(S, i); const f = ui.filter;
      if (["Critical", "High", "Medium", "Low"].includes(f) && a.severity !== f) return false;
      if (f === "Unverified" && i.verified) return false;
      if (f === "Active" && i.status === "Resolved") return false;
      if (f === "Resolved" && i.status !== "Resolved") return false;
      if (q && !(i.id.toLowerCase().includes(q) || i.location.toLowerCase().includes(q) || i.type.toLowerCase().includes(q))) return false;
      return true;
    });
  }

  /* ---------- MAPS ---------- */
  function makeMap(id, center = D.CENTER, zoom = 13) {
    const el = document.getElementById(id); if (!el || !window.L) { if (el) el.innerHTML = `<div class="empty">Map unavailable — check your internet connection.</div>`; return null; }
    const mapCenter = ui.userLocation && center === D.CENTER ? [ui.userLocation.lat, ui.userLocation.lng] : center;
    const m = L.map(el, { zoomControl: true, attributionControl: true }).setView(mapCenter, ui.userLocation && center === D.CENTER ? Math.max(zoom, 14) : zoom);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap contributors" }).addTo(m);
    ui.maps[id] = m;
    if (ui.userLocation) L.circleMarker([ui.userLocation.lat, ui.userLocation.lng], { radius: 8, color: "#fff", weight: 2, fillColor: "#39e7ff", fillOpacity: 1 }).bindTooltip(`Your current location · ${esc(ui.userLocation.label)}`).addTo(m);
    setTimeout(() => m.invalidateSize(), 60); return m;
  }
  function updateLocationStatus() {
    const status = $("#locationStatus"), label = $("#locationLabel");
    if (!status || !label) return;
    status.classList.toggle("is-set", !!ui.userLocation);
    label.textContent = ui.userLocation ? ui.userLocation.label : "Location not set";
    status.title = ui.userLocation ? `${ui.userLocation.lat.toFixed(5)}, ${ui.userLocation.lng.toFixed(5)}` : "Use the button to share your location with this page";
  }
  async function reverseGeocode(lat, lng) {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}`);
      if (!res.ok) throw new Error("Reverse geocoding unavailable");
      const data = await res.json();
      return data.name || data.address?.road || data.address?.suburb || data.address?.city || data.display_name?.split(",").slice(0, 3).join(",") || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    } catch (_) { return `${lat.toFixed(5)}, ${lng.toFixed(5)}`; }
  }
  function locateUser(onSuccess, onError) {
    if (!navigator.geolocation) { (onError || (() => toast("Location is not supported by this browser", "error")))(); return; }
    toast("Requesting your location permission…");
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const lat = pos.coords.latitude, lng = pos.coords.longitude;
      const label = await reverseGeocode(lat, lng);
      ui.userLocation = { lat, lng, label, accuracy: pos.coords.accuracy };
      updateLocationStatus();
      if (onSuccess) onSuccess(ui.userLocation);
      else { render(); toast("Current location updated", "success"); }
    }, (err) => {
      const msg = err.code === 1 ? "Location permission denied. You can still enter an address or pin a map location." : "Could not determine your location. Enter an address or pin a map location instead.";
      if (onError) onError(msg); else toast(msg, "error");
    }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
  }
  function incMarker(i, onClick) {
    const a = E.assess(S, i); const n = i.reportIds.length;
    const icon = L.divIcon({ className: "", html: `<div class="mk ${n > 1 ? "mk-count" : ""}" style="background:${i.status === "Resolved" ? "#56627a" : sevColor[a.severity]}">${n > 1 ? n : ""}</div>`, iconSize: n > 1 ? [26, 26] : [18, 18] });
    const mk = L.marker([i.lat, i.lng], { icon }).bindPopup(`<b>${i.id} · ${esc(i.type)}</b><br>${esc(i.location)}<br>Severity: <b style="color:${sevColor[a.severity]}">${a.severity}</b> <span class="estimate">est.</span><br>${n} report(s) · ${i.status}<br>${i.verified ? "Verified" : "Unverified"}`);
    if (onClick) mk.on("click", () => onClick(i.id));
    return mk;
  }
  function addResponders(m) {
    S.responders.forEach((r) => {
      const busy = !r.available || r.assignment;
      L.marker([r.lat, r.lng], { icon: L.divIcon({ className: "", html: `<div class="mk-resp ${busy ? "busy" : ""}">${r.cap[0]}</div>`, iconSize: [22, 22] }) })
        .bindTooltip(`${r.name} · ${r.cap}${busy ? " (busy)" : " (available)"}`).addTo(m);
    });
  }
  function addShelters(m) {
    D.SHELTERS.forEach((s) => L.marker([s.lat, s.lng], { icon: L.divIcon({ className: "", html: `<div class="mk-shelter">⌂</div>`, iconSize: [22, 22] }) })
      .bindPopup(`<b>${s.name}</b><br>Capacity ${s.occupied}/${s.capacity}`).addTo(m));
  }
  function ripple(m, i) {
    if (ui.layers.ripple) ui.layers.ripple.forEach((l) => m.removeLayer(l));
    const L2 = [];
    L2.push(L.marker([i.lat, i.lng], { icon: L.divIcon({ className: "", html: `<div class="ripple-marker"><i></i><i></i><i></i></div>`, iconSize: [0, 0] }), interactive: false }).addTo(m));
    const zone = { Flood: [700, "#5b8cff", "Estimated flood-affected zone (simulated)"], Fire: [320, "#ff4d6d", "Simulated surrounding fire-risk zone"], "Road Accident": [220, "#ff9f43", "Estimated traffic impact area"], "Public Safety Threat": [250, "#ffd23f", "Simulated precaution cordon"], "Medical Emergency": [120, "#22e3ff", "Estimated response perimeter"], "Other Emergency": [120, "#22e3ff", "Estimated perimeter"] }[i.type];
    const c = L.circle([i.lat, i.lng], { radius: zone[0], color: zone[1], weight: 1, dashArray: "6 6", fillOpacity: 0.12 }).bindTooltip(zone[2] + " — ESTIMATE", { sticky: true }).addTo(m);
    L2.push(c);
    // nearby reports
    S.reports.filter((r) => E.distKm(r, i) < 1.2).forEach((r) => L2.push(L.circleMarker([r.lat, r.lng], { radius: 4, color: "#22e3ff", weight: 1, fillOpacity: .8 }).bindTooltip(`Report ${r.id}: ${esc(r.desc.slice(0, 50))}`).addTo(m)));
    // nearby responders lines
    S.responders.filter((r) => E.distKm(r, i) < 3).forEach((r) => L2.push(L.polyline([[r.lat, r.lng], [i.lat, i.lng]], { color: i.responders.includes(r.id) ? "#22e3ff" : "#5b8cff", weight: i.responders.includes(r.id) ? 2.5 : 1, opacity: .6, dashArray: "4 6" }).addTo(m)));
    ui.layers.ripple = L2;
    m.flyTo([i.lat, i.lng], 15, { duration: 0.8 });
  }

  /* =========================================================
     PAGE: LANDING
     ========================================================= */
  function landing() {
    const st = stats();
    app.innerHTML = `
    <section class="scroll-sequence" id="response-sequence" aria-label="Emergency response scroll animation">
      <div class="sequence-sticky">
        <canvas id="response-canvas" aria-label="Emergency vehicles responding through the city"></canvas>
        <div class="sequence-vignette"></div>
        <div class="sequence-caption"><span class="sequence-kicker"><i></i> AURA <b>·</b> RESPONSE IN MOTION</span><span class="sequence-count" id="sequence-count">001 / 192</span></div>
        <div class="sequence-copy" id="sequence-copy" aria-live="polite">
          <div class="sequence-live"><span class="sequence-live-dot"></span> CITY RESPONSE SYSTEM <span class="sequence-live-line"></span> <span>ONLINE</span></div>
          <p class="sequence-overline" id="sequence-overline">WHEN EVERY SECOND MATTERS</p>
          <h2 id="sequence-title">THE CITY<br><em>CAN’T WAIT.</em></h2>
          <p class="sequence-description" id="sequence-description">One signal can change everything. AURA turns urgent reports into coordinated action, when it matters most.</p>
          <div class="sequence-proof"><span><b>01</b> DETECT</span><i></i><span><b>02</b> COORDINATE</span><i></i><span><b>03</b> RESPOND</span></div>
        </div>
        <div class="sequence-bottomline"><span>BUILT FOR THE MOMENTS THAT MATTER</span><span class="sequence-scroll-label">SCROLL TO ACTIVATE <span>↓</span></span></div>
        <div class="sequence-hint" id="sequence-hint"><span class="sequence-mouse"><i></i></span> SCROLL TO WITNESS THE RESPONSE</div>
      </div>
    </section>
    <section class="hero">
      <div>
        <div class="eyebrow"><span class="dot live"></span>&nbsp; Adaptive Urban Response Assistant</div>
        <h1 style="margin-top:18px">Every Signal Matters.<br><em>Every Second Counts.</em></h1>
        <p class="lead">AURA fuses scattered citizen reports into clear, prioritized incidents — so coordinators see the whole picture and responders reach people faster. When every second matters.</p>
        <div class="row">
          <a class="btn btn-primary" href="#/citizen">Get Started →</a>
          <a class="btn" href="#/command">Explore Command Center</a>
          <a class="btn" href="#/routing">Smart Emergency Routing ↗</a>
          <a class="btn" href="#/traffic">Traffic Intelligence ↗</a>
        </div>
        <p class="muted small" style="margin-top:22px">Frontend demonstration with synthetic data. Not connected to official emergency services — in a real emergency dial 112.</p>
      </div>
      <div class="radar" aria-hidden="true">
        <span class="blip c" style="left:62%;top:38%"></span><span class="radar-label" style="left:66%;top:32%">FIRE · CRITICAL</span>
        <span class="blip h" style="left:30%;top:60%"></span><span class="radar-label" style="left:12%;top:66%">6 REPORTS FUSED</span>
        <span class="blip l" style="left:44%;top:26%"></span>
        <span class="blip l" style="left:72%;top:70%"></span><span class="radar-label" style="left:62%;top:76%">UNIT EN ROUTE</span>
        <span class="blip h" style="left:22%;top:34%"></span>
      </div>
    </section>

    <section class="section" id="citizen-sec">
      <div class="eyebrow">Citizen Safety</div>
      <h2>Report in seconds. Stay informed.</h2>
      <p class="sub">A calm, mobile-first app for the worst moments: one-tap reporting, nearby shelters, live safety alerts and clear instructions.</p>
      <div class="feature-grid">
        <div class="card feature"><div class="ico">⚡</div><h3>Guided reporting</h3><p>Six simple steps — type, description, location, people affected, photo and review — with an incident ID you can track.</p></div>
        <div class="card feature"><div class="ico">⌂</div><h3>Nearby shelters</h3><p>See open shelters, distance and current capacity on a live city map.</p></div>
        <div class="card feature"><div class="ico">◉</div><h3>Safety alerts</h3><p>Area-aware alerts from active, verified incidents around you.</p></div>
      </div>
    </section>

    <section class="section split">
      <div>
        <div class="eyebrow">Signature · AURA Signal Fusion</div>
        <h2>Six noisy reports. One clear incident.</h2>
        <p class="sub">AURA compares emergency category, geographic proximity, timing and text similarity to group duplicate reports, write a unified summary, flag missing information and recommend resources — every estimate labelled and explained.</p>
        <a class="btn" href="#/command" style="margin-top:20px">See it live</a>
      </div>
      <div class="card fusion-viz">
        <svg><g stroke="rgba(34,227,255,.35)" stroke-dasharray="4 5"><line x1="15%" y1="15%" x2="50%" y2="50%"/><line x1="85%" y1="18%" x2="50%" y2="50%"/><line x1="10%" y1="80%" x2="50%" y2="50%"/><line x1="88%" y1="82%" x2="50%" y2="50%"/><line x1="50%" y1="8%" x2="50%" y2="50%"/></g></svg>
        <div class="rep" style="left:4%;top:8%">"car crash at chowk"</div>
        <div class="rep" style="right:4%;top:10%;animation-delay:.5s">"driver bleeding"</div>
        <div class="rep" style="left:36%;top:2%;animation-delay:1s">"two vehicles hit"</div>
        <div class="rep" style="left:2%;bottom:10%;animation-delay:1.5s">"traffic jam forming"</div>
        <div class="rep" style="right:3%;bottom:8%;animation-delay:2s">"auto overturned"</div>
        <div class="core">INC-1001<br><span class="small muted">5 reports · High</span></div>
      </div>
    </section>

    <section class="section split">
      <div class="card ripple-demo"><span></span><span></span><span></span><b></b></div>
      <div>
        <div class="eyebrow">Signature · AURA Ripple</div>
        <h2>See how an emergency spreads.</h2>
        <p class="sub">Select any incident and AURA Ripple expands across the map — revealing nearby reports, responders, shelters and a clearly labelled simulated impact zone for floods, fires and accidents.</p>
      </div>
    </section>

    <section class="section">
      <div class="eyebrow">How it works</div>
      <h2>From signal to response</h2>
      <div class="steps">
        <div class="card step"><h4>Citizens report</h4><p>Guided reports with location, people affected and optional photos.</p></div>
        <div class="card step"><h4>AURA fuses</h4><p>Related reports merge into one incident with a transparent match score.</p></div>
        <div class="card step"><h4>Coordinators decide</h4><p>Priority estimates and resource recommendations, with reasons shown.</p></div>
        <div class="card step"><h4>Responders act</h4><p>Accept, go en route, arrive and resolve — synced to the command center.</p></div>
      </div>
    </section>

    <section class="section">
      <div class="stats-band">
        <div class="card"><b>${st.total}</b><span class="muted">incidents tracked</span></div>
        <div class="card"><b>${S.reports.length}</b><span class="muted">citizen signals fused</span></div>
        <div class="card"><b>${S.responders.length}</b><span class="muted">response units</span></div>
        <div class="card"><b>${D.SHELTERS.length}</b><span class="muted">shelters mapped</span></div>
      </div>
    </section>
    <footer class="footer"><span>© 2026 AURA — Adaptive Urban Response Assistant</span><span>Synthetic demo · Not an official emergency service · Dial 112</span></footer>`;
    initResponseSequence();
  }

  /* ---------- SCROLL-DRIVEN RESPONSE FILM ---------- */
  let sequenceCleanup = null;
  function initResponseSequence() {
    if (sequenceCleanup) sequenceCleanup();
    const section = document.getElementById("response-sequence");
    const canvas = document.getElementById("response-canvas");
    if (!section || !canvas) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    const total = 192;
    const images = new Array(total);
    let currentFrame = -1, raf = 0, destroyed = false;
    const count = document.getElementById("sequence-count");
    const hint = document.getElementById("sequence-hint");
    const copy = document.getElementById("sequence-copy");
    const overline = document.getElementById("sequence-overline");
    const title = document.getElementById("sequence-title");
    const description = document.getElementById("sequence-description");
    const story = [
      { at: 0, overline: "WHEN EVERY SECOND MATTERS", title: "THE CITY<br><em>CAN’T WAIT.</em>", description: "One signal can change everything. AURA turns urgent reports into coordinated action, when it matters most." },
      { at: .34, overline: "FROM SIGNAL TO SITUATIONAL AWARENESS", title: "SEE THE<br><em>WHOLE PICTURE.</em>", description: "Citizen reports become one clear operational view, helping teams understand what is happening and where help is needed." },
      { at: .68, overline: "COORDINATED. CLEAR. IN MOTION.", title: "EVERY SECOND<br><em>HAS A PURPOSE.</em>", description: "Prioritized incidents. Connected responders. Smarter decisions, designed to help support a faster response." }
    ];
    let activeStory = -1;

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(window.innerWidth * dpr);
      canvas.height = Math.round(window.innerHeight * dpr);
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      drawFrame(currentFrame < 0 ? 0 : currentFrame);
    }
    function drawFrame(index) {
      if (destroyed) return;
      index = Math.max(0, Math.min(total - 1, index));
      currentFrame = index;
      const img = images[index];
      if (img && img.complete && img.naturalWidth) {
        const cw = canvas.width, ch = canvas.height;
        const scale = Math.max(cw / img.naturalWidth, ch / img.naturalHeight);
        const w = img.naturalWidth * scale, h = img.naturalHeight * scale;
        ctx.fillStyle = "#050a12";
        ctx.fillRect(0, 0, cw, ch);
        ctx.drawImage(img, (cw - w) / 2, (ch - h) / 2, w, h);
      }
      if (count) count.textContent = String(index + 1).padStart(3, "0") + " / " + total;
    }
    function update() {
      raf = 0;
      const rect = section.getBoundingClientRect();
      const travel = Math.max(1, section.offsetHeight - window.innerHeight);
      const progress = Math.max(0, Math.min(1, -rect.top / travel));
      drawFrame(Math.round(progress * (total - 1)));
      if (hint) hint.style.opacity = progress > 0.04 ? "0" : "1";
      const storyIndex = progress < .34 ? 0 : progress < .68 ? 1 : 2;
      if (storyIndex !== activeStory) {
        activeStory = storyIndex;
        const scene = story[storyIndex];
        if (copy) { copy.classList.remove("is-entering"); void copy.offsetWidth; copy.classList.add("is-entering"); }
        if (overline) overline.textContent = scene.overline;
        if (title) title.innerHTML = scene.title;
        if (description) description.textContent = scene.description;
      }
      if (copy) copy.style.setProperty("--story-progress", String(progress));
    }
    function requestUpdate() { if (!raf) raf = requestAnimationFrame(update); }
    for (let i = 0; i < total; i++) {
      const img = new Image();
      img.decoding = "async";
      img.src = "frames/frame_" + String(i + 1).padStart(3, "0") + ".webp";
      img.onload = () => { if (Math.abs(i - currentFrame) < 3) drawFrame(currentFrame); };
      images[i] = img;
    }
    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", resize);
    resize();
    requestUpdate();
    sequenceCleanup = () => {
      destroyed = true;
      window.removeEventListener("scroll", requestUpdate);
      window.removeEventListener("resize", resize);
      if (raf) cancelAnimationFrame(raf);
    };
  }

  /* =========================================================
     PAGE: COMMAND CENTER
     ========================================================= */
  function command() {
    const st = stats();
    const list = filtered();
    if (ui.selected && !inc(ui.selected)) ui.selected = null;
    app.innerHTML = `<div class="page">
      <div class="page-head">
        <div><div class="eyebrow"><span class="dot live"></span>&nbsp; Live · Chandigarh</div><h1>AURA Command Center</h1></div>
        <div class="row">
          <button class="btn crisis-btn" data-action="crisis" ${ui.simTimer ? "disabled" : ""}>${ui.simTimer ? "CRISIS RUNNING…" : "▶ RUN CITY IN CRISIS"}</button>
          <button class="btn" data-action="reset">↺ Reset Scenario</button>
        </div>
      </div>
      <div class="stat-grid">
        ${[["Total Incidents", st.total, "#22e3ff"], ["Critical Incidents", st.critical, "#ff4d6d"], ["Active Incidents", st.active, "#ff9f43"], ["Available Responders", st.avail, "#5b8cff"], ["Resolved Incidents", st.resolved, "#3ddc97"]]
          .map(([k, v, c]) => `<div class="card stat" style="--accent:${c}"><div class="k">${k}</div><div class="v" style="color:${c}">${v}</div></div>`).join("")}
      </div>
      <div class="cmd-grid">
        <div class="card">
          <input class="input" id="search" placeholder="Search ID, location, type…" value="${esc(ui.search)}" aria-label="Search incidents" />
          <div class="chips">${["All", "Critical", "High", "Medium", "Low", "Unverified", "Active", "Resolved"].map((f) => `<button class="chip ${ui.filter === f ? "on" : ""}" data-action="filter" data-f="${f}">${f}</button>`).join("")}</div>
          <div class="scroll" id="feed">${list.length ? list.map((i) => incCard(i, i.id === ui.selected)).join("") : `<div class="empty">No incidents match these filters.</div>`}</div>
        </div>
        <div class="card" style="padding:8px"><div id="cmdMap" class="map"></div></div>
        <div class="card"><div class="scroll" id="intel">${intel()}</div></div>
      </div></div>`;
    const m = makeMap("cmdMap");
    if (m) {
      S.incidents.forEach((i) => incMarker(i, (id) => { ui.selected = id; refreshCommandPanels(); }).addTo(m));
      addResponders(m); addShelters(m);
      const sel = inc(ui.selected); if (sel) ripple(m, sel);
    }
    $("#search").addEventListener("input", (e) => { ui.search = e.target.value; refreshFeed(); });
  }
  function refreshFeed() { const f = $("#feed"); if (!f) return; const list = filtered(); f.innerHTML = list.length ? list.map((i) => incCard(i, i.id === ui.selected)).join("") : `<div class="empty">No incidents match these filters.</div>`; }
  function refreshCommandPanels() {
    refreshFeed(); const p = $("#intel"); if (p) p.innerHTML = intel();
    const m = ui.maps.cmdMap, i = inc(ui.selected); if (m && i) ripple(m, i);
  }

  function intel() {
    const i = inc(ui.selected);
    if (!i) return `<div class="empty"><div style="font-size:30px">◎</div>Select an incident to open the AURA intelligence panel.</div>`;
    const a = E.assess(S, i);
    return `
      <div class="row between"><span class="mono small muted">${i.id}</span><span class="pill sev-${a.severity}">${a.severity}</span></div>
      <h3 style="font-size:20px;margin:8px 0 4px">${typeIcon(i.type)} ${esc(i.type)}</h3>
      <div class="muted small">📍 ${esc(i.location)} · ${ago(i.createdAt)} · ${i.status}</div>
      <div class="section-t">Incident summary <span class="estimate">report synthesis</span></div>
      <p style="font-size:13px;line-height:1.6;margin:0">${esc(a.summary)}</p>
      <div class="section-t">Priority assessment <span class="estimate">rules-based estimate</span></div><div class="row between small" style="margin-bottom:10px"><span>Review state</span><b class="${a.needsAssessment ? "pill-warn" : "pill-ok"}">${esc(a.priorityState || "Provisional estimate")}</b></div>
      <div class="row between small"><span>Priority score</span><b class="mono">${a.score}/100</b></div><div class="bar"><i style="width:${a.score}%;background:${sevColor[a.severity]}"></i></div>
      <div class="row between small" style="margin-top:8px"><span>Confidence</span><b class="mono">${a.confidence}%</b></div><div class="bar"><i style="width:${a.confidence}%"></i></div>
      <div class="section-t">Extracted information</div>
      <dl class="kv"><dt>People affected</dt><dd>${i.people || "Unknown"} <span class="estimate">reported</span></dd>
      <dt>Potential injuries</dt><dd>${a.injuries.length ? esc(a.injuries.join(", ")) : "None mentioned"}</dd>
      <dt>Verification</dt><dd class="${i.verified ? "pill-ok" : "pill-warn"}">${i.verified ? "Verified by coordinator" : "UNVERIFIED — citizen reports only"}</dd>
      <dt>Responders</dt><dd>${i.responders.length ? esc(i.responders.map((r) => resp(r)?.name).join(", ")) : "None assigned"}</dd></dl>
      <div class="section-t">Missing information</div>
      <div class="chips">${a.missing.length ? a.missing.map((x) => `<span class="pill pill-warn">${esc(x)}</span>`).join("") : `<span class="pill pill-ok">Complete</span>`}</div>
      <div class="section-t">Recommended resources</div>
      ${a.recommended.map((x) => `<div class="list-item"><span>${x.cap}</span><span>${x.responder ? `${esc(x.responder.name)} · ${x.d.toFixed(1)} km <button class="btn btn-sm" data-action="assign" data-inc="${i.id}" data-r="${x.responder.id}" ${i.status === "Resolved" ? "disabled" : ""}>Assign</button>` : `<span class="muted">No unit free</span>`}</span></div>`).join("")}
      <div class="section-t">Why this recommendation</div>
      <ul style="margin:0;padding-left:18px;font-size:12px;line-height:1.7" class="muted">${a.reasons.map((r) => `<li>${esc(r)}</li>`).join("")}<li>Nearest available unit of each required capability, by straight-line distance.</li></ul>
      <div class="section-t">Signal Fusion — how this incident formed</div>
      <div class="fusion-tree">${a.reports.map((r) => `<div class="r"><div class="row between"><span class="mono muted">${r.id}</span><span class="muted">${ago(r.time)}</span></div>"${esc(r.desc)}"${r.match ? `<div class="muted" style="margin-top:4px">match ${(r.match.score * 100).toFixed(0)}% · category ${r.match.cat ? "✓" : "✗"} · ${r.match.d.toFixed(2)} km · text ${(r.match.text * 100).toFixed(0)}%</div>` : `<div class="muted" style="margin-top:4px">origin report</div>`}</div>`).join("")}</div>
      <div class="row" style="margin-top:16px">
        <a class="btn btn-sm btn-primary" href="#/manage" data-action="open-manage" data-id="${i.id}">Manage incident</a>
        ${!i.verified ? `<button class="btn btn-sm" data-action="verify" data-id="${i.id}">Verify</button>` : ""}
        ${i.status !== "Resolved" ? `<button class="btn btn-sm" data-action="resolve" data-id="${i.id}">Resolve</button>` : ""}
      </div>`;
  }

  /* ---------- ACTIONS on incidents ---------- */
  function assign(incId, rId) {
    const i = inc(incId), r = resp(rId); if (!i || !r) return;
    if (r.assignment && r.assignment !== incId) { toast(`${r.name} is already assigned to ${r.assignment}`, "error"); return; }
    if (!r.available) { toast(`${r.name} is unavailable`, "error"); return; }
    if (i.responders.includes(rId)) { toast("Already assigned", "error"); return; }
    i.responders.push(rId); r.assignment = incId; r.ack = false; r.status = "Assigned";
    if (["Reported", "Under Review", "Verified"].includes(i.status)) i.status = "Responder Assigned";
    log(i, `${r.name} assigned`); toast(`${r.name} assigned to ${incId}`, "success"); commit(`${r.name} assigned to ${incId}`);
  }
  function unassign(incId, rId) {
    const i = inc(incId), r = resp(rId); if (!i || !r) return;
    i.responders = i.responders.filter((x) => x !== rId); r.assignment = null; r.ack = false; r.status = null;
    if (!i.responders.length && ["Responder Assigned", "En Route"].includes(i.status)) i.status = i.verified ? "Verified" : "Under Review";
    log(i, `${r.name} removed from incident`); toast(`${r.name} unassigned`); commit();
  }
  function resolve(incId) {
    const i = inc(incId); if (!i) return;
    i.status = "Resolved";
    i.responders.forEach((id) => { const r = resp(id); if (r) { r.assignment = null; r.ack = false; r.status = null; } });
    log(i, "Incident resolved — responders released"); toast(`${incId} resolved`, "success"); commit(`${incId} marked resolved`);
  }
  function verify(incId) { const i = inc(incId); i.verified = true; if (["Reported", "Under Review"].includes(i.status)) i.status = "Verified"; log(i, "Verified by coordinator"); toast(`${incId} verified`, "success"); commit(`${incId} verified`); }
  function setStatus(incId, st) {
    const i = inc(incId); if (!i || i.status === st) return;
    if (st === "Resolved") return resolve(incId);
    if (["Responder Assigned", "En Route"].includes(st) && !i.responders.length) { toast("Assign a responder first", "error"); render(); return; }
    if (st === "Verified") i.verified = true;
    i.status = st; log(i, `Status changed to ${st}`); toast(`${incId} → ${st}`, "success"); commit();
  }

  /* =========================================================
     PAGE: INCIDENT MANAGEMENT
     ========================================================= */
  function manage() {
    if (!ui.manageSel || !inc(ui.manageSel)) ui.manageSel = S.incidents[0]?.id;
    const list = filtered();
    const i = inc(ui.manageSel);
    app.innerHTML = `<div class="page">
      <div class="page-head"><div><div class="eyebrow">Operations</div><h1>Incident Management</h1></div>
      <a class="btn" href="#/command">← Command Center</a></div>
      <div class="manage-grid">
        <div class="card" style="max-height:calc(100vh - 180px);display:flex;flex-direction:column">
          <input class="input" id="search" placeholder="Search ID, location, type…" value="${esc(ui.search)}" />
          <div class="chips">${["All", "Critical", "High", "Unverified", "Active", "Resolved"].map((f) => `<button class="chip ${ui.filter === f ? "on" : ""}" data-action="filter" data-f="${f}">${f}</button>`).join("")}</div>
          <div class="scroll" id="mfeed">${list.length ? list.map((x) => incCard(x, x.id === ui.manageSel).replace('data-action="select"', 'data-action="mselect"')).join("") : `<div class="empty">No incidents.</div>`}</div>
        </div>
        <div>${i ? manageDetail(i) : `<div class="card empty">No incidents yet. Submit one from Citizen Safety.</div>`}</div>
      </div></div>`;
    $("#search").addEventListener("input", (e) => { ui.search = e.target.value; const l = filtered(); $("#mfeed").innerHTML = l.map((x) => incCard(x, x.id === ui.manageSel).replace('data-action="select"', 'data-action="mselect"')).join("") || `<div class="empty">No incidents.</div>`; });
    if (i) {
      const m = makeMap("mMap", [i.lat, i.lng], 15);
      if (m) { incMarker(i).addTo(m); addResponders(m); addShelters(m); ripple(m, i); }
      $("#statusSel").addEventListener("change", (e) => { const v = e.target.value; confirmBox("Change status?", `Set ${i.id} to "${v}"?`, () => setStatus(i.id, v)); e.target.value = i.status; });
    }
  }
  function manageDetail(i) {
    const a = E.assess(S, i);
    const idx = E.STATUSES.indexOf(i.status);
    const free = S.responders.filter((r) => r.available && !r.assignment);
    return `<div class="grid" style="grid-template-columns:1fr 1fr">
      <div class="card" style="grid-column:1/-1">
        <div class="row between"><div><span class="mono muted small">${i.id}</span><h2 style="margin-top:4px">${typeIcon(i.type)} ${esc(i.type)} — ${esc(i.location)}</h2></div>
        <div class="row"><span class="pill sev-${a.severity}">${a.severity} <span class="muted">est.</span></span><span class="pill ${i.verified ? "pill-ok" : "pill-warn"}">${i.verified ? "Verified" : "Unverified"}</span></div></div>
        <div class="status-track">${E.STATUSES.map((s, k) => `<span class="${k <= idx ? "on" : ""}" title="${s}"></span>`).join("")}</div>
        <div class="row between small muted">${E.STATUSES.map((s) => `<span>${s}</span>`).join("")}</div>
        <div class="row" style="margin-top:16px">
          <label class="lbl" for="statusSel" style="margin:0">Status</label>
          <select class="input" id="statusSel" style="width:auto">${E.STATUSES.map((s) => `<option ${s === i.status ? "selected" : ""}>${s}</option>`).join("")}</select>
          ${!i.verified ? `<button class="btn btn-primary" data-action="verify" data-id="${i.id}">✓ Verify incident</button>` : ""}
          ${i.status !== "Resolved" ? `<button class="btn" data-action="resolve" data-id="${i.id}">Mark resolved</button>` : ""}
        </div>
      </div>
      <div class="card"><h3>Details</h3>
        <dl class="kv"><dt>Reported</dt><dd>${new Date(i.createdAt).toLocaleString()}</dd><dt>Reports</dt><dd>${i.reportIds.length}</dd><dt>People affected</dt><dd>${i.people || "Unknown"}</dd><dt>Priority score</dt><dd class="mono">${a.score}/100 <span class="estimate">est.</span></dd><dt>Confidence</dt><dd class="mono">${a.confidence}%</dd><dt>Coordinates</dt><dd class="mono small">${i.lat.toFixed(4)}, ${i.lng.toFixed(4)}</dd></dl>
        <p class="small muted" style="line-height:1.6">${esc(a.summary)}</p>
      </div>
      <div class="card" style="padding:8px;min-height:300px"><div id="mMap" class="map"></div></div>
      <div class="card"><h3>Responders</h3>
        ${i.responders.length ? i.responders.map((id) => { const r = resp(id); return `<div class="list-item"><span><b>${esc(r.name)}</b><br><span class="muted small">${r.cap} · ${r.ack ? r.status || "Accepted" : "Awaiting acceptance"}</span></span><button class="btn btn-sm" data-action="unassign" data-inc="${i.id}" data-r="${r.id}">Remove</button></div>`; }).join("") : `<div class="muted small">No responders assigned.</div>`}
        <div class="row" style="margin-top:12px">
          <select class="input" id="assignSel" style="flex:1" ${i.status === "Resolved" ? "disabled" : ""}><option value="">Select available responder…</option>${free.map((r) => `<option value="${r.id}">${esc(r.name)} — ${r.cap} · ${E.distKm(r, i).toFixed(1)} km</option>`).join("")}</select>
          <button class="btn btn-primary" data-action="assign-sel" data-inc="${i.id}" ${i.status === "Resolved" ? "disabled" : ""}>Assign</button>
        </div>
        <div class="small muted" style="margin-top:8px">Recommended: ${a.recommended.map((x) => x.cap + (x.responder ? " → " + esc(x.responder.name) : " (none free)")).join(" · ")}</div>
      </div>
      <div class="card"><h3>Duplicate reports <span class="estimate">fusion</span></h3>
        ${a.reports.map((r, k) => `<div class="list-item"><span style="flex:1"><span class="mono muted small">${r.id} · ${ago(r.time)}</span><br>"${esc(r.desc)}"${r.image && r.image.startsWith("data:") ? `<br><img src="${r.image}" alt="report photo" style="max-width:120px;border-radius:8px;margin-top:6px">` : ""}</span>${k > 0 ? `<button class="btn btn-sm" data-action="split" data-inc="${i.id}" data-rep="${r.id}">Not a duplicate</button>` : `<span class="pill pill-cyan">origin</span>`}</div>`).join("")}
      </div>
      <div class="card" style="grid-column:1/-1"><h3>Incident history</h3><div class="timeline">${i.history.slice().reverse().map((h) => `<div>${esc(h.msg)}<div class="muted small">${new Date(h.t).toLocaleString()}</div></div>`).join("")}</div></div>
    </div>`;
  }
  function split(incId, repId) {
    const i = inc(incId), r = S.reports.find((x) => x.id === repId); if (!i || !r) return;
    i.reportIds = i.reportIds.filter((x) => x !== repId); log(i, `Report ${repId} split out (marked not duplicate)`);
    const n = { id: "INC-" + (1000 + S.seq++), type: r.type, location: r.location, lat: r.lat, lng: r.lng, createdAt: r.time, lastUpdate: r.time, reportIds: [r.id], people: r.people, verified: false, status: "Reported", responders: [], history: [{ t: Date.now(), msg: `Created by splitting report ${r.id} from ${incId}` }] };
    r.incidentId = n.id; delete r.match; S.incidents.unshift(n); toast(`Report split into ${n.id}`, "success"); commit();
  }

  /* =========================================================
     PAGE: CITIZEN SAFETY
     ========================================================= */
  function citizen() {
    const active = S.incidents.filter((i) => i.status !== "Resolved");
    const alerts = active.map((i) => ({ i, a: E.assess(S, i) })).filter((x) => ["Critical", "High"].includes(x.a.severity) || x.i.verified).slice(0, 5);
    const mine = S.reports.filter((r) => r.source === "citizen").slice(-4).reverse();
    const status = alerts.some((x) => x.a.severity === "Critical") ? ["Caution advised", "Critical incidents are active in the city. Avoid affected areas."] : ["You're in a safe zone", "No critical incidents reported near you."];
    app.innerHTML = `<div class="page citizen" style="margin:0 auto">
      <div class="page-head"><div><div class="eyebrow">Citizen Safety</div><h1>Stay safe, Chandigarh</h1></div></div>
      <div class="cit-grid">
        <div class="stack">
          <div class="card safety-status"><div class="eyebrow" style="color:var(--low)">Current status</div><h2 style="margin:8px 0 4px">${status[0]}</h2><p class="muted small" style="margin:0">${status[1]}</p></div>
          <button class="sos" data-action="report">REPORT EMERGENCY<small>Tap to start a guided report</small></button>
          <div class="warn-box">⚠ AURA is a demonstration and is <b>not connected to official emergency services</b>. In a real emergency call <b>112</b> (Police 100 · Fire 101 · Ambulance 108).</div>
          <div class="card"><h3>SOS quick actions</h3><div class="row">
            <a class="btn btn-danger btn-sm" href="tel:112">Call 112</a>
            <button class="btn btn-sm" data-action="share-loc">Share my location</button>
            <button class="btn btn-sm" data-action="instructions">Emergency instructions</button></div></div>
          ${mine.length ? `<div class="card"><h3>My reports</h3>${mine.map((r) => { const i = inc(r.incidentId); return `<div class="list-item"><span><span class="mono small">${i ? i.id : "—"}</span><br><span class="muted small">${esc(r.type)} · ${ago(r.time)}</span></span><span class="pill pill-cyan">${i ? i.status : "Submitted"}</span></div>`; }).join("")}</div>` : ""}
        </div>
        <div class="stack">
          <div class="card" style="padding:8px;height:380px"><div id="citMap" class="map"></div></div>
          <div class="grid" style="grid-template-columns:1fr 1fr">
            <div class="card"><h3>Safety alerts</h3>${alerts.length ? alerts.map((x) => `<div class="list-item"><span>${typeIcon(x.i.type)} ${esc(x.i.type)}<br><span class="muted small">${esc(x.i.location)} · ${x.i.verified ? "verified" : "unverified"}</span></span><span class="pill sev-${x.a.severity}">${x.a.severity}</span></div>`).join("") : `<div class="empty">No active alerts</div>`}</div>
            <div class="card"><h3>Nearby shelters</h3>${D.SHELTERS.map((s) => `<div class="list-item"><span>${esc(s.name)}<br><span class="muted small">${E.distKm({ lat: D.CENTER[0], lng: D.CENTER[1] }, s).toFixed(1)} km away</span></span><span class="mono small">${s.capacity - s.occupied} free</span></div>`).join("")}</div>
          </div>
        </div>
      </div></div>`;
    const m = makeMap("citMap", D.CENTER, 12);
    if (m) { active.forEach((i) => incMarker(i).addTo(m)); addShelters(m); }
  }
  function instructions() {
    openModal(`<h2>Emergency instructions</h2>
      <div class="section-t">Medical</div><p class="small muted">Check breathing. Call 108. Apply firm pressure to bleeding. Do not move someone with a suspected spinal injury.</p>
      <div class="section-t">Fire</div><p class="small muted">Get out, stay out. Stay low under smoke. Never use lifts. Call 101.</p>
      <div class="section-t">Flood</div><p class="small muted">Move to higher ground. Avoid walking or driving through flood water. Switch off electricity if safe.</p>
      <div class="section-t">Road accident</div><p class="small muted">Turn on hazard lights, keep a safe distance from traffic, do not remove helmets of injured riders.</p>
      <div class="modal-actions"><span></span><button class="btn btn-primary" data-action="modal-close">Got it</button></div>`);
  }

  /* ---------- REPORT FORM (6 steps) ---------- */
  let F = null;
  function startReport() { F = { step: 1, type: null, desc: "", loc: "", lat: null, lng: null, people: 0, answers: { injury: "unknown", danger: "unknown", trapped: "unknown", blocked: "unknown" }, image: null, imageName: "" }; drawStep(); }
  function drawStep(err = "") {
    const titles = ["Emergency type", "What is happening?", "Where is it?", "People affected", "Add a photo (optional)", "Review & submit"];
    let body = "";
    if (F.step === 1) body = `<div class="type-grid">${Object.keys(D.TYPES).map((t) => `<button class="type-opt ${F.type === t ? "on" : ""}" data-action="f-type" data-t="${t}"><span class="e">${D.TYPES[t].icon}</span>${t}</button>`).join("")}</div>`;
    if (F.step === 2) body = `<label class="lbl" for="fDesc">Describe what you know (short reports are okay)</label><textarea class="input" id="fDesc" rows="3" maxlength="500" placeholder="e.g. accident near the bridge…">${esc(F.desc)}</textarea><div class="muted small" style="text-align:right"><span id="fCount">${F.desc.length}</span>/500</div><div class="assessment-questions"><div class="section-t">Quick safety check · choose “Not sure” if you cannot tell</div>
      ${[["injury","Is anyone injured, unconscious or having trouble breathing?"],["trapped","Is anyone trapped or pinned?"],["danger","Is there fire, smoke, a gas leak or immediate danger?"],["blocked","Is the road blocked or emergency access obstructed?"]].map(([k,q])=>`<label class="lbl" for="f-${k}">${q}</label><select class="input" id="f-${k}"><option value="unknown" ${F.answers[k]==="unknown"?"selected":""}>Not sure</option><option value="yes" ${F.answers[k]==="yes"?"selected":""}>Yes</option><option value="no" ${F.answers[k]==="no"?"selected":""}>No, as far as I can tell</option></select>`).join("")}</div>`;
    if (F.step === 3) body = `<label class="lbl" for="fLoc">Incident address or landmark</label><div class="row" style="align-items:stretch"><input class="input" id="fLoc" style="flex:1;min-width:180px" value="${esc(F.locationName || F.loc || "")}" placeholder="Enter any address, business, landmark or area" autocomplete="street-address"><button class="btn btn-primary" id="fLocSearch" type="button">Find location</button></div><div class="row" style="margin:10px 0"><button class="btn btn-sm" id="fUseGPS" type="button">◎ Use my current location</button><span class="small muted" id="fLocStatus">Search any place or click the map to set the incident location.</span></div><div id="fMap" class="map" style="height:260px;min-height:260px"></div><p class="small muted" style="margin-top:8px">You are not limited to saved landmarks. Search an address or place, or click anywhere on the map to drop the incident pin.</p>`;
    if (F.step === 4) body = `<div class="counter"><button class="btn" data-action="f-dec" aria-label="Decrease">−</button><b id="fPeople">${F.people}</b><button class="btn" data-action="f-inc" aria-label="Increase">+</button></div><p class="small muted" style="text-align:center">Estimated number of people affected. Use 0 if unknown or no one is reported affected.</p>`;
    if (F.step === 5) body = `<label class="btn" style="width:100%;padding:28px;border-style:dashed;cursor:pointer">📷 ${F.imageName ? esc(F.imageName) : "Choose image (max 5 MB)"}<input type="file" id="fImg" accept="image/*" hidden></label>${F.image ? `<img src="${F.image}" alt="preview" style="width:100%;max-height:200px;object-fit:cover;border-radius:12px;margin-top:12px">` : ""}`;
    if (F.step === 6) { const L2 = locName(); body = `<dl class="kv"><dt>Type</dt><dd>${F.type}</dd><dt>Description</dt><dd>${esc(F.desc)}</dd><dt>Location</dt><dd>${esc(L2)}</dd><dt>People</dt><dd>${F.people}</dd><dt>Photo</dt><dd>${F.image ? "Attached" : "None"}</dd><dt>Injury status</dt><dd>${F.answers.injury}</dd><dt>Trapped people</dt><dd>${F.answers.trapped}</dd><dt>Immediate danger</dt><dd>${F.answers.danger}</dd><dt>Road blocked</dt><dd>${F.answers.blocked}</dd></dl><div class="warn-box" style="margin-top:16px">AURA is not connected to official emergency services. For life-threatening emergencies, also call 112.</div>`; }
    openModal(`<div class="row between"><span class="eyebrow">Step ${F.step} of 6</span><button class="btn btn-sm btn-ghost" data-action="modal-close" aria-label="Close">✕</button></div>
      <div class="progress">${[1, 2, 3, 4, 5, 6].map((k) => `<span class="${k <= F.step ? "on" : ""}"></span>`).join("")}</div>
      <h2>${titles[F.step - 1]}</h2><div style="margin-top:14px">${body}</div><div class="err" id="fErr">${esc(err)}</div>
      <div class="modal-actions"><button class="btn" data-action="f-back" ${F.step === 1 ? "disabled" : ""}>Back</button>
      <button class="btn ${F.step === 6 ? "btn-danger" : "btn-primary"}" data-action="f-next">${F.step === 6 ? "Submit report" : F.step === 5 && !F.image ? "Skip" : "Next"}</button></div>`);
    if (F.step === 2) { const t = $("#fDesc"); t.addEventListener("input", () => { F.desc = t.value; $("#fCount").textContent = t.value.length; }); }
    if (F.step === 3) {
      const locInput = $("#fLoc"), locStatus = $("#fLocStatus");
      locInput.addEventListener("input", () => { F.locationName = locInput.value.trim(); F.lat = null; F.lng = null; F.loc = ""; if (locStatus) locStatus.textContent = "Search this address or choose a point on the map to confirm coordinates."; });
      const setReportLocation = async (lat, lng, label) => {
        F.lat = lat; F.lng = lng; F.locationName = label || `${lat.toFixed(5)}, ${lng.toFixed(5)}`; F.loc = "custom";
        if (locInput) locInput.value = F.locationName;
        if (locStatus) locStatus.textContent = `Selected: ${F.locationName}`;
        placePin();
      };
      const findAddress = async () => {
        const q = locInput.value.trim(); if (!q) { locStatus.textContent = "Enter an address or place name first."; return; }
        locStatus.textContent = "Searching map locations…";
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(q)}`);
          if (!res.ok) throw new Error("Search service unavailable");
          const results = await res.json(); if (!results.length) { locStatus.textContent = "No matching place found. Try a fuller address or click the map."; return; }
          const place = results[0]; await setReportLocation(Number(place.lat), Number(place.lon), place.display_name.split(",").slice(0, 4).join(","));
          if (ui.fm) ui.fm.setView([F.lat, F.lng], 16);
        } catch (_) { locStatus.textContent = "Address search is unavailable. Click the map to place a pin or use GPS."; }
      };
      $("#fLocSearch").addEventListener("click", findAddress);
      locInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); findAddress(); } });
      $("#fUseGPS").addEventListener("click", () => locateUser((loc) => setReportLocation(loc.lat, loc.lng, loc.label), (msg) => { locStatus.textContent = msg; }));
      setTimeout(() => {
        if (!window.L) return;
        const start = F.lat != null ? [F.lat, F.lng] : (ui.userLocation ? [ui.userLocation.lat, ui.userLocation.lng] : D.CENTER);
        const fm = L.map("fMap").setView(start, F.lat != null || ui.userLocation ? 15 : 12);
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap contributors" }).addTo(fm);
        ui.fm = fm; if (F.lat != null) placePin();
        fm.on("click", async (e) => { const lat=e.latlng.lat, lng=e.latlng.lng; await setReportLocation(lat, lng, `${lat.toFixed(5)}, ${lng.toFixed(5)}`); const label=await reverseGeocode(lat,lng); F.locationName=label; if(locInput)locInput.value=label; if(locStatus)locStatus.textContent=`Pinned location: ${label}`; placePin(); });
      }, 50);
    }
    if (F.step === 5) $("#fImg").addEventListener("change", (e) => {
      const f = e.target.files[0]; if (!f) return;
      if (!f.type.startsWith("image/")) return drawStep("Please choose an image file.");
      if (f.size > 5e6) return drawStep("Image is larger than 5 MB.");
      const rd = new FileReader(); rd.onload = () => { const img = new Image(); img.onload = () => { const c = document.createElement("canvas"); const sc = Math.min(1, 480 / img.width); c.width = img.width * sc; c.height = img.height * sc; c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); F.image = c.toDataURL("image/jpeg", 0.7); F.imageName = f.name; drawStep(); }; img.src = rd.result; }; rd.readAsDataURL(f);
    });
  }
  function placePin() { if (!ui.fm || F.lat == null) return; if (ui.fpin) ui.fm.removeLayer(ui.fpin); ui.fpin = L.circleMarker([F.lat, F.lng], { radius: 9, color: "#22e3ff", fillOpacity: .7 }).addTo(ui.fm); ui.fm.setView([F.lat, F.lng], 15); }
  function locName() {
    if (F.locationName && F.locationName.trim()) return F.locationName.trim();
    if (F.lat != null && F.lng != null) return `${F.lat.toFixed(5)}, ${F.lng.toFixed(5)}`;
    return "Location not specified";
  }
  function nextStep() {
    if (F.step === 1 && !F.type) return drawStep("Please choose an emergency type.");
    if (F.step === 2) {
      F.desc = $("#fDesc").value.trim();
      ["injury", "danger", "trapped", "blocked"].forEach((k) => { const el = $("#f-" + k); if (el) F.answers[k] = el.value; });
      if (!F.desc && Object.values(F.answers).every((v) => v === "unknown")) return drawStep("Add a few words or answer at least one safety question. If you cannot tell, choose Not sure.");
    }
    if (F.step === 3 && F.lat == null) return drawStep("Please choose a location or drop a pin on the map.");
    if (F.step === 6) return submitReport();
    F.step++; drawStep();
  }
  function submitReport() {
    $("#modalBody").innerHTML = `<div class="loader" style="height:220px"><span></span></div><p class="muted" style="text-align:center">AURA Signal Fusion is analysing your report…</p>`;
    setTimeout(() => {
      const answerText = `Reporter safety answers: injury=${F.answers.injury}; trapped=${F.answers.trapped}; immediate danger=${F.answers.danger}; road blocked=${F.answers.blocked}.`;
      const fullDesc = [F.desc.trim(), answerText].filter(Boolean).join(" ");
      const rep = { id: E.rid("RPT"), type: F.type, desc: fullDesc, location: locName().replace("Pinned near ", ""), lat: F.lat, lng: F.lng, people: F.people, time: Date.now(), image: F.image, source: "citizen" };
      S.reports.push(rep); const res = E.fuse(S, rep);
      ui.selected = res.incident.id;
      commit(res.merged ? `New report fused into ${res.incident.id}` : `New incident ${res.incident.id} reported`);
      const a = E.assess(S, res.incident);
      openModal(`<div style="text-align:center"><div style="font-size:40px">✓</div><h2>Report received</h2><p class="muted">Your incident ID</p></div>
        <div class="confirm-id">${res.incident.id}</div>
        <dl class="kv"><dt>Status</dt><dd>${res.incident.status}</dd><dt>Report ID</dt><dd class="mono">${rep.id}</dd><dt>Signal Fusion</dt><dd>${res.merged ? `Matched an existing incident with ${res.incident.reportIds.length} reports` : "New incident created"}</dd><dt>Priority</dt><dd><span class="pill sev-${a.severity}">${a.severity}</span> <span class="estimate">provisional</span></dd><dt>Review state</dt><dd>${esc(a.priorityState)}</dd></dl>${a.needsAssessment ? `<div class="warn-box">Some safety details are unknown. AURA keeps this visible for follow-up instead of assuming there is no danger.</div>` : ""}
        <div class="warn-box" style="margin-top:14px">This report is visible in the AURA Command Center. It has <b>not</b> been sent to official emergency services — call 112 if lives are at risk.</div>
        <div class="modal-actions"><a class="btn" href="#/command" data-action="modal-close">View in Command Center</a><button class="btn btn-primary" data-action="modal-close">Done</button></div>`);
      toast("Report submitted", "success");
    }, 900);
  }

  /* =========================================================
     PAGE: RESPONDER PORTAL
     ========================================================= */
  function responder() {
    const r = resp(S.currentResponder) || S.responders[0];
    const i = r.assignment ? inc(r.assignment) : null;
    const d = i ? E.distKm(r, i) : 0;
    app.innerHTML = `<div class="page" style="max-width:1100px">
      <div class="page-head"><div><div class="eyebrow">Responder Portal</div><h1>${esc(r.name)}</h1></div>
        <div><label class="lbl" for="rSel">Signed in as unit</label><select class="input" id="rSel">${S.responders.map((x) => `<option value="${x.id}" ${x.id === r.id ? "selected" : ""}>${esc(x.name)} — ${x.cap}${x.assignment ? " •" : ""}</option>`).join("")}</select></div></div>
      <div class="cit-grid">
        <div class="stack">
          <div class="card"><div class="row between"><div><h3 style="margin:0">${esc(r.lead)}</h3><span class="muted small">${r.id} · ${r.cap}</span></div><div class="avatar">${r.cap[0]}</div></div>
            <div class="row between" style="margin-top:16px"><span>Availability</span>
            <button class="btn btn-sm ${r.available ? "btn-primary" : ""}" data-action="toggle-avail" ${r.assignment ? "disabled title='Finish current assignment first'" : ""} aria-pressed="${r.available}">${r.available ? "● Available" : "○ Off duty"}</button></div>
            <div class="row between small muted" style="margin-top:8px"><span>Current status</span><span class="pill pill-cyan">${r.assignment ? (r.ack ? r.status || "Accepted" : "New assignment") : r.available ? "Standby" : "Off duty"}</span></div>
          </div>
          ${i ? `<div class="card"><div class="row between"><span class="mono muted small">${i.id}</span><span class="pill sev-${E.assess(S, i).severity}">${E.assess(S, i).severity}</span></div>
            <h3 style="font-size:18px;margin:8px 0">${typeIcon(i.type)} ${esc(i.type)}</h3>
            <dl class="kv"><dt>Location</dt><dd>${esc(i.location)}</dd><dt>People</dt><dd>${i.people || "Unknown"}</dd><dt>Reports</dt><dd>${i.reportIds.length}</dd><dt>Verified</dt><dd>${i.verified ? "Yes" : "No — treat with caution"}</dd><dt>Distance</dt><dd class="mono">${d.toFixed(2)} km</dd><dt>ETA</dt><dd class="mono">~${Math.max(2, Math.round(d / 0.5))} min <span class="estimate">est.</span></dd></dl>
            <p class="small muted" style="line-height:1.6">${esc(E.assess(S, i).summary)}</p>
            <div class="row" style="margin-top:12px">
              ${!r.ack ? `<button class="btn btn-primary" data-action="r-accept">Accept</button><button class="btn" data-action="r-reject">Reject</button>` : `
              <button class="btn ${r.status === "En Route" ? "btn-primary" : ""}" data-action="r-enroute" ${r.status === "En Route" || r.status === "On Scene" ? "disabled" : ""}>Mark En Route</button>
              <button class="btn" data-action="r-arrived" ${r.status !== "En Route" ? "disabled" : ""}>Mark Arrived</button>
              <button class="btn btn-primary" data-action="r-resolve" ${r.status !== "On Scene" ? "disabled" : ""}>Mark Resolved</button>`}
            </div></div>` : `<div class="card empty">No active assignment.<br><span class="small">New assignments from the Command Center appear here.</span></div>`}
        </div>
        <div class="stack">
          <div class="card" style="padding:8px;height:440px"><div id="rMap" class="map"></div></div>
          ${i ? `<div class="card"><h3>Suggested navigation <span class="estimate">simulated</span></h3><ol class="small muted" style="line-height:1.8;margin:0;padding-left:18px"><li>Head ${bearing(r, i)} from current position</li><li>Take the main sector road towards ${esc(i.location)}</li><li>Arrive at scene — straight-line ${d.toFixed(2)} km</li></ol></div>` : ""}
        </div>
      </div></div>`;
    $("#rSel").addEventListener("change", (e) => { S.currentResponder = e.target.value; E.save(S); render(); });
    const m = makeMap("rMap", [r.lat, r.lng], 14);
    if (m) {
      addShelters(m);
      L.marker([r.lat, r.lng], { icon: L.divIcon({ className: "", html: `<div class="mk-resp">${r.cap[0]}</div>`, iconSize: [22, 22] }) }).bindTooltip("You").addTo(m);
      if (i) { incMarker(i).addTo(m); L.polyline([[r.lat, r.lng], [i.lat, i.lng]], { color: "#22e3ff", weight: 3, dashArray: "8 8" }).bindTooltip("Suggested route (simulated)").addTo(m); m.fitBounds([[r.lat, r.lng], [i.lat, i.lng]], { padding: [50, 50] }); }
    }
  }
  /* =========================================================
     SMART ROUTING + TRAFFIC INTELLIGENCE
     These tools use real road-network routing where the public demo
     service responds. Road incidents/closures remain simulated reports.
     ========================================================= */
  async function geocodeDestination(query) {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`;
    const response = await fetch(url, { headers: { "Accept-Language": "en" } });
    if (!response.ok) throw new Error("Location search is unavailable");
    const results = await response.json();
    if (!results.length) throw new Error("No matching location found. Try a more complete address or nearby landmark.");
    const result = results[0];
    return { lat: Number(result.lat), lng: Number(result.lon), location: result.display_name.split(",").slice(0, 4).join(","), label: result.display_name };
  }
  function routing() {
    const active = S.incidents.filter((i) => i.status !== "Resolved");
    const selectedId = ui.routeIncident && active.some(i => i.id === ui.routeIncident) ? ui.routeIncident : (active[0]?.id || "");
    const selectedIncident = inc(selectedId);
    const units = S.responders.filter(r => r.available || r.assignment);
    const unitId = ui.routeUnit && units.some(r => r.id === ui.routeUnit) ? ui.routeUnit : (units[0]?.id || "");
    const unit = resp(unitId);
    const custom = ui.routeDestination;
    const target = custom || selectedIncident;
    app.innerHTML = `<div class="page"><div class="page-head"><div><div class="eyebrow">AURA / Route Intelligence</div><h1>Smart Emergency Routing</h1><p class="muted">Route comparison, obstruction awareness and a simulated green corridor.</p></div><span class="pill pill-cyan">ROAD-NETWORK ROUTING</span></div>
      <div class="warn-box" style="margin-bottom:16px">Prototype notice: route geometry and ETA use a public routing demo when available. Congestion, road closures and signal priority are not live city feeds. Green corridor is a simulation and does not control traffic lights.</div>
      <div class="route-layout"><div class="stack"><div class="card"><h3>Mission setup</h3><label class="lbl" for="routeUnit">Response unit</label><select class="input" id="routeUnit">${units.map(r=>`<option value="${r.id}" ${r.id===unitId?'selected':''}>${esc(r.name)} · ${esc(r.cap)} ${r.assignment?'(assigned)':''}</option>`).join('')}</select>
      <label class="lbl" for="routeIncident" style="margin-top:12px">Use an active incident</label><select class="input" id="routeIncident"><option value="">Choose an incident (optional)</option>${active.map(i=>`<option value="${i.id}" ${!custom&&i.id===selectedId?'selected':''}>${i.id} · ${esc(i.type)} · ${esc(i.location)}</option>`).join('')}</select>
      <div class="divider" style="margin:16px 0"></div><label class="lbl" for="routeDestinationInput">Or enter any destination</label><p class="small muted" style="margin:5px 0 9px">Search an address, place name, hospital, street or landmark. It does not need to be a saved incident.</p><input class="input" id="routeDestinationInput" placeholder="e.g. PGI Chandigarh, Sector 12, Chandigarh" value="${esc(ui.routeDestinationQuery || (custom?.location || ''))}" autocomplete="street-address"><div class="row" style="margin-top:8px;gap:8px"><button class="btn" id="findRouteDestination" type="button">Find destination</button><button class="btn btn-ghost" id="clearRouteDestination" type="button">Use selected incident</button></div><div id="routeDestinationStatus" class="small muted" style="margin-top:8px">${custom?`Custom destination: ${esc(custom.location)}`:'Choose an incident above or search for any destination.'}</div>
      <button class="btn btn-primary" id="calculateRoute" style="width:100%;margin-top:14px" ${unit&&target?'':'disabled'}>Calculate best route</button><div id="routeResult" class="route-result"><div class="empty">Choose a destination, then calculate a route.</div></div></div>
      ${selectedIncident&&!custom?`<div class="card"><h3>Incident context</h3><div class="row between"><b>${esc(selectedIncident.type)}</b><span class="pill sev-${E.assess(S,selectedIncident).severity}">${E.assess(S,selectedIncident).severity}</span></div><p class="muted small">${esc(selectedIncident.location)} · ${selectedIncident.reportIds.length} report(s)</p><p class="small">${esc(E.assess(S,selectedIncident).priorityState)}. ${E.assess(S,selectedIncident).needsAssessment?'Human review recommended because important details remain unknown.':'Priority is still a provisional rules-based estimate.'}</p></div>`:''}</div><div class="card map-card"><div class="map-heading"><div><div class="eyebrow">LIVE MAP VIEW</div><h3>Route & corridor</h3></div><span class="map-legend"><i class="legend-unit"></i> Unit <i class="legend-incident"></i> Destination</span></div><div id="routeMap" class="map route-map"></div><div class="map-foot">© OpenStreetMap contributors · route requests use OSRM demo when available</div></div></div>
      <div class="grid route-metrics" style="grid-template-columns:repeat(3,minmax(0,1fr));margin-top:16px"><div class="card"><span class="muted small">ROUTE MODE</span><h2>Fastest path</h2><p class="small muted">Road-network route, not straight-line distance.</p></div><div class="card"><span class="muted small">GREEN CORRIDOR</span><h2>Priority simulation</h2><p class="small muted">Highlights key approach and intersections for a demo.</p></div><div class="card"><span class="muted small">SAFETY RULE</span><h2>Human dispatch</h2><p class="small muted">Operator confirms route and resources before action.</p></div></div></div>`;
    const m = makeMap("routeMap", target ? [target.lat, target.lng] : (ui.userLocation ? [ui.userLocation.lat,ui.userLocation.lng] : D.CENTER), 13);
    if (m) { addResponders(m); active.forEach(i=>{ if(!custom || i.id!==selectedId) incMarker(i).addTo(m); }); if(unit)L.marker([unit.lat,unit.lng],{icon:L.divIcon({className:'',html:`<div class="mk-resp">${unit.cap[0]}</div>`,iconSize:[22,22]})}).bindTooltip(unit.name).addTo(m); if(target){const marker=L.marker([target.lat,target.lng]).bindTooltip(custom?`Custom destination: ${esc(custom.location)}`:`Destination: ${esc(target.location)}`).addTo(m); if(unit)m.fitBounds([[unit.lat,unit.lng],[target.lat,target.lng]],{padding:[45,45]});} }
    const uSel = $('#routeUnit'), iSel = $('#routeIncident');
    if(uSel)uSel.addEventListener('change',()=>{ui.routeUnit=uSel.value; render();});
    if(iSel)iSel.addEventListener('change',()=>{ui.routeIncident=iSel.value; ui.routeDestination=null; ui.routeDestinationQuery=''; render();});
    const destInput=$('#routeDestinationInput'), findDest=$('#findRouteDestination'), destStatus=$('#routeDestinationStatus');
    if(destInput)destInput.addEventListener('input',()=>{ui.routeDestinationQuery=destInput.value; ui.routeDestination=null; if(destStatus)destStatus.textContent='Search and select a matching destination before routing.'; const b=$('#calculateRoute'); if(b)b.disabled=true;});
    if(findDest)findDest.addEventListener('click',async()=>{
      const q=destInput.value.trim(); if(!q){toast('Enter a destination address or place name first','error');return;}
      findDest.disabled=true; findDest.textContent='Searching…'; if(destStatus)destStatus.textContent='Finding that location on the map…';
      try { ui.routeDestination=await geocodeDestination(q); ui.routeDestinationQuery=q; ui.routeIncident=''; toast('Custom destination found','success'); render(); }
      catch(err){ui.routeDestination=null; if(destStatus)destStatus.textContent=err.message||'Could not find that location.'; toast(err.message||'Could not find destination','error');}
      finally { const b=$('#findRouteDestination'); if(b){b.disabled=false;b.textContent='Find destination';} }
    });
    const clearDest=$('#clearRouteDestination'); if(clearDest)clearDest.addEventListener('click',()=>{ui.routeDestination=null;ui.routeDestinationQuery='';ui.routeIncident=selectedId||'';render();});
    const calc=$('#calculateRoute'); if(calc)calc.addEventListener('click',async()=>{
      const r=resp($('#routeUnit').value), targetNow=ui.routeDestination || inc($('#routeIncident').value), out=$('#routeResult'), map=ui.maps.routeMap;
      if(!r||!targetNow||!out||!map){toast('Choose an incident or find a custom destination first','error');return;}
      out.innerHTML='<div class="loader"><span></span></div><p class="muted small">Finding a road-network route…</p>';
      try {
        const url=`https://router.project-osrm.org/route/v1/driving/${r.lng},${r.lat};${targetNow.lng},${targetNow.lat}?overview=full&geometries=geojson&steps=true&alternatives=true`;
        const response=await fetch(url); if(!response.ok)throw new Error('Routing service unavailable'); const data=await response.json(); if(data.code!=='Ok'||!data.routes?.length)throw new Error('No route returned');
        (map._auraRouteLayers||[]).forEach(layer=>map.removeLayer(layer)); map._auraRouteLayers=[];
        const main=data.routes[0], coords=main.geometry.coordinates.map(c=>[c[1],c[0]]);
        const alt=data.routes[1]; if(alt){const ac=alt.geometry.coordinates.map(c=>[c[1],c[0]]);map._auraRouteLayers.push(L.polyline(ac,{color:'#ffb454',weight:4,opacity:.75,dashArray:'6 8'}).bindTooltip('Alternative route · estimate').addTo(map));}
        map._auraRouteLayers.push(L.polyline(coords,{color:'#39e7ff',weight:6,opacity:.95}).bindTooltip('Recommended road route').addTo(map));
        map._auraRouteLayers.push(L.polyline(coords,{color:'#ffffff',weight:2,opacity:.8,dashArray:'3 9'}).bindTooltip('Green corridor simulation only').addTo(map));
        map.fitBounds(coords,{padding:[35,35]});
        const km=(main.distance/1000).toFixed(1), mins=Math.max(1,Math.round(main.duration/60));
        const steps=(main.legs||[]).flatMap(l=>l.steps||[]).slice(0,5).map(st=>`<li>${esc(st.name||st.maneuver?.type||'Continue')} · ${(st.distance/1000).toFixed(1)} km</li>`).join('');
        out.innerHTML=`<div class="route-success"><span class="pill pill-cyan">ROUTE READY</span><p class="small"><b>Destination:</b> ${esc(targetNow.location)}</p><div class="route-stats"><div><b>${km} km</b><span>Road distance</span></div><div><b>${mins} min</b><span>Routing estimate</span></div></div><p class="small muted">Estimated driving time from road-network data; not live traffic-aware and not an emergency-service ETA.</p><div class="section-t">Suggested directions</div><ol class="route-steps">${steps||'<li>Follow the highlighted route to your destination.</li>'}</ol>${alt?'<p class="small">An alternative route is shown in amber.</p>':''}<div class="warn-box">Green corridor visualizes a proposed priority path only. Actual signal pre-emption requires authorized traffic-control integration.</div></div>`;
      } catch(err) {
        const km=E.distKm(r,targetNow), mins=Math.max(2,Math.round(km/0.45));
        out.innerHTML=`<div class="warn-box">The routing demo service did not respond. Showing a fallback estimate instead.</div><p class="small"><b>Destination:</b> ${esc(targetNow.location)}</p><div class="route-stats"><div><b>${km.toFixed(1)} km</b><span>Straight-line distance</span></div><div><b>~${mins} min</b><span>Rough fallback only</span></div></div><p class="small muted">This is not a road route. Retry when the routing service is available.</p>`;
      }
    });
  }
  function traffic() {
    const active=S.incidents.filter(i=>i.status!=='Resolved');
    const roadIssues=active.filter(i=>i.type==='Road Accident'||i.type==='Flood'||i.type==='Fire');
    const high=active.filter(i=>['Critical','High'].includes(E.assess(S,i).severity)).length;
    app.innerHTML=`<div class="page"><div class="page-head"><div><div class="eyebrow">AURA / Traffic Intelligence</div><h1>Emergency Traffic Intelligence</h1><p class="muted">Spot response blockers, understand road impact and keep routes adaptable.</p></div><span class="pill pill-cyan">INCIDENT-DRIVEN VIEW</span></div>
      <div class="warn-box" style="margin-bottom:16px">Traffic status is inferred from AURA's reported incidents and simulated demo hazards. This is not a live traffic feed and must not be used as the sole basis for real emergency navigation.</div>
      <div class="grid traffic-kpis" style="grid-template-columns:repeat(4,minmax(0,1fr));margin-bottom:16px"><div class="card"><span class="muted small">ACTIVE INCIDENTS</span><h2>${active.length}</h2></div><div class="card"><span class="muted small">POTENTIAL DELAY POINTS</span><h2>${roadIssues.length}</h2></div><div class="card"><span class="muted small">HIGH / CRITICAL</span><h2>${high}</h2></div><div class="card"><span class="muted small">ROAD BLOCK REPORTS</span><h2>${S.reports.filter(r=>/blocked|traffic stopped|traffic jam|obstruct/i.test(r.desc)).length}</h2></div></div>
      <div class="route-layout"><div class="card"><div class="row between"><h3>Road impact feed</h3><button class="btn btn-sm" data-action="traffic-refresh">Refresh</button></div><div class="section-t">Ranked by likely response impact</div>${roadIssues.length?roadIssues.map(i=>{const a=E.assess(S,i);const rs=S.reports.filter(r=>r.incidentId===i.id);const block=rs.some(r=>/blocked|traffic stopped|traffic jam|obstruct|water logging|flood/i.test(r.desc));return `<div class="traffic-item"><div class="row between"><b>${esc(i.location)}</b><span class="pill sev-${a.severity}">${a.severity}</span></div><p class="small muted">${esc(i.type)} · ${rs.length} report(s) · ${i.verified?'verified':'unverified'}</p><div class="impact-bar"><i style="width:${Math.min(100,25+rs.length*15+(block?25:0)+(a.severity==='Critical'?20:0))}%"></i></div><div class="row between small"><span>${block?'Possible obstruction reported':'Potential traffic impact'}</span><a href="#/routing" class="btn btn-sm">Plan route</a></div></div>`}).join(''):'<div class="empty">No active road-impact incidents.</div>'}<div class="warn-box" style="margin-top:14px">Do not treat an unreported road as clear. Confirm important closures with authorized sources.</div></div><div class="card map-card"><div class="map-heading"><div><div class="eyebrow">CITY OVERVIEW</div><h3>Incidents & impact zones</h3></div><span class="map-legend"><i class="legend-incident"></i> Active incident</span></div><div id="trafficMap" class="map route-map"></div><div class="map-foot">© OpenStreetMap contributors · impact estimates are simulated</div></div></div>
      <div class="card" style="margin-top:16px"><h3>How the traffic intelligence works</h3><div class="grid" style="grid-template-columns:repeat(3,minmax(0,1fr))"><div><b>01 · Detect</b><p class="small muted">Find incident reports mentioning blocked roads, stopped traffic, flooding or fire.</p></div><div><b>02 · Assess</b><p class="small muted">Combine reported road impact with incident urgency and corroborating reports.</p></div><div><b>03 · Act</b><p class="small muted">Open Smart Routing to compare a route and review alternatives.</p></div></div></div></div>`;
    const m=makeMap('trafficMap',D.CENTER,12); if(m){active.forEach(i=>incMarker(i).addTo(m));addResponders(m);active.forEach(i=>{const rs=S.reports.filter(r=>r.incidentId===i.id);if(rs.some(r=>/blocked|traffic stopped|traffic jam|obstruct|water logging|flood/i.test(r.desc)))L.circle([i.lat,i.lng],{radius:260,color:'#ffb454',weight:2,dashArray:'6 6',fillColor:'#ffb454',fillOpacity:.10}).bindTooltip('Reported / inferred traffic impact · estimated').addTo(m);});}
  }

  function bearing(a, b) { const dy = b.lat - a.lat, dx = b.lng - a.lng; return (dy > 0 ? "north" : "south") + (Math.abs(dx) > Math.abs(dy) * .4 ? (dx > 0 ? "-east" : "-west") : ""); }
  function rAction(kind) {
    const r = resp(S.currentResponder), i = inc(r.assignment); if (!i) return;
    if (kind === "accept") { r.ack = true; r.status = "Accepted"; log(i, `${r.name} accepted assignment`); toast("Assignment accepted", "success"); commit(`${r.name} accepted ${i.id}`); }
    if (kind === "reject") confirmBox("Reject assignment?", `${i.id} will be returned to the coordinator.`, () => { log(i, `${r.name} rejected assignment`); unassign(i.id, r.id); S.notifications.unshift({ t: Date.now(), msg: `${r.name} rejected ${i.id}`, read: false }); E.save(S); renderNotifs(); }, true);
    if (kind === "enroute") { r.status = "En Route"; i.status = "En Route"; log(i, `${r.name} en route`); commit(`${r.name} en route to ${i.id}`); }
    if (kind === "arrived") { r.status = "On Scene"; log(i, `${r.name} arrived on scene`); commit(`${r.name} arrived at ${i.id}`); }
    if (kind === "resolve") confirmBox("Mark incident resolved?", `This closes ${i.id} for all units.`, () => { r.lat = i.lat; r.lng = i.lng; resolve(i.id); });
  }

  /* ---------- CITY IN CRISIS ---------- */
  function runCrisis() {
    if (ui.simTimer) return;
    toast("City in Crisis scenario started", "error");
    let k = 0;
    const q = D.CRISIS.slice();
    const tick = () => {
      if (k >= q.length) {
        clearInterval(ui.simTimer); ui.simTimer = null;
        const top = S.incidents.filter((i) => i.status !== "Resolved").map((i) => ({ i, a: E.assess(S, i) })).sort((a, b) => b.a.score - a.a.score)[0];
        if (top) ui.selected = top.i.id;
        commit("Crisis scenario complete — review recommendations and assign responders");
        toast("Scenario complete. Assign recommended responders from the intelligence panel.", "success");
        return;
      }
      const s = q[k++], L2 = D.LOCATIONS[s.loc];
      const rep = { id: E.rid("RPT"), type: s.type, desc: s.desc, location: L2.name, lat: L2.lat + (Math.random() - .5) * .003, lng: L2.lng + (Math.random() - .5) * .003, people: s.people, time: Date.now(), image: null, source: "crisis" };
      S.reports.push(rep); const res = E.fuse(S, rep);
      ui.selected = res.incident.id;
      toast(res.merged ? `Fusion: report merged into ${res.incident.id} (${res.incident.reportIds.length} reports)` : `New incident ${res.incident.id}: ${s.type} at ${L2.name}`);
      commit();
    };
    ui.simTimer = setInterval(tick, 1300); tick();
  }
  function reset() {
    confirmBox("Reset scenario?", "All incidents, reports and assignments return to the initial synthetic data.", () => {
      if (ui.simTimer) { clearInterval(ui.simTimer); ui.simTimer = null; }
      S = E.fresh(); ui.selected = null; ui.manageSel = null; ui.filter = "All"; ui.search = "";
      E.save(S); toast("Scenario reset", "success"); renderNotifs(); render();
    }, true);
  }

  /* ---------- EVENT DELEGATION ---------- */
  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-action]"); if (!t) {
      if (!e.target.closest("#notifPanel")) $("#notifPanel").hidden = true; return;
    }
    const a = t.dataset.action;
    switch (a) {
      case "toggle-nav": $("#navLinks").classList.toggle("open"); break;
      case "toggle-notifs": { const p = $("#notifPanel"); p.hidden = !p.hidden; if (!p.hidden) { S.notifications.forEach((n) => (n.read = true)); E.save(S); $("#notifCount").hidden = true; } break; }
      case "clear-notifs": S.notifications = []; E.save(S); renderNotifs(); break;
      case "modal-close": closeModal(); break;
      case "select": ui.selected = t.dataset.id; refreshCommandPanels(); break;
      case "mselect": ui.manageSel = t.dataset.id; render(); break;
      case "open-manage": ui.manageSel = t.dataset.id; break;
      case "filter": ui.filter = t.dataset.f; render(); break;
      case "assign": assign(t.dataset.inc, t.dataset.r); break;
      case "assign-sel": { const v = $("#assignSel").value; if (!v) { toast("Choose a responder first", "error"); break; } assign(t.dataset.inc, v); break; }
      case "unassign": confirmBox("Remove responder?", `Unassign ${resp(t.dataset.r).name} from ${t.dataset.inc}?`, () => unassign(t.dataset.inc, t.dataset.r), true); break;
      case "verify": verify(t.dataset.id); break;
      case "resolve": confirmBox("Resolve incident?", `Mark ${t.dataset.id} as resolved and release responders?`, () => resolve(t.dataset.id)); break;
      case "split": confirmBox("Split report?", "Move this report into its own new incident?", () => split(t.dataset.inc, t.dataset.rep)); break;
      case "crisis": runCrisis(); break;
      case "traffic-refresh": render(); toast("Traffic intelligence refreshed from current incident reports", "success"); break;
      case "reset": reset(); break;
      case "report": startReport(); break;
      case "instructions": instructions(); break;
      case "share-loc":
        locateUser((loc) => toast(`Your location: ${loc.label} (${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)})`, "success"));
        break;
      case "current-location":
        locateUser((loc) => { toast(`Current location set: ${loc.label}`, "success"); render(); });
        break;
      case "f-type": F.type = t.dataset.t; drawStep(); break;
      case "f-back": F.step--; drawStep(); break;
      case "f-next": nextStep(); break;
      case "f-inc": F.people = Math.min(999, F.people + 1); $("#fPeople").textContent = F.people; break;
      case "f-dec": F.people = Math.max(0, F.people - 1); $("#fPeople").textContent = F.people; break;
      case "toggle-avail": { const r = resp(S.currentResponder); r.available = !r.available; toast(`${r.name} is now ${r.available ? "available" : "off duty"}`); commit(); break; }
      case "r-accept": rAction("accept"); break;
      case "r-reject": rAction("reject"); break;
      case "r-enroute": rAction("enroute"); break;
      case "r-arrived": rAction("arrived"); break;
      case "r-resolve": rAction("resolve"); break;
    }
  });

  // Keep other tabs in sync
  window.addEventListener("storage", (e) => { if (e.key === "aura_state_v1") { S = E.load(); renderNotifs(); render(); } });

  app.innerHTML = `<div class="loader"><span></span></div>`;
  renderNotifs();
  setTimeout(render, 250);
})();
