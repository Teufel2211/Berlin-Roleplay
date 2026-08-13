const { createClient } = require('@supabase/supabase-js');
const { config } = require('./config');
const logger = require('./logger');

let client = null;

const TABLES = {
  warteraum: 'eghr_warteraum',
  users: 'eghr_users',
  giveaways: 'eghr_giveaways',
  giveawayParticipants: 'eghr_giveaway_participants',
  countingStats: 'eghr_counting_stats',
  countingState: 'eghr_counting_state',
  applications: 'eghr_applications',
  tickets: 'eghr_tickets',
  ticketTranscripts: 'eghr_ticket_transcripts',
  auditLog: 'eghr_audit_log',
  settings: 'eghr_settings',
  sessions: 'eghr_sessions',
};

function getClient() {
  if (!client) {
    if (!config.supabaseUrl || !config.supabaseServiceRoleKey) {
      throw new Error('SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY fehlen in .env');
    }
    client = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
      auth: { persistSession: false },
    });
  }
  return client;
}

async function withRetry(fn) {
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < 2) {
        logger.warn(`DB-Aufruf fehlgeschlagen (Versuch ${attempt + 1}): ${err.message}`);
        await new Promise((r) => setTimeout(r, 500));
      }
    }
  }
  throw lastErr;
}

module.exports = { getClient, TABLES, withRetry };
