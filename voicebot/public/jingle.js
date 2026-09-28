// Platzhalter-Jingle: eigene, kurze Melodie (G-Dur-Pentatonik, Glockenspiel/Marimba-Klang),
// bewusst NICHT an ein bestehendes Markenjingle angelehnt. Rein synthetisch, keine Rechte Dritter.
// Für die Produktion: Lizenzierte Datei unter public/audio/jingle.mp3 ablegen – sie wird automatisch bevorzugt.

const N = { G3: 196, D3: 146.83, G4: 392, A4: 440, B4: 493.88, D5: 587.33, E5: 659.25, G5: 783.99, B5: 987.77 };

// [Note, Startzeit (s), Dauer (s), Lautstärke]
const MELODY = [
  ["G4", 0.0, 0.35, 0.5], ["B4", 0.16, 0.35, 0.5], ["D5", 0.32, 0.35, 0.5], ["G5", 0.48, 0.55, 0.55],
  ["E5", 1.0, 0.3, 0.45], ["D5", 1.16, 0.3, 0.45], ["B4", 1.32, 0.3, 0.45], ["D5", 1.5, 0.6, 0.5],
  // Schlussakkord
  ["G4", 2.1, 1.5, 0.4], ["B4", 2.1, 1.5, 0.35], ["D5", 2.1, 1.5, 0.35], ["G5", 2.1, 1.5, 0.4], ["B5", 2.16, 1.2, 0.18],
  // Bass
  ["G3", 0.0, 0.9, 0.35], ["D3", 1.5, 0.6, 0.3], ["G3", 2.1, 1.6, 0.35],
];

function bell(ctx, out, freq, t0, dur, vol) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol * 0.5, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + 0.6);
  g.connect(out);
  // Grundton + leicht verstimmter Oberton für weichen, mallet-artigen Klang
  for (const [mult, type, amp] of [[1, "sine", 1], [2.0, "sine", 0.28], [4.01, "triangle", 0.08]]) {
    const o = ctx.createOscillator();
    const og = ctx.createGain();
    o.type = type;
    o.frequency.value = freq * mult;
    og.gain.value = amp;
    o.connect(og).connect(g);
    o.start(t0);
    o.stop(t0 + dur + 0.7);
  }
}

export async function playJingle(ctx, customJingle = false) {
  // 1) Eigene Datei bevorzugen, falls vorhanden
  try {
    if (customJingle) {
      const buf = await ctx.decodeAudioData(await (await fetch("/audio/jingle.mp3")).arrayBuffer());
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.start();
      return new Promise((r) => (src.onended = r));
    }
  } catch {}
  // 2) Synthetischer Platzhalter mit sanftem Echo
  const master = ctx.createGain();
  master.gain.value = 0.55;
  const delay = ctx.createDelay();
  delay.delayTime.value = 0.23;
  const fb = ctx.createGain();
  fb.gain.value = 0.28;
  const wet = ctx.createGain();
  wet.gain.value = 0.35;
  master.connect(ctx.destination);
  master.connect(delay);
  delay.connect(fb).connect(delay);
  delay.connect(wet).connect(ctx.destination);
  const t = ctx.currentTime + 0.08;
  for (const [n, s, d, v] of MELODY) bell(ctx, master, N[n], t + s, d, v);
  return new Promise((r) => setTimeout(r, 3900));
}
