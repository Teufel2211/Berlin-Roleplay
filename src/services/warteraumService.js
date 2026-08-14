const { getClient, TABLES, withRetry } = require('../supabase');
const settingsService = require('./settingsService');
const embeds = require('../discord/embeds');
const helpers = require('../discord/helpers');
const logger = require('../logger');

async function nextPosition(guildId) {
  const { data } = await withRetry(() =>
    getClient().from(TABLES.warteraum).select('position').eq('guild_id', guildId).order('position', { ascending: false }).limit(1)
  );
  return (data && data.length ? data[0].position : 0) + 1;
}

async function add(interaction, target) {
  const guild = interaction.guild;
  const gid = guild.id;
  const settings = await settingsService.getAll(gid);

  const { data: existing } = await withRetry(() =>
    getClient().from(TABLES.warteraum).select('position').eq('guild_id', gid).eq('discord_id', target.id).maybeSingle()
  );
  if (existing) {
    return interaction.reply({
      embeds: [embeds.error('Bereits eingereiht', `<@${target.id}> wartet bereits an Position ${existing.position}.`, guild)],
      ephemeral: true,
    });
  }

  const pos = await nextPosition(gid);
  await withRetry(() => getClient().from(TABLES.warteraum).insert({ guild_id: gid, discord_id: target.id, position: pos }));

  const roles = helpers.resolveRoles(guild, settings.warteraum_roles);
  if (roles.length) {
    try { await target.roles.add(roles); } catch (err) { logger.warn(`Warteraum-Rollen nicht vergeben: ${err.message}`); }
  }

  if (settings.warteraum_voice_channel_id && target.voice && target.voice.channelId !== settings.warteraum_voice_channel_id) {
    try { await target.voice.setChannel(settings.warteraum_voice_channel_id); } catch (err) { logger.warn(`Voice-Verschiebung fehlgeschlagen: ${err.message}`); }
  }

  return interaction.reply({ embeds: [embeds.warteraum('Warteraum', `<@${target.id}> wurde auf Position **${pos}** eingereiht.`, guild)] });
}

async function list(interaction) {
  const guild = interaction.guild;
  const gid = guild.id;
  const voiceId = await settingsService.get(gid, 'warteraum_voice_channel_id');

  const { data } = await withRetry(() =>
    getClient().from(TABLES.warteraum).select('*').eq('guild_id', gid).order('position', { ascending: true })
  );
  if (!data || data.length === 0) {
    return interaction.reply({ embeds: [embeds.warteraum('🎧 Warteraum — Warteschlange', 'Die Warteschlange ist leer.', guild)] });
  }

  const lines = [];
  for (const entry of data) {
    const member = guild.members.cache.get(entry.discord_id);
    const absent = voiceId && member && member.voice && member.voice.channelId !== voiceId ? ' (abwesend)' : '';
    const wait = Date.now() - new Date(entry.joined_at).getTime();
    lines.push(`${entry.position}. <@${entry.discord_id}>${absent} — wartet seit ${helpers.formatRemaining(wait)}`);
  }

  return interaction.reply({ embeds: [embeds.warteraum('🎧 Warteraum — Warteschlange', lines.join('\n'), guild)] });
}

async function removeFromQueue(interaction, target) {
  const guild = interaction.guild;
  const gid = guild.id;
  const settings = await settingsService.getAll(gid);

  const { data: entry } = await withRetry(() =>
    getClient().from(TABLES.warteraum).select('*').eq('guild_id', gid).eq('discord_id', target.id).maybeSingle()
  );
  if (!entry) {
    return interaction.reply({ embeds: [embeds.error('Nicht in der Queue', `<@${target.id}> wartet nicht im Warteraum.`, guild)], ephemeral: true });
  }

  await withRetry(() => getClient().from(TABLES.warteraum).delete().eq('guild_id', gid).eq('discord_id', target.id));

  const roles = helpers.resolveRoles(guild, settings.warteraum_roles);
  if (roles.length) {
    try { await target.roles.remove(roles); } catch (err) { logger.warn(`Warteraum-Rollen nicht entfernt: ${err.message}`); }
  }
  if (settings.warteraum_target_channel_id && target.voice && target.voice.channelId !== settings.warteraum_target_channel_id) {
    try { await target.voice.setChannel(settings.warteraum_target_channel_id); } catch (err) { logger.warn(`Voice-Verschiebung fehlgeschlagen: ${err.message}`); }
  }

  return interaction.reply({ embeds: [embeds.warteraum('Warteraum', `<@${target.id}> wurde aus der Warteschlange entfernt.`, guild)] });
}

async function advance(interaction) {
  const guild = interaction.guild;
  const gid = guild.id;
  const settings = await settingsService.getAll(gid);

  const { data } = await withRetry(() =>
    getClient().from(TABLES.warteraum).select('*').eq('guild_id', gid).order('position', { ascending: true }).limit(1)
  );
  if (!data || data.length === 0) {
    return interaction.reply({ embeds: [embeds.warteraum('🎧 Warteraum', 'Niemand wartet gerade in der Warteschlange.', guild)] });
  }

  const entry = data[0];
  const target = guild.members.cache.get(entry.discord_id);
  await withRetry(() => getClient().from(TABLES.warteraum).delete().eq('guild_id', gid).eq('discord_id', entry.discord_id));

  if (target) {
    try {
      await target.send('🎧 **Du bist dran!** Bitte komm jetzt in den Kanal.');
    } catch (err) {
      logger.warn(`DM an <@${entry.discord_id}> fehlgeschlagen`);
    }
    const roles = helpers.resolveRoles(guild, settings.warteraum_roles);
    if (roles.length) {
      try { await target.roles.remove(roles); } catch (err) { logger.warn(`Warteraum-Rollen nicht entfernt: ${err.message}`); }
    }
    if (settings.warteraum_target_channel_id && target.voice) {
      try { await target.voice.setChannel(settings.warteraum_target_channel_id); } catch (err) { logger.warn(`Voice-Verschiebung fehlgeschlagen: ${err.message}`); }
    }
  }

  return interaction.reply({
    embeds: [embeds.warteraum('🎧 Warteraum', `<@${entry.discord_id}> wurde aufgerufen und ist raus aus der Warteschlange.`, guild)],
  });
}

async function cleanupMember(guildId, memberId) {
  try {
    await withRetry(() => getClient().from(TABLES.warteraum).delete().eq('guild_id', guildId).eq('discord_id', memberId));
  } catch (err) {
    logger.error(`Warteraum-Cleanup fehlgeschlagen: ${err.message}`);
  }
}

module.exports = { add, list, removeFromQueue, advance, cleanupMember };
