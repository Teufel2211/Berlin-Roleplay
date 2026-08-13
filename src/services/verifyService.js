const { getClient, TABLES, withRetry } = require('../supabase');
const settingsService = require('./settingsService');
const auditService = require('./auditService');
const embeds = require('../discord/embeds');
const helpers = require('../discord/helpers');
const logger = require('../logger');

async function postPanel(interaction) {
  const guild = interaction.guild;
  const verifyChannelId = await settingsService.get('verify_channel_id');
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
  const panel = embeds.info('Verifizierung', 'Klicke auf ✅, um dich als Mitglied zu verifizieren.', guild);
  const row = helpers.row(helpers.primaryButton('verify_panel', 'Verifizieren', '✅'));

  let message = null;
  const existingId = await settingsService.get('verify_panel_message_id');
  if (existingId) {
    try {
      const old = await channel.messages.fetch(existingId);
      message = await old.edit({ embeds: [panel], components: [row] });
    } catch (err) {
      message = null;
    }
  }
  if (!message) message = await channel.send({ embeds: [panel], components: [row] });

  await settingsService.setMany({ verify_panel_message_id: message.id });
  await auditService.log(interaction.user.tag, 'verify.panel', { channel: channel.id });
  return interaction.reply({
    embeds: [embeds.success('Panel gepostet', `Das Verifizierungs-Panel steht in <#${channel.id}>.`, guild)],
    ephemeral: true,
  });
}

async function handlePanelButton(interaction) {
  const guild = interaction.guild;
  const member = interaction.member;
  const verifiedRoleName = await settingsService.get('verified_role');

  if (!verifiedRoleName) {
    return interaction.reply({
      embeds: [embeds.error('Keine Rolle konfiguriert', 'Die Verifizierungs-Rolle ist unter Einstellungen nicht gesetzt.', guild)],
      ephemeral: true,
    });
  }
  const role = helpers.findRole(guild, verifiedRoleName);
  if (!role) {
    logger.warn(`verified_role "${verifiedRoleName}" nicht gefunden`);
    return interaction.reply({
      embeds: [embeds.error('Fehler', 'Die Verifizierungs-Rolle konnte nicht gefunden werden. Bitte informiere den Staff.', guild)],
      ephemeral: true,
    });
  }
  if (member.roles.cache.has(role.id)) {
    return interaction.reply({ embeds: [embeds.info('Bereits verifiziert', 'Du bist bereits verifiziert.', guild)], ephemeral: true });
  }

  try {
    await member.roles.add(role);
  } catch (err) {
    logger.error(`Rolle konnte nicht vergeben werden: ${err.message}`);
    return interaction.reply({ embeds: [embeds.error('Fehler', 'Die Rolle konnte nicht vergeben werden.', guild)], ephemeral: true });
  }

  const now = new Date().toISOString();
  await withRetry(() =>
    getClient().from(TABLES.users).upsert(
      { discord_id: member.id, username: member.user.username, verified_at: now, left_at: null },
      { onConflict: 'discord_id' }
    )
  );

  if ((await settingsService.get('verify_dm', 'true')) === 'true') {
    try {
      await member.send('✅ Du bist jetzt verifiziert. Willkommen!');
    } catch (err) {
      logger.warn(`DM an ${member.user.tag} fehlgeschlagen`);
    }
  }

  const logChannelId = await settingsService.get('verify_log_channel_id');
  if (logChannelId) {
    const logChannel = guild.channels.cache.get(logChannelId);
    if (logChannel) {
      try {
        await logChannel.send({ embeds: [embeds.success('Mitglied verifiziert', `<@${member.id}> hat sich soeben verifiziert.`, guild)] });
      } catch (err) {
        logger.warn(`Log-Kanal für Verifizierung nicht beschreibbar: ${err.message}`);
      }
    }
  }

  await auditService.log(interaction.user.tag, 'verify.success', { discord_id: member.id });
  return interaction.reply({ embeds: [embeds.success('Verifiziert', 'Du bist jetzt verifiziert. Willkommen!', guild)], ephemeral: true });
}

async function status(interaction) {
  const guild = interaction.guild;
  const member = interaction.member;
  const verifiedRoleName = await settingsService.get('verified_role');
  const role = verifiedRoleName ? helpers.findRole(guild, verifiedRoleName) : null;

  if (role && member.roles.cache.has(role.id)) {
    const { data } = await withRetry(() =>
      getClient().from(TABLES.users).select('verified_at').eq('discord_id', member.id).maybeSingle()
    );
    const since = data && data.verified_at ? helpers.formatDateTime(data.verified_at) : 'unbekannt';
    return interaction.reply({
      embeds: [embeds.success('Verifiziert', `Du bist verifiziert seit **${since}**.`, guild)],
      ephemeral: true,
    });
  }
  return interaction.reply({
    embeds: [embeds.info('Nicht verifiziert', 'Du bist noch nicht verifiziert. Klicke im Verifizierungs-Panel auf ✅.', guild)],
    ephemeral: true,
  });
}

async function remove(interaction, target) {
  const guild = interaction.guild;
  const verifiedRoleName = await settingsService.get('verified_role');
  const role = verifiedRoleName ? helpers.findRole(guild, verifiedRoleName) : null;

  if (role && target.roles.cache.has(role.id)) {
    try {
      await target.roles.remove(role);
    } catch (err) {
      logger.warn(`Rolle konnte nicht entfernt werden: ${err.message}`);
    }
  }
  await withRetry(() => getClient().from(TABLES.users).update({ left_at: new Date().toISOString() }).eq('discord_id', target.id));
  await auditService.log(interaction.user.tag, 'verify.remove', { discord_id: target.id });
  return interaction.reply({
    embeds: [embeds.success('Verifizierung entfernt', `Die Verifizierung von <@${target.id}> wurde entfernt.`, guild)],
    ephemeral: true,
  });
}

module.exports = { postPanel, handlePanelButton, status, remove };
