// Optionaler Claude-Fallback für Freitext, den die Regeln nicht verstehen.
// Ohne ANTHROPIC_API_KEY ist `llm` null und der Bot läuft rein regelbasiert.

const KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001";

const SCHEMAS = {
  early: `{"damage":"repair|replace|null","glass":{"type":"front|rear|side|roof","side":"links|rechts|null","pos":"vorne|hinten|null"}|null,"insurance":"voll|teil|self|unknown|null"}`,
  name: `{"salutation":"Herr|Frau|null","firstName":"string|null","lastName":"string|null"}`,
  address: `{"street":"string","houseNo":"string","zip":"5 Ziffern|null","city":"string|null"}`,
};

export const llm = KEY
  ? {
      async extract(kind, text) {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "content-type": "application/json", "x-api-key": KEY, "anthropic-version": "2023-06-01" },
          body: JSON.stringify({
            model: MODEL,
            max_tokens: 200,
            system:
              "Du extrahierst Felder aus einer deutschen Spracherkennungs-Transkription (kann Fehler enthalten) für einen Werkstatttermin für Autoscheiben. " +
              "Antworte ausschließlich mit einem JSON-Objekt nach diesem Schema, unbekannte Felder als null: " + SCHEMAS[kind],
            messages: [{ role: "user", content: text }],
          }),
          signal: AbortSignal.timeout(4000),
        });
        if (!res.ok) return null;
        const data = await res.json();
        const raw = data.content?.[0]?.text ?? "";
        const m = raw.match(/\{[\s\S]*\}/);
        return m ? JSON.parse(m[0]) : null;
      },
    }
  : null;
