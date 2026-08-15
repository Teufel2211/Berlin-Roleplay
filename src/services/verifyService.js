const { getClient, TABLES, withRetry } = require('../supabase');
const settingsService = require('./settingsService');
const auditService = require('./auditService');
const embeds = require('../discord/embeds');
const helpers = require('../discord/helpers');
const logger = require('../logger');

function getAccountAgeDays(user) {
  if (!user || !user.createdTimestamp) return 0;
  return Math.floor((Date.now() - user.createdTimestamp) / 86400000);
}

async function postPanel(interaction) {
  const guild = interaction.guild;
  const gid = guild.id;
  const verifyChannelId = await settingsService.get(gid, 'verify_channel_id');
  if (!verifyChannelId) {
    return interaction.reply({
      embeds: [embeds.error('Kein Verifizierungs-Kanal', 'Setze unter Einstellungen (Dashboard) die `verify_channel_id` und poste das Panel erneut.', guild)],
      ephemeral: true,
    });
  }
  const channel = guild.channels.cache.get(verifyChannelId);
  if (!channel) {
    return interaction.reply({
      embeds: [embeds.error('Kanal nicht gefunden', 'Der konfigurierte Verifizierungs-Kanal existiert nicht mehr.', guild)],
      ephemeral: true,
    });
  }
  const panel = embeds.info('Verifizierung', 'Klicke auf **Verifizieren**, um dich als Mitglied zu verifizieren.', guild);
  const row = helpers.row(helpers.primaryButton('verify_panel', 'Verifizieren'));

  let message = null;
  const existingId = await settingsService.get(gid, 'verify_panel_message_id');
  if (existingId) {
    try {
      const old = await channel.messages.fetch(existingId);
      message = await old.edit({ embeds: [panel], components: [row] });
    } catch (_) { message = null; }
  }
  if (!message) message = await channel.send({ embeds: [panel], components: [row] });

  await settingsService.setMany(gid, { verify_panel_message_id: message.id });
  await auditService.log(gid, interaction.user.tag, 'verify.panel', { channel: channel.id });
  return interaction.reply({ embeds: [embeds.success('Panel gepostet', `Das Verifizierungs-Panel steht in <#${channel.id}>.`, guild)], ephemeral: true });
}

async function writeVerifyLog(guild, title, description) {
  const logChannelId = await settingsService.get(guild.id, 'verify_log_channel_id');
  if (!logChannelId) return;
  const logChannel = guild.channels.cache.get(logChannelId);
  if (!logChannel) return;
  try { await logChannel.send({ embeds: [embeds.info(title, description, guild)] }); } catch (err) { logger.warn(`Verifizierungslog fehlgeschlagen: ${err.message}`); }
}

async function handlePanelButton(interaction) {
  const guild = interaction.guild;
  const gid = guild.id;
  const member = interaction.member;
  const verifiedRoles = await settingsService.get(gid, 'verified_roles');
  const roles = helpers.resolveRoles(guild, verifiedRoles);
  if (!roles.length) return interaction.reply({ embeds: [embeds.error('Keine Rolle konfiguriert', 'Die Verifizierungs-Rolle ist unter Einstellungen nicht gesetzt.', guild)], ephemeral: true });

  const minAge = Number(await settingsService.get(gid, 'verify_min_account_age_days', '0')) || 0;
  if (minAge > 0) {
    const age = getAccountAgeDays(interaction.user);
    if (age < minAge) {
      await auditService.log(gid, interaction.user.tag, 'verify.rejected_age', { discord_id: member.id, account_age_days: age, minimum_days: minAge });
      await writeVerifyLog(guild, 'Verifizierung abgelehnt', `<@${member.id}> wurde abgelehnt: Account ist **${age} Tage** alt, erforderlich sind **${minAge} Tage**.`);
      return interaction.reply({ embeds: [embeds.error('Account zu neu', `Dein Discord-Account muss mindestens **${minAge} Tage** alt sein. Dein Account ist **${age} Tage** alt.`, guild)], ephemeral: true });
    }
  }

  const rolesToAdd = roles.filter((r) => !member.roles.cache.has(r.id));
  if (!rolesToAdd.length) return interaction.reply({ embeds: [embeds.info('Bereits verifiziert', 'Du bist bereits verifiziert.', guild)], ephemeral: true });

  try {
    await member.roles.add(rolesToAdd);
  } catch (err) {
    logger.error(`Rolle konnte nicht vergeben werden: ${err.message}`);
    return interaction.reply({ embeds: [embeds.error('Fehler', 'Die Rolle konnte nicht vergeben werden.', guild)], ephemeral: true });
  }

  const now = new Date().toISOString();
  await withRetry(() => getClient().from(TABLES.users).upsert({ guild_id: gid, discord_id: member.id, username: member.user.username, verified_at: now, left_at: null }, { onConflict: 'guild_id,discord_id' }));

  if ((await settingsService.get(gid, 'verify_dm', 'true')) === 'true') {
    try { await member.send('✅ Du bist jetzt verifiziert. Willkommen!'); } catch (_) {}
  }

  await auditService.log(gid, interaction.user.tag, 'verify.success', { discord_id: member.id, account_age_days: getAccountAgeDays(interaction.user) });
  await writeVerifyLog(guild, 'Mitglied verifiziert', `<@${member.id}> hat sich erfolgreich verifiziert.`);
  return interaction.reply({ embeds: [embeds.success('Verifiziert', 'Du bist jetzt verifiziert. Willkommen!', guild)], ephemeral: true });
}

async function status(interaction) {
  const guild = interaction.guild;
  const gid = guild.id;
  const member = interaction.member;
  const roles = helpers.resolveRoles(guild, await settingsService.get(gid, 'verified_roles'));
  const verified = roles.some((r) => member.roles.cache.has(r.id));
  if (verified) {
    const { data } = await withRetry(() => getClient().from(TABLES.users).select('verified_at').eq('guild_id', gid).eq('discord_id', member.id).maybeSingle());
    const since = data && data.verified_at ? helpers.formatDateTime(data.verified_at) : 'unbekannt';
    return interaction.reply({ embeds: [embeds.success('Verifiziert', `Du bist verifiziert seit **${since}**.`, guild)], ephemeral: true });
  }
  return interaction.reply({ embeds: [embeds.info('Nicht verifiziert', 'Du bist noch nicht verifiziert. Klicke im Verifizierungs-Panel auf **Verifizieren**.', guild)], ephemeral: true });
}

async function remove(interaction, target) {
  const guild = interaction.guild;
  const gid = guild.id;
  const roles = helpers.resolveRoles(guild, await settingsService.get(gid, 'verified_roles'));
  const toRemove = roles.filter((r) => target.roles.cache.has(r.id));
  if (toRemove.length) {
    try { await target.roles.remove(toRemove); } catch (err) { logger.warn(`Rolle konnte nicht entfernt werden: ${err.message}`); }
  }
  await withRetry(() => getClient().from(TABLES.users).update({ left_at: new Date().toISOString() }).eq('guild_id', gid).eq('discord_id', target.id));
  await auditService.log(gid, interaction.user.tag, 'verify.remove', { discord_id: target.id });
  await writeVerifyLog(guild, 'Verifizierung entfernt', `<@${target.id}> wurde von <@${interaction.user.id}> entverifiziert.`);
  return interaction.reply({ embeds: [embeds.success('Verifizierung entfernt', `Die Verifizierung von <@${target.id}> wurde entfernt.`, guild)], ephemeral: true });
}

module.exports = { postPanel, handlePanelButton, status, remove };