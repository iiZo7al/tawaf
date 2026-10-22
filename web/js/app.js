/* Browser console: camera analysis runs on the camera device; the display receives the stream and controls the Arduino through Web Serial. */

import { PoseLandmarker, FilesetResolver } from "../vendor/vision_bundle.mjs";
import {
  classifyPosture,
  FallEngine,
  BrightnessMeter,
  meanBrightness,
  TUNING,
} from "./detector.js";
import { CloudLink, newCode, normalizeCode } from "./link.js";
import {
  t,
  getLang,
  setLang,
  applyStatic,
  onLangChange,
  translateReason,
  voiceLine,
  hasVoiceForCurrentLang,
} from "./i18n.js";

// ---------------------------------------------------------------------------
// Elements
// ---------------------------------------------------------------------------
const $ = (id) => document.getElementById(id);
const el = {
  stage: $("stage"),
  setup: $("setup"),
  waiting: $("waiting"),
  banner: $("alert-banner"),
  bannerReason: $("alert-reason"),
  sidebar: $("sidebar"),
  status: $("status-text"),
  recovery: $("recovery"),
  recoveryFill: $("recovery-fill"),
  recoveryPct: $("recovery-pct"),
  torso: $("m-torso"),
  torsoBar: $("m-torso-bar"),
  drop: $("m-drop"),
  stab: $("m-stab"),
  incidents: $("m-incidents"),
  light: $("m-light"),
  lampRow: $("lamp-row"),
  lampText: $("lamp-text"),
  subjects: $("subjects"),
  subjectsText: $("subjects-text"),
  railList: $("rail-list"),
  railCount: $("rail-count"),
  chips: {
    role: $("chip-role"),
    ai: $("chip-ai"),
    serial: $("chip-serial"),
    cloud: $("chip-cloud"),
    fps: $("chip-fps"),
  },
  deviceSelect: $("device-select"),
  activeCameraSelect: $("active-camera-select"),
  btnCameraSwitch: $("btn-camera-switch"),
  deviceRow: $("device-row"),
  pairInput: $("pair-input"),
  pairRow: $("pair-row"),
  pairCode: $("pair-code"),
  pairCopy: $("pair-copy"),
  pairCard: $("pair-card"),
  pairPendingCard: $("pair-pending-card"),
  pairPendingCode: $("pair-pending-code"),
  waitingTitle: $("waiting-title"),
  waitingDesc: $("waiting-desc"),
  btnStart: $("btn-start"),
  btnFullscreen: $("btn-fullscreen"),
  btnHud: $("btn-hud"),
  btnSettings: $("btn-settings"),
  btnSerial: $("btn-serial"),
  drawer: $("drawer"),
  selftestOut: $("selftest-out"),
  drawerMeta: $("drawer-meta"),
  portSelect: $("port-select"),
  serialState: $("serial-state"),
  cloudState: $("cloud-state"),
  btnCloudCheck: $("btn-cloud-check"),
  cmdLog: $("cmd-log"),
  btnRefreshPorts: $("btn-refresh-ports"),
  btnConnectSerial: $("btn-connect-serial"),
  toast: $("toast"),
};

const params = new URLSearchParams(location.search);
// three modes: camera (no interface) · view (display only) · both (full interface)
const MODE_PARAM = params.get("role");
const initialMode = MODE_PARAM === "view" ? "view" : MODE_PARAM === "both" ? "both" : "camera";
const role = initialMode === "view" ? "view" : "camera";

// ---------------------------------------------------------------------------
// Runtime state
// ---------------------------------------------------------------------------
const state = {
  role,
  mode: initialMode,
  running: false,
  engine: new FallEngine(),
  brightness: new BrightnessMeter(),
  video: null,
  pose: null,
  inferAt: 0,
  lastResults: null,
  fps: 0,
  poseVisible: false,
  peopleCount: 0,
  torso: 90,
  drop: 0,
  prevHipY: null,
  incidents: 0,
  voice: true,
  hud: true,
  sidebar: true,
  dark: false,
  lightLevel: 0,
  lampTestUntil: 0,
  noPersonSince: null,
  lastLampSent: null,
  lastLampCommandAt: 0,
  simUntil: 0,
  simStart: 0,
  lastFrameSent: 0,
  viewers: 0,
  lastScreenAt: 0,
  lastCameraAt: 0,
  pairCode: "",
  pairAck: false,
  pairPending: false,
  linkState: "idle",
  mediaBase: null,
  lastFrameAt: 0,
  startedAt: 0,
  serial: { connected: false, port: null, error: null },
  serialSeen: false,
  serialStatusAt: 0,
  ports: [],
  serialPort: null,
  warnedVoice: false,
  hintShown: false,
  statusKey: "status.idle",
  statusVars: null,
  statusReason: "",
};

let audioCtx = null;

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------
function toast(msg, isError = false) {
  el.toast.textContent = msg;
  el.toast.classList.toggle("error", isError);
  el.toast.classList.remove("hidden");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.toast.classList.add("hidden"), 3400);
}

const chipState = {};
function chip(name, mode, text, key) {
  chipState[name] = { mode, text, key };
  renderChip(name);
}
function renderChip(name) {
  const node = el.chips[name];
  const st = chipState[name];
  if (!node || !st) return;
  node.classList.remove("on", "warn", "off", "bad");
  if (st.mode) node.classList.add(st.mode);
  const span = node.querySelector("span");
  if (span) span.textContent = st.key ? t(st.key) : st.text ?? "";
}

function esc(text) {
  return String(text ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

/** Status line: translated sentence, with the English reason isolated for bidi. */
function setStatus(key, vars = null, reason = "") {
  state.statusKey = key;
  state.statusVars = vars;
  state.statusReason = reason;
  renderStatus();
}

function renderStatus() {
  let text = t(state.statusKey, state.statusVars);
  if (state.statusReason) {
    text += ` — <bdi dir="ltr">${esc(translateReason(state.statusReason))}</bdi>`;
    el.status.innerHTML = text;
  } else {
    el.status.textContent = text;
  }
  el.status.style.color = state.statusKey === "status.alarm" ? "#ff9aa3"
    : state.statusKey === "status.recovering" ? "#9ed0ff" : "";
}

// ---------------------------------------------------------------------------
// Cloud link — pairing by six-digit code (MQTT over WSS)
// ---------------------------------------------------------------------------
let link = null;

function initCloud() {
  link = new CloudLink({ onMessage: handleCloudMessage, onState: applyCloudState });
  link.connect();
}

function applyCloudState(next) {
  state.linkState = next;
  if (state.mode === "camera" && state.pairPending && next !== "online") {
    setStatus("status.pairPending", { code: state.pairCode });
  }
  if (next === "online") {
    chip("cloud", "on", "", "chip.cloud.ready");
  } else if (next === "connecting") {
    chip("cloud", "warn", "", "chip.cloud.connecting");
  } else if (next === "offline") {
    chip("cloud", "bad", "", "chip.cloud.offline");
  }
  if (state.role === "view") renderWaitingCode();
  applySoloMode();
}

function handleCloudMessage(msg) {
  if (msg.__hw) {
    handleHardwareState(msg);
    return;
  }
  if (msg.type === "hello") {
    // the display sends mode "view" (and older builds "screen")
    const expectedScreenTopic = `bsg/v2/${state.pairCode}/scr`;
    const isVerifiedScreen = state.role === "camera"
      && state.pairCode.length === 6
      && msg.__topic === expectedScreenTopic
      && (msg.mode === "view" || msg.mode === "screen");
    if (isVerifiedScreen) {
      state.lastScreenAt = performance.now();
      state.viewers = 1;
      // The code is confirmed: the display is really in the room.
      state.pairAck = true;
      applySoloMode();
      if (state.pairPending && state.linkState === "online") {
        state.pairPending = false;
        openPendingCamera();
      }
    } else if (state.role === "view" && msg.mode === "camera") {
      state.lastCameraAt = performance.now();
      state.viewers = 1;
      el.waiting.classList.add("hidden");
      if (performance.now() - state.lastFrameAt > 4000) setStatus("status.viewConnected");
      chip("role", "on", `${t("chip.role.view")} · ${state.pairCode}`);
    }
    return;
  }
  const screenTopic = "bsg/v2/" + state.pairCode + "/scr";
  const cameraTopic = "bsg/v2/" + state.pairCode + "/cam";
  if (state.role === "camera" && msg.__topic === screenTopic && msg.type === "control" && msg.action === "switch-camera") {
    listCameras().then(() => {
      const options = [...el.deviceSelect.options].filter((option) => option.value);
      if (!options.length) return;
      const current = options.findIndex((option) => option.value === el.deviceSelect.value);
      const next = options[(current + 1) % options.length];
      el.deviceSelect.value = next.value;
      switchLocalCamera(next.value).catch(() => toast("تعذر تغيير الكاميرا.", true));
    });
    return;
  }
  if (state.role === "camera" && msg.__topic === screenTopic && msg.type === "control" && msg.action === "simulate") {
    startSimulationLocal();
    return;
  }
  if (state.role === "view" && msg.__topic === cameraTopic && msg.type === "control" && msg.action === "hardware") {
    writeSerialCommand(msg.cmd);
    return;
  }
  if (state.role !== "view") return;
  if (msg.type === "frame") renderRemoteFrame(msg.data);
  else if (msg.type === "telemetry") applyRemoteTelemetry(msg);
  else if (msg.type === "incident") loadIncidents();
}

function handleHardwareState(msg) {
  if (msg.type === "serial") {
    const age = Date.now() / 1000 - Number(msg.ts || 0);
    // The state topic is retained: an old retained message must not pretend
    // the Arduino agent is still running.
    if (msg.online === false || age > 20) {
      state.serialSeen = false;
      chip("serial", "off", "", "chip.serial.agentOff");
      if (el.serialState) {
        el.serialState.textContent = t("serial.agentOff");
        el.serialState.classList.remove("on");
        el.serialState.classList.add("bad");
      }
      return;
    }
    state.serialSeen = true;
    state.serialStatusAt = Date.now();
    applySerialStatus(msg);
  } else if (msg.type === "ports") {
    fillPorts(msg.ports || []);
  } else if (msg.type === "cmd-sent") {
    if (msg.serial) applySerialStatus(msg.serial);
    logCommand(msg.cmd, msg.ok);
  } else if (msg.type === "cloud") {
    chip("cloud", msg.ok ? "on" : "bad", "", msg.ok ? "chip.cloud.sent" : "chip.cloud.failed");
  }
}

/** Join the room and start advertising this device's role. */
function joinPairing(code, role) {
  if (!link) initCloud();
  state.pairCode = normalizeCode(code);
  link.join(state.pairCode, role);
  const hello = () => link.send({ type: "hello", mode: role, ts: Date.now() });
  hello();
  clearInterval(joinPairing._timer);
  joinPairing._timer = setInterval(() => {
    if (link?.state === "online") hello();
  }, 1500);
}

/** The display shows its code before the camera arrives. */
function renderWaitingCode() {
  if (el.pairCode) el.pairCode.textContent = state.pairCode || "------";
}

// ---------------------------------------------------------------------------
// Arduino / Bluetooth link
// ---------------------------------------------------------------------------
function applySerialStatus(serial) {
  state.serial = serial || {};
  if (serial.connected) {
    chip("serial", "on", serial.port || "");
    el.serialState.textContent = t("serial.connected", { port: serial.port || "—" });
    el.serialState.classList.add("on");
    el.serialState.classList.remove("bad");
  } else if (serial.available === false) {
    chip("serial", "off", "", "chip.serial.nolib");
    el.serialState.textContent = t("serial.sim");
    el.serialState.classList.remove("on");
    el.serialState.classList.add("bad");
  } else if (serial.enabled === false) {
    chip("serial", "warn", "", "chip.serial.sim");
    el.serialState.textContent = t("serial.sim");
    el.serialState.classList.remove("on", "bad");
  } else if (serial.error) {
    chip("serial", "off", "", "chip.serial.off");
    el.serialState.textContent = t("serial.error", { err: serial.error });
    el.serialState.classList.remove("on");
    el.serialState.classList.add("bad");
  } else {
    chip("serial", "warn", "", "chip.serial.sim");
    el.serialState.textContent = t("serial.sim");
    el.serialState.classList.remove("on", "bad");
  }
}

function renderCloudStatus(msg) {
  if (!el.cloudState) return;
  el.cloudState.classList.remove("on", "bad");
  if (!msg.ok) {
    el.cloudState.textContent = t("cloud.offline", { err: msg.data?.error || "error" });
    el.cloudState.classList.add("bad");
    return;
  }
  if (msg.active) {
    el.cloudState.textContent = t("cloud.emergency");
    el.cloudState.classList.add("bad");
    chip("cloud", "bad", "", "chip.cloud.sent");
  } else {
    el.cloudState.textContent = t("cloud.safe");
    el.cloudState.classList.add("on");
    chip("cloud", "on", "", "chip.cloud.ready");
  }
}

async function requestCloudStatus() {
  if (el.cloudState) el.cloudState.textContent = t("cloud.checking");
  try {
    const res = await fetch("/api/cloud/status", { headers: { Accept: "application/json" } });
    const data = await res.json();
    renderCloudStatus({ ok: res.ok && data.ok !== false, active: Boolean(data.active), data });
  } catch (err) {
    renderCloudStatus({ ok: false, data: { error: err.message } });
  }
}

async function cloudAlert(reason) {
  chip("cloud", "warn", "", "chip.cloud.sending");
  try {
    const res = await fetch("/api/cloud/alert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    const data = await res.json().catch(() => ({}));
    const ok = res.ok && data.ok !== false;
    chip("cloud", ok ? "on" : "bad", "", ok ? "chip.cloud.sent" : "chip.cloud.failed");
  } catch {
    chip("cloud", "bad", "", "chip.cloud.failed");
  }
}

async function cloudResolve() {
  try {
    await fetch("/api/cloud/resolve", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    chip("cloud", "on", "", "chip.cloud.resolved");
  } catch {
    chip("cloud", "bad", "", "chip.cloud.failed");
  }
}

/* --------------------------------- theme -------------------------------- */
const THEME_KEY = "bsg.theme";

function applyTheme(mode) {
  const dark = mode !== "light";
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  const btn = document.getElementById("btn-theme");
  if (btn) {
    btn.textContent = dark ? "☀" : "◐";
    btn.title = t(dark ? "theme.toLight" : "theme.toDark");
    btn.setAttribute("aria-label", btn.title);
  }
  try { localStorage.setItem(THEME_KEY, dark ? "dark" : "light"); } catch {}
}

function initTheme() {
  let saved = null;
  try { saved = localStorage.getItem(THEME_KEY); } catch {}
  applyTheme(saved || "dark");
  document.getElementById("btn-theme")?.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    applyTheme(next);
    toast(t(next === "dark" ? "theme.toDark" : "theme.toLight"));
  });
}

/* ------------------------- share links (any network) --------------------- */
const LOCAL_HOSTS = ["localhost", "127.0.0.1", "::1"];

function shareLink(kind) {
  const url = new URL(location.href);
  url.searchParams.set("role", kind === "view" ? "view" : "camera");
  url.hash = "";
  return url.toString();
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {}
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand("copy"); } catch {}
  ta.remove();
  return ok;
}

function renderShareLinks() {
  const local = LOCAL_HOSTS.includes(location.hostname);
  document.querySelectorAll("[data-share]").forEach((btn) => {
    const kind = btn.dataset.share;
    const out = btn.querySelector("[data-share-text]");
    if (out) out.textContent = new URL(shareLink(kind)).host;
  });
  const note = document.querySelector(".share-note");
  if (note) note.textContent = t(local ? "share.localOnly" : "share.note");
}

function initSoloBadge() {
  const badge = document.getElementById("solo-badge");
  if (!badge) return;
  badge.title = t("solo.hold");
  // Long-press to stop: a stray tap on the camera phone must never kill the
  // session (that is what used to send people back to the start screen).
  let holdTimer = null;
  const startHold = () => {
    badge.classList.add("hold");
    holdTimer = setTimeout(() => {
      holdTimer = null;
      badge.classList.remove("hold");
      if (!state.running) return;
      stopAll();
      toast(t("status.stopped"));
    }, 1200);
  };
  const cancelHold = () => {
    clearTimeout(holdTimer);
    holdTimer = null;
    badge.classList.remove("hold");
  };
  badge.addEventListener("pointerdown", startHold);
  badge.addEventListener("pointerup", cancelHold);
  badge.addEventListener("pointercancel", cancelHold);
  badge.addEventListener("pointerleave", cancelHold);
  badge.addEventListener("contextmenu", (e) => e.preventDefault());
}

function initShareLinks() {
  document.querySelectorAll("[data-share]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const ok = await copyText(shareLink(btn.dataset.share));
      toast(t(ok ? "share.copied" : "share.copyFailed"), !ok);
    });
  });
  renderShareLinks();
}

function fillPorts(ports) {
  state.ports = ports;
  const previous = el.portSelect.value;
  el.portSelect.innerHTML = "";
  if (!ports.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = t("serial.noport");
    el.portSelect.appendChild(opt);
    return;
  }
  ports.forEach((port, index) => {
    const opt = document.createElement("option");
    opt.value = String(index);
    opt.textContent = "Bluetooth / Serial device " + (index + 1);
    if (String(index) === previous) opt.selected = true;
    el.portSelect.appendChild(opt);
  });
}

async function requestPorts() {
  if (!navigator.serial) {
    if (el.serialState) el.serialState.textContent = "استخدم Chrome أو Edge على الكمبيوتر للاتصال بـ HC-05.";
    return;
  }
  try {
    fillPorts(await navigator.serial.getPorts());
  } catch (err) {
    if (el.serialState) el.serialState.textContent = "تعذر عرض المنافذ: " + (err && err.message || "خطأ");
  }
}

async function connectBrowserSerial() {
  if (!navigator.serial) {
    toast("اتصال البلوتوث من الموقع يحتاج Chrome أو Edge على الكمبيوتر.", true);
    return;
  }
  try {
    const authorized = await navigator.serial.getPorts();
    const selectedIndex = Number(el.portSelect.value);
    const port = Number.isInteger(selectedIndex) ? authorized[selectedIndex] : null;
    state.serialPort = port || await navigator.serial.requestPort();
    if (!state.serialPort.readable && !state.serialPort.writable) await state.serialPort.open({ baudRate: 9600 });
    state.serial.connected = true;
    state.serial.port = "HC-05";
    applySerialStatus(state.serial);
    if (el.serialState) el.serialState.textContent = "متصل بـ HC-05 من المتصفح";
    state.serialPort.addEventListener("disconnect", () => {
      state.serial.connected = false;
      state.serialPort = null;
      applySerialStatus({ connected: false, error: "انقطع اتصال HC-05" });
    }, { once: true });
    toast("اتصل الموقع بالأردوينو عبر HC-05.");
    await requestPorts();
  } catch (err) {
    if (err && err.name !== "NotFoundError") toast("تعذر الاتصال: " + (err.message || "خطأ"), true);
  }
}

async function writeSerialCommand(cmd) {
  if (!state.serialPort?.writable) {
    const agentReady = state.serialSeen
      && state.serial?.connected
      && Date.now() - state.serialStatusAt <= 20000;
    if (agentReady) {
      const sent = link?.sendHardware({ type: "cmd", cmd });
      logCommand(cmd, Boolean(sent));
      if (!sent) toast("تعذر إرسال أمر الأردوينو عبر السحابة.", true);
      return Boolean(sent);
    }
    logCommand(cmd, false);
    if (state.role === "view") toast("اتصل بـ HC-05 أو ESP32 من إعدادات الموقع أولاً.", true);
    return false;
  }
  let writer;
  try {
    writer = state.serialPort.writable.getWriter();
    await writer.write(new TextEncoder().encode(String(cmd)));
    logCommand(cmd, true);
    return true;
  } catch (err) {
    logCommand(cmd, false);
    if (el.serialState) el.serialState.textContent = "انقطع اتصال HC-05: " + (err && err.message || "خطأ");
    return false;
  } finally {
    writer?.releaseLock();
  }
}

function logCommand(cmd, ok) {
  if (!el.cmdLog) return;
  const empty = el.cmdLog.querySelector(".muted");
  if (empty) empty.remove();
  const li = document.createElement("li");
  if (!ok) li.classList.add("fail");
  li.textContent = new Date().toLocaleTimeString("en-GB") + "  " + cmd + " → " + (state.serial.port || "HC-05") + "  " + (ok ? "sent (not confirmed by robot)" : "no link");
  el.cmdLog.prepend(li);
  while (el.cmdLog.children.length > 8) el.cmdLog.lastElementChild.remove();
}

function hardware(cmd) {
  if (state.role === "view" || state.mode === "both") {
    writeSerialCommand(cmd);
    return;
  }
  if (link && state.pairCode) link.send({ type: "control", action: "hardware", cmd });
}

// ---------------------------------------------------------------------------
// Media sources
// ---------------------------------------------------------------------------
function createVideoEl() {
  const v = document.createElement("video");
  v.muted = true;
  v.playsInline = true;
  v.autoplay = true;
  v.setAttribute("playsinline", "");
  return v;
}

async function listCameras() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cams = devices.filter((d) => d.kind === "videoinput");
    const keep = el.deviceSelect.value;
    el.deviceSelect.innerHTML = "";
    const def = document.createElement("option");
    def.value = "";
    def.textContent = t("setup.defaultCamera");
    el.deviceSelect.appendChild(def);
    cams.forEach((d, i) => {
      const opt = document.createElement("option");
      opt.value = d.deviceId;
      opt.textContent = d.label || `Camera ${i + 1}`;
      el.deviceSelect.appendChild(opt);
    });
    if (keep) el.deviceSelect.value = keep;
    if (el.activeCameraSelect) {
      const active = el.activeCameraSelect.value;
      el.activeCameraSelect.innerHTML = "";
      cams.forEach((d, i) => { const opt = document.createElement("option"); opt.value = d.deviceId; opt.textContent = d.label || `Camera ${i + 1}`; el.activeCameraSelect.appendChild(opt); });
      if (active) el.activeCameraSelect.value = active;
    }
    return cams.length;
  } catch {
    return 0;
  }
}

async function switchLocalCamera(deviceId) {
  if (!state.video || !state.running) return;
  const next = await openCamera(deviceId || "");
  const previous = state.video.srcObject;
  state.video.srcObject = next;
  await state.video.play();
  previous?.getTracks?.().forEach((track) => track.stop());
  if (deviceId) el.deviceSelect.value = deviceId;
}

function withTimeout(promise, ms, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ]);
}

async function openCamera(deviceId) {
  const base = { width: { ideal: 1280 }, height: { ideal: 720 } };
  const attempts = [];
  if (deviceId) attempts.push({ video: { ...base, deviceId: { exact: deviceId } }, audio: false });
  // Phones get the rear camera; desktops ignore facingMode and pick the default.
  if (isMobile()) attempts.push({ video: { ...base, facingMode: { ideal: "environment" } }, audio: false });
  attempts.push({ video: base, audio: false });

  let lastErr = null;
  for (const constraints of attempts) {
    try {
      // Phones show a permission dialog; give it real time (a 6s limit was
      // kicking users back to the start screen after ~10 seconds).
      return await withTimeout(navigator.mediaDevices.getUserMedia(constraints), 20000, "timeout");
    } catch (err) {
      lastErr = err;
      // These never succeed on a retry: stop immediately instead of waiting again.
      if (["NotAllowedError", "NotFoundError", "NotReadableError", "SecurityError"].includes(err?.name)) break;
    }
  }
  throw lastErr || new Error("camera");
}

function isMobile() {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

/* ------------------------- camera-only shell ---------------------------- */
/**
 * The dashboard belongs to the display, never to a camera-only phone.
 * In camera mode the HUD is hidden from the very first moment (setup card
 * included once we start pairing), leaving only the pending card and badge.
 */
function applyModeShell() {
  document.body.classList.toggle("cam-shell", state.mode === "camera");
}

function soloBadge(key, cls) {
  const badge = document.getElementById("solo-badge");
  if (!badge) return;
  const text = document.getElementById("solo-text");
  if (text) text.textContent = t(key);
  badge.classList.remove("warn", "bad");
  if (cls) badge.classList.add(cls);
}

function applySoloMode() {
  const solo = state.mode === "camera" && state.running;
  // Keep the camera-only shell active while connecting, pairing, running, and
  // returning to setup. A delayed broker connection must never reveal the
  // dashboard on the phone.
  document.body.classList.toggle("cam-shell", state.mode === "camera");
  document.body.classList.toggle("solo", solo);
  const badge = document.getElementById("solo-badge");
  if (!badge) return;
  badge.classList.toggle("hidden", !solo);
  if (!solo) return;
  const online = state.linkState === "online";
  const paired = online && (!state.pairCode || state.mode === "both" || state.viewers > 0);
  if (!online) soloBadge("solo.connecting", "warn");
  else if (paired) soloBadge("solo.connected");
  else soloBadge("solo.waiting", "warn");
}

async function attachStream(stream) {
  const v = createVideoEl();
  v.srcObject = stream;
  await v.play();
  state.video = v;
  await listCameras(); // labels become available after permission
  return v;
}

// ---------------------------------------------------------------------------
// Pose model
// ---------------------------------------------------------------------------
async function mediaRoot() {
  if (state.mediaBase) return state.mediaBase;
  // Deployed builds keep the 35 MB model/wasm in cloud storage under /media/;
  // a locally served copy still falls back to web/vendor.
  const cloud = new URL("media/", location.href).href;
  try {
    const probe = await fetch(new URL("wasm/vision_wasm_internal.js", cloud), { method: "HEAD" });
    state.mediaBase = probe.ok ? cloud : new URL("vendor/", location.href).href;
  } catch {
    state.mediaBase = new URL("vendor/", location.href).href;
  }
  return state.mediaBase;
}

async function initPose() {
  if (state.pose) return state.pose;
  const root = await mediaRoot();
  // FilesetResolver appends "/vision_wasm_internal.js", so no trailing slash.
  const base = new URL("wasm", root).href;
  const model = new URL("models/pose_landmarker_full.task", root).href;
  const vision = await FilesetResolver.forVisionTasks(base);

  const options = (delegate) => ({
    baseOptions: { modelAssetPath: model, delegate },
    runningMode: "VIDEO",
    numPoses: 10,
    minPoseDetectionConfidence: 0.65,
    minPosePresenceConfidence: 0.65,
    minTrackingConfidence: 0.6,
  });

  try {
    state.pose = await PoseLandmarker.createFromOptions(vision, options("GPU"));
  } catch (err) {
    console.warn("[AI] GPU delegate unavailable, falling back to CPU:", err);
    state.pose = await PoseLandmarker.createFromOptions(vision, options("CPU"));
  }
  chip("ai", "on", "Pose 33");
  return state.pose;
}

// ---------------------------------------------------------------------------
// Canvas drawing
// ---------------------------------------------------------------------------
const CONNECTIONS = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28],
  [27, 29], [29, 31], [28, 30], [30, 32], [27, 31], [28, 32],
  [0, 1], [0, 4], [1, 2], [2, 3], [4, 5], [5, 6], [9, 10],
];

function canvasSize(w, h) {
  if (el.stage.width !== w || el.stage.height !== h) {
    el.stage.width = w;
    el.stage.height = h;
  }
}

function drawFrame(video, result, postures) {
  const w = video.videoWidth || 1280;
  const h = video.videoHeight || 720;
  canvasSize(w, h);
  const ctx = el.stage.getContext("2d");

  ctx.save();
  ctx.translate(w, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0, w, h);
  ctx.restore();

  if (state.dark && !state.engine.isFall) {
    ctx.fillStyle = "rgba(255, 170, 60, 0.07)";
    ctx.fillRect(0, 0, w, h);
  }

  const poses = result && Array.isArray(result.landmarks) ? result.landmarks : [];
  if (!poses.length) return;

  const pt = (lm) => [(1 - lm.x) * w, lm.y * h];
  ctx.lineWidth = Math.max(2, w / 460);

  for (let index = 0; index < poses.length; index += 1) {
    const lms = poses[index];
    const posture = postures[index];
    if (!lms || !posture?.personDetected) continue;

    const poseAlarm = Boolean(posture.isFall);
    const skel = poseAlarm ? "rgba(255, 70, 80, 0.95)" : "rgba(46, 230, 200, 0.9)";
    const joint = poseAlarm ? "rgba(255, 170, 90, 0.95)" : "rgba(255, 215, 0, 0.9)";

    ctx.strokeStyle = skel;
    ctx.beginPath();
    for (const [a, b] of CONNECTIONS) {
      const la = lms[a];
      const lb = lms[b];
      if (!la || !lb) continue;
      if ((la.visibility ?? 1) < 0.3 || (lb.visibility ?? 1) < 0.3) continue;
      const [x1, y1] = pt(la);
      const [x2, y2] = pt(lb);
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
    }
    ctx.stroke();

    ctx.fillStyle = joint;
    for (const lm of lms) {
      if ((lm.visibility ?? 1) < 0.3) continue;
      const [x, y] = pt(lm);
      ctx.beginPath();
      ctx.arc(x, y, Math.max(2, w / 420), 0, Math.PI * 2);
      ctx.fill();
    }

    const box = posture.box;
    if (!box) continue;
    const mx = w - (box.x + box.w);
    const color = poseAlarm ? "#ff3b4e" : "#2ee6c8";
    const len = Math.max(16, Math.min(34, Math.min(box.w, box.h) / 3));
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    const corners = [
      [mx, box.y, 1, 1],
      [mx + box.w, box.y, -1, 1],
      [mx, box.y + box.h, 1, -1],
      [mx + box.w, box.y + box.h, -1, -1],
    ];
    for (const [cx, cy, sx, sy] of corners) {
      ctx.beginPath();
      ctx.moveTo(cx + sx * len, cy);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx, cy + sy * len);
      ctx.stroke();
    }
    ctx.globalAlpha = 0.35;
    ctx.strokeRect(mx, box.y, box.w, box.h);
    ctx.globalAlpha = 1;

    const reason = translateReason(posture.reason);
    const label = poseAlarm ? `EMERGENCY: ${reason}` : `SAFE · ${Math.round(posture.torsoAngle)}°`;
    ctx.font = `600 ${Math.max(13, Math.round(w / 62))}px "PlexArabic", system-ui, sans-serif`;
    const tw = ctx.measureText(label).width;
    const pad = 8;
    const by = Math.max(8, box.y - 34);
    ctx.fillStyle = poseAlarm ? "rgba(150, 12, 28, 0.88)" : "rgba(10, 30, 26, 0.82)";
    ctx.fillRect(mx, by, tw + pad * 2, 26);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.strokeRect(mx, by, tw + pad * 2, 26);
    ctx.fillStyle = "#fff";
    ctx.textBaseline = "middle";
    ctx.fillText(label, mx + pad, by + 14);
  }
}

function renderRemoteFrame(dataUrl) {
  const img = new Image();
  img.onload = () => {
    canvasSize(img.naturalWidth, img.naturalHeight);
    el.stage.getContext("2d").drawImage(img, 0, 0);
    state.lastFrameAt = performance.now();
    el.waiting.classList.add("hidden");
    if (!state.hintShown) {
      state.hintShown = true;
      showVideoHint("hint.clickVideo");
    }
  };
  img.src = dataUrl;
}

// ---------------------------------------------------------------------------
// Feedback: beep + voice (spoken in the selected language)
// ---------------------------------------------------------------------------
function beep() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const t0 = audioCtx.currentTime;
    for (const offset of [0, 0.2]) {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.frequency.value = 1400;
      gain.gain.setValueAtTime(0.001, t0 + offset);
      gain.gain.exponentialRampToValueAtTime(0.25, t0 + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + offset + 0.14);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t0 + offset);
      osc.stop(t0 + offset + 0.16);
    }
  } catch {}
}

function speak(kind) {
  if (!state.voice || !("speechSynthesis" in window)) return;
  const line = voiceLine(kind);
  const arabic = line.lang.startsWith("ar");
  if (arabic && !hasVoiceForCurrentLang() && !state.warnedVoice) {
    state.warnedVoice = true;
    toast(t("toast.noArabicVoice"), true);
  }
  try {
    const u = new SpeechSynthesisUtterance(line.text);
    u.rate = 0.95;
    u.lang = line.lang;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  } catch {}
}

// ---------------------------------------------------------------------------
// Hardware + cloud actions
// ---------------------------------------------------------------------------
function takeSnapshot(reason) {
  const now = Date.now();
  // Keep the black box readable: at most one snapshot every 4 seconds, even if
  // the alarm re-fires while a pilgrim is still on the floor.
  if (now - (takeSnapshot._last || 0) < 4000) return;
  takeSnapshot._last = now;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = el.stage.width;
    canvas.height = el.stage.height;
    canvas.getContext("2d").drawImage(el.stage, 0, 0);
    const image = canvas.toDataURL("image/jpeg", 0.82);
    fetch("/api/incidents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image, reason }),
    })
      .then((r) => r.json())
      .then((res) => {
        if (!res.ok) throw new Error(res.error || "cloud");
        addShot(res.url, reason);
        state.incidents += 1;
        el.incidents.textContent = state.incidents;
        el.railCount.textContent = state.incidents;
        link?.send({ type: "incident", file: res.file, url: res.url });
        toast(t("toast.snapshotSaved", { file: res.file }));
      })
      .catch((err) => toast(t("toast.snapshotError", { err: err.message }), true));
  } catch (err) {
    toast(t("toast.captureError", { err: err.message }), true);
  }
}

function addShot(_url, reason, stamp) {
  const empty = el.railList.querySelector(".rail-empty");
  if (empty) empty.remove();
  const entry = document.createElement("div");
  entry.className = "incident-entry";
  const label = document.createElement("span");
  label.textContent = (reason && translateReason(reason)) || t("rail.incident");
  const time = document.createElement("time");
  time.textContent = stamp || new Date().toLocaleTimeString(getLang() === "ar" ? "ar-SA" : "en-GB");
  entry.append(label, time);
  el.railList.prepend(entry);
  while (el.railList.children.length > 8) el.railList.lastElementChild.remove();
}

// ---------------------------------------------------------------------------
// Open the video full screen / view a captured incident
// ---------------------------------------------------------------------------
let hintTimer = null;

function showVideoHint(key) {
  const existing = document.querySelector(".video-hint");
  const node = existing || document.createElement("div");
  node.className = "video-hint";
  node.textContent = t(key);
  if (!existing) document.body.appendChild(node);
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => {
    node.classList.add("fade");
    setTimeout(() => node.remove(), 700);
  }, 5000);
}

async function toggleImmersive() {
  const goingFull = !document.body.classList.contains("hud-off");
  document.body.classList.toggle("hud-off", goingFull);
  try {
    if (goingFull) {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
    } else if (document.fullscreenElement) {
      await document.exitFullscreen();
    }
  } catch {
    /* fullscreen can be refused (iOS, iframe) - the HUD still hides */
  }
  showVideoHint(goingFull ? "hint.exitVideo" : "hint.clickVideo");
}

function openShot(url, caption) {
  let box = document.getElementById("lightbox");
  if (!box) {
    box = document.createElement("div");
    box.id = "lightbox";
    box.className = "lightbox hidden";
    box.innerHTML =
      '<button class="lightbox-close" aria-label="close">✕</button><img alt=""><div class="lightbox-caption"></div>';
    document.body.appendChild(box);
    // Click anywhere on the opened capture to dismiss it.
    box.addEventListener("click", (ev) => {
      void ev;
      closeShot();
    });
    document.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape") closeShot();
    });
  }
  box.querySelector("img").src = url;
  box.querySelector(".lightbox-caption").textContent = `${t("lightbox.incident")} · ${caption || ""}`;
  box.querySelector(".lightbox-close").title = t("lightbox.close");
  box.classList.remove("hidden");
}

function closeShot() {
  document.getElementById("lightbox")?.classList.add("hidden");
}

/** incident_YYYYmmdd_HHMMSS.jpg -> HH:MM:SS (the same naming Python uses) */
function timeFromFilename(name) {
  const m = /_(\d{8})_(\d{6})/.exec(name || "");
  if (!m) return "";
  const s = m[2];
  return `${s.slice(0, 2)}:${s.slice(2, 4)}:${s.slice(4, 6)}`;
}

// ---------------------------------------------------------------------------
// Detection loop (camera device only)
// ---------------------------------------------------------------------------
async function startCameraRole() {
  const code = normalizeCode(el.pairInput?.value || params.get("code") || "");
  if (state.mode === "both") {
    state.pairCode = "";
    state.pairAck = true;
    state.pairPending = false;
    return openPendingCamera();
  }
  if (code.length !== 6) {
    toast(t("toast.pairRequired"), true);
    el.pairInput?.focus();
    return;
  }
  if (!link) initCloud();
  state.pairCode = code;

  // "camera only" must prove the code is real before the lens is opened:
  // join the room, then wait for the display device to answer.
  if (state.mode !== "both") {
    joinPairing(code, "camera");
    state.pairPending = true;
    el.setup.classList.add("hidden");
    showPairPending();
    clearTimeout(startCameraRole._timeout);
    // Keep the camera on the confirmation screen while the display reconnects.
    startCameraRole._timeout = setTimeout(() => {
      if (state.pairPending) setStatus("status.pairPending", { code: state.pairCode });
    }, 45000);
    if (state.linkState !== "online") toast(t("toast.cloudOffline"), true);
    return;
  }

  return openPendingCamera();
}

/** Camera-only: a clean "confirming the code" screen, no dashboard. */
function showPairPending() {
  document.body.classList.add("cam-shell");
  el.waiting.classList.remove("hidden");
  el.pairPendingCard?.classList.remove("hidden");
  el.pairCard?.classList.add("hidden");
  if (el.pairPendingCode) el.pairPendingCode.textContent = state.pairCode;
  if (el.waitingTitle) el.waitingTitle.textContent = t("pair.pendingTitle");
  if (el.waitingDesc) el.waitingDesc.textContent = t("pair.pendingDesc", { code: state.pairCode });
  setStatus("status.pairPending", { code: state.pairCode });
}

function backToSetup(message, isError = false) {
  clearInterval(joinPairing._timer);
  state.running = false;
  state.pairPending = false;
  clearTimeout(startCameraRole._timeout);
  applyModeShell();
  if (state.video && state.video.srcObject) {
    state.video.srcObject.getTracks().forEach((tr) => tr.stop());
  }
  document.body.classList.remove("alarm", "hud-off", "solo");
  document.getElementById("solo-badge")?.classList.add("hidden");
  el.waiting.classList.add("hidden");
  el.pairPendingCard?.classList.add("hidden");
  el.pairCard?.classList.remove("hidden");
  el.setup.classList.remove("hidden");
  el.btnStart.disabled = false;
  chip("ai", "off", "", "chip.ai.idle");
  chip("role", "off", "—");
  setStatus("status.idle");
  if (message) toast(message, isError);
}

async function openPendingCamera() {
  if (state.linkState !== "online" || !state.pairAck) {
    showPairPending();
    setStatus("status.pairPending", { code: state.pairCode });
    return;
  }
  state.running = true;
  state.startedAt = performance.now();
  el.setup.classList.add("hidden");
  el.btnStart.disabled = true;
  clearTimeout(startCameraRole._timeout);
  // keep the pending card up until the camera is really attached

  try {
    setStatus("status.opening");
    if (el.waitingDesc) el.waitingDesc.textContent = t("pair.opening");
    const stream = await openCamera(el.deviceSelect.value || "");
    await attachStream(stream);
  } catch (err) {
    setStatus("status.pairPending", { code: state.pairCode });
    showSetupNote(t("setup.note.cameraBlocked"));
    clearTimeout(openPendingCamera._retry);
    openPendingCamera._retry = setTimeout(() => {
      if (state.pairAck && !state.running) openPendingCamera();
    }, 1500);
    state.running = false;
    return;
  }

  el.waiting.classList.add("hidden");
  el.pairPendingCard?.classList.add("hidden");

  const v = state.video;
  if (!v.videoWidth) {
    await new Promise((resolve) => (v.onloadeddata = resolve));
  }
  setStatus("status.loadingModel");
  try {
    await initPose();
  } catch (err) {
    backToSetup(t("toast.modelError", { err: err.message }), true);
    setStatus("status.modelFailed");
    return;
  }

  chip("role", "on", "", "chip.role.camera");
  setStatus("status.active");
  el.waiting.classList.add("hidden");
  applySoloMode();
  if (!state.hintShown) {
    state.hintShown = true;
    showVideoHint("hint.clickVideo");
  }
  requestAnimationFrame(loop);
  setInterval(publishTelemetry, 200);
}

function loop(ts) {
  if (!state.running || state.role !== "camera") return;
  const v = state.video;
  if (!v || v.readyState < 2) {
    requestAnimationFrame(loop);
    return;
  }

  const now = performance.now();
  const dt = Math.max(0.001, (now - (loop._prev || now)) / 1000);
  loop._prev = now;
  state.fps = 0.92 * state.fps + 0.08 * (1 / dt);

  if (now - state.inferAt > 1000 / 24) {
    state.inferAt = now;
    try {
      state.lastResults = state.pose.detectForVideo(v, now);
    } catch (err) {
      if (!loop._inferWarned) {
        console.warn("[AI] detectForVideo failed:", err);
        loop._inferWarned = true;
      }
      state.lastResults = null;
    }
  }

  const result = state.lastResults;
  const w = v.videoWidth || 1280;
  const h = v.videoHeight || 720;
  const landmarks = result && Array.isArray(result.landmarks) ? result.landmarks : [];
  const assessments = landmarks.map((poseLandmarks) => ({
    landmarks: poseLandmarks,
    posture: classifyPosture(poseLandmarks, w, h),
  }));
  const people = assessments.filter((person) => person.posture.personDetected);
  const fallenPerson = people.find((person) => person.posture.isFall) || null;
  const primaryPerson = fallenPerson || people[0] || null;
  const posture = primaryPerson ? primaryPerson.posture : {
    personDetected: false, isFall: false, reason: "",
    torsoAngle: 90, standing: false, box: null,
  };
  const lms = primaryPerson?.landmarks || null;
  const personDetected = people.length > 0;
  state.peopleCount = people.length;
  state.noPersonSince = personDetected ? null : (state.noPersonSince ?? now);
  state.poseVisible = personDetected;
  if (!personDetected) {
    state.prevHipY = null;
    state.drop = 0;
  }

  let frameFall = Boolean(fallenPerson);
  let standing = !frameFall && people.some((person) => person.posture.standing);
  let reason = fallenPerson?.posture.reason || posture.reason;
  if (state.simUntil > now) {
    const elapsed = (now - state.simStart) / 1000;
    if (elapsed < 3.8) {
      frameFall = true;
      standing = false;
      reason = "Simulated Fall (Judge Demo)";
    } else {
      frameFall = false;
      standing = true;
    }
  }

  if (lms) {
    const hipY = (lms[23].y + lms[24].y) / 2;
    if (state.prevHipY !== null) {
      state.drop = Math.max(0, ((hipY - state.prevHipY) / dt) * 1.6);
    }
    state.prevHipY = hipY;
  }
  state.torso = posture.torsoAngle;

  updateLamp(now);

  const events = state.engine.update({
    frameFall,
    standing,
    reason,
    torsoAngle: posture.torsoAngle,
    now: now / 1000,
  });

  // A missing person cannot complete the standing recovery check. Clear a stale
  // emergency after the same five-second no-person grace period used by the lamp.
  const noPersonTimeout = state.noPersonSince !== null && now - state.noPersonSince >= 5000;
  if (noPersonTimeout && state.engine.alertActive) {
    state.engine.isFall = false;
    state.engine.fallCounter = 0;
    state.engine.safeCounter = 0;
    state.engine.alertActive = false;
    state.engine.standingSince = null;
    state.engine.recoveryProgress = 0;
    state.engine.lastSent = "N";
    if (!events.some((event) => event.type === "safe")) events.push({ type: "safe" });
    events.push({ type: "resolved" });
  }
  for (const ev of events) onEngineEvent(ev, now);

  drawFrame(v, result, assessments.map((person) => person.posture));
  updateHUD();

  if (now - state.lastFrameSent > 125) {
    state.lastFrameSent = now;
    publishFrame();
  }

  requestAnimationFrame(loop);
}

function onEngineEvent(ev) {
  switch (ev.type) {
    case "fall-start":
      hardware("F");
      cloudAlert(ev.reason || "");
      document.body.classList.add("alarm");
      el.banner.classList.remove("hidden");
      el.bannerReason.textContent = translateReason(ev.reason) || "—";
      speak("fall");
      takeSnapshot(ev.reason || "");
      console.log("[EMERGENCY]", ev.reason);
      break;
    case "heartbeat":
      hardware("F"); // re-arm the Arduino watchdog
      break;
    case "beep":
      beep();
      break;
    case "safe":
      hardware("N");
      document.body.classList.remove("alarm");
      el.banner.classList.add("hidden");
      break;
    case "resolved":
      cloudResolve();
      el.recovery.classList.add("hidden");
      speak("resolved");
      break;
    case "resolving":
      el.recovery.classList.remove("hidden");
      el.recoveryFill.style.width = `${Math.round(ev.progress * 100)}%`;
      el.recoveryPct.textContent = `${Math.round(ev.progress * 100)}%`;
      break;
  }
}

// ---------------------------------------------------------------------------
// Auto lamp (darkness) — same hysteresis as the desktop program
// ---------------------------------------------------------------------------
const scratch = document.createElement("canvas");
scratch.width = 64;
scratch.height = 36;

function updateLamp(now) {
  if (!state.video) return;
  const level = state.brightness.push(meanBrightness(state.video, scratch));
  state.lightLevel = level;

  if (state.lampTestUntil && now > state.lampTestUntil) state.lampTestUntil = 0;
  const noPersonTimeout = state.noPersonSince !== null && now - state.noPersonSince >= 5000;
  const shouldBeOn = Boolean(state.lampTestUntil) || (!noPersonTimeout && level < TUNING.darkThreshold);

  if (shouldBeOn && !state.dark) {
    state.dark = true;
    hardware("D");
    state.lastLampSent = "on";
    state.lastLampCommandAt = now;
    console.log(`[LAMP ON] brightness=${level.toFixed(1)}`);
  } else if (!shouldBeOn && state.dark && (noPersonTimeout || level > TUNING.brightThreshold)) {
    state.dark = false;
    hardware("C");
    state.lastLampSent = "off";
    state.lastLampCommandAt = now;
    console.log(`[LAMP OFF] brightness=${level.toFixed(1)}`);
  }

  // Retry OFF while the scene is empty or bright. MQTT/serial delivery can
  // briefly fail, and without an acknowledgement a single C command is fragile.
  const shouldForceOff = !state.lampTestUntil
    && (noPersonTimeout || level >= TUNING.darkThreshold);
  if (shouldForceOff
    && (state.lastLampSent !== "off" || now - state.lastLampCommandAt >= 2500)) {
    hardware("C");
    state.lastLampSent = "off";
    state.lastLampCommandAt = now;
  }

  el.lampRow.classList.toggle("on", state.dark);
  el.lampText.textContent = t(state.dark ? "lamp.on" : "lamp.off", { level: Math.round(level) });
  el.light.textContent = Math.round(level);
}

// ---------------------------------------------------------------------------
// HUD refresh
// ---------------------------------------------------------------------------
function updateHUD() {
  const eng = state.engine;
  const angle = Math.round(state.torso);
  const stability = Math.round(Math.min(100, Math.max(0, (angle / 90) * 100)));

  el.torso.textContent = `${angle}°`;
  el.torsoBar.style.width = `${stability}%`;
  el.torsoBar.classList.toggle("low", angle <= TUNING.uprightAngle);
  el.drop.textContent = state.drop.toFixed(2);
  el.stab.textContent = `${stability}%`;
  el.incidents.textContent = state.incidents;
  chip("fps", state.fps > 1 ? "on" : "warn", `${Math.round(state.fps)}`);

  el.subjects.classList.toggle("empty", !state.poseVisible);
  el.subjectsText.textContent = t(state.peopleCount > 0 ? "subjects.count" : "subjects.none", { count: state.peopleCount });

  if (eng.isFall) {
    setStatus("status.alarm", null, eng.fallReason || "ALERT");
  } else if (eng.alertActive && eng.standingSince) {
    setStatus("status.recovering", { pct: eng.recoveryProgress.toFixed(1) });
  } else if (state.poseVisible) {
    setStatus("status.normal", { angle });
  } else {
    setStatus("status.noSubject");
  }
}

// ---------------------------------------------------------------------------
// Streaming frames + telemetry to other devices
// ---------------------------------------------------------------------------
function publishFrame() {
  // No display in the room yet: don't burn mobile data on unseen frames.
  if (!link || state.viewers <= 0) return;
  try {
    const maxW = 960;
    const src = el.stage;
    const scale = Math.min(1, maxW / src.width);
    const w = Math.round(src.width * scale);
    const h = Math.round(src.height * scale);
    const tmp = publishFrame._c || (publishFrame._c = document.createElement("canvas"));
    if (tmp.width !== w) {
      tmp.width = w;
      tmp.height = h;
    }
    tmp.getContext("2d").drawImage(src, 0, 0, w, h);
    link.send({ type: "frame", data: tmp.toDataURL("image/jpeg", 0.55), w, h });
  } catch {}
}

function publishTelemetry() {
  if (state.role !== "camera" || !state.running || !state.pairCode) return;
  if (state.lastScreenAt && performance.now() - state.lastScreenAt > 6000) state.viewers = 0;
  const eng = state.engine;
  link?.send({
    type: "telemetry",
    fall: eng.isFall,
    reason: eng.fallReason,
    torso: Math.round(state.torso),
    drop: Number(state.drop.toFixed(2)),
    standing: eng.standingSince !== null,
    recovery: eng.recoveryProgress,
    incidents: state.incidents,
    dark: state.dark,
    brightness: Math.round(state.lightLevel || 0),
    fps: Math.round(state.fps),
    poseVisible: state.poseVisible,
    peopleCount: state.peopleCount,
    alertActive: eng.alertActive,
    lang: getLang(),
  });
}

function applyRemoteTelemetry(tel) {
  state.incidents = tel.incidents || 0;
  state.torso = tel.torso || 90;
  state.drop = tel.drop || 0;
  state.poseVisible = Boolean(tel.poseVisible);
  state.peopleCount = Number.isFinite(Number(tel.peopleCount)) ? Number(tel.peopleCount) : (state.poseVisible ? 1 : 0);
  state.dark = Boolean(tel.dark);
  state.lightLevel = tel.brightness || 0;

  const angle = Math.round(state.torso);
  const stability = Math.round(Math.min(100, Math.max(0, (angle / 90) * 100)));
  el.torso.textContent = `${angle}°`;
  el.torsoBar.style.width = `${stability}%`;
  el.torsoBar.classList.toggle("low", angle <= TUNING.uprightAngle);
  el.drop.textContent = state.drop.toFixed(2);
  el.stab.textContent = `${stability}%`;
  el.incidents.textContent = state.incidents;
  el.light.textContent = state.lightLevel;
  el.lampRow.classList.toggle("on", state.dark);
  el.lampText.textContent = t(state.dark ? "lamp.onShort" : "lamp.offShort");
  el.subjects.classList.toggle("empty", !state.poseVisible);
  el.subjectsText.textContent = t(state.peopleCount > 0 ? "subjects.count" : "subjects.none", { count: state.peopleCount });
  chip("fps", "on", `${tel.fps || 0}`);

  document.body.classList.toggle("alarm", Boolean(tel.fall));
  el.banner.classList.toggle("hidden", !tel.fall);
  if (tel.fall) el.bannerReason.textContent = translateReason(tel.reason) || "—";

  if (tel.fall) {
    setStatus("status.alarm", null, tel.reason || "ALERT");
  } else if (tel.alertActive && tel.standing) {
    setStatus("status.recovering", { pct: Math.round((tel.recovery || 0) * 100) });
    el.recovery.classList.remove("hidden");
    el.recoveryFill.style.width = `${Math.round((tel.recovery || 0) * 100)}%`;
    el.recoveryPct.textContent = `${Math.round((tel.recovery || 0) * 100)}%`;
  } else {
    setStatus("status.viewLive");
    el.recovery.classList.add("hidden");
  }
}

// ---------------------------------------------------------------------------
// Viewer role
// ---------------------------------------------------------------------------
function startViewerRole() {
  if (!link) initCloud();
  if (!state.pairCode) state.pairCode = newCode();
  joinPairing(state.pairCode, "view");
  el.setup.classList.add("hidden");
  el.waiting.classList.remove("hidden");
  el.pairCard?.classList.remove("hidden");
  el.pairPendingCard?.classList.add("hidden");
  if (el.waitingTitle) el.waitingTitle.textContent = t("waiting.title");
  if (el.waitingDesc) el.waitingDesc.textContent = t("waiting.desc");
  renderWaitingCode();
  chip("role", "on", `${t("chip.role.view")} · ${state.pairCode}`);
  chip("ai", "off", "", "chip.ai.remote");
  setStatus("status.viewWait");
  state.running = true;
  setInterval(() => {
    const cameraOnline = state.lastCameraAt > 0 && performance.now() - state.lastCameraAt < 5000;
    if (!cameraOnline && performance.now() - state.lastFrameAt > 4000) {
      el.waiting.classList.remove("hidden");
      renderWaitingCode();
      setStatus("status.viewWait");
    }
  }, 1200);
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------
function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen?.().catch(() => {});
  } else {
    document.exitFullscreen?.().catch(() => {});
  }
}

function toggleHud() {
  state.hud = !state.hud;
  document.body.classList.toggle("hud-off", !state.hud);
}

function toggleSidebar() {
  state.sidebar = !state.sidebar;
  el.sidebar.style.display = state.sidebar ? "" : "none";
}

function toggleVoice() {
  state.voice = !state.voice;
  toast(t(state.voice ? "toast.voiceOn" : "toast.voiceOff"));
  document.querySelector('[data-key="v"]')?.classList.toggle("active", state.voice);
}

function startSimulationLocal() {
  state.simStart = performance.now();
  state.simUntil = state.simStart + 7600;
  toast(t("toast.sim"));
}

function runSimulation() {
  if (state.role === "view") {
    if (!link || !link.send({ type: "control", action: "simulate" })) toast("الكاميرا غير متصلة؛ لم يبدأ الاختبار.", true);
    else toast("أُرسل اختبار المحاكاة إلى جهاز الكاميرا.");
    return;
  }
  if (state.role === "camera") startSimulationLocal();
}

function lampTest() {
  if (state.role !== "view" && state.role !== "camera") return;
  state.lampTestUntil = performance.now() + 4000;
  state.dark = true;
  hardware("D");
  toast(t("toast.lampTest"));
}

function stopAll() {
  state.running = false;
  state.pairPending = false;
  clearTimeout(startCameraRole._timeout);
  clearInterval(joinPairing._timer);
  hardware("N");
  hardware("C");
  state.dark = false;
  state.lampTestUntil = 0;
  if (state.video && state.video.srcObject) {
    state.video.srcObject.getTracks().forEach((tr) => tr.stop());
  }
  document.body.classList.remove("alarm", "hud-off", "solo");
  document.getElementById("solo-badge")?.classList.add("hidden");
  el.banner.classList.add("hidden");
  el.waiting.classList.add("hidden");
  el.pairPendingCard?.classList.add("hidden");
  el.pairCard?.classList.remove("hidden");
  el.setup.classList.remove("hidden");
  el.btnStart.disabled = false;
  setStatus("status.stopped");
  chip("ai", "off", "", "chip.ai.off");
}

function handleKey(k) {
  switch (k) {
    case "f": toggleFullscreen(); break;
    case "h": toggleHud(); break;
    case "t": runSimulation(); break;
    case "l": lampTest(); break;
    case "v": toggleVoice(); break;
    case "b": toggleSidebar(); break;
    case "q": stopAll(); break;
  }
}

function bindControls() {
  document.querySelectorAll("[data-key]").forEach((btn) => {
    btn.addEventListener("click", () => handleKey(btn.dataset.key));
  });

  el.stage.addEventListener("click", () => {
    if (state.running) toggleImmersive();
  });
  // While the stream is interrupted the waiting overlay covers the stage, so it
  // must also be able to bring the dashboard back.
  el.waiting.addEventListener("click", () => {
    if (document.body.classList.contains("hud-off")) toggleImmersive();
  });
  el.btnCameraSwitch?.addEventListener("click", async () => {
    if (state.role === "view") {
      if (!link || !link.send({ type: "control", action: "switch-camera" })) toast("الكاميرا غير متصلة.", true);
      else toast("أُرسل طلب تغيير الكاميرا.");
      return;
    }
    await listCameras();
    if (!el.activeCameraSelect?.options.length) { toast("لا توجد كاميرا متاحة.", true); return; }
    el.activeCameraSelect.hidden = !el.activeCameraSelect.hidden;
    if (!el.activeCameraSelect.hidden) el.activeCameraSelect.focus();
  });
  el.activeCameraSelect?.addEventListener("change", () => {
    switchLocalCamera(el.activeCameraSelect.value).catch(() => toast("تعذر تغيير الكاميرا.", true));
  });
  el.btnFullscreen.addEventListener("click", toggleFullscreen);
  el.btnHud.addEventListener("click", toggleHud);
  el.btnSettings.addEventListener("click", () => {
    el.drawer.classList.toggle("hidden");
    if (!el.drawer.classList.contains("hidden")) {
      requestPorts();
      requestCloudStatus();
      refreshEsp32Heartbeat();
    }
  });
  el.btnCloudCheck.addEventListener("click", requestCloudStatus);
  $("btn-close-drawer").addEventListener("click", () => el.drawer.classList.add("hidden"));
  $("btn-run-selftest").addEventListener("click", runSelfTest);
  el.btnSerial.addEventListener("click", () => {
    el.drawer.classList.remove("hidden");
    requestPorts();
    el.portSelect.focus();
  });
  el.btnRefreshPorts.addEventListener("click", requestPorts);
  el.btnConnectSerial.addEventListener("click", connectBrowserSerial);

  el.pairInput?.addEventListener("input", () => {
    const clean = normalizeCode(el.pairInput.value);
    if (el.pairInput.value !== clean) el.pairInput.value = clean;
  });
  el.pairCopy?.addEventListener("click", async () => {
    const ok = await copyText(state.pairCode);
    toast(t(ok ? "waiting.copied" : "share.copyFailed"), !ok);
  });
  el.chips.serial.addEventListener("click", () => {
    el.drawer.classList.remove("hidden");
    requestPorts();
  });

  document.querySelectorAll("[data-lang-btn]").forEach((btn) => {
    btn.addEventListener("click", () => {
      setLang(btn.dataset.langBtn);
      toast(t("toast.langSwitched"));
    });
  });

  document.querySelectorAll(".role").forEach((btn) => {
    btn.addEventListener("click", async () => {
      document.querySelectorAll(".role").forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
      const chosen = btn.dataset.role;
      state.mode = chosen;
      state.role = chosen === "view" ? "view" : "camera";
      applyModeShell();
      el.deviceRow.style.display = chosen === "view" ? "none" : "";
      if (el.pairRow) el.pairRow.style.display = chosen === "view" || chosen === "both" ? "none" : "";
      el.btnStart.textContent = t(
        chosen === "view" ? "setup.startView" : chosen === "both" ? "setup.startBoth" : "setup.start"
      );
      if (chosen === "camera" && navigator.mediaDevices?.getUserMedia) {
        try {
          const preview = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
          preview.getTracks().forEach((track) => track.stop());
          await listCameras();
        } catch {
          showSetupNote(t("setup.note.cameraBlocked"));
          setStatus("status.cameraFailed");
        }
      }
    });
  });

  el.btnStart.addEventListener("click", async () => {
    const chosen = document.querySelector(".role.selected")?.dataset.role || "camera";
    state.mode = chosen;
    state.role = chosen === "view" ? "view" : "camera";
    applyModeShell();
    if (chosen === "view") {
      startViewerRole();
      return;
    }
    await startCameraRole();
  });

  window.addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    if (["f", "h", "t", "l", "v", "b", "q"].includes(k) && !e.ctrlKey && !e.metaKey) {
      handleKey(k);
    }
  });
}

function showSetupNote(text) {
  const note = $("setup-note");
  if (note) note.textContent = text;
}

// Keep the device list fresh when a camera is plugged in later (IR webcam).
navigator.mediaDevices?.addEventListener?.("devicechange", () => {
  listCameras().catch(() => {});
});

// ---------------------------------------------------------------------------
// Self test — proves the ported math behaves like the Python program
// ---------------------------------------------------------------------------
function makeLandmarks(overrides, vis = 0.95) {
  const lms = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: vis }));
  for (const [idx, val] of Object.entries(overrides)) {
    lms[Number(idx)] = { x: val[0], y: val[1], z: 0, visibility: vis };
  }
  return lms;
}

function runSelfTest() {
  const w = 1280;
  const h = 720;
  const results = [];
  const check = (key, cond, detail) => results.push({ key, ok: Boolean(cond), detail });

  const standing = classifyPosture(
    makeLandmarks({ 0: [0.5, 0.22], 11: [0.44, 0.3], 12: [0.56, 0.3], 23: [0.46, 0.62], 24: [0.54, 0.62] }),
    w, h);
  check("selftest.standing", !standing.isFall && standing.standing,
    t("selftest.angle", { angle: Math.round(standing.torsoAngle) }));

  const lying = classifyPosture(
    makeLandmarks({ 0: [0.2, 0.55], 11: [0.35, 0.55], 12: [0.35, 0.58], 23: [0.68, 0.55], 24: [0.68, 0.58] }),
    w, h);
  check("selftest.lying", lying.isFall && /Lying/.test(lying.reason), lying.reason);

  const collapsed = classifyPosture(
    makeLandmarks({ 0: [0.5, 0.55], 11: [0.45, 0.65], 12: [0.55, 0.65], 23: [0.46, 0.7], 24: [0.54, 0.7] }),
    w, h);
  check("selftest.collapsed", collapsed.isFall, collapsed.reason);

  const slumped = classifyPosture(
    makeLandmarks({ 0: [0.5, 0.78], 11: [0.45, 0.62], 12: [0.55, 0.62], 23: [0.47, 0.55], 24: [0.53, 0.55] }),
    w, h);
  check("selftest.slumped", slumped.isFall, slumped.reason);

  const eng = new FallEngine();
  let clock = 100;
  const events = [];
  for (let i = 0; i < 3; i += 1) {
    events.push(...eng.update({ frameFall: true, standing: false, reason: "test", torsoAngle: 10, now: (clock += 0.04) }));
  }
  const fired = events.some((e) => e.type === "fall-start");
  check("selftest.confirm", fired && eng.isFall, `events=${events.map((e) => e.type).join(",")}`);

  let resolved = false;
  for (let i = 0; i < 90; i += 1) {
    const evs = eng.update({ frameFall: false, standing: true, reason: "", torsoAngle: 80, now: (clock += 0.1) });
    if (evs.some((e) => e.type === "resolved")) {
      resolved = true;
      break;
    }
  }
  check("selftest.resolve", resolved, `alertActive=${eng.alertActive}`);

  const noPerson = classifyPosture([], w, h);
  check("selftest.empty", !noPerson.isFall, t("selftest.emptyFrame"));

  const passed = results.filter((r) => r.ok).length;
  const lines = results.map((r) => `${r.ok ? "✓" : "✗"} ${t(r.key)}  (${r.detail})`);
  lines.push("", t("selftest.summary", { passed, total: results.length }));
  el.selftestOut.textContent = lines.join("\n");
  el.drawerMeta.textContent = `self-test ${passed}/${results.length} @ ${new Date().toLocaleTimeString("en-GB")}`;
  el.drawer.classList.remove("hidden");
  return { passed, total: results.length, results };
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
function loadIncidents() {
  fetch("/api/incidents", { headers: { Accept: "application/json" } })
    .then((r) => r.json())
    .then((d) => {
      const items = d.incidents || [];
      el.railList.querySelectorAll(".shot").forEach((n) => n.remove());
      for (const item of items.slice().reverse()) addShot(item.url, "", timeFromFilename(item.file));
      el.railCount.textContent = items.length;
    })
    .catch(() => {});
}

function refreshTranslations() {
  applyStatic();
  // Device labels are not translated, but the "default camera" option is.
  const defOpt = el.deviceSelect.querySelector('option[value=""]');
  if (defOpt) defOpt.textContent = t("setup.defaultCamera");
  renderStatus();
  Object.keys(chipState).forEach(renderChip);
  el.btnStart.textContent = t(
    state.mode === "view" ? "setup.startView" : state.mode === "both" ? "setup.startBoth" : "setup.start"
  );
  el.lampText.textContent = t(state.dark ? "lamp.onShort" : "lamp.idle");
  applyTheme(document.documentElement.dataset.theme || "dark");
  if (state.role === "view" && state.pairCode) {
    chip("role", "on", `${t("chip.role.view")} · ${state.pairCode}`);
  }
  // Keep the right waiting screen after a language switch.
  if (state.role === "view" && !el.waiting.classList.contains("hidden")) {
    if (el.waitingTitle) el.waitingTitle.textContent = t("waiting.title");
    if (el.waitingDesc) el.waitingDesc.textContent = t("waiting.desc");
  } else if (state.pairPending) {
    if (el.waitingTitle) el.waitingTitle.textContent = t("pair.pendingTitle");
    if (el.waitingDesc) el.waitingDesc.textContent = t("pair.pendingDesc", { code: state.pairCode });
  }
  const badge = document.getElementById("solo-badge");
  if (badge) badge.title = t("solo.hold");
  el.subjectsText.textContent = t(state.peopleCount > 0 ? "subjects.count" : "subjects.none", { count: state.peopleCount });
}

async function boot() {
  initTheme();
  applyStatic();
  bindControls();
  initShareLinks();
  initSoloBadge();
  loadIncidents();
  onLangChange(refreshTranslations);

  chip("role", "off", "—");
  chip("ai", "warn", "", "chip.ai.loading");
  applyModeShell();
  initCloud();

  const urlCode = normalizeCode(params.get("code") || "");
  if (urlCode) {
    state.pairCode = urlCode;
    if (el.pairInput) el.pairInput.value = urlCode;
  }

  // preselect the mode requested in the URL (camera / both / view)
  const preset = document.querySelector(`.role[data-role="${initialMode}"]`);
  if (preset) {
    document.querySelectorAll(".role").forEach((b) => b.classList.remove("selected"));
    preset.classList.add("selected");
    el.deviceRow.style.display = initialMode === "view" ? "none" : "";
    if (el.pairRow) el.pairRow.style.display = initialMode === "view" || initialMode === "both" ? "none" : "";
    el.btnStart.textContent = t(
      initialMode === "view" ? "setup.startView" : initialMode === "both" ? "setup.startBoth" : "setup.start"
    );
  }

  if (role === "view") {
    startViewerRole();
    el.drawerMeta.textContent = "";
  } else {
    el.status.textContent = t("status.idle");
    chip("ai", "off", "", "chip.ai.idle");
    chip("cloud", "off", "", "chip.cloud.ready");
    chip("serial", "off", "", "chip.serial.connecting");
    requestPorts();
    try {
      const count = await listCameras();
      if (!count) showSetupNote(t("setup.note.noCamera"));
    } catch {}
  }

  window.__guard = {
    state,
    classifyPosture,
    FallEngine,
    runSelfTest,
    startCameraRole,
    startViewerRole,
    joinPairing,
    renderRemoteFrame,
    initPose,
    getLang,
    setLang,
    link: () => link,
  };
}

boot();
