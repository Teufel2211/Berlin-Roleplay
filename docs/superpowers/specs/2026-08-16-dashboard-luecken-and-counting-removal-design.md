# Design: Dashboard-Lücken schließen + Counting-Modul entfernen

Datum: 2026-08-16
Status: Freigegeben durch User (2026-08-16)

## Ziel

Die Anforderung „von allen Modulen soll alles im Dashboard einstellbar sein" wird als **Lücken schließen** umgesetzt: Alle Settings-Keys, die der Code tatsächlich liest, müssen einen Dashboard-Eintrag (Formularfeld bzw. Default) haben. Zusätzlich wird das **nie implementierte Counting-Modul vollständig entfernt** (Code-Konstanten, Tabellen-DDL, Migration-Drop, MASTERPROMPT-Kapitel).

## Entscheidungen (mit User geklärt)

| Frage | Entscheidung |
|---|---|
| Kernziel | Lücken schließen (nicht „alles neu herausziehen") |
| Counting-Modul | Soll **gar nicht mehr existieren** (nicht nachrüsten) |
| DB-Tabellen | Beide `eghr_counting_*`-Tabellen werden **gedroppt** (Inhalt: 0 Stats + 1 Zählerstand, kein Verlust) |
| Aktion-Umfang | Alles in einer Runde (Lücken + Counting-Entfernung) |
| `verify_panel_message_id` | **Bleibt** als interner Runtime-Key (kein DEFAULT_SETTINGS, kein Dashboard, funktional nötig für Panel-Ersetzung) |

## Bestandsaufnahme (verifiziert)

| Key | Status | Fundstelle |
|---|---|---|
| `max_open_tickets`, `ticket_transcripts_enabled` | In DEFAULT_SETTINGS + i18n, aber **kein Dashboard-Feld** | ticketService.js:99, :278 |
| `moderation_log_channel_id`, `team_log_channel_id` | Dashboard-Feld existiert, aber **kein Default** in config.js | moderation.js:7, server.js:96-97 |
| `welcome_channel_id`, `welcome_auto_roles` | **Tote Keys**: Label/Liste ja, aber von keinem Code gelesen (Welcome nutzt eigene Tabelle `eghr_welcome_messages`) | server.js:34,36,44 |
| `verify_panel_message_id` | Interner Runtime-Key (kein Dashboard-Feld gewollt) | verifyService.js:38,47 |

Counting existiert **nirgends als Code** (kein Command, kein Service) — nur als Tabellen-Konstanten, DDL und MASTERPROMPT-Spezifikation. Slash-Befehle `/counting` wurden nie registriert.

## Teil 1 — Ticket „Verhalten"-Sektion (Lücke A)

- `src/web/server.js`:
  - `FEATURE_SECTIONS.tickets` um `{ id: 'verhalten', label: 'Verhalten', kind: 'settings' }` erweitern.
  - Neuer `SETTING_GROUPS`-Eintrag: `{ feature: 'tickets', id: 'verhalten', subgroup: 'Verhalten', keys: ['max_open_tickets', 'ticket_transcripts_enabled'] }`.
  - `LABELS` um beide Keys ergänzen („Max. gleichzeitig offene Tickets", „Ticket-Transkripte aktivieren").
- `src/web/views/features/_tickets.ejs`: `_sec_settings`-Include für `verhalten` (nach `kanale`), Muster wie `_verification.ejs`/`_giveaway.ejs`.
- i18n-Labels existieren bereits (de 108-109 / en 300-301); Defaults in config.js vorhanden. Keine Änderung dort nötig.

## Teil 2 — Fehlende Settings-Defaults (Lücke B)

- `src/config.js` `DEFAULT_SETTINGS` ergänzen: `moderation_log_channel_id: ''`, `team_log_channel_id: ''`.
- Formularfelder + Labels existieren bereits (SETTING_GROUPS server.js:96-97, i18n de 103-104 / en 295-296).

## Teil 3 — Tote Welcome-Keys aufräumen (Lücke C)

- `src/web/server.js`: `welcome_channel_id` aus `CHANNEL_KEYS`, `welcome_auto_roles` aus `ROLE_KEYS`, beide aus `LABELS` entfernen.
- `src/web/i18n.js`: `label.welcome_channel_id` (de+en) entfernen.
- Keine DEFAULT_SETTINGS-Einträge vorhanden → nichts in config.js zu tun.

## Teil 4 — Counting komplett entfernen

- **Migration** (via MCP, `supabase_apply_migration`):
  `DROP TABLE IF EXISTS public.eghr_counting_stats; DROP TABLE IF EXISTS public.eghr_counting_state;`
- `src/supabase.js`: `countingStats`/`countingState`-Konstanten (Zeilen 12-13) entfernen.
- `supabase/migrations/001_init.sql`: CREATE TABLE für beide Tabellen (Zeilen 55-63) und deren RLS-Statements (Zeilen 166-167) entfernen.
- `MASTERPROMPT.md`:
  - Kapitel 8 „Modul: Counting (Zähl-Kanal)" (Zeilen 417-447) komplett entfernen.
  - **Renumbering**: Bewerbung 9→8, Interview 10→9, Ticket 11→10, Website-Dashboard 12→11, Embed-Design 13→12, Einrichtung 14→13, Willkommen 15→14, Abnahmekriterien 16→15, Hinweise 17→16.
  - Verweise korrigieren: Z.31 `Kapitel 3, 12`→`3, 11`; Z.37 `3.1 + 12`→`3.1 + 11`; Z.68 `siehe Kapitel 13`→`12`; Z.118 `Kapitel 12`→`11`; Z.291 `Kapitel 14`→`13`; Z.462 `siehe Kapitel 10`→`9`; Z.742 `Kapitel 13`→`12`; Z.750 `5–11`→`5–10`; Z.756 `14.3`→`13.3`.
  - Inhalt entfernen: Verzeichnisbaum (Z.75 `counting.js`, Z.84 `countingService.js`), Settings-Übersicht-Einträge (Z.151-152, Z.166-168), SQL-Block-Tabellen (Z.220, Z.226), Audit-Beispiel (Z.266 `counting.reset`), Audit-Pflicht (Z.283 `counting reset`).
- `AGENTS.md`: Verzeichnisstruktur (Z.23-24) und Slash-Command-Liste (Z.49) um `counting` bereinigen.

## Betroffene Dateien

`src/config.js`, `src/supabase.js`, `src/web/server.js`, `src/web/i18n.js`, `src/web/views/features/_tickets.ejs`, `supabase/migrations/001_init.sql`, `MASTERPROMPT.md`, `AGENTS.md`, plus neue Migration und neues Design-Doc.

## Verifikation

- `npm run lint` grün (51/51).
- `counting`-Grep in `src/` ergibt 0 Treffer.
- Renummerierungs-Referenzen in MASTERPROMPT geprüft (kein veraltetes „Kapitel 8/9/…").
- Migration via MCP angewendet; Tabellen existieren nicht mehr.
- Kein Commit/Push ohne Freigabe.

## Nicht-Ziele

- Keine neuen konfigurierbaren Werte über die Lücken hinaus (kein „alles herausziehen" von TTLs/Texte/Farben).
- Counting wird **nicht** nachgerüstet, sondern entfernt.
- `verify_panel_message_id` bleibt unverändert.
- Kein Umbau des Welcome-Moduls auf Settings-Keys (nutzt weiterhin eigene Tabelle).
