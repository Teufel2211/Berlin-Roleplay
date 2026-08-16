const { getClient, TABLES, withRetry } = require('../supabase');
const settingsService = require('./settingsService');
const auditService = require('./auditService');
const embeds = require('../discord/embeds');
const helpers = require('../discord/helpers');
const i18n = require('../i18n');
const logger = require('../logger');

let checking = false;

const MARKER_5M = '5m';
const MARKER_15M = '15m';
const MARKER_1H = '1h';
const MARKER_2H = '2h';

function markerFor(remaining) {
  if (remaining <= 5 * 60 * 1000) return MARKER_5M;
  if (remaining <= 15 * 60 * 1000) return MARKER_15M;
  if (remaining <= 60 * 60 * 1000) return MARKER_1H;
  if (remaining <= 2 * 60 * 60 * 1000) return MARKER_2H;
  return '';
}

function runningColor(remaining) {
  if (remaining <= 15 * 60 * 1000) return 0xE74C3C;
  if (remaining <= 60 * 60 * 1000) return 0xF1C40F;
  return 0x9B59B6;
}

async function runningEmbed(guild, row, t) {
  const remaining = new Date(row.ends_at).getTime() - Date.now();
  const marker = row.marker || markerFor(remaining);
  const markerLine = marker ? `\n\n**${t('giveaway.running.marker' + marker)}**` : '';
  const embed = embeds.giveaway(
    t('giveaway.running.title'),
    `**${t('giveaway.running.prize')}:** ${row.prize}\n` +
    `${t('giveaway.running.winners')}: **${row.winners_count}**\n` +
    `${t('giveaway.running.tickets')}: **${row.ticket_count || 0}**\n` +
    `${t('giveaway.running.participants')}: **${row.participant_count || 0}**\n` +
    `${t('giveaway.running.ends')}: ${helpers.formatDateTime(row.ends_at)} (${helpers.formatRemaining(remaining)})\n` +
    `${t('giveaway.running.host')}: <@${row.host_id}>` +
    markerLine,
    guild,
    runningColor(remaining)
  );
  embed.setFooter({ text: `${t('giveaway.join.footer')} • ${guild.name}` });
  embed.setTimestamp(new Date());
  return embed;
}

function endEmbed(guild, row, winners, t) {
  const color = winners.length ? 0x2ECC71 : 0xE74C3C;
  const embed = embeds.giveaway(
    t('giveaway.ended.title'),
    `**${t('giveaway.running.prize')}:** ${row.prize}\n` +
    `${t('giveaway.ended.winners')}: ${winners.length ? winners.map((w) => `<@${w}>`).join(', ') : '–'}\n` +
    `${t('giveaway.ended.participants')}: ${row.participant_count || 0}\n` +
    `${t('giveaway.ended.host')}: <@${row.host_id}>`,
    guild,
    color
  );
  embed.setTimestamp(new Date());
  return embed;
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

function buildPool(participants, hostId) {
  const pool = [];
  for (const p of participants || []) {
    if (p.discord_id === hostId) continue;
    const tickets = Math.min(Math.max(Number(p.tickets) || 1, 1), 100);
    for (let i = 0; i < tickets; i++) pool.push(p.discord_id);
  }
  return pool;
}

function findGuildByChannel(client, channelId) {
  for (const guild of client.guilds.cache.values()) {
    if (guild.channels.cache.has(channelId)) return guild;
  }
  return null;
}

async function getById(id) {
  const { data } = await withRetry(() =>
    getClient().from(TABLES.giveaways).select('*').eq('id', Number(id)).maybeSingle()
  );
  return data;
}

async function refreshEmbed(guild, gw) {
  if (!guild) return;
  const channel = guild.channels.cache.get(gw.channel_id);
  if (!channel) return;
  try {
    const msg = await channel.messages.fetch(gw.message_id);
    const t = await i18n.getT(gw.guild_id);
    await msg.edit({ embeds: [await runningEmbed(guild, gw, t)] });
  } catch (err) {
    logger.warn(`Giveaway-Embed nicht aktualisiert: ${err.message}`);
  }
}

async function syncCount(guild, gw) {
  const { data: parts } = await withRetry(() =>
    getClient().from(TABLES.giveawayParticipants).select('discord_id, tickets').eq('giveaway_id', gw.id)
  );
  const count = parts ? parts.length : 0;
  const tickets = parts ? parts.reduce((a, p) => a + (Number(p.tickets) || 1), 0) : 0;
  await withRetry(() => getClient().from(TABLES.giveaways).update({ participant_count: count, ticket_count: tickets }).eq('id', gw.id));
  if (guild) await refreshEmbed(guild, { ...gw, participant_count: count, ticket_count: tickets });
}

async function createGiveaway(interaction, prize, durationStr, winners) {
  const guild = interaction.guild;
  const gid = guild.id;
  const t = await i18n.getT(gid);
  const duration = helpers.parseDuration(durationStr);
  if (!duration || duration < 1000) {
    return interaction.reply({ embeds: [embeds.error(t('giveaway.error.invalidDuration'), t('giveaway.error.invalidDuration.msg'), guild)], ephemeral: true });
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
        ticket_count: 0,
        marker: '',
        warned: false,
        ends_at: endsAt.toISOString(),
        ended: false,
        host_id: interaction.user.id,
      })
      .select('*')
      .single()
  );
  if (error || !data) {
    logger.error(`Giveaway konnte nicht gespeichert werden: ${error ? error.message : 'keine Daten'}`);
    return interaction.reply({ embeds: [embeds.error(t('giveaway.error.save'), t('giveaway.error.save.msg'), guild)], ephemeral: true });
  }

  const button = helpers.successButton(`giveaway_join_${data.id}`, t('giveaway.join.button'), '🎉');
  const msg = await channel.send({ embeds: [await runningEmbed(guild, data, t)], components: [helpers.row(button)] });

  await withRetry(() => getClient().from(TABLES.giveaways).update({ message_id: msg.id }).eq('id', data.id));

  const text = hint ? t('giveaway.start.hint', { prize }) : t('giveaway.start.msg', { prize });
  return interaction.reply({ embeds: [embeds.success(t('giveaway.start.title'), text, guild)], ephemeral: true });
}

async function handleJoinButton(interaction) {
  const guild = interaction.guild;
  const gid = guild.id;
  const id = interaction.customId.replace('giveaway_join_', '');
  const t = await i18n.getT(gid);
  const gw = await getById(id);
  if (!gw || gw.guild_id !== gid || gw.ended) {
    return interaction.reply({ embeds: [embeds.error(t('giveaway.notFound.title'), t('giveaway.notFound.msg'), guild)], ephemeral: true });
  }
  if (gw.host_id === interaction.user.id) {
    return interaction.reply({ embeds: [embeds.error(t('giveaway.join.denied.role'), t('giveaway.join.denied.host'), guild)], ephemeral: true });
  }
  const requiredRoles = await settingsService.get(gid, 'giveaway_required_roles');
  const roles = helpers.resolveRoles(guild, requiredRoles);
  if (roles.length) {
    const member = guild.members.cache.get(interaction.user.id);
    if (!member || !roles.some((r) => member.roles.cache.has(r.id))) {
      try { await interaction.user.send(t('giveaway.join.denied.role.msg')); } catch (err) { /* ignorieren */ }
      return interaction.reply({ embeds: [embeds.error(t('giveaway.join.denied.role'), t('giveaway.join.denied.role.msg'), guild)], ephemeral: true });
    }
  }

  const maxTickets = Math.max(parseInt(await settingsService.get(gid, 'giveaway_max_tickets', '5'), 10) || 1, 1);

  const { data: existing } = await withRetry(() =>
    getClient().from(TABLES.giveawayParticipants).select('tickets').eq('giveaway_id', gw.id).eq('discord_id', interaction.user.id).maybeSingle()
  );
  const currentTickets = existing ? Number(existing.tickets) || 1 : 0;
  if (currentTickets >= maxTickets) {
    return interaction.reply({ embeds: [embeds.error(t('giveaway.join.denied.max', { max: maxTickets }), '', guild)], ephemeral: true });
  }

  if (existing) {
    await withRetry(() => getClient().from(TABLES.giveawayParticipants).update({ tickets: currentTickets + 1 }).eq('giveaway_id', gw.id).eq('discord_id', interaction.user.id));
  } else {
    await withRetry(() =>
      getClient().from(TABLES.giveawayParticipants).insert({ giveaway_id: gw.id, discord_id: interaction.user.id, username: interaction.user.username, tickets: 1 })
    );
  }

  await syncCount(guild, gw);
  const newTickets = existing ? currentTickets + 1 : 1;
  return interaction.reply({
    embeds: [embeds.success(t('giveaway.join.title'), t('giveaway.join.added', { prize: gw.prize, tickets: newTickets, max: maxTickets }), guild)],
    ephemeral: true,
  });
}

async function finishGiveaway(client, row) {
  const guild = findGuildByChannel(client, row.channel_id);
  const t = await i18n.getT(row.guild_id);
  if (!guild) {
    await withRetry(() => getClient().from(TABLES.giveaways).update({ ended: true }).eq('id', row.id));
    logger.warn(`Giveaway ${row.id}: Guild nicht gefunden, als beendet markiert`);
    return;
  }

  const channel = guild.channels.cache.get(row.channel_id);
  const message = channel ? await channel.messages.fetch(row.message_id).catch(() => null) : null;

  const { data: participants } = await withRetry(() =>
    getClient().from(TABLES.giveawayParticipants).select('discord_id, tickets').eq('giveaway_id', row.id)
  );
  const pool = buildPool(participants, row.host_id);
  const winners = drawWinners(pool, row.winners_count);

  const participantCount = (participants || []).length;
  await withRetry(() =>
    getClient().from(TABLES.giveaways).update({ ended: true, participant_count: participantCount, ticket_count: row.ticket_count || participantCount }).eq('id', row.id)
  );

  if (message) {
    try { await message.edit({ embeds: [endEmbed(guild, row, winners, t)], components: [] }); } catch (err) { logger.warn(`End-Embed nicht aktualisiert: ${err.message}`); }
  }

  if (winners.length === 0) {
    if (channel) {
      try {
        await channel.send({ embeds: [embeds.warning(t('giveaway.ended.none.title'), t('giveaway.ended.none.msg', { prize: row.prize }), guild)] });
      } catch (err) { /* ignorieren */ }
    }
  } else {
    for (const id of winners) {
      try {
        const u = await client.users.fetch(id);
        await u.send(t('giveaway.winner.dm', { prize: row.prize }));
      } catch (err) { logger.warn(`Gewinner-DM fehlgeschlagen (${id}): ${err.message}`); }
    }
    const announceChannelId = await settingsService.get(row.guild_id, 'giveaway_announce_channel_id');
    if (announceChannelId) {
      const ch = guild.channels.cache.get(announceChannelId);
      if (ch) {
        try {
          await ch.send({ embeds: [embeds.giveaway(t('giveaway.announce.title'), t('giveaway.announce.msg', { winners: winners.map((w) => `<@${w}>`).join(', '), prize: row.prize }), guild)] });
        } catch (err) { logger.warn(`Announcement fehlgeschlagen: ${err.message}`); }
      }
    }
  }

  await auditService.log(row.guild_id, 'System', 'giveaway.finish', { id: row.id, prize: row.prize, winners });
}

async function updateMarkers(client) {
  const { data: running } = await withRetry(() =>
    getClient().from(TABLES.giveaways).select('*').gt('ends_at', new Date().toISOString()).eq('ended', false)
  );
  if (!running) return;
  for (const gw of running) {
    const remaining = new Date(gw.ends_at).getTime() - Date.now();
    const marker = markerFor(remaining);
    if (marker !== gw.marker) {
      await withRetry(() => getClient().from(TABLES.giveaways).update({ marker }).eq('id', gw.id));
      const guild = findGuildByChannel(client, gw.channel_id);
      await refreshEmbed(guild, { ...gw, marker });
      if (marker === MARKER_5M && !gw.warned) {
        await withRetry(() => getClient().from(TABLES.giveaways).update({ warned: true }).eq('id', gw.id));
        const t = await i18n.getT(gw.guild_id);
        const channel = guild && guild.channels.cache.get(gw.channel_id);
        if (channel) {
          try {
            await channel.send({ embeds: [embeds.warning(t('giveaway.warning5m.title'), t('giveaway.warning5m.msg', { prize: gw.prize }), guild)] });
          } catch (err) { logger.warn(`5-Minuten-Warnung fehlgeschlagen: ${err.message}`); }
        }
      }
    }
  }
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
    await updateMarkers(client);
  } catch (err) {
    logger.error(`Giveaway-Check fehlgeschlagen: ${err.message}`);
  } finally {
    checking = false;
  }
}

function startInterval(client) {
  setInterval(() => checkExpired(client), 30 * 1000);
}

async function endNow(interaction, id) {
  const guild = interaction.guild;
  const gid = guild.id;
  const t = await i18n.getT(gid);
  const row = await getById(id);
  if (!row) {
    return interaction.reply({ embeds: [embeds.error(t('giveaway.notFound.title'), t('giveaway.notFound.msg'), guild)], ephemeral: true });
  }
  if (row.guild_id !== gid) {
    return interaction.reply({ embeds: [embeds.error(t('giveaway.notFound.title'), t('giveaway.notFound.msg'), guild)], ephemeral: true });
  }
  if (row.ended) {
    return interaction.reply({ embeds: [embeds.error(t('giveaway.endedAlready.title'), t('giveaway.endedAlready.msg'), guild)], ephemeral: true });
  }
  await finishGiveaway(interaction.client, row);
  await auditService.log(gid, interaction.user.tag, 'giveaway.end', { id: row.id });
  return interaction.reply({ embeds: [embeds.success(t('giveaway.end.title'), t('giveaway.end.msg', { prize: row.prize }), guild)], ephemeral: true });
}

async function extend(interaction, id, durationStr) {
  const guild = interaction.guild;
  const gid = guild.id;
  const t = await i18n.getT(gid);
  const row = await getById(id);
  if (!row || row.ended || row.guild_id !== gid) {
    return interaction.reply({ embeds: [embeds.error(t('giveaway.notFoundEnded.title'), t('giveaway.notFoundEnded.msg'), guild)], ephemeral: true });
  }
  const duration = helpers.parseDuration(durationStr);
  if (!duration) {
    return interaction.reply({ embeds: [embeds.error(t('giveaway.error.invalidDuration'), t('giveaway.error.invalidDuration.msg'), guild)], ephemeral: true });
  }
  const newEnds = new Date(new Date(row.ends_at).getTime() + duration).toISOString();
  await withRetry(() => getClient().from(TABLES.giveaways).update({ ends_at: newEnds, marker: markerFor(new Date(newEnds).getTime() - Date.now()) }).eq('id', row.id));
  const fresh = { ...row, ends_at: newEnds };
  await refreshEmbed(guild, fresh);
  await auditService.log(gid, interaction.user.tag, 'giveaway.extend', { id: row.id, duration: durationStr });
  return interaction.reply({ embeds: [embeds.success(t('giveaway.extend.title'), t('giveaway.extend.msg', { prize: row.prize, time: helpers.formatDateTime(newEnds) }), guild)], ephemeral: true });
}

async function redraw(interaction, id) {
  const guild = interaction.guild;
  const gid = guild.id;
  const t = await i18n.getT(gid);
  const row = await getById(id);
  if (!row || row.guild_id !== gid) {
    return interaction.reply({ embeds: [embeds.error(t('giveaway.notFound.title'), t('giveaway.notFound.msg'), guild)], ephemeral: true });
  }
  if (!row.ended) {
    return interaction.reply({ embeds: [embeds.error(t('giveaway.activeOnly.title'), t('giveaway.activeOnly.msg'), guild)], ephemeral: true });
  }
  const { data: participants } = await withRetry(() =>
    getClient().from(TABLES.giveawayParticipants).select('discord_id, tickets').eq('giveaway_id', row.id)
  );
  const pool = buildPool(participants, row.host_id);
  const winners = drawWinners(pool, row.winners_count);
  for (const w of winners) {
    try {
      const u = await interaction.client.users.fetch(w);
      await u.send(t('giveaway.winner.dm', { prize: row.prize }));
    } catch (err) { logger.warn(`Gewinner-DM fehlgeschlagen (${w}): ${err.message}`); }
  }
  await auditService.log(gid, interaction.user.tag, 'giveaway.redraw', { id: row.id, winners });
  const text = winners.length ? t('giveaway.redraw.msg', { winners: winners.map((w) => `<@${w}>`).join(', ') }) : t('giveaway.redraw.none');
  return interaction.reply({ embeds: [embeds.success(t('giveaway.redraw.title'), text, guild)], ephemeral: true });
}

async function participantsList(interaction, id) {
  const guild = interaction.guild;
  const gid = guild.id;
  const t = await i18n.getT(gid);
  const row = await getById(id);
  if (!row || row.guild_id !== gid) {
    return interaction.reply({ embeds: [embeds.error(t('giveaway.notFound.title'), t('giveaway.notFound.msg'), guild)], ephemeral: true });
  }
  const { data } = await withRetry(() =>
    getClient().from(TABLES.giveawayParticipants).select('username, tickets').eq('giveaway_id', row.id).limit(20)
  );
  const count = await withRetry(() => getClient().from(TABLES.giveawayParticipants).select('discord_id', { count: 'exact' }).eq('giveaway_id', row.id));
  const total = count.count || 0;
  const names = (data || []).map((p) => `${p.username || p.discord_id} (${Number(p.tickets) || 1}x)`).filter(Boolean);
  const more = total > names.length ? t('giveaway.participants.more', { more: total - names.length }) : '';
  return interaction.reply({
    embeds: [embeds.info(t('giveaway.participants.title'), `**${row.prize}**\n${t('giveaway.participants.total', { total })}\n${names.length ? names.join(', ') : t('giveaway.participants.none')}\n${more}`, guild)],
    ephemeral: true,
  });
}

async function cancel(interaction, id) {
  const guild = interaction.guild;
  const gid = guild.id;
  const t = await i18n.getT(gid);
  const row = await getById(id);
  if (!row || row.guild_id !== gid) {
    return interaction.reply({ embeds: [embeds.error(t('giveaway.notFound.title'), t('giveaway.notFound.msg'), guild)], ephemeral: true });
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
  return interaction.reply({ embeds: [embeds.success(t('giveaway.cancel.title'), t('giveaway.cancel.msg', { prize: row.prize }), guild)], ephemeral: true });
}

async function list(interaction) {
  const guild = interaction.guild;
  const gid = guild.id;
  const t = await i18n.getT(gid);
  const { data } = await withRetry(() =>
    getClient().from(TABLES.giveaways).select('*').eq('guild_id', gid).eq('ended', false).order('ends_at', { ascending: true })
  );
  if (!data || data.length === 0) {
    return interaction.reply({ embeds: [embeds.info(t('giveaway.list.title'), t('giveaway.list.none'), guild)], ephemeral: true });
  }
  const lines = data.map(
    (g) => `**ID ${g.id}** — ${g.prize}\n⏰ Endet: ${helpers.formatDateTime(g.ends_at)} · 🎟️ ${g.ticket_count || 0} · 👥 ${g.participant_count}`
  );
  return interaction.reply({ embeds: [embeds.info(t('giveaway.list.title'), lines.join('\n\n'), guild)], ephemeral: true });
}

module.exports = {
  createGiveaway,
  handleJoinButton,
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
