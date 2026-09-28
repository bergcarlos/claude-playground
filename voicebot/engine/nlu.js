// Regelbasiertes Sprachverstehen (NLU) für den Terminbot.
// Alles hier ist reine Textverarbeitung ohne Netzwerk – funktioniert also identisch
// für Browser-Prototyp und späteren Telefonie-Kanal (dort kommt der Text aus dem STT).

export const norm = (t) =>
  String(t ?? "")
    .toLowerCase()
    .replace(/[.,;:!?"„“()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const has = (t, re) => re.test(t);

// ---------- Ja / Nein ----------
export function parseYesNo(text) {
  const t = norm(text);
  if (has(t, /\b(nein|nee|nö|falsch|stimmt nicht|nicht richtig|kein|keine|anders|andere|leider nicht|passt nicht|nicht ganz)\b/)) return "no";
  if (has(t, /\b(ja|jo|jawohl|genau|stimmt|richtig|korrekt|passt|klar|gern|gerne|okay|ok|mhm|sicher|super|perfekt|in ordnung|bitte|machen wir|einverstanden)\b/)) return "yes";
  return null;
}

// ---------- Schadensart ----------
export function parseDamage(text) {
  const t = norm(text);
  if (has(t, /(austausch|tausch|ersetz|erneuer|komplett|gesprungen|zerbrochen|zersplittert|gebrochen|eingeschlagen|kaputt|zerstört|neue scheibe|neu machen|spinnennetz|riesig|groß(er)? riss|quer)/)) return "replace";
  if (has(t, /(steinschlag|stein|einschlag|reparier|reparatur|macke|kratzer|kleiner? riss|riss|sprung|delle|absplitter|abplatz|loch|punkt)/)) return "repair";
  if (has(t, /(weiß nicht|weiss nicht|keine ahnung|unsicher|nicht sicher|kann ich nicht sagen|schwer zu sagen|egal|was empfehlen)/)) return "unsure";
  return null;
}

// ---------- Scheibe ----------
export function parseGlass(text) {
  const t = norm(text);
  let type = null;
  if (has(t, /(front|windschutz|windschutzscheibe|vorne? scheibe|vordere scheibe|frontglas)/)) type = "front";
  else if (has(t, /(heck|hinterscheibe|hintere scheibe|heckklappe|rückscheibe)/)) type = "rear";
  else if (has(t, /(dach|panorama|schiebedach|glasdach)/)) type = "roof";
  else if (has(t, /(seite|fahrertür|fahrerseite|beifahrer|tür|fenster|dreieck|seitenfenster)/)) type = "side";
  else if (has(t, /(scheibe.*vorne|vorne)/)) type = "front";

  let side = null;
  if (has(t, /(rechts|beifahrer)/)) side = "rechts";
  else if (has(t, /(links|fahrer)/)) side = "links";
  let pos = null;
  if (has(t, /\bhinten|hintere/)) pos = "hinten";
  else if (has(t, /\bvorne|vordere/)) pos = "vorne";
  return type ? { type, side, pos } : null;
}

export const GLASS_LABEL = {
  front: "Frontscheibe",
  rear: "Heckscheibe",
  roof: "Dachscheibe",
  side: "Seitenscheibe",
};

export function glassLabel(g) {
  if (!g) return "";
  if (g.type !== "side") return GLASS_LABEL[g.type];
  return `Seitenscheibe ${[g.pos, g.side].filter(Boolean).join(" ")}`.trim();
}

// ---------- Versicherung ----------
export function parseInsurance(text) {
  const t = norm(text);
  if (has(t, /(selbstzahler|selbst zahlen|selbst bezahlen|privat|ohne versicherung|keine versicherung|nicht versichert|bar|aus eigener tasche|zahle selbst|zahl ich selbst)/)) return "self";
  if (has(t, /(voll ?kasko|vollkaskoversicherung)/)) return "voll";
  if (has(t, /(teil ?kasko|teilkaskoversicherung)/)) return "teil";
  if (has(t, /(kasko|versicherung|versichert)/)) return "kasko?";
  if (has(t, /(weiß nicht|weiss nicht|keine ahnung|nicht sicher|muss nachsehen|nachschauen)/)) return "unknown";
  return null;
}

export const INSURANCE_LABEL = {
  voll: "Vollkasko",
  teil: "Teilkasko",
  self: "Selbstzahler",
  unknown: "noch unklar (wird im Service Center geprüft)",
};

// ---------- Zahlen / Buchstabieralphabet ----------
const DIGIT_WORDS = {
  null: "0", eins: "1", ein: "1", eine: "1", zwei: "2", zwo: "2", drei: "3", vier: "4",
  fünf: "5", fuenf: "5", sechs: "6", sieben: "7", acht: "8", neun: "9",
  zehn: "10", elf: "11", zwölf: "12", zwoelf: "12", dreizehn: "13", vierzehn: "14",
  fünfzehn: "15", sechzehn: "16", siebzehn: "17", achtzehn: "18", neunzehn: "19", zwanzig: "20",
};

const SPELLING = {
  anton: "A", berta: "B", cäsar: "C", caesar: "C", cesar: "C", dora: "D", emil: "E",
  friedrich: "F", gustav: "G", heinrich: "H", ida: "I", julius: "J", kaufmann: "K",
  ludwig: "L", martha: "M", marta: "M", nordpol: "N", otto: "O", paula: "P", quelle: "Q",
  richard: "R", samuel: "S", schule: "S", theodor: "T", ulrich: "U", viktor: "V",
  wilhelm: "W", xanthippe: "X", ypsilon: "Y", zeppelin: "Z",
  ärger: "Ä", ökonom: "Ö", übermut: "Ü",
};

// „eins zwei drei“ / „123“ -> "123"; nur Ziffernwörter 0-9 werden verkettet.
export function wordsToDigits(text) {
  const t = norm(text);
  return t
    .split(" ")
    .map((tok) => (/^\d+$/.test(tok) ? tok : DIGIT_WORDS[tok] && DIGIT_WORDS[tok].length === 1 ? DIGIT_WORDS[tok] : /^(plus|\+)/.test(tok) ? "+" : ""))
    .join("");
}

export const spellDigits = (s) => String(s).split("").join(" ");

// ---------- Kennzeichen ----------
const PLATE_FILLER = /^(mein|das|kennzeichen|lautet|ist|und|ähm|äh|also|hm|bindestrich|minus|strich|punkt|leerzeichen|nummernschild|autokennzeichen|schild|es|wäre|hat|hätte|von|meinem|auto|nummer|fahrzeug|bei|den|dem)$/;

export function parsePlate(text) {
  const tokens = norm(text).split(" ").filter((t) => t && !PLATE_FILLER.test(t));
  const parts = [];
  for (const tok of tokens) {
    if (SPELLING[tok]) parts.push({ k: "L", v: SPELLING[tok] });
    else if (DIGIT_WORDS[tok] && DIGIT_WORDS[tok].length === 1) parts.push({ k: "D", v: DIGIT_WORDS[tok] });
    else if (/^\d+$/.test(tok)) parts.push({ k: "D", v: tok });
    else if (/^[a-zäöü]{1,3}$/.test(tok)) parts.push({ k: "L", v: tok.toUpperCase() });
    else if (/^[a-zäöü]{1,3}\d{1,4}[eh]?$/.test(tok)) {
      const m = tok.match(/^([a-zäöü]{1,3})(\d{1,4})([eh]?)$/);
      parts.push({ k: "L", v: m[1].toUpperCase() }, { k: "D", v: m[2] });
      if (m[3]) parts.push({ k: "L", v: m[3].toUpperCase() });
    } else return null; // unbekanntes Wort -> lieber nachfragen
  }
  const firstDigit = parts.findIndex((p) => p.k === "D");
  if (firstDigit < 1) return null;
  const letters = parts.slice(0, firstDigit);
  if (letters.some((p) => p.k !== "L")) return null;
  const rest = parts.slice(firstDigit);
  const digits = rest.filter((p) => p.k === "D").map((p) => p.v).join("");
  const suffix = rest.filter((p) => p.k === "L").map((p) => p.v).join(""); // E / H
  if (digits.length < 1 || digits.length > 4 || suffix.length > 1) return null;

  // Stadtkürzel = erster Token, wenn getrennt gesprochen („M AB 1234“); sonst per Länge geraten.
  const joined = letters.map((p) => p.v);
  const all = joined.join("");
  if (all.length < 2 || all.length > 5) return null;
  let city, mid;
  const tail = joined.slice(1).join("");
  if (joined.length >= 2 && joined[0].length <= 3 && tail.length >= 1 && tail.length <= 2) {
    city = joined[0];
    mid = tail;
  } else {
    const cl = all.length >= 4 ? 2 : 1;
    city = all.slice(0, cl);
    mid = all.slice(cl);
    if (mid.length < 1 || mid.length > 2) return null;
  }
  return { city, mid, digits, suffix, display: `${city}-${mid} ${digits}${suffix}` };
}

export function spokenPlate(p) {
  return `${p.city.split("").join(" ")}, ${p.mid.split("").join(" ")}, ${spellDigits(p.digits)}${p.suffix ? ", " + p.suffix : ""}`;
}

// ---------- Telefonnummer ----------
export function parsePhone(text) {
  let d = wordsToDigits(text.replace(/\+/g, " plus "));
  const plus = d.startsWith("+");
  d = d.replace(/\D/g, "");
  if (plus) {
    if (d.startsWith("49")) d = "0" + d.slice(2);
    else return d.length >= 8 ? { raw: "+" + d } : null;
  }
  if (d.length < 6 || d.length > 15) return null;
  if (!d.startsWith("0")) return d.length >= 10 ? { raw: d } : null; // ohne Vorwahl -> nachfragen
  return { raw: d };
}

export function formatPhone(raw) {
  if (raw.startsWith("+")) return raw;
  // grob: Vorwahl (4 Ziffern bzw. 3 bei 015x/016x/017x) + Rest
  const areaLen = /^01[567]/.test(raw) ? 4 : raw.length > 9 ? 4 : 3;
  return `${raw.slice(0, areaLen)} ${raw.slice(areaLen)}`;
}

export const spokenPhone = (raw) => spellDigits(raw.replace(/^\+/, "plus ").replace(/\s/g, "")).replace("p l u s", "plus");

// ---------- Name ----------
const NAME_PREFIX = /^(also |ja |hallo |ähm |äh |okay |gut )*(ich heiße|ich heisse|mein name ist|mein name lautet|ich bin( der| die)?|hier ist|hier spricht|name ist|das ist|am apparat ist|ich heiße|mein nachname ist|nachname|vorname|mein vorname ist|ich)\s+/;

export function parseName(text) {
  let t = String(text ?? "").trim().replace(/[.,;:!?]/g, " ").replace(/\s+/g, " ");
  const lower = t.toLowerCase();
  const m = lower.match(NAME_PREFIX);
  if (m) t = t.slice(m[0].length);
  let salutation = null;
  t = t.replace(/^(herr|frau)\s+/i, (x) => {
    salutation = /herr/i.test(x) ? "Herr" : "Frau";
    return "";
  });
  t = t.replace(/\b(dr|prof)\.?\s+/gi, "");
  const tokens = t.split(" ").filter((w) => /^[A-Za-zÄÖÜäöüß'’-]{2,}$/.test(w) && !/^(und|ist|mein|name|bitte|danke)$/i.test(w));
  if (!tokens.length || tokens.length > 4) return null;
  const cap = tokens.map((w) => w[0].toUpperCase() + w.slice(1));
  return { salutation, tokens: cap };
}

// ---------- Adresse ----------
const cap = (str) => str.replace(/(^|[\s-])(\p{L})/gu, (_, sep, c) => sep + c.toUpperCase());

export function parseAddress(text) {
  let t = String(text ?? "")
    .replace(/[;!?]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(meine adresse (ist|lautet)|ich wohne (in der|im|am|an der|in|auf der)?|wohnhaft (in der|im|in)?|ich bin (in der|im|in|am)?|in der|im|am|an der|wir wohnen (in der|im|in)?|adresse|das ist|die adresse ist|hier)\s+/i, "");
  // Ziffernwörter für Hausnummern
  t = t.replace(/\b([a-zäöüß]+)\b(?=\s*(,|$| in | \d{5}))/gi, (w) => (DIGIT_WORDS[w.toLowerCase()] && !/^(ein|eine)$/i.test(w) ? DIGIT_WORDS[w.toLowerCase()] : w));
  const m = t.match(/^(.+?)\s*(\d{1,3}\s?[a-zA-Z]?)\b\s*(?:,|in|,\s*in)?\s*(?:(\d{5})\s*)?(.*)$/);
  if (!m) return null;
  const street = m[1].replace(/[,]$/, "").trim();
  if (!/[a-zäöüß]{3,}/i.test(street) || /^\d/.test(street)) return null;
  const capStreet = cap(street).replace(/str\.?$/i, "straße");
  const city = m[4].replace(/^(in|bei)\s+/i, "").replace(/[,]$/, "").trim();
  return {
    street: capStreet,
    houseNo: m[2].replace(/\s/g, "").toUpperCase(),
    zip: m[3] || null,
    city: city ? cap(city) : null,
  };
}

export function parseZip(text) {
  const m = String(text ?? "").match(/\b(\d{5})\b/);
  if (m) return m[1];
  const d = wordsToDigits(text);
  return /^\d{5}$/.test(d) ? d : null;
}

// ---------- Auswahl (Termine, Service Center) ----------
const ORDINALS = [
  [/(erste|erster|ersten|eins\b|\b1\b|oben|zuerst)/, 0],
  [/(zweite|zweiter|zweiten|zwei\b|\b2\b|mittlere)/, 1],
  [/(dritte|dritter|dritten|drei\b|\b3\b|letzte|letzten)/, 2],
];

export function parseChoice(text, options) {
  const t = norm(text);
  if (has(t, /\b(keiner|keine|kein|passt nicht|passen nicht|nichts davon|andere|anderen|später|früher|weitere|noch was|noch andere|nächste woche)\b/)) return "none";
  // Wochentag / Uhrzeit / „morgen“
  const days = ["sonntag", "montag", "dienstag", "mittwoch", "donnerstag", "freitag", "samstag"];
  const mentionedDay = days.findIndex((d) => t.includes(d));
  const timeMatch = t.match(/(\d{1,2})(?::(\d{2}))?\s*uhr(?:\s*(\d{2}))?/) || t.match(/\bum (\d{1,2})\b/);
  const candidates = options.map((o, i) => ({ o, i }));
  let filtered = candidates;
  if (mentionedDay >= 0) filtered = filtered.filter((c) => c.o.date.getDay() === mentionedDay);
  if (has(t, /\bübermorgen\b/)) filtered = filtered.filter((c) => c.o.daysFromNow === 2);
  else if (has(t, /\bmorgen\b/)) filtered = filtered.filter((c) => c.o.daysFromNow === 1);
  if (timeMatch) {
    const h = Number(timeMatch[1]);
    const min = Number(timeMatch[2] ?? timeMatch[3] ?? 0);
    const f2 = filtered.filter((c) => c.o.hour === h && (c.o.min ?? 0) === min);
    filtered = f2.length ? f2 : filtered.filter((c) => c.o.hour === h);
  }
  if (has(t, /\b(vormittag|vormittags|früh|morgens)\b/)) {
    const f = filtered.filter((c) => c.o.hour < 12);
    if (f.length) filtered = f;
  }
  if (has(t, /\b(nachmittag|nachmittags|später am tag|mittags?)\b/)) {
    const f = filtered.filter((c) => c.o.hour >= 12);
    if (f.length) filtered = f;
  }
  const constrained = mentionedDay >= 0 || timeMatch || has(t, /\b(übermorgen|morgen|vormittag|vormittags|früh|morgens|nachmittag|nachmittags|mittag|mittags)\b/);
  if (constrained && filtered.length >= 1) return filtered[0].i;
  for (const [re, idx] of ORDINALS) if (idx < options.length && has(t, re)) return idx;
  // Center-Name in der Antwort
  for (const c of candidates) if (c.o.name && t.includes(norm(c.o.name).split(" ").slice(-1)[0])) return c.i;
  return null;
}

export const stripHesitation = (t) => norm(t).replace(/\b(ähm|äh|hm|also|ja|okay)\b/g, "").trim();
