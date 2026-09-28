// Mock-Daten: Service Center und Terminverfügbarkeit.
// Für die Produktion durch echte Schnittstellen (Filialsuche, Terminkalender) ersetzen.

export const CENTERS = [
  { id: "B1", name: "Berlin-Mitte", street: "Invalidenstraße 100", zip: "10115", city: "Berlin" },
  { id: "B2", name: "Berlin-Tempelhof", street: "Tempelhofer Damm 150", zip: "12099", city: "Berlin" },
  { id: "HH1", name: "Hamburg-Altona", street: "Von-Sauer-Straße 3", zip: "22761", city: "Hamburg" },
  { id: "HH2", name: "Hamburg-Wandsbek", street: "Wandsbeker Zollstraße 10", zip: "22041", city: "Hamburg" },
  { id: "M1", name: "München-Nord", street: "Ingolstädter Straße 45", zip: "80807", city: "München" },
  { id: "M2", name: "München-Ost", street: "Neuhauser Straße 8", zip: "81677", city: "München" },
  { id: "K1", name: "Köln-Ehrenfeld", street: "Vogelsanger Straße 200", zip: "50825", city: "Köln" },
  { id: "D1", name: "Düsseldorf-Flingern", street: "Höhenstraße 25", zip: "40227", city: "Düsseldorf" },
  { id: "F1", name: "Frankfurt-Ost", street: "Hanauer Landstraße 120", zip: "60314", city: "Frankfurt am Main" },
  { id: "S1", name: "Stuttgart-Zuffenhausen", street: "Ludwigsburger Straße 60", zip: "70435", city: "Stuttgart" },
  { id: "N1", name: "Nürnberg-Süd", street: "Regensburger Straße 90", zip: "90478", city: "Nürnberg" },
  { id: "H1", name: "Hannover-List", street: "Podbielskistraße 33", zip: "30163", city: "Hannover" },
  { id: "L1", name: "Leipzig-Mitte", street: "Torgauer Straße 12", zip: "04347", city: "Leipzig" },
  { id: "DD1", name: "Dresden-Neustadt", street: "Bautzner Straße 40", zip: "01099", city: "Dresden" },
  { id: "HB1", name: "Bremen-Hemelingen", street: "Hannoversche Straße 5", zip: "28309", city: "Bremen" },
];

const zipNum = (z) => Number(z);

// Nächstgelegene Center nach PLZ-Abstand (grobe Näherung für den Prototyp).
export function nearestCenters(zip, n = 2) {
  const z = zipNum(zip);
  return [...CENTERS]
    .sort((a, b) => Math.abs(zipNum(a.zip) - z) - Math.abs(zipNum(b.zip) - z))
    .slice(0, n);
}

export function centersByCity(text) {
  const t = text.toLowerCase();
  const hit = CENTERS.filter((c) => t.includes(c.city.toLowerCase().split(" ")[0]));
  return hit;
}

// ---------- Termine ----------
const WEEKDAYS = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
const MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

function addBusinessDays(from, n) {
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  while (n > 0) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) n--;
  }
  return d;
}

const TIMES = [
  [8, 0],
  [9, 30],
  [11, 0],
  [13, 0],
  [14, 30],
  [16, 0],
];

// Deterministisch, aber „lebendig“: drei Vorschläge ab frühestem Termin.
export function proposeSlots(centerId, damage, round = 0, now = new Date()) {
  const lead = damage === "repair" ? 1 : 2; // Reparatur ist schneller verfügbar als Austausch
  const seed = [...centerId].reduce((a, c) => a + c.charCodeAt(0), 0);
  const day0 = addBusinessDays(now, lead + round);
  const day1 = addBusinessDays(day0, 1);
  const a = (seed + round) % TIMES.length;
  const b = (a + 3) % TIMES.length; // gleicher Tag, anderer Zeitraum (Vor-/Nachmittag)
  const [early, late] = a < b ? [a, b] : [b, a];
  const raw = [
    [day0, TIMES[early]],
    [day0, TIMES[late]],
    [day1, TIMES[(a + 1) % TIMES.length]],
  ];
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  return raw.map(([d, [h, m]]) => {
    const date = new Date(d);
    date.setHours(h, m, 0, 0);
    return {
      date,
      hour: h,
      min: m,
      daysFromNow: Math.round((d - startOfToday) / 86400000),
      label: formatSlot(date),
    };
  });
}

export function formatSlot(date) {
  const time = date.getMinutes() ? `${date.getHours()} Uhr ${date.getMinutes()}` : `${date.getHours()} Uhr`;
  return `${WEEKDAYS[date.getDay()]}, den ${date.getDate()}. ${MONTHS[date.getMonth()]}, um ${time}`;
}
