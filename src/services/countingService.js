const { getClient, TABLES, withRetry } = require('../supabase');
const settingsService = require('./settingsService');
const auditService = require('./auditService');
const embeds = require('../discord/embeds');
const helpers = require('../discord/helpers');
const logger = require('../logger');

const MILESTONES = [100, 500, 1000, 2500, 5000, 10000];

const states = new Map();

async function getState(guildId) {
  if (states.has(guildId)) return states.get(guildId);
  const { data } = await withRetry(() =>
    getClient().from(TABLES.countingState).select('*').eq('guild_id', guildId).maybeSingle()
  );
  let state = data || { guild_id: guildId, current_number: 0, last_user_id: null, streak: 0, best_streak: 0 };
  if (!data) {
    await withRetry(() =>
      getClient().from(TABLES.countingState).insert({ guild_id: guildId, current_number: 0, last_user_id: null, streak: 0, best_streak: 0 })
    );
  }
  states.set(guildId, state);
  return state;
}

async function saveState(guildId) {
  const state = states.get(guildId);
  if (!state) return;
  await withRetry(() =>
    getClient()
      .from(TABLES.countingState)
      .update({
        current_number: state.current_number,
        last_user_id: state.last_user_id,
        streak: state.streak,
        best_streak: state.best_streak,
      })
      .eq('guild_id', guildId)
  );
}

async function bumpStats(guildId, discordId, { count = 0, wrong = false } = {}) {
  const { data: cur } = await withRetry(() =>
    getClient().from(TABLES.countingStats).select('*').eq('guild_id', guildId).eq('discord_id', discordId).maybeSingle()
  );
  const next = {
    guild_id: guildId,
    discord_id: discordId,
    count: (cur ? cur.count : 0) + count,
    wrong_counts: (cur ? cur.wrong_counts : 0) + (wrong ? 1 : 0),
  };
  await withRetry(() => getClient().from(TABLES.countingStats).upsert(next, { onConflict: 'guild_id,discord_id' }));
}

async function handleMessage(message) {
  if (message.author.bot || !message.guild) return;
  const gid = message.guild.id;
  const settings = await settingsService.getAll(gid);
  if (!settings.counting_channel_id || message.channelId !== settings.counting_channel_id) return;

  const raw = message.content.trim();
  const decimal = settings.counting_decimal === 'true';
  let value = null;
  if (decimal) {
    const cleaned = raw.replace(',', '.');
    if (/^-?\d+(\.\d+)?$/.test(cleaned)) value = parseFloat(cleaned);
  } else if (/^-?\d+$/.test(raw)) {
    value = parseInt(raw, 10);
  }

  const st = await getState(gid);
  const expected = st.current_number + 1;

  if (value === null) {
    await wrong(message, settings, st, gid, 'das ist keine Zahl', raw);
    return;
  }
  if (st.last_user_id === message.author.id) {
    await wrong(message, settings, st, gid, 'du darfst nicht zweimal hintereinander zählen', raw);
    return;
  }
  if (value !== expected) {
    await wrong(message, settings, st, gid, `du hast \`${raw}\` gesagt, erwartet wurde \`${expected}\``, raw);
    return;
  }

  st.current_number = value;
  st.last_user_id = message.author.id;
  st.streak += 1;
  if (st.streak > st.best_streak) st.best_streak = st.streak;
  await saveState(gid);
  await bumpStats(gid, message.author.id, { count: 1 });

  try { await message.react('✅'); } catch (err) { /* ignorieren */ }

  const milestone = isMilestone(st.current_number);
  if (settings.counting_milestones_enabled === 'true' && milestone) {
    const milestoneChannelId = settings.counting_milestone_channel_id || settings.counting_channel_id;
    const ch = message.guild.channels.cache.get(milestoneChannelId);
    if (ch) {
      try {
        await ch.send({ embeds: [embeds.success('🎯 Meilenstein', `**${helpers.formatNumber(milestone)}** erreicht!`, message.guild)] });
      } catch (err) { logger.warn(`Meilenstein-Embed nicht gesendet: ${err.message}`); }
    }
  }

  if (settings.counting_target && st.current_number >= parseInt(settings.counting_target, 10)) {
    const ch = message.guild.channels.cache.get(settings.counting_channel_id);
    if (ch) {
      try {
        await ch.send({ embeds: [embeds.success('🎉 Ziel erreicht', `**${helpers.formatNumber(st.current_number)}** erreicht! Der Zähler startet von vorn.`, message.guild)] });
      } catch (err) { logger.warn(`Ziel-Embed nicht gesendet: ${err.message}`); }
    }
    st.current_number = 0;
    st.streak = 0;
    st.last_user_id = null;
    await saveState(gid);
  }
}

function isMilestone(n) {
  if (MILESTONES.includes(n)) return n;
  if (n > 10000 && n % 10000 === 0) return n;
  return null;
}

async function wrong(message, settings, st, gid, reason, raw) {
  st.current_number = 0;
  st.streak = 0;
  st.last_user_id = null;
  await saveState(gid);
  await bumpStats(gid, message.author.id, { wrong: true });

  const ch = message.guild.channels.cache.get(settings.counting_channel_id);
  if (ch) {
    try {
      await ch.send({
        embeds: [embeds.error('❌ Falsch', `<@${message.author.id}> hat \`${raw}\` gesagt — ${reason}. Der Zähler ist zurück auf **0**.`, message.guild)],
      });
    } catch (err) { logger.warn(`Fehler-Embed nicht gesendet: ${err.message}`); }
  }
}

async function leaderboard(interaction) {
  const guild = interaction.guild;
  const gid = guild.id;
  const { data } = await withRetry(() =>
    getClient().from(TABLES.countingStats).select('discord_id, count').eq('guild_id', gid).order('count', { ascending: false }).limit(10)
  );
  if (!data || data.length === 0) {
    return interaction.reply({ embeds: [embeds.info('📊 Counting Leaderboard', 'Noch keine Daten vorhanden.', guild)] });
  }
  const lines = data.map((r, i) => {
    const medal = ['🥇', '🥈', '🥉'][i] || `${i + 1}.`;
    return `${medal} <@${r.discord_id}> — **${helpers.formatNumber(r.count)}** Zahlen`;
  });
  return interaction.reply({ embeds: [embeds.info('📊 Counting Leaderboard', lines.join('\n'), guild)] });
}

async function stats(interaction, target) {
  const guild = interaction.guild;
  const gid = guild.id;
  const discordId = target ? target.id : interaction.user.id;
  const { data } = await withRetry(() =>
    getClient().from(TABLES.countingStats).select('*').eq('guild_id', gid).eq('discord_id', discordId).maybeSingle()
  );
  const st = await getState(gid);
  const isSelf = !target || target.id === interaction.user.id;
  if (!data) {
    return interaction.reply({
      embeds: [embeds.info('📊 Counting Stats', isSelf ? 'Du hast noch nicht gezählt.' : `<@${discordId}> hat noch nicht gezählt.`, guild)],
      ephemeral: true,
    });
  }
  const embed = embeds.info(
    '📊 Counting Stats',
    `**Korrekte Zahlen:** ${helpers.formatNumber(data.count)}\n` +
    `**Falsche Beiträge:** ${helpers.formatNumber(data.wrong_counts)}\n` +
    `**Aktuelle Serie:** ${st && st.last_user_id === discordId ? st.streak : (st && st.streak || 0)}` +
    `\n**Rekord-Serie:** ${st ? st.best_streak : 0}`,
    guild
  );
  return interaction.reply({ embeds: [embed] });
}

async function setNumber(interaction, value) {
  const guild = interaction.guild;
  const gid = guild.id;
  const st = await getState(gid);
  st.current_number = value;
  st.streak = 0;
  st.last_user_id = null;
  await saveState(gid);
  await auditService.log(gid, interaction.user.tag, 'counting.set', { value });
  return interaction.reply({ embeds: [embeds.success('Zähler gesetzt', `Der Zählerstand wurde auf **${helpers.formatNumber(value)}** gesetzt.`, guild)], ephemeral: true });
}

async function setTarget(interaction, value) {
  const guild = interaction.guild;
  const gid = guild.id;
  await settingsService.setMany(gid, { counting_target: String(value) });
  await auditService.log(gid, interaction.user.tag, 'counting.target', { value });
  return interaction.reply({ embeds: [embeds.success('Ziel gesetzt', `Neues Zähl-Ziel: **${helpers.formatNumber(value)}**.`, guild)], ephemeral: true });
}

async function clearTarget(interaction) {
  const guild = interaction.guild;
  const gid = guild.id;
  await settingsService.setMany(gid, { counting_target: '' });
  await auditService.log(gid, interaction.user.tag, 'counting.target.clear', {});
  return interaction.reply({ embeds: [embeds.success('Ziel entfernt', 'Das Zähl-Ziel wurde entfernt (unendlich).', guild)], ephemeral: true });
}

async function reset(interaction) {
  const guild = interaction.guild;
  const gid = guild.id;
  const st = await getState(gid);
  st.current_number = 0;
  st.streak = 0;
  st.last_user_id = null;
  st.best_streak = 0;
  await saveState(gid);
  await auditService.log(gid, interaction.user.tag, 'counting.reset', {});
  return interaction.reply({ embeds: [embeds.success('Zähler zurückgesetzt', 'Der Zähler wurde auf **0** zurückgesetzt.', guild)], ephemeral: true });
}

module.exports = {
  handleMessage,
  leaderboard,
  stats,
  setNumber,
  setTarget,
  clearTarget,
  reset,
  getState,
};
