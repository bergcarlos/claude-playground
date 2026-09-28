// Dialogsteuerung des Terminbots (transportunabhängig).
//
//   const s = createSession();
//   const hello = start(s);              // -> { text, say }
//   const reply = await turn(s, "Ich habe einen Steinschlag");
//
// `text` ist die Anzeige, `say` die Sprechfassung (Ziffern einzeln, Kürzel buchstabiert).
// Browser-Prototyp und späterer Telefonie-Kanal (Twilio/Vapi/SIP) rufen nur diese zwei Funktionen auf.

import { randomUUID } from "node:crypto";
import {
  parseYesNo, parseDamage, parseGlass, parseInsurance, parsePlate, parsePhone, parseName,
  parseAddress, parseZip, parseChoice, glassLabel, INSURANCE_LABEL, formatPhone, spokenPhone, spokenPlate, norm,
} from "./nlu.js";
import { nearestCenters, centersByCity, proposeSlots } from "./centers.js";
import { BRAND, BOT_NAME } from "../config.js";

export const SILENCE = "__silence__";

const R = (text, say = text) => ({ text, say });
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const join = (...rs) => R(rs.map((r) => r.text).filter(Boolean).join(" "), rs.map((r) => r.say).filter(Boolean).join(" "));
const S = (t) => R(t);

const STEPS = [
  ["damage", (s) => !!s.slots.damage],
  ["glass", (s) => !!s.slots.glass && (s.slots.glass.type !== "side" || !!s.slots.glass.side)],
  ["insurance", (s) => !!s.slots.insurance],
  ["plate", (s) => !!s.slots.plate],
  ["name", (s) => !!s.slots.lastName],
  ["phone", (s) => !!s.slots.phone],
  ["address", (s) => !!s.slots.address],
  ["zip", (s) => !!s.slots.zip],
  ["center", (s) => !!s.slots.center],
  ["slot", (s) => !!s.slots.appointment],
];

export function createSession() {
  return {
    id: randomUUID(),
    step: "damage",
    sub: null,
    slots: {},
    ctx: { fails: {}, slotRound: 0 },
    silence: 0,
    lastAsk: null,
    lastAck: null,
    done: false,
    handover: false,
    log: [],
  };
}

// ---------- Begrüßung ----------
export function start(s) {
  const greet = R(
    `Herzlich willkommen bei ${BRAND}! Mein Name ist ${BOT_NAME}, ich bin die digitale Assistentin und helfe Ihnen dabei, in wenigen Minuten einen Termin für Ihre Autoscheibe zu vereinbaren. ` +
      `Ich verarbeite Ihre Angaben nur für die Terminbuchung.`
  );
  const ask = askDamage();
  s.lastAsk = ask;
  return join(greet, ask);
}

const askDamage = () => S("Was ist denn passiert: Haben Sie einen Steinschlag, der sich vielleicht noch reparieren lässt, oder muss die Scheibe komplett getauscht werden?");

// ---------- Fragen je Schritt ----------
function ask(s) {
  const step = nextStep(s);
  s.step = step;
  s.sub = null;
  let r;
  switch (step) {
    case "damage": r = askDamage(); break;
    case "glass":
      r = s.slots.glass?.type === "side"
        ? S("Welche Seite ist es – die Fahrerseite oder die Beifahrerseite?")
        : S("Welche Scheibe ist betroffen – die Frontscheibe, die Heckscheibe, eine Seitenscheibe oder das Dach?");
      break;
    case "insurance": r = S("Wie sind Sie versichert: Vollkasko, Teilkasko, oder zahlen Sie selbst?"); break;
    case "plate":
      r = S("Wie lautet Ihr Kennzeichen? Sagen Sie es einfach so, wie es auf dem Schild steht – gern auch buchstabiert.");
      break;
    case "name": r = S("Auf welchen Namen darf ich den Termin eintragen?"); break;
    case "phone": r = S("Unter welcher Telefonnummer erreichen wir Sie bei Rückfragen?"); break;
    case "address":
      r = S("Wie lautet Ihre Adresse? Also Straße, Hausnummer und wenn Sie mögen gleich die Postleitzahl und der Ort.");
      break;
    case "zip":
      if (s.slots.address?.zip && !s.ctx.zipAsked) {
        s.ctx.zipAsked = true;
        s.sub = "zip_home";
        r = R(
          `Soll das Service Center in der Nähe Ihrer Wohnadresse liegen, also rund um ${s.slots.address.zip}, oder suchen Sie an einem anderen Ort, zum Beispiel in der Nähe Ihrer Arbeit?`,
          `Soll das Service Center in der Nähe Ihrer Wohnadresse liegen, also rund um ${s.slots.address.zip.split("").join(" ")}, oder suchen Sie an einem anderen Ort, zum Beispiel in der Nähe Ihrer Arbeit?`
        );
      } else r = S("In welcher Stadt oder Postleitzahl soll das Service Center liegen?");
      break;
    case "center": r = askCenter(s); break;
    case "slot": r = askSlots(s); break;
    default: r = askConfirm(s);
  }
  s.lastAsk = r;
  return r;
}

const centerSay = (c) => `${c.name}, ${c.street} in ${c.city}`;
function askCenter(s) {
  s.sub = "center";
  const c = s.ctx.centerOptions[s.ctx.centerIdx];
  const first = s.ctx.centerIdx === 0;
  return S(`${first ? "Das nächstgelegene Service Center wäre" : "Alternativ gäbe es noch"} ${centerSay(c)}. ${first ? "Passt Ihnen das, oder soll ich noch ein weiteres nennen?" : "Wäre das eine Option?"}`);
}

function askSlots(s) {
  s.sub = "slot";
  const opts = proposeSlots(s.slots.center.id, s.slots.damage, s.ctx.slotRound);
  s.ctx.slotOptions = opts;
  const intro = s.ctx.slotRound === 0
    ? "Ich hätte diese Termine für Sie:"
    : "Kein Problem, hier sind drei weitere Möglichkeiten:";
  const listText = opts.map((o, i) => `${["Erstens", "Zweitens", "Drittens"][i]}: ${o.label}.`).join(" ");
  return S(`${intro} ${listText} Welcher passt Ihnen am besten?`);
}

function summaryLines(s) {
  const { slots } = s;
  const a = slots.address;
  return [
    ["Auftrag", `${slots.damage === "repair" ? "Reparatur" : slots.damage === "replace" ? "Austausch" : "Begutachtung"} – ${glassLabel(slots.glass)}`],
    ["Versicherung", INSURANCE_LABEL[slots.insurance]],
    ["Kennzeichen", slots.plate.display],
    ["Name", fullName(s)],
    ["Telefon", formatPhone(slots.phone)],
    ["Adresse", a.raw ?? `${a.street} ${a.houseNo}${a.zip ? ", " + a.zip : ""}${a.city ? " " + a.city : ""}`],
    ["Service Center", `${slots.center.name}, ${slots.center.street}, ${slots.center.zip} ${slots.center.city}`],
    ["Termin", slots.appointment.label],
  ];
}

function askConfirm(s) {
  s.sub = "confirm";
  const { slots } = s;
  const a = slots.address;
  const auftrag = slots.damage === "repair" ? "eine Reparatur" : slots.damage === "replace" ? "einen Austausch" : "eine Begutachtung";
  const plateSay = slots.plate.spoken ?? slots.plate.display;
  const recal = slots.glass.type === "front" && slots.damage !== "repair"
    ? " Bei einer Frontscheibe kalibrieren wir bei Bedarf gleich Ihre Fahrerassistenzsysteme mit, das ist dann im Termin enthalten."
    : "";
  const t = (phone, plate) =>
    `Dann fasse ich kurz zusammen: ${auftrag} an Ihrer ${glassLabel(slots.glass)}, Abrechnung als ${INSURANCE_LABEL[slots.insurance] === INSURANCE_LABEL.unknown ? "noch offen" : INSURANCE_LABEL[slots.insurance]}, ` +
    `Kennzeichen ${plate}, auf den Namen ${fullName(s)}, Rückrufnummer ${phone}. ` +
    `Ihr Termin ist am ${slots.appointment.label} im Service Center ${centerSay(slots.center)}.${recal} Soll ich den Termin so für Sie buchen?`;
  return R(t(formatPhone(slots.phone), slots.plate.display), t(spokenPhone(slots.phone), plateSay));
}

function fullName(s) {
  const { salutation, firstName, lastName } = s.slots;
  return [salutation, firstName, lastName].filter(Boolean).join(" ");
}
const politeName = (s) => (s.slots.salutation ? `${s.slots.salutation} ${s.slots.lastName}` : fullName(s));

function nextStep(s) {
  for (const [id, filled] of STEPS) if (!filled(s)) return id;
  return "confirm";
}

const ACKS = ["Alles klar.", "Verstanden.", "Okay, danke.", "Gut.", "Perfekt.", "Notiert."];
function ack(s) {
  let a;
  do a = pick(ACKS); while (a === s.lastAck);
  s.lastAck = a;
  return a;
}

const fail = (s, key) => (s.ctx.fails[key] = (s.ctx.fails[key] ?? 0) + 1);
const resetFail = (s, key) => (s.ctx.fails[key] = 0);

function endHandover(s, why) {
  s.done = true;
  s.handover = true;
  return S(why ?? "Kein Problem, ich verbinde Sie mit einem Kollegen aus unserem Team, der Ihnen persönlich weiterhilft. Einen Moment bitte.");
}

// ---------- Haupteinstieg pro Gesprächsrunde ----------
export async function turn(s, input, deps = {}) {
  if (s.done) return S("Das Gespräch ist bereits beendet.");
  const text = String(input ?? "").trim();
  s.log.push({ role: "user", text });

  let reply;
  if (text === SILENCE || !text) {
    s.silence++;
    if (s.silence >= 2) {
      s.done = true;
      reply = S("Ich kann Sie leider nicht hören. Sie erreichen uns jederzeit wieder, wenn Sie einen Termin vereinbaren möchten. Auf Wiederhören!");
    } else reply = join(S("Hallo? Sind Sie noch da? Ich wiederhole gern meine Frage."), s.lastAsk);
  } else {
    s.silence = 0;
    reply = await route(s, text, deps);
  }
  s.log.push({ role: "bot", text: reply.text });
  return reply;
}

async function route(s, text, deps) {
  const t = norm(text);
  if (/\b(mitarbeiter|mitarbeiterin|berater|beraterin|echten mensch|einen menschen|kundenservice|kundenberater|mit jemandem sprechen|person sprechen)\b/.test(t)) return endHandover(s);
  if (/\b(abbrechen|auflegen|tschüss|tschüs|auf wiedersehen|doch nicht|kein interesse|vergiss es)\b/.test(t)) {
    s.done = true;
    return S("Schade, aber kein Problem. Falls Sie es sich anders überlegen, rufen Sie uns jederzeit gerne wieder an. Auf Wiederhören!");
  }
  if (/\b(wiederhol|noch ?mal|wie bitte|bitte was|nicht verstanden|verstehe ich nicht|was war die frage|hab ich nicht verstanden)\b/.test(t) && s.sub !== "confirm") {
    return join(S("Natürlich, gern noch einmal:"), s.lastAsk);
  }
  const handler = HANDLERS[s.step] ?? handleConfirm;
  return handler(s, text, deps);
}

// ---------- Handler ----------
async function handleEarly(s, text, deps) {
  const { slots, ctx } = s;
  const notes = [];

  let hit = false;

  // Sonderfall: Seite nachgefragt
  if (slots.glass?.type === "side" && !slots.glass.side) {
    const g = parseGlass(text);
    const t = norm(text);
    const side = /rechts|beifahrer/.test(t) ? "rechts" : /links|fahrer/.test(t) ? "links" : null;
    if (side) {
      hit = true;
      slots.glass.side = side;
      if (/hinten|hintere/.test(t)) slots.glass.pos = "hinten";
      else if (/vorne|vordere/.test(t)) slots.glass.pos = "vorne";
    } else if (g && g.type !== "side") { slots.glass = g; hit = true; }
  }

  if (!slots.damage) {
    const d = parseDamage(text);
    if (d === "repair" || d === "replace") { slots.damage = d; hit = true; }
    else if (d === "unsure") {
      if (fail(s, "damage") >= 2) { slots.damage = "check"; hit = true; notes.push(S("Kein Problem, das schauen sich unsere Experten vor Ort genau an und entscheiden dann, ob repariert oder getauscht wird.")); }
      else return S("Kein Problem. Als Faustregel: Ist es nur ein kleiner Einschlag, ungefähr so groß wie eine Zwei-Euro-Münze, lässt er sich meistens reparieren. Ist die Scheibe aber gerissen oder splittert sie, muss sie getauscht werden. Was trifft bei Ihnen eher zu?");
    }
  }
  if (!slots.glass) {
    const g = parseGlass(text);
    if (g) { slots.glass = g; hit = true; }
  }
  if (!slots.insurance) {
    const i = parseInsurance(text);
    if (i === "kasko?") return S("Ist es eine Vollkasko oder eine Teilkasko? Das steht meistens in Ihrem Versicherungsschein. Wenn Sie es nicht wissen, sagen Sie einfach „weiß ich nicht“.");
    if (i) { slots.insurance = i; hit = true; }
  }

  if (!hit && deps.llm) {
    const r = await deps.llm.extract("early", text, s).catch(() => null);
    if (r) {
      if (!slots.damage && (r.damage === "repair" || r.damage === "replace")) { slots.damage = r.damage; hit = true; }
      if (!slots.glass && r.glass?.type) { slots.glass = { type: r.glass.type, side: r.glass.side ?? null, pos: r.glass.pos ?? null }; hit = true; }
      if (!slots.insurance && ["voll", "teil", "self", "unknown"].includes(r.insurance)) { slots.insurance = r.insurance; hit = true; }
    }
  }

  if (!hit && !notes.length) {
    const k = fail(s, s.step);
    if (k >= 3) return endHandover(s, "Entschuldigung, das klappt gerade nicht so gut. Ich verbinde Sie lieber mit einem Kollegen, der Ihnen persönlich weiterhilft.");
    const again = {
      damage: "Entschuldigung, das habe ich nicht ganz verstanden. Geht es um einen Steinschlag oder um eine Scheibe, die getauscht werden muss?",
      glass: "Entschuldigung, welche Scheibe genau meinen Sie? Zum Beispiel die Frontscheibe, die Heckscheibe oder eine Seitenscheibe.",
      insurance: "Entschuldigung, das habe ich nicht verstanden. Sind Sie Vollkasko oder Teilkasko versichert, oder zahlen Sie selbst?",
    }[s.step];
    return S(again);
  }

  // Fachregel: Nur Frontscheiben (Verbundglas) lassen sich reparieren.
  if (slots.damage === "repair" && slots.glass && slots.glass.type !== "front") {
    slots.damage = "replace";
    notes.push(S(`Bei ${slots.glass.type === "rear" ? "der Heckscheibe" : slots.glass.type === "roof" ? "Dachscheiben" : "Seitenscheiben"} ist eine Reparatur leider nicht möglich, da das Glas dort gehärtet ist. Die Scheibe wird deshalb getauscht.`));
  }
  if (slots.insurance === "teil" && slots.damage === "repair") notes.push(S("Bei einer Reparatur fällt bei Teilkasko in der Regel keine Selbstbeteiligung an."));
  if (slots.insurance === "voll" || (slots.insurance === "teil" && slots.damage !== "repair")) notes.push(S("Um die Abwicklung mit Ihrer Versicherung kümmern wir uns direkt."));

  resetFail(s, s.step);
  return join(S(ack(s)), ...notes, ask(s));
}

async function handlePlate(s, text) {
  const yn = parseYesNo(text);
  if (s.sub === "plate_confirm" && !parsePlate(text)) {
    if (yn === "yes") {
      s.slots.plate = s.ctx.plateCand;
      resetFail(s, "plate");
      return join(S(ack(s)), ask(s));
    }
    if (yn === "no") {
      fail(s, "plate");
      s.sub = null;
      return S("Kein Problem, dann noch einmal. Am besten buchstabieren Sie langsam, zum Beispiel „M wie Martha, A wie Anton, B wie Berta, eins zwei drei vier“.");
    }
  }
  const p = parsePlate(text);
  if (!p) {
    if (fail(s, "plate") >= 3) {
      s.slots.plate = { display: "wird im Service Center aufgenommen", spoken: "wird im Service Center aufgenommen" };
      return join(S("Das Kennzeichen klären wir einfach im Service Center vor Ort."), ask(s));
    }
    return S("Das Kennzeichen habe ich leider nicht richtig verstanden. Bitte sagen Sie es noch einmal, gern buchstabiert, zum Beispiel „Martha, Anton, Berta, eins zwei drei vier“.");
  }
  s.ctx.plateCand = { ...p, spoken: spokenPlate(p) };
  s.sub = "plate_confirm";
  const r = R(`Ich habe ${p.display} verstanden. Stimmt das?`, `Ich habe ${spokenPlate(p)} verstanden. Stimmt das?`);
  s.lastAsk = r;
  return r;
}

async function handleName(s, text, deps) {
  let n = parseName(text);
  if (!n && deps.llm) {
    const r = await deps.llm.extract("name", text, s).catch(() => null);
    if (r?.lastName) n = { salutation: r.salutation ?? null, tokens: [r.firstName, r.lastName].filter(Boolean) };
  }
  if (!n) {
    if (fail(s, "name") >= 3) return endHandover(s);
    return S("Entschuldigung, den Namen habe ich nicht verstanden. Können Sie ihn bitte noch einmal sagen, gern auch buchstabiert?");
  }
  if (s.ctx.nameHalf) {
    s.slots.firstName = s.ctx.nameHalf;
    s.slots.lastName = n.tokens.join(" ");
    s.ctx.nameHalf = null;
  } else if (n.tokens.length === 1 && !n.salutation) {
    s.ctx.nameHalf = n.tokens[0];
    const r = S(`Danke, ${n.tokens[0]}. Und wie lautet Ihr Nachname?`);
    s.lastAsk = r;
    return r;
  } else {
    s.slots.salutation = n.salutation;
    s.slots.lastName = n.tokens[n.tokens.length - 1];
    s.slots.firstName = n.tokens.length > 1 ? n.tokens.slice(0, -1).join(" ") : null;
  }
  resetFail(s, "name");
  const nice = s.slots.salutation ? `${s.slots.salutation} ${s.slots.lastName}` : fullName(s);
  return join(S(`Danke, ${nice}.`), ask(s));
}

async function handlePhone(s, text) {
  if (s.sub === "phone_confirm") {
    const yn = parseYesNo(text);
    const again = parsePhone(text);
    if (yn === "yes" && !again) {
      s.slots.phone = s.ctx.phoneCand;
      return join(S(ack(s)), ask(s));
    }
    if (yn === "no" && !again) {
      s.sub = null;
      return S("Okay, dann noch einmal die Nummer, bitte in Ruhe Ziffer für Ziffer.");
    }
  }
  const p = parsePhone(text);
  if (!p) {
    if (fail(s, "phone") >= 3) return endHandover(s);
    return S("Die Nummer habe ich leider nicht ganz verstanden. Bitte sagen Sie sie noch einmal, am besten mit Vorwahl und Ziffer für Ziffer.");
  }
  s.ctx.phoneCand = p.raw;
  s.sub = "phone_confirm";
  const r = R(`Ich habe ${formatPhone(p.raw)} notiert. Ist das korrekt?`, `Ich habe ${spokenPhone(p.raw)} notiert. Ist das korrekt?`);
  s.lastAsk = r;
  return r;
}

async function handleAddress(s, text, deps) {
  let a = parseAddress(text);
  if (!a && deps.llm) {
    const r = await deps.llm.extract("address", text, s).catch(() => null);
    if (r?.street && r?.houseNo) a = { street: r.street, houseNo: String(r.houseNo), zip: r.zip ?? null, city: r.city ?? null };
  }
  if (!a) {
    if (fail(s, "address") >= 3) {
      s.slots.address = { raw: text };
      return join(S("Ich notiere das so, wie ich es verstanden habe, das prüfen wir im Service Center noch einmal."), ask(s));
    }
    return S("Die Adresse habe ich nicht ganz verstanden. Bitte nennen Sie mir Straße und Hausnummer, zum Beispiel „Musterstraße 12“.");
  }
  s.slots.address = a;
  if (a.zip) s.ctx.zipAsked = false;
  const line = `${a.street} ${a.houseNo}${a.zip ? ` in ${a.zip}` : ""}${a.city ? ` ${a.city}` : ""}`;
  const say = `${a.street} ${a.houseNo.replace(/(\d)/g, "$1 ").trim()}${a.zip ? `, in ${a.zip.split("").join(" ")}` : ""}${a.city ? ` ${a.city}` : ""}`;
  resetFail(s, "address");
  return join(R(`Ich notiere: ${line}.`, `Ich notiere: ${say}.`), ask(s));
}

function startCenterSearch(s, zip) {
  s.slots.zip = zip;
  s.ctx.centerOptions = nearestCenters(zip, 3);
  s.ctx.centerIdx = 0;
}

async function handleZip(s, text) {
  const t = norm(text);
  let zip = parseZip(text);
  if (!zip) {
    const cities = centersByCity(text);
    if (cities.length) zip = cities[0].zip;
  }
  if (!zip && s.slots.address?.zip && (s.sub === "zip_home" || /(wohnort|zuhause|zu hause|wohnadresse|wie oben|gleiche|bei mir|hier)/.test(t))) {
    const yn = parseYesNo(text);
    if (yn !== "no") zip = s.slots.address.zip;
    else return S("Alles klar. In welcher Stadt oder Postleitzahl soll es dann sein?");
  }
  if (!zip && /(wohnort|zuhause|zu hause|wohnadresse|wie oben|gleiche|bei mir)/.test(t)) return S("Dann brauche ich noch die Postleitzahl Ihres Wohnorts. Wie lautet sie?");
  if (!zip) {
    if (fail(s, "zip") >= 3) return endHandover(s);
    return S("Die Stadt oder Postleitzahl habe ich nicht verstanden. Nennen Sie mir bitte zum Beispiel „Hamburg“ oder die fünf Ziffern der Postleitzahl.");
  }
  startCenterSearch(s, zip);
  resetFail(s, "zip");
  return join(S(ack(s)), ask(s));
}

async function handleCenter(s, text) {
  const opts = s.ctx.centerOptions;
  const newZip = parseZip(text) ?? centersByCity(text)[0]?.zip;
  const yn = parseYesNo(text);
  if (newZip && yn !== "yes") {
    startCenterSearch(s, newZip);
    return join(S(ack(s)), ask(s));
  }
  const idxWord = /\b(erste|erstes|ersten)\b/.test(norm(text)) ? 0 : /\b(zweite|zweites|zweiten)\b/.test(norm(text)) ? 1 : null;
  if (yn === "yes" || idxWord !== null) {
    s.slots.center = opts[idxWord ?? s.ctx.centerIdx];
    s.ctx.slotRound = 0;
    return join(S(ack(s)), ask(s));
  }
  if (yn === "no") {
    s.ctx.centerIdx++;
    if (s.ctx.centerIdx >= opts.length) {
      s.slots.zip = null;
      s.ctx.centerIdx = 0;
      return S("Mehr Service Center in dieser Gegend habe ich leider nicht. Möchten Sie es in einer anderen Stadt oder Postleitzahl versuchen?");
    }
    return ask(s);
  }
  return S("Passt Ihnen dieses Service Center? Sie können auch mit Ja oder Nein antworten.");
}

async function handleSlot(s, text) {
  const opts = s.ctx.slotOptions;
  const choice = parseChoice(text, opts);
  if (choice === "none") {
    s.ctx.slotRound++;
    if (s.ctx.slotRound >= 3) return endHandover(s, "Das passt leider alles nicht. Ich verbinde Sie mit einem Kollegen, der mit Ihnen einen passenden Termin findet. Einen Moment bitte.");
    s.slots.appointment = null;
    return ask(s);
  }
  if (choice === null) {
    if (fail(s, "slot") >= 3) return endHandover(s);
    return S("Welchen Termin darf ich für Sie eintragen? Sie können zum Beispiel „den ersten“ oder „Donnerstag um 9 Uhr“ sagen, oder „keiner passt“.");
  }
  s.slots.appointment = opts[choice];
  resetFail(s, "slot");
  return join(S(`Gut, dann ${opts[choice].label}.`), ask(s));
}

const CHANGE_MAP = [
  [/(name|namen)/, ["salutation", "firstName", "lastName"]],
  [/(telefon|nummer|rufnummer|handy)/, ["phone"]],
  [/(adresse|straße|wohnort)/, ["address"]],
  [/(kennzeichen|nummernschild)/, ["plate"]],
  [/(versicherung|kasko|selbst)/, ["insurance"]],
  [/(termin|uhrzeit|datum|zeit|tag)/, ["appointment"]],
  [/(service center|center|werkstatt|standort|ort|plz|postleitzahl)/, ["zip", "center", "appointment"]],
  [/(schaden|reparatur|austausch|steinschlag)/, ["damage", "appointment"]],
  [/(scheibe)/, ["glass"]],
];

async function handleConfirm(s, text) {
  if (s.sub === "change") {
    const t = norm(text);
    const hit = CHANGE_MAP.find(([re]) => re.test(t));
    if (!hit) return S("Das habe ich nicht verstanden. Was möchten Sie ändern: den Namen, die Telefonnummer, die Adresse, das Kennzeichen, das Service Center oder den Termin?");
    for (const k of hit[1]) delete s.slots[k];
    if (hit[1].includes("zip")) s.ctx.zipAsked = true;
    if (hit[1].includes("appointment")) s.ctx.slotRound = 0;
    return join(S("Klar, das ändern wir."), ask(s));
  }
  const yn = parseYesNo(text);
  if (yn === "yes") {
    s.done = true;
    const r = R(
      `Wunderbar, Ihr Termin ist gebucht, ${politeName(s)}! Sie bekommen gleich eine Bestätigung per SMS auf Ihre Handynummer. ` +
        `Bitte bringen Sie zum Termin Ihren Fahrzeugschein und, falls vorhanden, Ihre Versicherungsdaten mit. ` +
        `Vielen Dank für Ihr Vertrauen, kommen Sie gut hin, und bis bald bei ${BRAND}. Auf Wiederhören!`
    );
    s.booking = { ...s.slots, summary: summaryLines(s) };
    return r;
  }
  if (yn === "no") {
    s.sub = "change";
    return S("Kein Problem. Was soll ich ändern?");
  }
  return S("Soll ich den Termin so für Sie buchen? Bitte antworten Sie mit Ja oder Nein.");
}

const HANDLERS = {
  damage: handleEarly,
  glass: handleEarly,
  insurance: handleEarly,
  plate: handlePlate,
  name: handleName,
  phone: handlePhone,
  address: handleAddress,
  zip: handleZip,
  center: handleCenter,
  slot: handleSlot,
  confirm: handleConfirm,
};

// Für die UI: aktueller Stand der erfassten Daten.
export function publicState(s) {
  const { slots } = s;
  return {
    step: s.step,
    done: s.done,
    handover: s.handover,
    fields: {
      Schaden: slots.damage ? (slots.damage === "repair" ? "Reparatur" : slots.damage === "replace" ? "Austausch" : "Begutachtung") : null,
      Scheibe: slots.glass ? glassLabel(slots.glass) : null,
      Versicherung: slots.insurance ? INSURANCE_LABEL[slots.insurance] : null,
      Kennzeichen: slots.plate?.display ?? null,
      Name: slots.lastName ? fullName(s) : null,
      Telefon: slots.phone ? formatPhone(slots.phone) : null,
      Adresse: slots.address ? (slots.address.raw ?? `${slots.address.street} ${slots.address.houseNo}${slots.address.zip ? ", " + slots.address.zip : ""}${slots.address.city ? " " + slots.address.city : ""}`) : null,
      "Service Center": slots.center ? `${slots.center.name}` : null,
      Termin: slots.appointment?.label ?? null,
    },
  };
}
