const { getClient, TABLES, withRetry } = require('../supabase');
const settingsService = require('./settingsService');
const auditService = require('./auditService');
const embeds = require('../discord/embeds');
const helpers = require('../discord/helpers');
const logger = require('../logger');

const MILESTONES = [100, 500, 1000, 2500, 5000, 10000];

let state = null;
let loading = null;

async function getState() {
  if (state) return state;
  if (!loading) {
    loading = (async () => {
      const { data } = await withRetry(() =>
        getClient().from(TABLES.countingState).select('*').eq('id', true).maybeSingle()
      );
      state = data || { id: true, current_number: 0, last_user_id: null, streak: 0, best_streak: 0 };
      if (!data) {
        await withRetry(() => getClient().from(TABLES.countingState).insert({ id: true, current_number: 0, last_user_id: null, streak: 0, best_streak: 0 }));
      }
      return state;
    })();
  }
  return loading;
}

async function saveState() {
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
      .eq('id', true)
  );
}

async function bumpStats(discordId, { count = 0, wrong = false } = {}) {
  const { data: cur } = await withRetry(() =>
    getClient().from(TABLES.countingStats).select('*').eq('discord_id', discordId).maybeSingle()
  );
  const next = {
    discord_id: discordId,
    count: (cur ? cur.count : 0) + count,
    wrong_counts: (cur ? cur.wrong_counts : 0) + (wrong ? 1 : 0),
  };
  await withRetry(() => getClient().from(TABLES.countingStats).upsert(next, { onConflict: 'discord_id' }));
}

async function handleMessage(message) {
  if (message.author.bot) return;
  const settings = await settingsService.getAll();
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

  const st = await getState();
  const expected = st.current_number + 1;

  if (value === null) {
    await wrong(message, settings, st, 'das ist keine Zahl', raw);
    return;
  }
  if (st.last_user_id === message.author.id) {
    await wrong(message, settings, st, 'du darfst nicht zweimal hintereinander zählen', raw);
    return;
  }
  if (value !== expected) {
    await wrong(message, settings, st, `du hast \`${raw}\` gesagt, erwartet wurde \`${expected}\``, raw);
    return;
  }

  st.current_number = value;
  st.last_user_id = message.author.id;
  st.streak += 1;
  if (st.streak > st.best_streak) st.best_streak = st.streak;
  await saveState();
  await bumpStats(message.author.id, { count: 1 });

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
    await saveState();
  }
}

function isMilestone(n) {
  if (MILESTONES.includes(n)) return n;
  if (n > 10000 && n % 10000 === 0) return n;
  return null;
}

async function wrong(message, settings, st, reason, raw) {
  st.current_number = 0;
  st.streak = 0;
  st.last_user_id = null;
  await saveState();
  await bumpStats(message.author.id, { wrong: true });

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
  const { data } = await withRetry(() =>
    getClient().from(TABLES.countingStats).select('discord_id, count').order('count', { ascending: false }).limit(10)
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
  const discordId = target ? target.id : interaction.user.id;
  const { data } = await withRetry(() =>
    getClient().from(TABLES.countingStats).select('*').eq('discord_id', discordId).maybeSingle()
  );
  const st = await getState();
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
  const st = await getState();
  st.current_number = value;
  st.streak = 0;
  st.last_user_id = null;
  await saveState();
  await auditService.log(interaction.user.tag, 'counting.set', { value });
  return interaction.reply({ embeds: [embeds.success('Zähler gesetzt', `Der Zählerstand wurde auf **${helpers.formatNumber(value)}** gesetzt.`, guild)], ephemeral: true });
}

async function setTarget(interaction, value) {
  const guild = interaction.guild;
  await settingsService.setMany({ counting_target: String(value) });
  await auditService.log(interaction.user.tag, 'counting.target', { value });
  return interaction.reply({ embeds: [embeds.success('Ziel gesetzt', `Neues Zähl-Ziel: **${helpers.formatNumber(value)}**.`, guild)], ephemeral: true });
}

async function clearTarget(interaction) {
  const guild = interaction.guild;
  await settingsService.setMany({ counting_target: '' });
  await auditService.log(interaction.user.tag, 'counting.target.clear', {});
  return interaction.reply({ embeds: [embeds.success('Ziel entfernt', 'Das Zähl-Ziel wurde entfernt (unendlich).', guild)], ephemeral: true });
}

async function reset(interaction) {
  const guild = interaction.guild;
  const st = await getState();
  st.current_number = 0;
  st.streak = 0;
  st.last_user_id = null;
  st.best_streak = 0;
  await saveState();
  await auditService.log(interaction.user.tag, 'counting.reset', {});
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
