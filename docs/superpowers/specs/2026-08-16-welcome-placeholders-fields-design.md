# Design: Welcome-Umbau — Platzhalter & konfigurierbare Embed-Felder (Phase H)

Datum: 2026-08-16
Status: Freigegeben durch User (2026-08-16)

## Ziel

Das Willkommenssystem (Kanal-Embed + DM + Auto-Rollen) wird erweitert: zusätzliche Platzhalter und konfigurierbare Embed-Felder. Bestehende Konfigurationen bleiben unverändert gültig (kein Breaking Change).

## Entscheidungen (mit User geklärt)

| Frage | Entscheidung |
|---|---|
| Kernziel | Embed erweitern |
| Umfang | Mehr Platzhalter + konfigurierbare Embed-Felder; keine Buttons, keine separate DM-Nachricht |
| Neue Platzhalter | `{join_date}`, `{user_count}`, `{bot_count}` |
| `{user}` | Bleibt Ping (`<@id>`), `{username}` bleibt reiner Name — unverändert |
| Feld-Konfiguration | Wiederholbare Eingaben (Name/Wert/Inline) im Dashboard-Formular |

## Ansatz

**A — Erweiterung der bestehenden `eghr_welcome_messages`**: `embed_data.fields` als JSONB-Array, `renderTemplate` erweitert. Keine Migration (JSONB-Spalte).

## Bot-Verhalten

### Platzhalter (`renderTemplate`)

| Platzhalter | Ergebnis |
|---|---|
| `{user}` | Ping `<@id>` (unverändert) |
| `{username}` | Reiner Nutzername (unverändert) |
| `{server}` | Servername (unverändert) |
| `{member_count}` | Server-Mitgliederzahl (unverändert) |
| `{join_date}` | Beitrittsdatum des Mitglieds, `DD.MM.YYYY` (Fallback: heute) |
| `{user_count}` | Anzahl Nicht-Bot-Mitglieder |
| `{bot_count}` | Anzahl Bot-Mitglieder |

- Unbekannte Platzhalter bleiben unangetastet (kein Fehler).

### Embed-Felder

- `embed_data.fields` = Array aus `{ name, value, inline }` (alle Strings/Booleans).
- Je Feld: `embed.addFields({ name: renderTemplate(name), value: renderTemplate(value), inline: !!inline })`.
- Limit 25 Felder (Discord-Limit); darüber liegende werden verworfen + Log-Warnung.
- Ungültiges `fields` (kein Array) → ignoriert.
- Feld mit leerem Name oder Wert → übersprungen.
- DM-Nachricht nutzt dieselben Felder wie das Kanal-Embed.

### Ablauf `handleMemberJoin`

1. Config laden; nicht aktiv oder kein Kanal → nichts tun.
2. Titel/Beschreibung/Farbe/Image/Thumbnail rendern (unverändert).
3. Felder rendern (neu).
4. Kanal-Embed senden.
5. DM (falls `dm_enabled`) mit denselben Embed-Inhalten.
6. Auto-Rollen vergeben (unverändert).

### Fehlerfälle

| Fall | Verhalten |
|---|---|
| `fields` kein Array | Ignorieren |
| Feld leer (Name oder Wert) | Überspringen |
| Mehr als 25 Felder | Nach 25 stoppen + Log-Warnung |
| `join_date` nicht verfügbar | Heutiges Datum |

## Dashboard

- `_management.ejs` Sektion `sec-willkommen`: Block „Embed-Felder" unter den bestehenden Feldern — wiederholbare Zeilen (Feldname, Wert, Inline-Checkbox) + „Feld hinzufügen" (clientseitig). Bestehende Konfiguration wird zurückgerendert.
- `managementAdmin.js` Aktion `save`: `fields` aus dem Formular auslesen (mehrere Name/Wert/Inline-Gruppen), nur vollständig gefüllte Paare übernehmen, als `embed_data.fields` speichern.
- i18n de+en: Labels „Embed-Felder", „Feld hinzufügen", „Feldname", „Wert", „Inline".

## MASTERPROMPT

- Neues Kapitel „Willkommen": Ablauf (Join → Embed mit Feldern → DM → Auto-Rollen), Platzhalter-Tabelle, Fehlerfälle.

## Verifikation

- `npm run lint` grün.
- Render-Harness: Willkommens-Sektion rendert.
- Kein Commit/Push ohne Freigabe.

## Nicht-Ziele

- Keine Buttons/Actions im Welcome-Embed.
- Keine separate DM-Nachricht.
- Keine Rollenwahl per Button.
- Keine Mehrkanal-/Mehrnachrichten-Konfiguration.
- Kein Breaking Change an `{user}`/`{username}`.
