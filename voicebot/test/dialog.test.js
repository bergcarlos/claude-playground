import test from "node:test";
import assert from "node:assert/strict";
import { createSession, start, turn, SILENCE } from "../engine/dialog.js";
import { parsePlate, parsePhone, parseAddress, parseName } from "../engine/nlu.js";

test("Kennzeichen", () => {
  assert.equal(parsePlate("M AB 1234").display, "M-AB 1234");
  assert.equal(parsePlate("Martha Anton Berta eins zwei drei vier").display, "M-AB 1234");
  assert.equal(parsePlate("HH XY 99").display, "HH-XY 99");
  assert.equal(parsePlate("B MW 123 E").display, "B-MW 123E");
  assert.equal(parsePlate("das ist kompletter unsinn"), null);
});
test("Telefon", () => {
  assert.equal(parsePhone("null eins sieben zwei drei vier fünf sechs sieben acht neun").raw, "01723456789");
  assert.equal(parsePhone("plus 49 172 3456789").raw, "01723456789");
  assert.equal(parsePhone("123"), null);
});
test("Adresse", () => {
  assert.deepEqual(parseAddress("Ich wohne in der Musterstraße 12, 80331 München"), { street: "Musterstraße", houseNo: "12", zip: "80331", city: "München" });
  assert.equal(parseAddress("Hauptstraße 5a").houseNo, "5A");
  assert.equal(parseAddress("nur Text"), null);
});
test("Name", () => {
  assert.deepEqual(parseName("Mein Name ist Anna Müller"), { salutation: null, tokens: ["Anna", "Müller"] });
  assert.equal(parseName("Frau Schmidt").salutation, "Frau");
});

test("kompletter Ablauf", async () => {
  const s = createSession();
  const hello = start(s);
  assert.match(hello.text, /Carglass/);
  const say = async (t) => (await turn(s, t)).text;
  await say("Ich habe einen Steinschlag in der Frontscheibe");
  assert.equal(s.step, "insurance");
  await say("Teilkasko");
  assert.equal(s.step, "plate");
  await say("M AB 1234");
  assert.equal(s.sub, "plate_confirm");
  await say("ja");
  await say("Anna Müller");
  await say("null eins sieben zwei drei vier fünf sechs sieben acht neun");
  await say("ja stimmt");
  await say("Musterstraße 12, 80331 München");
  assert.equal(s.sub, "zip_home");
  await say("ja");
  assert.equal(s.sub, "center");
  await say("ja");
  assert.equal(s.sub, "slot");
  await say("den zweiten");
  assert.equal(s.sub, "confirm");
  const bye = await say("ja bitte");
  assert.ok(s.done);
  assert.match(bye, /gebucht/);
  assert.equal(s.booking.plate.display, "M-AB 1234");
});

test("Rückgängig, Seitenscheibe, Stille", async () => {
  const s = createSession();
  start(s);
  await turn(s, "Die Seitenscheibe ist kaputt, Vollkasko");
  assert.equal(s.slots.damage, "replace");
  assert.equal(s.step, "glass");
  await turn(s, "Beifahrerseite hinten");
  assert.equal(s.step, "plate");
  const r1 = await turn(s, SILENCE);
  assert.match(r1.text, /noch da/);
  await turn(s, SILENCE);
  assert.ok(s.done);
});

test("Reparatur Heckscheibe wird Austausch", async () => {
  const s = createSession();
  start(s);
  const r = await turn(s, "Steinschlag in der Heckscheibe");
  assert.equal(s.slots.damage, "replace");
  assert.match(r.text, /nicht möglich/);
});
