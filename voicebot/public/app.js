import { playJingle } from "./jingle.js";

const $ = (id) => document.getElementById(id);
const SILENCE = "__silence__";
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

let cfg = { tts: false };
let sessionId = null;
let ctx = null;
let recog = null;
let micOn = true;
let busy = false;
let ended = false;
let silenceTimer = null;
let currentAudio = null;

const setStatus = (text, mode = "") => {
  $("status").textContent = text;
  $("avatar").className = "badge " + mode;
};

function addMsg(role, text) {
  const d = document.createElement("div");
  d.className = "msg " + role;
  d.textContent = text;
  $("chat").append(d);
  $("chat").scrollTop = $("chat").scrollHeight;
}

function renderState(state, booking) {
  const dl = $("fields");
  dl.replaceChildren();
  for (const [k, v] of Object.entries(state.fields)) {
    const row = document.createElement("div");
    const dt = document.createElement("dt");
    const dd = document.createElement("dd");
    dt.textContent = k;
    dd.textContent = v ?? "–";
    if (!v) dd.className = "empty";
    row.append(dt, dd);
    dl.append(row);
  }
  if (state.done) {
    const b = $("booking");
    b.hidden = false;
    b.textContent = state.handover
      ? "Übergabe an einen Mitarbeiter (im Prototyp nicht verbunden)."
      : booking ? "Termin gebucht (Testdaten)." : "Gespräch beendet.";
  }
}

// ---------- Sprachausgabe ----------
function chunks(text) {
  // In Sätze teilen: kurze erste Häppchen = geringe Latenz, Chrome-TTS bricht lange Texte sonst ab.
  const parts = text.match(/[^.!?]+[.!?]+["“”]?\s*|[^.!?]+$/g) ?? [text];
  const out = [];
  let cur = "";
  for (const p of parts) {
    if ((cur + p).length > 220 && cur) { out.push(cur.trim()); cur = p; } else cur += p;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function pickVoice() {
  const voices = speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith("de"));
  const rank = (v) => (/natural|neural|online/i.test(v.name) ? 0 : /google|anna|petra|katja|conny|amala|marlene|vicki/i.test(v.name) ? 1 : 2);
  return voices.sort((a, b) => rank(a) - rank(b))[0] ?? null;
}

function speakBrowser(text) {
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "de-DE";
    const v = pickVoice();
    if (v) u.voice = v;
    u.rate = 1.03;
    const done = () => { clearTimeout(guard); resolve(); };
    const guard = setTimeout(done, 2500 + text.length * 95); // falls der Browser nie „fertig“ meldet
    u.onend = u.onerror = done;
    speechSynthesis.speak(u);
  });
}

async function fetchAudio(text) {
  const r = await fetch("/api/tts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) });
  if (!r.ok) throw new Error("tts " + r.status);
  return URL.createObjectURL(await r.blob());
}

function playUrl(url) {
  return new Promise((resolve) => {
    const a = new Audio(url);
    currentAudio = a;
    a.onended = a.onerror = () => { URL.revokeObjectURL(url); resolve(); };
    a.play().catch(resolve);
  });
}

async function speak(text) {
  stopListening();
  setStatus("Lena spricht …", "speaking");
  const parts = chunks(text);
  if (cfg.tts) {
    try {
      let next = fetchAudio(parts[0]);
      for (let i = 0; i < parts.length; i++) {
        const url = await next;
        if (i + 1 < parts.length) next = fetchAudio(parts[i + 1]); // vorladen, während die aktuelle läuft
        await playUrl(url);
        if (ended) return;
      }
      return;
    } catch (e) {
      console.warn("ElevenLabs fehlgeschlagen, wechsle auf Browser-Stimme", e);
      cfg.tts = false;
    }
  }
  for (const p of parts) { await speakBrowser(p); if (ended) return; }
}

// ---------- Spracheingabe ----------
function stopListening() {
  clearTimeout(silenceTimer);
  if (recog) { recog.onend = null; recog.onresult = null; recog.onerror = null; try { recog.abort(); } catch {} recog = null; }
  $("interim").textContent = "";
}

function listen() {
  if (ended) return;
  setStatus(micOn && SR ? "Ich höre zu …" : "Bitte tippen Sie Ihre Antwort", micOn && SR ? "listening" : "");
  if (!SR || !micOn) return;
  stopListening();
  const r = new SR();
  recog = r;
  r.lang = "de-DE";
  r.interimResults = true;
  r.continuous = false;
  r.maxAlternatives = 1;
  let gotFinal = false;
  r.onresult = (e) => {
    let interim = "", final = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      (e.results[i].isFinal ? (final += e.results[i][0].transcript) : (interim += e.results[i][0].transcript));
    }
    $("interim").textContent = interim;
    if (final.trim()) { gotFinal = true; stopListening(); send(final.trim()); }
  };
  r.onerror = (e) => {
    if (e.error === "not-allowed" || e.error === "service-not-allowed") {
      micOn = false; $("mic").setAttribute("aria-pressed", "false");
      setStatus("Mikrofon nicht erlaubt – bitte tippen", "");
    }
  };
  r.onend = () => { if (!gotFinal && recog === r && !ended && micOn) { try { r.start(); } catch {} } }; // Chrome beendet bei Stille von selbst
  try { r.start(); } catch {}
  silenceTimer = setTimeout(() => { if (!gotFinal) { stopListening(); send(SILENCE); } }, 9000);
}

// ---------- Gesprächsrunde ----------
async function send(text) {
  if (busy || ended) return;
  busy = true;
  stopListening();
  if (text !== SILENCE) addMsg("user", text);
  setStatus("Einen Moment …", "");
  try {
    const r = await fetch("/api/turn", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sessionId, text }) });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error);
    addMsg("bot", data.reply.text);
    renderState(data.state, data.booking);
    await speak(data.reply.say);
    if (data.state.done) return finish();
  } catch (e) {
    addMsg("bot", "Entschuldigung, da ist technisch etwas schiefgelaufen. (" + e.message + ")");
  } finally { busy = false; }
  listen();
}

function finish() {
  ended = true;
  stopListening();
  setStatus("Gespräch beendet", "");
  $("form").hidden = true;
  $("hangup").hidden = true;
  const b = document.createElement("button");
  b.className = "primary";
  b.textContent = "Neues Gespräch";
  b.onclick = () => location.reload();
  $("chat").after(b);
}

async function begin() {
  $("startBtn").disabled = true;
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  await ctx.resume();
  if (!SR) $("capsHint").textContent = "";
  $("start").hidden = true;
  $("chat").hidden = false;
  $("form").hidden = false;
  $("hangup").hidden = false;
  const r = await fetch("/api/session", { method: "POST" });
  const data = await r.json();
  sessionId = data.sessionId;
  renderState(data.state);
  setStatus("Jingle …", "speaking");
  await playJingle(ctx, cfg.customJingle);
  addMsg("bot", data.reply.text);
  busy = true;
  await speak(data.reply.say);
  busy = false;
  listen();
}

$("startBtn").onclick = begin;
$("form").onsubmit = (e) => {
  e.preventDefault();
  const v = $("input").value.trim();
  if (!v) return;
  $("input").value = "";
  if (busy) return;
  speechSynthesis.cancel(); currentAudio?.pause();
  send(v);
};
$("mic").onclick = () => {
  micOn = !micOn;
  $("mic").setAttribute("aria-pressed", String(micOn));
  micOn ? (!busy && listen()) : stopListening();
  if (!micOn) setStatus("Mikrofon aus – bitte tippen", "");
};
$("hangup").onclick = () => {
  speechSynthesis.cancel(); currentAudio?.pause();
  addMsg("bot", "Gespräch beendet.");
  finish();
};

(async () => {
  try { cfg = await (await fetch("/api/config")).json(); } catch {}
  if (cfg.brand) $("title").textContent = `${cfg.brand} – Scheibentermin per Sprache`;
  $("mic").setAttribute("aria-pressed", "true");
  $("capsHint").textContent = [
    SR ? "" : "Dieser Browser unterstützt keine Spracherkennung – bitte Chrome oder Edge nutzen, oder die Antworten tippen.",
    cfg.tts ? "Sprachausgabe: ElevenLabs." : "Sprachausgabe: Browser-Stimme (für natürlichere Sprache ElevenLabs-Key setzen).",
  ].filter(Boolean).join(" ");
  speechSynthesis.getVoices();
  renderState({ fields: { Schaden: null, Scheibe: null, Versicherung: null, Kennzeichen: null, Name: null, Telefon: null, Adresse: null, "Service Center": null, Termin: null } });
})();
