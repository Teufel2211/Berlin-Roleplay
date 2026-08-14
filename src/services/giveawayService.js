const { getClient, TABLES, withRetry } = require('../supabase');
const settingsService = require('./settingsService');
const auditService = require('./auditService');
const embeds = require('../discord/embeds');
const helpers = require('../discord/helpers');
const logger = require('../logger');

let checking = false;

function runningEmbed(guild, row) {
  const remaining = new Date(row.ends_at).getTime() - Date.now();
  return embeds.giveaway(
    '🎉 **GIVEAWAY**',
    `**Gewinne:** ${row.prize}\n` +
    `👥 **Gewinner:** ${row.winners_count}\n` +
    `👥 **Teilnehmer:** ${row.participant_count}\n` +
    `⏰ **Endet:** ${helpers.formatDateTime(row.ends_at)} (${helpers.formatRemaining(remaining)})\n` +
    `🏆 **Host:** <@${row.host_id}>\n\nReagiere mit 🎉 um teilzunehmen`,
    guild
  );
}

function drawWinners(pool, n) {
  const arr = pool.slice();
  const result = [];
  const count = Math.min(n, arr.length);
  for (let i = 0; i < count; i++) {
    const idx = Math.floor(Math.random() * arr.length);
    result.push(arr.splice(idx, 1)[0]);
  }
  return result;
}

function findGuildByChannel(client, channelId) {
  for (const guild of client.guilds.cache.values()) {
    if (guild.channels.cache.has(channelId)) return guild;
  }
  return null;
}

async function createGiveaway(interaction, prize, durationStr, winners) {
  const guild = interaction.guild;
  const gid = guild.id;
  const duration = helpers.parseDuration(durationStr);
  if (!duration || duration < 1000) {
    return interaction.reply({ embeds: [embeds.error('Ungültige Dauer', 'Nutze z.B. `30m`, `1h`, `2d`, `1w`.', guild)], ephemeral: true });
  }

  let winnersCount = winners;
  if (!winnersCount) {
    winnersCount = parseInt(await settingsService.get(gid, 'giveaway_default_winners', '1'), 10) || 1;
  }

  const channelId = await settingsService.get(gid, 'giveaway_channel_id');
  const channel = (channelId && guild.channels.cache.get(channelId)) || interaction.channel;

  let endsAt = new Date(Date.now() + duration);
  let hint = false;
  if (endsAt.getTime() <= Date.now()) {
    endsAt = new Date(Date.now() + 30 * 60 * 1000);
    hint = true;
  }

  const { data, error } = await withRetry(() =>
    getClient()
      .from(TABLES.giveaways)
      .insert({
        guild_id: gid,
        channel_id: channel.id,
        prize,
        winners_count: winnersCount,
        participant_count: 0,
        ends_at: endsAt.toISOString(),
        ended: false,
        host_id: interaction.user.id,
      })
      .select('*')
      .single()
  );
  if (error || !data) {
    logger.error(`Giveaway konnte nicht gespeichert werden: ${error ? error.message : 'keine Daten'}`);
    return interaction.reply({ embeds: [embeds.error('Fehler', 'Das Giveaway konnte nicht gespeichert werden.', guild)], ephemeral: true });
  }

  const msg = await channel.send({ embeds: [runningEmbed(guild, data)] });
  try { await msg.react('🎉'); } catch (err) { logger.warn(`Reaktion fehlgeschlagen: ${err.message}`); }

  await withRetry(() => getClient().from(TABLES.giveaways).update({ message_id: msg.id }).eq('id', data.id));

  const text = hint
    ? `Giveaway **${prize}** gestartet (Endzeit lag in der Vergangenheit → +30 Minuten).`
    : `Giveaway **${prize}** gestartet.`;
  return interaction.reply({ embeds: [embeds.success('🎉 Giveaway gestartet', text, guild)], ephemeral: true });
}

async function handleReaction(reaction, user) {
  if (user.bot) return;
  if (reaction.emoji.name !== '🎉') return;
  try {
    if (reaction.partial) await reaction.fetch();
    if (reaction.message.partial) await reaction.message.fetch();
  } catch (err) { return; }

  const { data: gw } = await withRetry(() =>
    getClient().from(TABLES.giveaways).select('*').eq('message_id', reaction.message.id).eq('ended', false).maybeSingle()
  );
  if (!gw) return;
  if (gw.host_id === user.id) return;

  const guild = reaction.message.guild;
  if (guild && gw.guild_id === guild.id) {
    const requiredRoles = await settingsService.get(gw.guild_id, 'giveaway_required_roles');
    const roles = helpers.resolveRoles(guild, requiredRoles);
    if (roles.length) {
      const member = guild.members.cache.get(user.id);
      if (!member || !roles.some((r) => member.roles.cache.has(r.id))) {
        try { await reaction.users.remove(user.id); } catch (err) { logger.warn(`Reaktion nicht entfernt: ${err.message}`); }
        try { await user.send('❌ Du hast nicht die erforderliche Rolle für dieses Giveaway.'); } catch (err) { /* ignorieren */ }
        return;
      }
    }
  }

  const { data: existing } = await withRetry(() =>
    getClient().from(TABLES.giveawayParticipants).select('discord_id').eq('giveaway_id', gw.id).eq('discord_id', user.id).maybeSingle()
  );
  if (!existing) {
    await withRetry(() =>
      getClient().from(TABLES.giveawayParticipants).insert({ giveaway_id: gw.id, discord_id: user.id, username: user.username })
    );
    await syncCount(guild, gw);
  }
}

async function handleReactionRemove(reaction, user) {
  if (user.bot) return;
  if (reaction.emoji.name !== '🎉') return;
  try {
    if (reaction.partial) await reaction.fetch();
    if (reaction.message.partial) await reaction.message.fetch();
  } catch (err) { return; }

  const { data: gw } = await withRetry(() =>
    getClient().from(TABLES.giveaways).select('*').eq('message_id', reaction.message.id).eq('ended', false).maybeSingle()
  );
  if (!gw) return;

  await withRetry(() => getClient().from(TABLES.giveawayParticipants).delete().eq('giveaway_id', gw.id).eq('discord_id', user.id));
  await syncCount(reaction.message.guild, gw);
}

async function syncCount(guild, gw) {
  const { data: part } = await withRetry(() =>
    getClient().from(TABLES.giveawayParticipants).select('discord_id').eq('giveaway_id', gw.id)
  );
  const count = part ? part.length : 0;
  await withRetry(() => getClient().from(TABLES.giveaways).update({ participant_count: count }).eq('id', gw.id));
  if (!guild) return;
  const channel = guild.channels.cache.get(gw.channel_id);
  if (!channel) return;
  try {
    const msg = await channel.messages.fetch(gw.message_id);
    await msg.edit({ embeds: [runningEmbed(guild, { ...gw, participant_count: count })] });
  } catch (err) { logger.warn(`Giveaway-Embed nicht aktualisiert: ${err.message}`); }
}

async function finishGiveaway(client, row) {
  const guild = findGuildByChannel(client, row.channel_id);
  if (!guild) {
    await withRetry(() => getClient().from(TABLES.giveaways).update({ ended: true }).eq('id', row.id));
    logger.warn(`Giveaway ${row.id}: Guild nicht gefunden, als beendet markiert`);
    return;
  }

  const channel = guild.channels.cache.get(row.channel_id);
  const message = channel ? await channel.messages.fetch(row.message_id).catch(() => null) : null;

  let winners = [];
  if (message) {
    try {
      const reaction = message.reactions.cache.get('🎉');
      if (reaction) {
        const users = await reaction.users.fetch();
        const pool = users.filter((u) => !u.bot && u.id !== row.host_id).map((u) => u.id);
        winners = drawWinners(pool, row.winners_count);
      }
    } catch (err) {
      logger.warn(`Reaktionsabfrage fehlgeschlagen (${row.id}): ${err.message}`);
    }
  }
  if (winners.length === 0 && row.winners_count > 0) {
    const { data: participants } = await withRetry(() =>
      getClient().from(TABLES.giveawayParticipants).select('discord_id').eq('giveaway_id', row.id)
    );
    const pool = (participants || []).filter((p) => p.discord_id !== row.host_id).map((p) => p.discord_id);
    winners = drawWinners(pool, row.winners_count);
  }

  await withRetry(() =>
    getClient().from(TABLES.giveaways).update({ ended: true, participant_count: row.participant_count }).eq('id', row.id)
  );

  if (message) {
    const endEmbed = embeds.giveaway(
      '🏆 **GIVEAWAY BEENDET**',
      `**Gewinne:** ${row.prize}\n` +
      (winners.length ? `👥 **Gewinner:** ${winners.map((w) => `<@${w}>`).join(', ')}\n` : `👥 **Gewinner:** –\n`) +
      `👥 **Teilnehmer:** ${row.participant_count}\n` +
      `🏆 **Host:** <@${row.host_id}>`,
      guild
    );
    try { await message.edit({ embeds: [endEmbed] }); } catch (err) { logger.warn(`End-Embed nicht aktualisiert: ${err.message}`); }
  }

  if (winners.length === 0) {
    if (channel) {
      try {
        await channel.send({ embeds: [embeds.warning('GIVEAWAY BEENDET', `Keine Teilnehmer für **${row.prize}** — der Preis verfällt.`, guild)] });
      } catch (err) { /* ignorieren */ }
    }
  } else {
    for (const id of winners) {
      try {
        const u = await client.users.fetch(id);
        await u.send(`🎉 Herzlichen Glückwunsch! Du hast **${row.prize}** gewonnen.`);
      } catch (err) { logger.warn(`Gewinner-DM fehlgeschlagen (${id}): ${err.message}`); }
    }
    const announceChannelId = await settingsService.get(row.guild_id, 'giveaway_announce_channel_id');
    if (announceChannelId) {
      const ch = guild.channels.cache.get(announceChannelId);
      if (ch) {
        try {
          await ch.send({ embeds: [embeds.giveaway('🏆 Gewinner', `${winners.map((w) => `<@${w}>`).join(', ')} haben **${row.prize}** gewonnen!`, guild)] });
        } catch (err) { logger.warn(`Announcement fehlgeschlagen: ${err.message}`); }
      }
    }
  }

  await auditService.log(row.guild_id, 'System', 'giveaway.finish', { id: row.id, prize: row.prize, winners });
}

async function checkExpired(client) {
  if (checking) return;
  checking = true;
  try {
    const { data } = await withRetry(() =>
      getClient().from(TABLES.giveaways).select('*').lte('ends_at', new Date().toISOString()).eq('ended', false)
    );
    if (data) {
      for (const gw of data) {
        await finishGiveaway(client, gw);
      }
    }
  } catch (err) {
    logger.error(`Giveaway-Check fehlgeschlagen: ${err.message}`);
  } finally {
    checking = false;
  }
}

function startInterval(client) {
  setInterval(() => checkExpired(client), 30 * 1000);
}

async function getById(id) {
  const { data } = await withRetry(() =>
    getClient().from(TABLES.giveaways).select('*').eq('id', Number(id)).maybeSingle()
  );
  return data;
}

async function endNow(interaction, id) {
  const guild = interaction.guild;
  const gid = guild.id;
  const row = await getById(id);
  if (!row) {
    return interaction.reply({ embeds: [embeds.error('Nicht gefunden', 'Giveaway nicht gefunden. Nutze `/giveaway liste`.', guild)], ephemeral: true });
  }
  if (row.guild_id !== gid) {
    return interaction.reply({ embeds: [embeds.error('Nicht gefunden', 'Giveaway nicht gefunden.', guild)], ephemeral: true });
  }
  if (row.ended) {
    return interaction.reply({ embeds: [embeds.error('Bereits beendet', 'Dieses Giveaway ist bereits beendet.', guild)], ephemeral: true });
  }
  await finishGiveaway(interaction.client, row);
  await auditService.log(gid, interaction.user.tag, 'giveaway.end', { id: row.id });
  return interaction.reply({ embeds: [embeds.success('Giveaway beendet', `**${row.prize}** wurde ausgewertet.`, guild)], ephemeral: true });
}

async function extend(interaction, id, durationStr) {
  const guild = interaction.guild;
  const gid = guild.id;
  const row = await getById(id);
  if (!row || row.ended || row.guild_id !== gid) {
    return interaction.reply({ embeds: [embeds.error('Nicht gefunden oder beendet', 'Giveaway nicht gefunden oder bereits beendet. Nutze `/giveaway liste`.', guild)], ephemeral: true });
  }
  const duration = helpers.parseDuration(durationStr);
  if (!duration) {
    return interaction.reply({ embeds: [embeds.error('Ungültige Dauer', 'Nutze z.B. `30m`, `1h`, `2d`.', guild)], ephemeral: true });
  }
  const newEnds = new Date(new Date(row.ends_at).getTime() + duration).toISOString();
  await withRetry(() => getClient().from(TABLES.giveaways).update({ ends_at: newEnds }).eq('id', row.id));
  const fresh = { ...row, ends_at: newEnds };
  const channel = guild.channels.cache.get(row.channel_id);
  if (channel) {
    try {
      const msg = await channel.messages.fetch(row.message_id);
      await msg.edit({ embeds: [runningEmbed(guild, fresh)] });
    } catch (err) { /* ignorieren */ }
  }
  await auditService.log(gid, interaction.user.tag, 'giveaway.extend', { id: row.id, duration: durationStr });
  return interaction.reply({ embeds: [embeds.success('Giveaway verlängert', `**${row.prize}** endet jetzt um **${helpers.formatDateTime(newEnds)}**.`, guild)], ephemeral: true });
}

async function redraw(interaction, id) {
  const guild = interaction.guild;
  const gid = guild.id;
  const row = await getById(id);
  if (!row || row.guild_id !== gid) {
    return interaction.reply({ embeds: [embeds.error('Nicht gefunden', 'Giveaway nicht gefunden.', guild)], ephemeral: true });
  }
  if (!row.ended) {
    return interaction.reply({ embeds: [embeds.error('Noch aktiv', 'Eine Neu-Ziehung ist nur bei beendeten Giveaways möglich.', guild)], ephemeral: true });
  }
  const { data: participants } = await withRetry(() =>
    getClient().from(TABLES.giveawayParticipants).select('discord_id').eq('giveaway_id', row.id)
  );
  const pool = (participants || []).filter((p) => p.discord_id !== row.host_id).map((p) => p.discord_id);
  const winners = drawWinners(pool, row.winners_count);
  for (const w of winners) {
    try {
      const u = await interaction.client.users.fetch(w);
      await u.send(`🎉 Herzlichen Glückwunsch! Du hast **${row.prize}** gewonnen.`);
    } catch (err) { logger.warn(`Gewinner-DM fehlgeschlagen (${w}): ${err.message}`); }
  }
  await auditService.log(gid, interaction.user.tag, 'giveaway.redraw', { id: row.id, winners });
  const text = winners.length
    ? `Neue Gewinner: ${winners.map((w) => `<@${w}>`).join(', ')}`
    : 'Keine Teilnehmer gefunden.';
  return interaction.reply({ embeds: [embeds.success('Neu gezogen', text, guild)], ephemeral: true });
}

async function participantsList(interaction, id) {
  const guild = interaction.guild;
  const gid = guild.id;
  const row = await getById(id);
  if (!row || row.guild_id !== gid) {
    return interaction.reply({ embeds: [embeds.error('Nicht gefunden', 'Giveaway nicht gefunden.', guild)], ephemeral: true });
  }
  const { data } = await withRetry(() =>
    getClient().from(TABLES.giveawayParticipants).select('username').eq('giveaway_id', row.id).limit(20)
  );
  const count = await withRetry(() => getClient().from(TABLES.giveawayParticipants).select('discord_id', { count: 'exact' }).eq('giveaway_id', row.id));
  const total = count.count || 0;
  const names = (data || []).map((p) => p.username).filter(Boolean);
  const more = total > names.length ? `\n… und **${total - names.length}** weitere` : '';
  return interaction.reply({
    embeds: [embeds.info('🎉 Teilnehmer', `**${row.prize}**\nGesamt: **${total}**\n${names.length ? names.join(', ') : 'Keine Teilnehmer'}\n${more}`, guild)],
    ephemeral: true,
  });
}

async function cancel(interaction, id) {
  const guild = interaction.guild;
  const gid = guild.id;
  const row = await getById(id);
  if (!row || row.guild_id !== gid) {
    return interaction.reply({ embeds: [embeds.error('Nicht gefunden', 'Giveaway nicht gefunden.', guild)], ephemeral: true });
  }
  const channel = guild.channels.cache.get(row.channel_id);
  if (channel && row.message_id) {
    try {
      const msg = await channel.messages.fetch(row.message_id);
      await msg.delete();
    } catch (err) { /* bereits gelöscht */ }
  }
  await withRetry(() => getClient().from(TABLES.giveaways).update({ ended: true }).eq('id', row.id));
  await auditService.log(gid, interaction.user.tag, 'giveaway.cancel', { id: row.id });
  return interaction.reply({ embeds: [embeds.success('Giveaway abgebrochen', `**${row.prize}** wurde abgebrochen.`, guild)], ephemeral: true });
}

async function list(interaction) {
  const guild = interaction.guild;
  const gid = guild.id;
  const { data } = await withRetry(() =>
    getClient().from(TABLES.giveaways).select('*').eq('guild_id', gid).eq('ended', false).order('ends_at', { ascending: true })
  );
  if (!data || data.length === 0) {
    return interaction.reply({ embeds: [embeds.info('🎉 Laufende Giveaways', 'Aktuell laufen keine Giveaways.', guild)], ephemeral: true });
  }
  const lines = data.map(
    (g) => `**ID ${g.id}** — ${g.prize}\n⏰ Endet: ${helpers.formatDateTime(g.ends_at)} · 👥 ${g.participant_count}`
  );
  return interaction.reply({ embeds: [embeds.info('🎉 Laufende Giveaways', lines.join('\n\n'), guild)], ephemeral: true });
}

module.exports = {
  createGiveaway,
  handleReaction,
  handleReactionRemove,
  checkExpired,
  startInterval,
  endNow,
  extend,
  redraw,
  participantsList,
  cancel,
  list,
  findGuildByChannel,
};
