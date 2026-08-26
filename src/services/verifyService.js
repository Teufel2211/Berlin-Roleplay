const { getClient, TABLES, withRetry } = require('../supabase');
const settingsService = require('./settingsService');
const auditService = require('./auditService');
const embeds = require('../discord/embeds');
const helpers = require('../discord/helpers');
const logger = require('../logger');

const RULES_PENDING_TTL_MS = 60000;
const RULES_TEXT_MAX = 4000;
const rulesPending = new Map();

function getAccountAgeDays(user) {
  if (!user || !user.createdTimestamp) return 0;
  return Math.floor((Date.now() - user.createdTimestamp) / 86400000);
}

async function writeVerifyLog(guild, title, description) {
  const logChannelId = await settingsService.get(guild.id, 'verify_log_channel_id');
  if (!logChannelId) return;
  const logChannel = guild.channels.cache.get(logChannelId);
  if (!logChannel) return;
  try { await logChannel.send({ embeds: [embeds.info(title, description, guild)] }); } catch (err) { logger.warn(`Verifizierungslog fehlgeschlagen: ${err.message}`); }
}

async function fetchRulesMessage(guild, channelId) {
  if (!channelId) return null;
  const channel = guild.channels.cache.get(channelId);
  if (!channel || !channel.isTextBased()) return null;
  try {
    const messages = await channel.messages.fetch({ limit: 1 });
    return messages.first() || null;
  } catch (err) {
    logger.warn(`Regeln-Nachricht konnte nicht gelesen werden: ${err.message}`);
    return null;
  }
}

function rulesTextFromMessage(message) {
  if (!message) return null;
  let text = message.content;
  if (!text && message.embeds.length) text = message.embeds.map((e) => e.description || '').join('\n');
  if (!text || !text.trim()) return null;
  return text.length > RULES_TEXT_MAX ? `${text.slice(0, RULES_TEXT_MAX)}…` : text;
}

async function grantVerification(interaction) {
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

async function handlePanelButton(interaction) {
  const guild = interaction.guild;
  const gid = guild.id;
  const member = interaction.member;
  const verifiedRoles = await settingsService.get(gid, 'verified_roles');
  const roles = helpers.resolveRoles(guild, verifiedRoles);
  if (!roles.length) return interaction.reply({ embeds: [embeds.error('Keine Rolle konfiguriert', 'Die Verifizierungs-Rolle ist unter Einstellungen nicht gesetzt.', guild)], ephemeral: true });

  const rolesToAdd = roles.filter((r) => !member.roles.cache.has(r.id));
  if (!rolesToAdd.length) return interaction.reply({ embeds: [embeds.info('Bereits verifiziert', 'Du bist bereits verifiziert.', guild)], ephemeral: true });

  const rulesChannelId = await settingsService.get(gid, 'verify_rules_channel_id');
  const rulesMessage = await fetchRulesMessage(guild, rulesChannelId);
  const rulesText = rulesTextFromMessage(rulesMessage);
  if (rulesText) {
    rulesPending.set(`${gid}:${member.id}`, Date.now());
    const embed = embeds.info('Regeln akzeptieren', rulesText, guild);
    const row = helpers.row(helpers.successButton(`verify_accept_rules_${member.id}`, 'Regeln akzeptieren', '✅'));
    return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
  }

  return grantVerification(interaction);
}

async function handleAcceptRules(interaction) {
  const guild = interaction.guild;
  const gid = guild.id;
  const ownerId = interaction.customId.replace(/^verify_accept_rules_/, '');
  if (!ownerId || interaction.user.id !== ownerId) {
    return interaction.reply({ embeds: [embeds.error('Nicht für dich', 'Dieser Button gehört zur Verifizierung eines anderen Mitglieds. Klicke selbst auf **Verifizieren** im Panel.', guild)], ephemeral: true });
  }

  const started = rulesPending.get(`${gid}:${ownerId}`) || 0;
  if (!started || Date.now() - started > RULES_PENDING_TTL_MS) {
    rulesPending.delete(`${gid}:${ownerId}`);
    return interaction.reply({ embeds: [embeds.error('Zeit abgelaufen', 'Die Zeit zum Akzeptieren der Regeln ist abgelaufen. Klicke erneut auf **Verifizieren** im Panel.', guild)], ephemeral: true });
  }
  rulesPending.delete(`${gid}:${ownerId}`);

  return grantVerification(interaction);
}

module.exports = { handlePanelButton, handleAcceptRules };
