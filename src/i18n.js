const settingsService = require('./services/settingsService');

const de = {
  'giveaway.start.title': '🎉 Giveaway gestartet',
  'giveaway.start.msg': 'Giveaway **{prize}** gestartet.',
  'giveaway.start.hint': 'Giveaway **{prize}** gestartet (Endzeit lag in der Vergangenheit → +30 Minuten).',
  'giveaway.error.invalidDuration': 'Ungültige Dauer',
  'giveaway.error.invalidDuration.msg': 'Nutze z.B. `30m`, `1h`, `2d`, `1w`.',
  'giveaway.error.save': 'Fehler',
  'giveaway.error.save.msg': 'Das Giveaway konnte nicht gespeichert werden.',
  'giveaway.join.title': '🎉 Teilnahme',
  'giveaway.join.added': 'Du nimmst am Giveaway **{prize}** teil. Lose: **{tickets}**/{max}.',
  'giveaway.join.denied.role': 'Keine Berechtigung',
  'giveaway.join.denied.role.msg': 'Du hast nicht die erforderliche Rolle für dieses Giveaway.',
  'giveaway.join.denied.host': 'Der Host kann nicht an seinem eigenen Giveaway teilnehmen.',
  'giveaway.join.denied.ended': 'Dieses Giveaway ist bereits beendet.',
  'giveaway.join.denied.max': 'Du hast bereits die maximale Anzahl Lose ({max}).',
  'giveaway.join.button': 'Teilnehmen',
  'giveaway.join.footer': 'Klicke auf den Button, um teilzunehmen',
  'giveaway.running.title': '🎉 GIVEAWAY',
  'giveaway.running.prize': 'Preis',
  'giveaway.running.winners': 'Gewinner',
  'giveaway.running.tickets': 'Lose',
  'giveaway.running.participants': 'Teilnehmer',
  'giveaway.running.ends': 'Endet',
  'giveaway.running.host': 'Host',
  'giveaway.running.marker2h': '⏰ Noch **2 Stunden**!',
  'giveaway.running.marker1h': '⏰ Noch **1 Stunde**!',
  'giveaway.running.marker15m': '⏰ Noch **15 Minuten**!',
  'giveaway.running.marker5m': '🚨 Noch **5 Minuten**!',
  'giveaway.warning5m.title': '⏰ Giveaway endet bald',
  'giveaway.warning5m.msg': 'Das Giveaway **{prize}** endet in **5 Minuten**!',
  'giveaway.ended.title': '🏆 GIVEAWAY BEENDET',
  'giveaway.ended.winners': 'Gewinner',
  'giveaway.ended.participants': 'Teilnehmer',
  'giveaway.ended.host': 'Host',
  'giveaway.ended.none.title': 'GIVEAWAY BEENDET',
  'giveaway.ended.none.msg': 'Keine Teilnehmer für **{prize}** — der Preis verfällt.',
  'giveaway.winner.dm': '🎉 Herzlichen Glückwunsch! Du hast **{prize}** gewonnen.',
  'giveaway.announce.title': '🏆 Gewinner',
  'giveaway.announce.msg': '{winners} haben **{prize}** gewonnen!',
  'giveaway.end.title': 'Giveaway beendet',
  'giveaway.end.msg': '**{prize}** wurde ausgewertet.',
  'giveaway.extend.title': 'Giveaway verlängert',
  'giveaway.extend.msg': '**{prize}** endet jetzt um **{time}**.',
  'giveaway.redraw.title': 'Neu gezogen',
  'giveaway.redraw.msg': 'Neue Gewinner: {winners}',
  'giveaway.redraw.none': 'Keine Teilnehmer gefunden.',
  'giveaway.participants.title': '🎉 Teilnehmer',
  'giveaway.participants.total': 'Gesamt: **{total}**',
  'giveaway.participants.none': 'Keine Teilnehmer',
  'giveaway.participants.more': '\n… und **{more}** weitere',
  'giveaway.cancel.title': 'Giveaway abgebrochen',
  'giveaway.cancel.msg': '**{prize}** wurde abgebrochen.',
  'giveaway.list.title': '🎉 Laufende Giveaways',
  'giveaway.list.none': 'Aktuell laufen keine Giveaways.',
  'giveaway.notFound.title': 'Nicht gefunden',
  'giveaway.notFound.msg': 'Giveaway nicht gefunden. Nutze `/giveaway liste`.',
  'giveaway.notFoundEnded.title': 'Nicht gefunden oder beendet',
  'giveaway.notFoundEnded.msg': 'Giveaway nicht gefunden oder bereits beendet. Nutze `/giveaway liste`.',
  'giveaway.endedAlready.title': 'Bereits beendet',
  'giveaway.endedAlready.msg': 'Dieses Giveaway ist bereits beendet.',
  'giveaway.activeOnly.title': 'Noch aktiv',
  'giveaway.activeOnly.msg': 'Eine Neu-Ziehung ist nur bei beendeten Giveaways möglich.',
  'giveaway.noPermission.title': 'Keine Berechtigung',
  'giveaway.noPermission.msg': 'Nur Staff kann Giveaways verwalten.',
  'giveaway.marker.2h': '2h',
  'giveaway.marker.1h': '1h',
  'giveaway.marker.15m': '15m',
  'giveaway.marker.5m': '5m',
};

const en = {
  'giveaway.start.title': '🎉 Giveaway started',
  'giveaway.start.msg': 'Giveaway **{prize}** started.',
  'giveaway.start.hint': 'Giveaway **{prize}** started (end time was in the past → +30 minutes).',
  'giveaway.error.invalidDuration': 'Invalid duration',
  'giveaway.error.invalidDuration.msg': 'Use e.g. `30m`, `1h`, `2d`, `1w`.',
  'giveaway.error.save': 'Error',
  'giveaway.error.save.msg': 'The giveaway could not be saved.',
  'giveaway.join.title': '🎉 Entry',
  'giveaway.join.added': 'You entered **{prize}**. Tickets: **{tickets}**/{max}.',
  'giveaway.join.denied.role': 'No permission',
  'giveaway.join.denied.role.msg': 'You do not have the required role for this giveaway.',
  'giveaway.join.denied.host': 'The host cannot enter their own giveaway.',
  'giveaway.join.denied.ended': 'This giveaway has already ended.',
  'giveaway.join.denied.max': 'You already have the maximum number of tickets ({max}).',
  'giveaway.join.button': 'Enter',
  'giveaway.join.footer': 'Click the button to enter',
  'giveaway.running.title': '🎉 GIVEAWAY',
  'giveaway.running.prize': 'Prize',
  'giveaway.running.winners': 'Winners',
  'giveaway.running.tickets': 'Tickets',
  'giveaway.running.participants': 'Participants',
  'giveaway.running.ends': 'Ends',
  'giveaway.running.host': 'Host',
  'giveaway.running.marker2h': '⏰ Only **2 hours** left!',
  'giveaway.running.marker1h': '⏰ Only **1 hour** left!',
  'giveaway.running.marker15m': '⏰ Only **15 minutes** left!',
  'giveaway.running.marker5m': '🚨 Only **5 minutes** left!',
  'giveaway.warning5m.title': '⏰ Giveaway ending soon',
  'giveaway.warning5m.msg': 'The giveaway **{prize}** ends in **5 minutes**!',
  'giveaway.ended.title': '🏆 GIVEAWAY ENDED',
  'giveaway.ended.winners': 'Winners',
  'giveaway.ended.participants': 'Participants',
  'giveaway.ended.host': 'Host',
  'giveaway.ended.none.title': 'GIVEAWAY ENDED',
  'giveaway.ended.none.msg': 'No participants for **{prize}** — the prize expires.',
  'giveaway.winner.dm': '🎉 Congratulations! You won **{prize}**.',
  'giveaway.announce.title': '🏆 Winners',
  'giveaway.announce.msg': '{winners} won **{prize}**!',
  'giveaway.end.title': 'Giveaway ended',
  'giveaway.end.msg': '**{prize}** was evaluated.',
  'giveaway.extend.title': 'Giveaway extended',
  'giveaway.extend.msg': '**{prize}** now ends at **{time}**.',
  'giveaway.redraw.title': 'Redrawn',
  'giveaway.redraw.msg': 'New winners: {winners}',
  'giveaway.redraw.none': 'No participants found.',
  'giveaway.participants.title': '🎉 Participants',
  'giveaway.participants.total': 'Total: **{total}**',
  'giveaway.participants.none': 'No participants',
  'giveaway.participants.more': '\n… and **{more}** more',
  'giveaway.cancel.title': 'Giveaway cancelled',
  'giveaway.cancel.msg': '**{prize}** was cancelled.',
  'giveaway.list.title': '🎉 Running giveaways',
  'giveaway.list.none': 'There are no running giveaways.',
  'giveaway.notFound.title': 'Not found',
  'giveaway.notFound.msg': 'Giveaway not found. Use `/giveaway liste`.',
  'giveaway.notFoundEnded.title': 'Not found or ended',
  'giveaway.notFoundEnded.msg': 'Giveaway not found or already ended. Use `/giveaway liste`.',
  'giveaway.endedAlready.title': 'Already ended',
  'giveaway.endedAlready.msg': 'This giveaway has already ended.',
  'giveaway.activeOnly.title': 'Still active',
  'giveaway.activeOnly.msg': 'A redraw is only possible for ended giveaways.',
  'giveaway.noPermission.title': 'No permission',
  'giveaway.noPermission.msg': 'Only staff can manage giveaways.',
  'giveaway.marker.2h': '2h',
  'giveaway.marker.1h': '1h',
  'giveaway.marker.15m': '15m',
  'giveaway.marker.5m': '5m',
};

const dicts = { de, en };

function render(str, vars) {
  if (!vars) return str;
  return String(str).replace(/\{(\w+)\}/g, (_, key) => (vars[key] !== undefined ? vars[key] : `{${key}}`));
}

async function getT(guildId) {
  let lang = 'de';
  try {
    lang = await settingsService.get(guildId, 'language', 'de');
  } catch (err) {
    /* Standard auf de */
  }
  const d = dicts[lang] || de;
  return function t(key, vars) {
    const v = d[key];
    if (v === undefined) return key;
    return render(v, vars);
  };
}

function isSupported(lang) {
  return lang === 'de' || lang === 'en';
}

module.exports = { getT, isSupported, languages: ['de', 'en'] };
