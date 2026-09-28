// Minimaler Server ohne Abhängigkeiten: statische UI + Dialog-API + TTS-Proxy.
import http from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createSession, start, turn, publicState } from "./engine/dialog.js";
import { llm } from "./engine/llm.js";
import { BRAND, BOT_NAME } from "./config.js";

const PORT = Number(process.env.PORT ?? 3000);
const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), "public");
const EL_KEY = process.env.ELEVENLABS_API_KEY;
const EL_VOICE = process.env.ELEVENLABS_VOICE_ID ?? "21m00Tcm4TlvDq8ikWAM";
const EL_MODEL = process.env.ELEVENLABS_MODEL ?? "eleven_multilingual_v2";

const sessions = new Map();
const ttsCache = new Map();
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".mp3": "audio/mpeg", ".wav": "audio/wav", ".svg": "image/svg+xml" };

const json = (res, code, body) => {
  res.writeHead(code, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
};
const readBody = (req) =>
  new Promise((resolve, reject) => {
    let d = "";
    req.on("data", (c) => { d += c; if (d.length > 1e5) req.destroy(); });
    req.on("end", () => { try { resolve(d ? JSON.parse(d) : {}); } catch (e) { reject(e); } });
  });

async function tts(text) {
  const key = createHash("sha1").update(EL_VOICE + EL_MODEL + text).digest("hex");
  if (ttsCache.has(key)) return ttsCache.get(key);
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${EL_VOICE}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": EL_KEY, "content-type": "application/json" },
    body: JSON.stringify({
      text,
      model_id: EL_MODEL,
      voice_settings: { stability: 0.4, similarity_boost: 0.8, style: 0.3, use_speaker_boost: true },
    }),
  });
  if (!r.ok) throw new Error(`ElevenLabs ${r.status}: ${await r.text()}`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (ttsCache.size > 300) ttsCache.delete(ttsCache.keys().next().value);
  ttsCache.set(key, buf);
  return buf;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://x");
    if (req.method === "GET" && url.pathname === "/api/config") return json(res, 200, { tts: !!EL_KEY, llm: !!llm, brand: BRAND, botName: BOT_NAME, customJingle: existsSync(path.join(PUBLIC, "audio", "jingle.mp3")) });

    if (req.method === "POST" && url.pathname === "/api/session") {
      const s = createSession();
      sessions.set(s.id, s);
      setTimeout(() => sessions.delete(s.id), 30 * 60 * 1000).unref();
      const reply = start(s);
      return json(res, 200, { sessionId: s.id, reply, state: publicState(s) });
    }

    if (req.method === "POST" && url.pathname === "/api/turn") {
      const { sessionId, text } = await readBody(req);
      const s = sessions.get(sessionId);
      if (!s) return json(res, 404, { error: "Unbekannte Session" });
      const reply = await turn(s, text, { llm });
      return json(res, 200, { reply, state: publicState(s), booking: s.booking?.summary ?? null });
    }

    if (req.method === "POST" && url.pathname === "/api/tts") {
      if (!EL_KEY) return json(res, 501, { error: "Kein ELEVENLABS_API_KEY gesetzt" });
      const { text } = await readBody(req);
      if (!text || text.length > 1500) return json(res, 400, { error: "Text fehlt oder zu lang" });
      const audio = await tts(text);
      res.writeHead(200, { "content-type": "audio/mpeg", "cache-control": "no-store" });
      return res.end(audio);
    }

    if (req.method === "GET" || req.method === "HEAD") {
      const rel = url.pathname === "/" ? "/index.html" : url.pathname;
      const file = path.normalize(path.join(PUBLIC, rel));
      if (!file.startsWith(PUBLIC)) return json(res, 403, { error: "verboten" });
      try {
        const data = await readFile(file);
        res.writeHead(200, { "content-type": MIME[path.extname(file)] ?? "application/octet-stream" });
        return res.end(data);
      } catch { return json(res, 404, { error: "nicht gefunden" }); }
    }
    json(res, 405, { error: "Methode nicht erlaubt" });
  } catch (e) {
    console.error(e);
    json(res, 500, { error: String(e.message ?? e) });
  }
});

server.listen(PORT, () => {
  console.log(`Voicebot-Prototyp läuft auf http://localhost:${PORT}`);
  console.log(`  Sprachausgabe: ${EL_KEY ? "ElevenLabs" : "Browser-Stimme (setze ELEVENLABS_API_KEY für natürlichere Sprache)"}`);
  console.log(`  Claude-Fallback: ${llm ? "an" : "aus (ANTHROPIC_API_KEY setzen, optional)"}`);
});
