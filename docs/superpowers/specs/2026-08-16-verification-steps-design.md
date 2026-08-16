# Design: Verifizierung-Umbau — Mehrstufige Button-Verifizierung (Phase G)

Datum: 2026-08-16
Status: Freigegeben durch User (2026-08-16)

## Ziel

Die Button-Verifizierung wird mehrstufig: **Regeln akzeptieren → Account-Alter-Check → Rolle vergeben**. Ohne konfigurierten Regeln-Kanal verhält sich die Verifizierung wie bisher (Regeln-Stufe übersprungen).

## Entscheidungen (mit User geklärt)

| Frage | Entscheidung |
|---|---|
| Kernziel | Neue Pflicht-Checks + mehrstufige Verifizierung |
| Pflicht-Checks | Regeln akzeptieren, Account-Alter-Check |
| Stufen-Folge | 2 Stufen in einem Panel (Inline-Fluss) |
| Regeln-Quelle | Regeln-Kanal/-Message, im Dashboard konfiguriert |
| Regeln-Identifikation | Neueste Nachricht im konfigurierten Kanal |
| Regeln-Anzeige | Embed im Chat (ephemeral), Button „Regeln akzeptieren" |
| Nach Akzeptanz | Sofort Rolle vergeben (Alter-Check → Rolle → Erfolg) |
| Alter-Check | Blockieren bei zu jungem Account |

## Ansatz

**A — Inline-Fluss im Panel** (rückwärtskompatibel, kein neuer Kanal/kein neues Panel).

## Bot-Verhalten

### `/verify panel`

- Unverändert: postet/aktualisiert Panel-Embed + Button `verify_panel` „✅ Verifizieren" in `verify_channel_id`.

### Klick auf `verify_panel`

1. Bereits verifiziert (hat `verified_roles`) → Erfolgs-Embed „Bereits verifiziert", **ohne** Regeln-Schritt.
2. Kein Regeln-Kanal (`verify_rules_channel_id` leer) oder keine Nachricht im Kanal → wie heute: sofort Alter-Check → Rolle (Regeln-Stufe übersprungen).
3. Regeln vorhanden → ephemeres Stufen-Embed: Regeln-Text aus der neuesten Kanal-Nachricht als Embed (auf 4000 Zeichen gekürzt, sonst Hinweis), unten Button `verify_accept_rules_<userId>` „✅ Regeln akzeptieren".

### Klick auf `verify_accept_rules_<userId>`

- Nur für den Nutzer sichtbar/ausführbar, dessen ID in der Custom-ID steht (sonst Hinweis).
- Verfall: 60 Sekunden nach dem Start-Klick (sonst Fehler-Hinweis „Zeit abgelaufen, klicke erneut auf Verifizieren").
- Bereits verifiziert → Erfolgs-Embed „Bereits verifiziert".
- Ablauf: Alter-Check → zu jung: Fehler-Embed + `verify.rejected_age` Audit/Log, keine Rolle; OK → Rolle vergeben, `users`-Upsert (`verified_at`, `left_at: null`), optional DM, `verify.success` Audit, Log-Embed.

### Fehlerfälle

| Fall | Verhalten |
|---|---|
| `verify_rules_channel_id` gesetzt, aber Kanal nicht gefunden/kein Zugriff | Regeln-Stufe überspringen + Log-Warnung |
| Regeln-Text > Embed-Limit | Auf 4000 Zeichen kürzen + Hinweis im Embed |
| `verify_accept_rules_<id>` fremde User-ID | Hinweis-Embed (kein Crash) |
| Zeit abgelaufen | Fehler-Hinweis, erneut auf Panel klicken |
| `verified_roles` leer | Fehler-Embed „Keine Rolle konfiguriert" (wie heute) |

## Dashboard/Settings

- **Neuer Key** `verify_rules_channel_id` (Verifizierung → Sektion „Kanäle", Typ `channel`, leer = Stufe übersprungen).
- Bestehende Keys bleiben: `verified_roles`, `verify_channel_id`, `verify_dm`, `verify_log_channel_id`, `verify_min_account_age_days`.
- **i18n** de+en: `label.verify_rules_channel_id`.
- **Keine Migration** (nur Settings-Key).

## MASTERPROMPT

- Kapitel 5 (Verifizierung) um Stufen-Ablauf und `verify_rules_channel_id` erweitern.

## Verifikation

- `npm run lint` grün.
- Render-Harness: Verifizierungs-View rendert.
- Smoke-Test: `/verify panel` + Klick-Fluss manuell geprüft (falls Bot läuft).
- Kein Commit/Push ohne Freigabe.

## Nicht-Ziele

- Keine Freigabe durch Staff (kein Antrags-Workflow).
- Kein eigener Kanal/Thread pro Verifizierung.
- Keine Avatar-/Banner-Checks, keine Zusatz-Rollen-Pflichten.
- Kein Modal für Regeln.
