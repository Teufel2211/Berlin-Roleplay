# Design: Interview-Umbau — Ergebnis-DM + Prozent-Schwellwert (Phase I)

Datum: 2026-08-16
Status: Freigegeben durch User (2026-08-16)

## Ziel

Das Interview-System erhält zwei Umbauten: **Ergebnis-DM mit Punkten** an den Bewerber bei Abschluss sowie die Umstellung des Bestehens-Schwellwerts von absoluter Punktzahl auf **Prozent**. Zusätzlich wird der ungenutzte Settings-Key `interview_max_per_section` entfernt und das bislang fehlende Interview-Kapitel in der MASTERPROMPT ergänzt.

## Entscheidungen (mit User geklärt)

| Frage | Entscheidung |
|---|---|
| DM-Punkte | Ergebnis-DM mit erreichten Punkten an den Bewerber |
| Schwellwert-Umbau | Prozent statt absoluter Zahl |
| Umstellung | Direkt Prozent (Default 75); bestehende Werte ≤ 100 werden direkt als Prozent interpretiert (kein Mapping) |
| Toter Key `interview_max_per_section` | Entfernen |
| DM-Empfänger | Bewerber bei beiden Bewertungswegen (Button-Bewertung UND Bewertungsbogen-Import) |
| DM-Schalter | Nicht konfigurierbar (immer aktiv) |

## Ansatz

**A — In-place Umbau:** `interviewService.handleScore` und `interviewAdmin.importGradingSheet` nutzen gemeinsame Helfer für Berechnung und DM-Versand. Kein Schema-Change, keine Migration.

## Bestehenslogik (beide Wege)

- `passed` wird **nur** bei vollständiger Bewertung berechnet (`scoredCount >= totalQuestions` bzw. `complete`); sonst bleibt `passed` unverändert. Das behebt zugleich einen bestehenden Bug: bisher wurde `passed` auch bei Teilbewertung gesetzt.
- Formel: `pct = sum / maxTotal * 100`, `passed = pct >= threshold`.
- Ergebnis-Embed und DM zeigen: erreichte **Prozentzahl** sowie „Bestanden ab **X %** (Y Punkte)".

## Ergebnis-DM (Bewerber)

- Neuer Helfer `sendResultDm(applicantId, name, total, maxTotal, pct, threshold, passed)` in `interviewService.js`.
- DM-Inhalt als Embed: 🎉 bestanden / ❌ nicht bestanden, erreichte Punkte, Prozent, „Bestanden ab X %".
- Aufruf in `handleScore` bei `status === 'fertig'` sowie in `interviewAdmin.importGradingSheet` bei `complete`.
- DM geschlossen/Fehler → `try/catch`, nur `logger.warn`, kein Crash.

## Settings/Dashboard

- `config.js`: `interview_pass_threshold` Default `45` → `75`; `interview_max_per_section` Zeile entfernen.
- `server.js`: `interview_max_per_section` aus `LABELS` und aus `SETTING_GROUPS` (Sektion `bewertung` enthält dann nur noch `interview_pass_threshold`).
- `i18n.js`: `label.interview_max_per_section` (de+en) entfernen; `label.interview_pass_threshold` auf „Bestanden ab (Prozent)" / „Pass from (percent)".
- Bereits gespeicherte `interview_max_per_section`-Zeilen in `eghr_settings` bleiben liegen (harmlos, ungenutzt). Keine Migration.

## MASTERPROMPT

- **Neues Kapitel 10 „Modul: Interview"** (nach Kapitel 9 Bewerbung): Ablauf (Buttons, Prozent-Schwellwert, Ergebnis-DM, Bewertungsbogen-Import), Settings-Tabelle, Fehlerfälle.
- **Renumbering** der Folgekapitel: Ticket 10→11, Website-Dashboard 11→12, Embed-Design 12→13, Einrichtung 13→14, Willkommen 14→15, Abnahmekriterien 15→16, Hinweise 16→17.
- Verweise korrigieren: „Einrichtung, Kapitel 13" → 14 (Zeile ~291), „Kapitel 13.3" → 14.3 (Zeile ~726), Bewerbungs-Verweis „siehe Kapitel 8, `eghr_interviews`" → „siehe Kapitel 10" (Zeile ~462).
- Die bisher fehlerhaften Verweise „Kapitel 12" (Dashboard) und „Kapitel 13" (Embed-Design) werden durch das Renumbering automatisch korrekt (12 = Dashboard, 13 = Embed-Design).

## Betroffene Dateien

`src/config.js`, `src/services/interviewService.js`, `src/web/interviewAdmin.js`, `src/web/server.js`, `src/web/i18n.js`, `MASTERPROMPT.md`, plus neues Design-Doc.

## Verifikation

- `npm run lint` grün (51/51).
- Render-Harness: Interview-View rendert weiterhin.
- Prüfung: `interview_max_per_section` kommt in `src/` nicht mehr vor.
- Kein Commit/Push ohne Freigabe.

## Nicht-Ziele

- Kein DM-Schalter (immer aktiv).
- Kein per-Interview konfigurierbarer Schwellwert (DB-Feld).
- Kein eigenes `interviewResultService` (YAGNI).
- Keine Migration / kein Schema-Change.
