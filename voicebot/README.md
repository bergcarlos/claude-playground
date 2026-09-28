# Voicebot Werkstatttermin (Prototyp)

Deutscher Voicebot, der einen Werkstatttermin für **Scheibenreparatur oder -austausch** vereinbart
(VGRRR: Vehicle Glass Repair, Replace, Recalibration). Läuft als Prototyp im Browser, die
Dialoglogik ist so getrennt, dass sie später unverändert an Telefonie angeschlossen werden kann.

## Starten

```bash
cd voicebot
npm start              # http://localhost:3000  (Chrome oder Edge empfohlen)
npm test               # Unit- und Ablauftests der Dialoglogik
```

Ohne weitere Einrichtung läuft alles mit Browser-Stimme und Regel-NLU. Für die **natürlichste Sprache**:

| Variable | Wirkung |
|---|---|
| `ELEVENLABS_API_KEY` | Sprachausgabe über ElevenLabs (Modell `eleven_multilingual_v2`, Sätze werden vorgeladen) |
| `ELEVENLABS_VOICE_ID` | Stimme aus der ElevenLabs Voice Library. Nimm eine deutsche weibliche Stimme, die dir gefällt |
| `ELEVENLABS_MODEL` | z. B. `eleven_turbo_v2_5` für geringere Latenz |
| `ANTHROPIC_API_KEY` | Optional: Claude als Fallback, wenn die Regeln Namen, Adressen oder Schadensangaben nicht verstehen |
| `BRAND_NAME`, `BOT_NAME` | Marke und Name der Assistentin (Standard: „Carglass“, „Lena“) |

## Ablauf

1. Jingle und Begrüßung
2. Schadensart (Steinschlag/Reparatur oder Austausch) und Scheibe
3. Versicherung (Vollkasko, Teilkasko, Selbstzahler)
4. Kennzeichen (auch buchstabiert, z. B. „Martha Anton Berta …“) mit Rückfrage
5. Name, Telefonnummer (mit Rückfrage), Adresse
6. Wunschort (PLZ oder Stadt) und Service Center
7. Drei Terminvorschläge, Auswahl per „den zweiten“, „Donnerstag um 9 Uhr“ oder „keiner passt“
8. Zusammenfassung, Bestätigung (Änderungswünsche möglich), Verabschiedung

Fachregeln: Nur Frontscheiben werden repariert (Heck-, Seiten- und Dachscheiben werden getauscht);
bei Frontscheiben-Austausch wird die Kalibrierung der Assistenzsysteme erwähnt. Mehrere Angaben in einem Satz
(„Steinschlag in der Frontscheibe, ich bin Vollkasko versichert“) werden in einem Rutsch erfasst.
Bei Stille, Verständnisproblemen oder dem Wunsch nach einem Menschen gibt es eine Übergabe.

## Architektur

```
engine/nlu.js      Regel-NLU (Kennzeichen, Telefon, Adresse, Namen, Auswahl …)
engine/dialog.js   Zustandsautomat: createSession() / start() / turn(session, text) -> {text, say}
engine/centers.js  Mock: Service Center und Terminvorschläge  -> durch echte Schnittstellen ersetzen
engine/llm.js      Optionaler Claude-Fallback
server.js          HTTP-API (/api/session, /api/turn, /api/tts) + statische UI
public/            Browser-UI: Mikrofon (Web Speech API), Wiedergabe, Jingle
```

`turn()` bekommt Text und liefert Text (`text` zur Anzeige, `say` als Sprechfassung mit einzeln
gesprochenen Ziffern). Der Kanal ist austauschbar.

## Weg zur Telefonie

Ersetze in der Browser-UI nur Ein- und Ausgabe, `engine/` bleibt gleich:

1. Telefonie-Anbieter mit Streaming-Sprache (z. B. Twilio Media Streams, Vapi, Retell oder SIP über LiveKit).
2. Streaming-STT mit deutscher Sprache (z. B. Deepgram, Azure, Google) liefert den Text an `turn()`.
3. `say` geht an ElevenLabs (Streaming-TTS) und zurück ins Telefonat. Die Zustände `done`/`handover` steuern Auflegen und Weiterleiten.
4. Sitzungen pro Anruf-ID statt im Speicher (Redis o. Ä.); `SILENCE` wird vom Anbieter bei Sprechpausen gesendet.
5. Barge-in (Unterbrechen der Bot-Stimme) ist im Browser-Prototyp bewusst nicht enthalten und kommt mit Streaming-Telefonie.

## Jingle

`public/jingle.js` erzeugt eine **eigene, synthetische Platzhalter-Melodie** (G-Dur-Pentatonik, Glockenspiel-Klang),
die sich nicht an ein bestehendes Markenjingle anlehnt. Für die Produktion lizenzierte Datei als
`public/audio/jingle.mp3` ablegen; sie wird automatisch bevorzugt.

## Bekannte Grenzen des Prototyps

- Service Center, Verfügbarkeiten und die Buchung sind Testdaten. Es wird nichts gebucht und keine SMS versendet.
- Kennzeichen wird aus dem Gesprochenen erkannt, es gibt keine Fahrzeugdaten-Abfrage (HSN/TSN).
- Die Web Speech API funktioniert nur zuverlässig in Chrome und Edge.
