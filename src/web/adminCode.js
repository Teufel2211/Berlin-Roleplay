const crypto = require('crypto');
const { config } = require('../config');
const { getClient, TABLES, withRetry } = require('../supabase');
const { sendDirectMessage } = require('./discordApi');
const logger = require('../logger');

const CODE_TTL_MS = 10 * 60 * 1000;

function generateCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

function codeMessage(code) {
  return [
    `Neuer einmaliger Admin-Code für das Dashboard:`,
    ``,
    `\`${code}\``,
    ``,
    `Gültig für 10 Minuten und nur einmal verwendbar.`,
  ].join('\n');
}

async function generateAdminCode() {
  const now = new Date();
  await withRetry(() =>
    getClient().from(TABLES.adminCodes).update({ used: true }).eq('user_id', config.ownerUserId).eq('used', false)
  );
  await withRetry(() =>
    getClient().from(TABLES.adminCodes).delete().lt('expires_at', now.toISOString())
  );
  const code = generateCode();
  const row = {
    code,
    user_id: config.ownerUserId,
    expires_at: new Date(now.getTime() + CODE_TTL_MS).toISOString(),
  };
  const { error } = await getClient().from(TABLES.adminCodes).insert(row).select('id').single();
  if (error) throw new Error(`Code-Speicherung fehlgeschlagen: ${error.message}`);
  try {
    await sendDirectMessage(config.ownerUserId, codeMessage(code));
  } catch (err) {
    logger.warn(`Code-DM fehlgeschlagen: ${err.message}`);
    await getClient().from(TABLES.adminCodes).update({ used: true }).eq('code', code).eq('user_id', config.ownerUserId);
    throw err;
  }
  return code;
}

async function verifyAdminCode(code) {
  if (!code || typeof code !== 'string') return { ok: false, reason: 'invalid' };
  const { data } = await getClient()
    .from(TABLES.adminCodes)
    .select('id, used, expires_at')
    .eq('user_id', config.ownerUserId)
    .eq('code', code.trim())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return { ok: false, reason: 'invalid' };
  if (data.used) return { ok: false, reason: 'used' };
  if (new Date(data.expires_at).getTime() <= Date.now()) return { ok: false, reason: 'expired' };
  await withRetry(() => getClient().from(TABLES.adminCodes).update({ used: true }).eq('id', data.id));
  return { ok: true };
}

async function ensureAdminCode() {
  const { data } = await getClient()
    .from(TABLES.adminCodes)
    .select('code')
    .eq('user_id', config.ownerUserId)
    .eq('used', false)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (data) return data.code;
  return generateAdminCode();
}

module.exports = { generateAdminCode, ensureAdminCode, verifyAdminCode, CODE_TTL_MS };
