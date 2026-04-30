// ════════════════════════════════════════
// United HighEyes — Dashboard JS
// Real-time surveillance frontend logic
// Socket.IO + AI analysis + alert system
// ════════════════════════════════════════

// ── Global app state
const App = {
  token:        null,
  socket:       null,
  cameras:      {},        // cameraId → camera object
  alerts:       [],        // all alerts array
  unreadAlerts: 0,
  settings: {
    threshold: 0.75,
    cooldown:  30,
    mode:      "smart",
  },
  currentAlertId: null,    // alert being viewed in modal
};

// ── Threat type → emoji + pill color mapping
const THREAT_META = {
  weapon_detected:  { emoji: "🔫", color: "pill-red",    label: "Weapon Detected",  bar: "#ef4444" },
  mask_suspicious:  { emoji: "🎭", color: "pill-amber",  label: "Suspicious Mask",  bar: "#f59e0b" },
  intrusion:        { emoji: "🚨", color: "pill-red",    label: "Intrusion",        bar: "#ef4444" },
  crowd_panic:      { emoji: "👥", color: "pill-red",    label: "Crowd Panic",      bar: "#ef4444" },
  loitering:        { emoji: "👁️", color: "pill-amber",  label: "Loitering",        bar: "#f59e0b" },
  vandalism:        { emoji: "🔨", color: "pill-amber",  label: "Vandalism",        bar: "#f59e0b" },
  fire_smoke:       { emoji: "🔥", color: "pill-red",    label: "Fire / Smoke",     bar: "#ef4444" },
  abandoned_object: { emoji: "📦", color: "pill-purple", label: "Abandoned Object", bar: "#a855f7" },
  normal:           { emoji: "✅", color: "pill-green",  label: "Normal",           bar: "#22c55e" },
};

// ════════════════════════════════════════
// AUTH — LOGIN / LOGOUT
// ════════════════════════════════════════

// Login button click ya Enter key pe call hota hai
async function doLogin() {
  const username = document.getElementById("login-user").value.trim();
  const password = document.getElementById("login-pass").value;
  const errorEl  = document.getElementById("login-error");
  const btn      = document.getElementById("login-btn");

  if (!username || !password) {
    showLoginError("Please enter username and password.");
    return;
  }

  btn.disabled = true;
  btn.innerHTML = "Authenticating...";
  errorEl.style.display = "none";

  try {
    const res  = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || "Login failed");

    // Token save karo aur dashboard show karo
    App.token = data.token;
    localStorage.setItem("uhe_token", data.token);
    startDashboard();

  } catch (err) {
    showLoginError(err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span>Access System</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M5 12h14M12 5l7 7-7 7"/></svg>';
  }
}

function showLoginError(msg) {
  const el = document.getElementById("login-error");
  el.textContent = msg;
  el.style.display = "block";
}

function doLogout() {
  App.token  = null;
  App.socket?.disconnect();
  localStorage.removeItem("uhe_token");
  document.getElementById("app").style.display          = "none";
  document.getElementById("login-screen").style.display = "flex";
  document.getElementById("login-pass").value = "";
}

// ── Enter key se login
document.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && document.getElementById("login-screen").style.display !== "none") {
    doLogin();
  }
});

// ════════════════════════════════════════
// DASHBOARD STARTUP
// ════════════════════════════════════════
async function startDashboard() {
  document.getElementById("login-screen").style.display = "none";
  document.getElementById("app").style.display          = "grid";

  initClock();
  initSocket();
  await loadStats();
  await loadAlerts();
  await loadCameras();
  loadAnalytics();
}

// ── Real-time clock in topbar
function initClock() {
  function tick() {
    const now  = new Date();
    document.getElementById("topbar-time").textContent = now.toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
    document.getElementById("page-date").textContent   = now.toLocaleDateString("en-PK", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  }
  tick();
  setInterval(tick, 1000);
}

// ── Auto-refresh stats every 30s
setInterval(() => { if (App.token) loadStats(); }, 30000);

// ════════════════════════════════════════
// SOCKET.IO — Real-time connection
// ════════════════════════════════════════
function initSocket() {
  App.socket = io({ transports: ["websocket"] });

  // Connected to server
  App.socket.on("connect", () => {
    updateSystemStatus("online", "System Online");
    document.getElementById("ai-dot").className = "ai-dot";
    showToast("Connected to surveillance server", "success");
  });

  // Disconnected
  App.socket.on("disconnect", () => {
    updateSystemStatus("offline", "Server Offline");
    document.getElementById("ai-dot").className = "ai-dot error";
    showToast("Server connection lost. Reconnecting...", "error");
  });

  // AI analysis result received (non-threat)
  App.socket.on("analysis_result", (data) => {
    const cam = App.cameras[data.cameraId];
    if (cam) updateCameraAnalysisUI(data);
  });

  // THREAT DETECTED — red alert
  App.socket.on("threat_alert", (data) => {
    handleIncomingThreat(data);
  });

  // Analysis error
  App.socket.on("analysis_error", (data) => {
    showToast(`Analysis error on ${data.cameraId}: ${data.error}`, "error");
    const aiEl = document.getElementById(`ai-${data.cameraId}`);
    if (aiEl) { aiEl.textContent = "ERROR"; aiEl.className = "cam-ai-badge threat"; }
  });

  // New camera registered
  App.socket.on("camera_registered", (data) => {
    loadCameras();
  });
}

// ════════════════════════════════════════
// THREAT HANDLING — incoming alert
// ════════════════════════════════════════
function handleIncomingThreat(data) {
  // Dashboard stats update karo
  App.unreadAlerts++;
  document.getElementById("alert-badge").style.display = "flex";
  document.getElementById("alert-badge-count").textContent = App.unreadAlerts;
  document.getElementById("alerts-nav-badge").style.display = "inline";

  // Alerts array mein push karo
  App.alerts.unshift(data);
  addAlertToTable(data);
  addAlertToFeed(data);
  updateStats();

  // Camera card red highlight
  const card = document.getElementById(`cam-card-${data.cameraId}`);
  if (card) {
    card.classList.add("threat");
    const banner = card.querySelector(".cam-threat-banner");
    if (banner) {
      banner.textContent = `⚠️ ${(THREAT_META[data.threatType]?.label || data.threatType).toUpperCase()} — ${Math.round(data.confidence * 100)}%`;
      banner.classList.add("show");
      setTimeout(() => { banner.classList.remove("show"); card.classList.remove("threat"); }, 8000);
    }
  }

  // AI badge update
  const aiEl = document.getElementById(`ai-${data.cameraId}`);
  if (aiEl) { aiEl.textContent = "THREAT"; aiEl.className = "cam-ai-badge threat"; }

  // Threat modal popup
  showThreatModal(data);

  // Stats reload karo
  loadStats();
}

// ════════════════════════════════════════
// THREAT MODAL
// ════════════════════════════════════════
function showThreatModal(data) {
  const meta = THREAT_META[data.threatType] || { emoji: "⚠️", label: data.threatType };

  document.getElementById("tm-icon").textContent   = meta.emoji;
  document.getElementById("tm-title").textContent  = "THREAT DETECTED";
  document.getElementById("tm-sub").textContent    = data.threatType.replace(/_/g, " ").toUpperCase();
  document.getElementById("tm-camera").textContent = data.cameraName || data.cameraId;
  document.getElementById("tm-confidence").textContent = `${Math.round(data.confidence * 100)}%`;
  document.getElementById("tm-time").textContent   = new Date(data.timestamp).toLocaleTimeString("en-PK");
  document.getElementById("tm-persons").textContent = data.persons ?? "--";
  document.getElementById("tm-desc").textContent   = data.description || "";
  document.getElementById("tm-rec").textContent    = data.recommendation ? `⚡ ${data.recommendation}` : "";

  // Snapshot image show karo agar available hai
  const snapWrap = document.getElementById("tm-snapshot-wrap");
  const snapImg  = document.getElementById("tm-snapshot");
  if (data.snapshot && data.snapshot.length > 100) {
    snapImg.src = data.snapshot.startsWith("data:") ? data.snapshot : `data:image/jpeg;base64,${data.snapshot}`;
    snapWrap.style.display = "block";
  } else {
    snapWrap.style.display = "none";
  }

  App.currentAlertId = data.alertId;
  document.getElementById("threat-modal").style.display = "flex";
}

function closeThreatModal(e) {
  if (e.target.id === "threat-modal") {
    document.getElementById("threat-modal").style.display = "none";
  }
}

async function acknowledgeFromModal() {
  if (!App.currentAlertId) return;
  await acknowledgeAlert(App.currentAlertId);
  document.getElementById("threat-modal").style.display = "none";
  showToast("Alert acknowledged", "success");
}

// ════════════════════════════════════════
// CAMERA MANAGEMENT
// ════════════════════════════════════════

// Demo camera add karo (test ke liye)
function addDemoCamera() {
  const demoId = `cam_${Date.now()}`;
  const names  = ["Main Entrance", "Parking Lot A", "Server Room", "Lobby", "Rooftop"];
  const locs   = ["Ground Floor", "Basement", "Floor 3", "Reception", "Top Floor"];
  const idx    = Object.keys(App.cameras).length % names.length;

  const camData = {
    id:       demoId,
    name:     names[idx],
    location: locs[idx],
  };

  App.socket?.emit("register_camera", camData);
  addCameraCard(camData);
  showToast(`Camera "${camData.name}" added`, "success");

  // Placeholder remove karo
  const ph = document.querySelector(".camera-placeholder");
  if (ph) ph.remove();
}

// Camera card DOM mein add karo
function addCameraCard(cam) {
  App.cameras[cam.id] = cam;

  const grid = document.getElementById("camera-grid");
  const card = document.createElement("div");
  card.className = "camera-card";
  card.id = `cam-card-${cam.id}`;

  card.innerHTML = `
    <div class="camera-feed-area" id="feed-${cam.id}">
      <div style="width:100%;height:100%;background:linear-gradient(135deg,#0a0f1a,#0d1525);display:flex;align-items:center;justify-content:center;color:#1e2d4a;flex-direction:column;gap:8px">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" width="40" height="40"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>
        <span style="font-size:12px;font-family:var(--mono)">Awaiting feed…</span>
      </div>
      <div class="camera-overlay">
        <div class="cam-badge"><div class="cam-rec-dot"></div><span>${escHtml(cam.name)}</span></div>
        <div class="cam-ai-badge clear" id="ai-${cam.id}">READY</div>
      </div>
      <div class="cam-threat-banner" id="banner-${cam.id}"></div>
    </div>
    <div class="camera-info">
      <div>
        <div class="cam-name">${escHtml(cam.name)}</div>
        <div class="cam-loc">${escHtml(cam.location || "—")}</div>
      </div>
      <div class="cam-actions">
        <button class="btn-cam-analyze" id="analyze-btn-${cam.id}" onclick="manualAnalyze('${cam.id}')">Analyze</button>
        <button class="btn-icon" onclick="removeCamera('${cam.id}')" title="Remove">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    </div>
  `;

  grid.appendChild(card);
  updateLiveBadge();
}

// Manually analyze button click
async function manualAnalyze(cameraId) {
  const btn = document.getElementById(`analyze-btn-${cameraId}`);
  const ai  = document.getElementById(`ai-${cameraId}`);

  if (!App.socket) { showToast("Not connected to server", "error"); return; }

  // File input trigger karo for this camera
  const input = document.getElementById("frame-upload-input");
  input.dataset.cameraId = cameraId;
  input.click();
}

// Frame upload handle karo
async function handleFrameUpload(event) {
  const file     = event.target.files[0];
  const cameraId = event.target.dataset.cameraId;
  if (!file || !cameraId) return;

  const cam = App.cameras[cameraId];
  if (!cam) return;

  // File base64 mein convert karo
  const reader = new FileReader();
  reader.onload = (e) => {
    const frameBase64 = e.target.result;
    const ai  = document.getElementById(`ai-${cameraId}`);
    const btn = document.getElementById(`analyze-btn-${cameraId}`);

    // Feed area mein image show karo
    const feedArea = document.getElementById(`feed-${cameraId}`);
    if (feedArea) {
      const img = document.createElement("img");
      img.src = frameBase64;
      img.style.cssText = "width:100%;height:100%;object-fit:cover;position:absolute;top:0;left:0;";
      feedArea.querySelector("div").style.display = "none";
      feedArea.appendChild(img);
    }

    if (ai)  { ai.textContent = "ANALYZING…"; ai.className = "cam-ai-badge analyzing"; }
    if (btn) { btn.disabled = true; btn.textContent = "Analyzing…"; }

    // Socket emit karo
    App.socket.emit("analyze_frame", {
      cameraId,
      cameraName: cam.name,
      frameBase64,
    });

    showToast(`Analyzing frame from ${cam.name}…`, "warning");

    // Btn restore karo after 5s regardless
    setTimeout(() => {
      if (btn) { btn.disabled = false; btn.textContent = "Analyze"; }
    }, 6000);
  };
  reader.readAsDataURL(file);

  event.target.value = ""; // reset input
}

// Upload Frame button (header) — generic prompt
function uploadFrame() {
  const ids = Object.keys(App.cameras);
  if (ids.length === 0) {
    showToast("Add a camera first", "warning");
    return;
  }
  // First camera pe analyze
  const input = document.getElementById("frame-upload-input");
  input.dataset.cameraId = ids[0];
  input.click();
}

// Camera analysis UI update (after result comes back)
function updateCameraAnalysisUI(data) {
  const ai  = document.getElementById(`ai-${data.cameraId}`);
  const btn = document.getElementById(`analyze-btn-${data.cameraId}`);

  if (ai) {
    if (data.threatDetected) {
      ai.textContent = "THREAT";
      ai.className   = "cam-ai-badge threat";
    } else {
      ai.textContent = "CLEAR";
      ai.className   = "cam-ai-badge clear";
      // 5s baad READY pe wapas
      setTimeout(() => {
        if (ai) { ai.textContent = "READY"; ai.className = "cam-ai-badge clear"; }
      }, 5000);
    }
  }
  if (btn) { btn.disabled = false; btn.textContent = "Analyze"; }
}

// Camera remove karo
function removeCamera(cameraId) {
  const card = document.getElementById(`cam-card-${cameraId}`);
  if (card) card.remove();
  delete App.cameras[cameraId];
  updateLiveBadge();
  if (Object.keys(App.cameras).length === 0) {
    document.getElementById("camera-grid").innerHTML = `
      <div class="camera-placeholder" onclick="addDemoCamera()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" width="48" height="48"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>
        <span>Click to add a camera feed</span>
        <small>Or upload an image frame for AI analysis</small>
      </div>`;
  }
}

// Live feed badge update karo
function updateLiveBadge() {
  const count = Object.keys(App.cameras).length;
  document.getElementById("live-badge").textContent = count;
}

// ════════════════════════════════════════
// ADD CAMERA MODAL
// ════════════════════════════════════════
function showAddCameraModal() {
  document.getElementById("add-camera-modal").style.display = "flex";
}

function closeAddCamera(e) {
  if (e.target.id === "add-camera-modal") {
    document.getElementById("add-camera-modal").style.display = "none";
  }
}

function addCamera() {
  const name     = document.getElementById("cam-name").value.trim();
  const location = document.getElementById("cam-location").value.trim();
  const url      = document.getElementById("cam-url").value.trim();

  if (!name) { showToast("Camera name required", "error"); return; }

  const camData = { id: `cam_${Date.now()}`, name, location, streamUrl: url };
  App.socket?.emit("register_camera", camData);
  addCameraCard(camData);

  const ph = document.querySelector(".camera-placeholder");
  if (ph) ph.remove();

  document.getElementById("add-camera-modal").style.display = "none";
  document.getElementById("cam-name").value     = "";
  document.getElementById("cam-location").value = "";
  document.getElementById("cam-url").value      = "";

  showToast(`Camera "${name}" added`, "success");
  switchTab("live", document.querySelector('[data-tab="live"]'));
}

// ════════════════════════════════════════
// API CALLS
// ════════════════════════════════════════

// Auth header helper
function authHeader() {
  return { "Content-Type": "application/json", Authorization: `Bearer ${App.token}` };
}

// Stats load karo
async function loadStats() {
  try {
    const res  = await fetch("/api/analytics/stats", { headers: authHeader() });
    const data = await res.json();
    if (!res.ok) return;

    document.getElementById("s-cameras").textContent      = data.activeCameras || 0;
    document.getElementById("s-alerts-today").textContent = data.alertsToday   || 0;
    document.getElementById("s-frames").textContent       = data.aiFramesAnalyzed || 0;
    document.getElementById("s-total-alerts").textContent = data.totalAlerts   || 0;
    document.getElementById("s-ai-speed").textContent     = `${data.aiAvgResponseMs || 0}ms`;
    document.getElementById("s-alerts-trend").textContent = `${data.alertsToday || 0} TODAY`;

    // Threat breakdown render karo
    if (data.byThreatType?.length) {
      renderThreatBreakdown(data.byThreatType);
    }
    if (data.topCameras?.length) {
      renderTopCameras(data.topCameras);
    }

  } catch (err) {
    console.error("Stats load failed:", err);
  }
}

// Alerts load karo from server
async function loadAlerts() {
  try {
    const res  = await fetch("/api/alerts?limit=100", { headers: authHeader() });
    const data = await res.json();
    if (!res.ok) return;

    App.alerts = data.alerts || [];
    renderAlertsTable(App.alerts);
    renderAlertFeed(App.alerts.slice(0, 8));

  } catch (err) {
    console.error("Alerts load failed:", err);
  }
}

// Cameras load karo
async function loadCameras() {
  try {
    const res  = await fetch("/api/cameras", { headers: authHeader() });
    const data = await res.json();
    if (!res.ok) return;

    renderCamerasTable(data.cameras || []);
  } catch (err) {
    console.error("Cameras load failed:", err);
  }
}

// Analytics trend load karo
async function loadAnalytics() {
  try {
    const res  = await fetch("/api/analytics/trend", { headers: authHeader() });
    const data = await res.json();
    if (!res.ok) return;

    renderTrendChart(data.trend || []);
  } catch (err) {
    console.error("Analytics load failed:", err);
  }
}

// Alert acknowledge karo
async function acknowledgeAlert(alertId) {
  try {
    await fetch(`/api/alerts/${alertId}/acknowledge`, {
      method:  "PATCH",
      headers: authHeader(),
    });
  } catch (err) {
    console.error("Acknowledge failed:", err);
  }
}

// ════════════════════════════════════════
// RENDER FUNCTIONS
// ════════════════════════════════════════

// Alerts table render karo
function renderAlertsTable(alerts) {
  const tbody = document.getElementById("alerts-tbody");
  if (!alerts.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="table-empty">No threat alerts recorded yet.</td></tr>';
    return;
  }
  tbody.innerHTML = alerts.map(a => alertTableRow(a)).join("");
}

// Single alert table row HTML generate karo
function alertTableRow(a) {
  const meta    = THREAT_META[a.threatType || a.threat_type] || { emoji: "⚠️", label: "Unknown", color: "pill-amber" };
  const confPct = Math.round((a.confidence || 0) * 100);
  const time    = new Date(a.timestamp).toLocaleString("en-PK", { hour: "2-digit", minute: "2-digit", hour12: false, month: "short", day: "numeric" });
  const camName = a.cameraName || a.camera_name || "Unknown";
  const ackd    = a.acknowledged;

  return `
    <tr style="${ackd ? 'opacity:0.5' : ''}">
      <td style="font-family:var(--mono);font-size:12px;white-space:nowrap">${time}</td>
      <td>${escHtml(camName)}</td>
      <td><span class="pill ${meta.color}">${meta.emoji} ${meta.label}</span></td>
      <td>
        <div class="conf-bar-wrap">
          <div class="conf-bar" style="width:${confPct}px;max-width:80px;background:${confPct>=75?'#ef4444':confPct>=50?'#f59e0b':'#22c55e'}"></div>
          <span class="conf-label" style="color:${confPct>=75?'#ef4444':confPct>=50?'#f59e0b':'#22c55e'}">${confPct}%</span>
        </div>
      </td>
      <td style="max-width:220px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--text-2);font-size:12px">${escHtml(a.description||"")}</td>
      <td>${a.snapshot ? `<img src="${a.snapshot.startsWith("data:") ? a.snapshot : "data:image/jpeg;base64,"+a.snapshot}" class="snapshot-thumb" onclick="viewSnapshot(this)" />` : "—"}</td>
      <td>
        ${!ackd ? `<button class="btn-outline" style="padding:4px 10px;font-size:11px" onclick="ackAlert('${a.id||a.alertId}', this)">Ack</button>` : '<span style="color:var(--green);font-size:11px">✓ Done</span>'}
      </td>
    </tr>`;
}

// Add single alert row to top of table
function addAlertToTable(a) {
  const tbody = document.getElementById("alerts-tbody");
  const emptyRow = tbody.querySelector(".table-empty");
  if (emptyRow) tbody.innerHTML = "";

  const tr = document.createElement("tr");
  tr.innerHTML = alertTableRow(a);
  tbody.prepend(tr.querySelector("tr") || tr);
}

// Alert feed (overview) render karo
function renderAlertFeed(alerts) {
  const el = document.getElementById("recent-alerts-list");
  if (!alerts.length) { el.innerHTML = '<div class="feed-empty">No threats detected. System monitoring...</div>'; return; }
  el.innerHTML = alerts.map(a => alertFeedItem(a)).join("");
}

function alertFeedItem(a) {
  const meta    = THREAT_META[a.threatType || a.threat_type] || { emoji: "⚠️", label: "Unknown" };
  const confPct = Math.round((a.confidence || 0) * 100);
  const camName = a.cameraName || a.camera_name || "Unknown";
  const time    = new Date(a.timestamp).toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit", hour12: false });
  const color   = confPct >= 75 ? "#ef4444" : confPct >= 50 ? "#f59e0b" : "#22c55e";

  return `
    <div class="feed-item">
      <div class="feed-item-icon">${meta.emoji}</div>
      <div class="feed-item-body">
        <div class="feed-item-title">${meta.label}</div>
        <div class="feed-item-meta">${escHtml(camName)} &bull; ${time}</div>
      </div>
      <div class="feed-item-conf" style="color:${color}">${confPct}%</div>
    </div>`;
}

function addAlertToFeed(a) {
  const el = document.getElementById("recent-alerts-list");
  const emptyDiv = el.querySelector(".feed-empty");
  if (emptyDiv) el.innerHTML = "";

  el.insertAdjacentHTML("afterbegin", alertFeedItem(a));

  // Max 8 items feed mein rakhna
  while (el.children.length > 8) el.removeChild(el.lastChild);
}

// Threat breakdown render karo
function renderThreatBreakdown(byType) {
  const el  = document.getElementById("threat-breakdown");
  const max = Math.max(...byType.map(t => t.count), 1);

  el.innerHTML = byType.map(t => {
    const meta  = THREAT_META[t.threat_type] || { emoji: "⚠️", label: t.threat_type, bar: "#7a86a8" };
    const width = Math.round((t.count / max) * 100);
    return `
      <div class="breakdown-row">
        <div class="breakdown-label">${meta.emoji} ${meta.label}</div>
        <div class="breakdown-bar-wrap">
          <div class="breakdown-bar" style="width:${width}%;background:${meta.bar}"></div>
        </div>
        <div class="breakdown-count">${t.count}</div>
      </div>`;
  }).join("");
}

// Top cameras list render karo
function renderTopCameras(cameras) {
  const el = document.getElementById("top-cameras-list");
  if (!el) return;
  el.innerHTML = cameras.map((c, i) => `
    <div class="top-list-item">
      <span class="top-rank">#${i + 1}</span>
      <span class="top-name">${escHtml(c.camera_name)}</span>
      <span class="top-count">${c.count} alerts</span>
    </div>`).join("");
}

// Cameras management table
function renderCamerasTable(cameras) {
  const tbody = document.getElementById("cameras-tbody");
  if (!cameras.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="table-empty">No cameras registered yet.</td></tr>';
    return;
  }
  tbody.innerHTML = cameras.map(c => {
    const statusPill = c.status === "active" ? "pill-green" : c.status === "maintenance" ? "pill-amber" : "pill-red";
    const lastFrame  = c.last_frame ? new Date(c.last_frame).toLocaleString("en-PK") : "Never";
    return `
      <tr>
        <td><strong>${escHtml(c.name)}</strong></td>
        <td style="color:var(--text-2)">${escHtml(c.location||"—")}</td>
        <td><span class="pill ${statusPill}">${c.status}</span></td>
        <td style="font-family:var(--mono);font-size:12px;color:var(--text-2)">${lastFrame}</td>
        <td>
          <select onchange="updateCamStatus('${c.id}', this.value)" style="background:var(--bg-input);border:1px solid var(--border-light);color:var(--text-1);padding:4px 8px;border-radius:4px;font-size:12px">
            <option ${c.status==='active'?'selected':''}>active</option>
            <option ${c.status==='inactive'?'selected':''}>inactive</option>
            <option ${c.status==='maintenance'?'selected':''}>maintenance</option>
          </select>
        </td>
      </tr>`;
  }).join("");
}

// Trend chart render karo (pure CSS bars)
function renderTrendChart(trend) {
  const el  = document.getElementById("trend-chart");
  if (!trend.length) { el.innerHTML = '<div style="color:var(--text-3);font-size:13px;margin:auto">No data yet</div>'; return; }

  const max = Math.max(...trend.map(t => t.count), 1);
  const chartH = 160;

  el.innerHTML = trend.map(t => {
    const h   = Math.max(Math.round((t.count / max) * chartH), 4);
    const day = new Date(t.date).toLocaleDateString("en-PK", { weekday: "short" });
    return `
      <div class="chart-bar-group">
        <div class="chart-bar-val">${t.count}</div>
        <div class="chart-bar" style="height:${h}px" title="${t.date}: ${t.count} alerts"></div>
        <div class="chart-bar-label">${day}</div>
      </div>`;
  }).join("");
}

// ════════════════════════════════════════
// ALERT ACTIONS
// ════════════════════════════════════════

async function ackAlert(alertId, btn) {
  await acknowledgeAlert(alertId);
  btn.closest("tr").style.opacity = "0.5";
  btn.outerHTML = '<span style="color:var(--green);font-size:11px">✓ Done</span>';
  showToast("Alert acknowledged", "success");
}

// Filter alerts by threat type
function filterAlerts() {
  const filter = document.getElementById("alert-filter").value;
  const filtered = filter ? App.alerts.filter(a => (a.threatType || a.threat_type) === filter) : App.alerts;
  renderAlertsTable(filtered);
}

// Export alerts as CSV
function exportAlerts() {
  if (!App.alerts.length) { showToast("No alerts to export", "warning"); return; }

  const headers = ["Time", "Camera", "Threat Type", "Confidence", "Description"];
  const rows    = App.alerts.map(a => [
    new Date(a.timestamp).toLocaleString("en-PK"),
    a.cameraName || a.camera_name,
    a.threatType || a.threat_type,
    `${Math.round((a.confidence||0)*100)}%`,
    (a.description || "").replace(/,/g, ";"),
  ]);

  const csv  = [headers, ...rows].map(r => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `united-higheyes-alerts-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast("Alerts exported", "success");
}

// Camera status update
async function updateCamStatus(cameraId, status) {
  try {
    await fetch(`/api/cameras/${cameraId}/status`, {
      method:  "PATCH",
      headers: authHeader(),
      body:    JSON.stringify({ status }),
    });
    showToast(`Camera status updated to ${status}`, "success");
  } catch (err) {
    showToast("Failed to update camera status", "error");
  }
}

// Snapshot fullscreen view
function viewSnapshot(img) {
  const overlay = document.createElement("div");
  overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.9);z-index:999;display:flex;align-items:center;justify-content:center;cursor:zoom-out";
  const bigImg = document.createElement("img");
  bigImg.src = img.src;
  bigImg.style.cssText = "max-width:90vw;max-height:90vh;border-radius:8px;box-shadow:0 0 60px rgba(0,0,0,0.8)";
  overlay.appendChild(bigImg);
  overlay.onclick = () => overlay.remove();
  document.body.appendChild(overlay);
}

// Save settings
function saveSettings() {
  App.settings.threshold = parseFloat(document.getElementById("set-threshold").value) || 0.75;
  App.settings.cooldown  = parseInt(document.getElementById("set-cooldown").value) || 30;
  App.settings.mode      = document.getElementById("set-mode").value;
  showToast("Settings saved (restart server to apply backend changes)", "success");
}

// Update stats counters
function updateStats() {
  document.getElementById("s-total-alerts").textContent = App.alerts.length;
}

// ════════════════════════════════════════
// UI HELPERS
// ════════════════════════════════════════

// Tab switch karo
function switchTab(tabName, btnEl) {
  document.querySelectorAll(".tab-pane").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".nav-item").forEach(b => b.classList.remove("active"));

  document.getElementById(`tab-${tabName}`)?.classList.add("active");
  if (btnEl) btnEl.classList.add("active");

  // Alerts tab khula toh unread reset karo
  if (tabName === "alerts") {
    App.unreadAlerts = 0;
    document.getElementById("alert-badge").style.display    = "none";
    document.getElementById("alerts-nav-badge").style.display = "none";
  }

  // Analytics tab pe data reload karo
  if (tabName === "analytics") loadAnalytics();
  if (tabName === "cameras")   loadCameras();
  if (tabName === "settings")  loadSystemInfo();
}

// System status indicator
function updateSystemStatus(state, text) {
  const el  = document.getElementById("sys-status");
  const dot = el.querySelector(".status-dot");
  dot.className = `status-dot ${state}`;
  el.querySelector("span:last-child").textContent = text;
}

// System info load karo
async function loadSystemInfo() {
  try {
    const res  = await fetch("/api/health");
    const data = await res.json();
    const uptimeEl = document.getElementById("sys-uptime");
    if (uptimeEl) {
      const h = Math.floor(data.uptime / 3600);
      const m = Math.floor((data.uptime % 3600) / 60);
      uptimeEl.textContent = `${h}h ${m}m`;
    }
  } catch {}
}

// Toast notification show karo
function showToast(message, type = "success") {
  const icons   = { success: "✓", error: "✕", warning: "⚡" };
  const container = document.getElementById("toast-container");

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span class="toast-icon">${icons[type] || "•"}</span><span>${escHtml(message)}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.transition = "opacity 0.3s, transform 0.3s";
    toast.style.opacity    = "0";
    toast.style.transform  = "translateX(120%)";
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// XSS se bachne ke liye HTML escape karo
function escHtml(str) {
  return String(str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ════════════════════════════════════════
// APP INIT — page load pe check token
// ════════════════════════════════════════
(async () => {
  const saved = localStorage.getItem("uhe_token");
  if (saved) {
    try {
      const res  = await fetch("/api/auth/verify", { headers: { Authorization: `Bearer ${saved}` } });
      const data = await res.json();
      if (data.valid) {
        App.token = saved;
        startDashboard();
        return;
      }
    } catch {}
  }
  // No valid token — login screen show karo
  document.getElementById("login-screen").style.display = "flex";
})();
