# Design: Willkommens- und Verifizierungs-System

Datum: 2026-08-29
Status: genehmigt

## Ziel

Zwei neue, über das Dashboard konfigurierbare Systeme für den Discord-Bot:

1. **Willkommens-System**: Postet eine frei anpassbare Willkommensnachricht in einen
   konfigurierbaren Server-Kanal, wenn ein neues Mitglied beitritt (Embed, kein DM).
2. **Verifizierungs-System**: Panel-Nachricht mit Button; der Klick vergibt eine
   konfigurierbare „Verifiziert"-Rolle (ephemere Rückmeldung an den Klickenden).

## Architektur

Konsistenter Stil zu den bestehenden Features (moderation/giveaway):
eigene Dashboard-Features, eigene Service-Module, Settings im `eghr_settings`-Mechanismus,
Bot-Events über `src/discord/events.js`.

### Neue Dashboard-Features

- `FEATURES` in `src/web/server.js`: `{ id: 'welcome', name: 'Willkommen' }`, `{ id: 'verification', name: 'Verifizierung' }`.
- In `enabled_modules` schaltbar (`welcome`, `verification`); Defaults und Bestandsserver werden aktiviert.
- `server.ejs`: `welcome` → neues Teil `_welcome.ejs`, `verification` → neues Teil `_verification.ejs`
  (bestehende `verification`-Zeile nutzt bereits `_verification`, `welcome` nutzt aktuell `_management` → umwechseln).
- `SETTING_GROUPS` + `FEATURE_SECTIONS` für beide Features.

### Settings-Keys (Default `''` bzw. Standardtext)

| Key | Typ | Zweck |
|-----|-----|-------|
| `welcome_channel_id` | Kanal (Select) | Kanal für Willkommensnachricht |
| `welcome_message` | Text | Freier Text, Platzhalter `{user}`, `{server}` |
| `verification_role` | Rolle (Select) | Rolle, die verifizierte Mitglieder erhalten |
| `verification_panel_channel_id` | Kanal (Select) | Kanal, in dem das Verifizierungs-Panel gesendet wird |
| `verification_panel_message_id` | (intern) | Letzte Panel-Nachricht (vom Bot gepflegt) |

### Dateien

- `src/services/welcomeService.js` (neu): `handleMemberAdd(guild, member)`.
- `src/services/verificationService.js` (neu, Muster `moderationPanelService`):
  `sendPanel(guild|interaction, ...)`, `handleVerifyButton(interaction)`.
- `src/discord/events.js`: `guildMemberAdd`-Hook; Button-Dispatch `verification:verify`.
- `src/web/server.js`: Feature-/Group-/Section-Einträge; Route `POST /dashboard/servers/:guildId/feature/verification/panel`
  analog zum Moderations-Panel.
- `src/web/views/features/_welcome.ejs` (neu), `_verification.ejs` (neu).
- `src/config.js`: `DEFAULT_SETTINGS` um die neuen Keys + `enabled_modules` ergänzen.
- `src/web/i18n.js`: Labels (`label.welcome_*`, `label.verification_*`, `sec.*`).
- `src/supabase.js`: `TABLES` ggf. unverändert (keine neue Tabelle nötig; Panel-Nachricht wird per Root-Button-Dispatch in `events.js` aufgelöst).

## Datenfluss

### Willkommen

```
Member tritt bei → events.js guildMemberAdd
  → settings: Modul 'welcome' aktiv? welcome_channel_id gesetzt?
  → welcomeService.handleMemberAdd
  → Embed senden (Text mit {user}→<@id>, {server}→guild.name)
  → Fehler: logger.warn, still ignorieren
```

### Verifizierung

```
Dashboard „Panel senden" → Route → verificationService.sendPanel
  → Nutze Kanal (Bot muss online sein, sonst Fehlermeldung)
  → Embed + Button customId 'verification:verify' posten
  → verification_panel_message_id in Settings speichern

Member klickt Button → events.js Button-Dispatch 'verification:verify'
  → Settings laden
    - Modul 'verification' deaktiviert → ephemere Fehlermeldung
    - verification_role leer → ephemere Fehlermeldung
  → Rolle (Name oder ID) auflösen
    - nicht gefunden → ephemere Fehlermeldung
  → Member hat Rolle → ephemere Info „bereits verifiziert"
  → Member hat Rolle nicht → Rolle geben → ephemere Erfolgsmeldung
```

## Fehlerbehandlung

- `guildMemberAdd`: Kanal gelöscht/kein Recht → `logger.warn`, kein Crash.
- Panel senden ohne Bot/Zugriff → 4xx-Fehlermeldung im Dashboard (Muster: Moderations-Panel; `botOffline`-Hinweis nutzbar).
- Button ohne konfigurierte Rolle → ephemere Fehlermeldung, Aktion sicher.

## Tests / Verifikation

- `npm run lint` (48/48 erhalten).
- Smoke-Test im Dashboard: Features erscheinen, Panel senden funktioniert, Button vergibt Rolle.
- Kein `npm run deploy` nötig (keine neuen Slash-Commands).
- Danach `enabled_modules` deines Servers (DB) + `DEFAULT_SETTINGS` um `welcome`/`verification` ergänzen.