const path = require('path');
require('dotenv').config();

const REQUIRED_SECRETS = ['DISCORD_TOKEN', 'CLIENT_ID', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];

const DEFAULT_SETTINGS = {
  language: 'de',
  theme: 'dark',
  enabled_modules: '["giveaway","tickets"]',
  giveaway_channel_id: '', giveaway_announce_channel_id: '', giveaway_log_channel_id: '', giveaway_required_roles: '', giveaway_excluded_roles: '', giveaway_bonus_role_weights: '', giveaway_default_winners: '1', giveaway_max_tickets: '5', giveaway_min_account_age_days: '0', giveaway_min_server_age_days: '0', giveaway_reroll_keep_winners: 'true', giveaway_announce_winners: 'true', giveaway_winner_dm: 'true',
  ticket_log_channel_id: '', ticket_panel_channel_id: '', ticket_panel_message_id: '', ticket_category_id: '', max_open_tickets: '1', ticket_transcripts_enabled: 'true', ticket_transcripts_on_close: 'true', ticket_transcripts_on_delete: 'true', ticket_auto_close_hours: '72', ticket_auto_delete_hours: '24',
};

const config = {
  requiredSecrets: REQUIRED_SECRETS,
  discordToken: process.env.DISCORD_TOKEN || '', clientId: process.env.CLIENT_ID || '', ownerUserId: process.env.OWNER_USER_ID || '1370372526001356972', discordClientSecret: process.env.DISCORD_CLIENT_SECRET || '', supabaseUrl: process.env.SUPABASE_URL || '', supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '', supabaseDbUrl: process.env.SUPABASE_DB_URL || '',   webPort: parseInt(process.env.WEB_PORT || '3000', 10), webUrl: (process.env.WEB_URL || 'http://localhost:3000').replace(/\/+$/, ''), sessionSecret: process.env.SESSION_SECRET || 'notruf-hamburg-dev-secret', debug: process.env.DEBUG === '1', dataDir: path.join(__dirname, '..', 'data'), logDir: path.join(__dirname, '..', 'logs'), transcriptDir: path.join(__dirname, '..', 'data', 'transcripts'),
  selfUpdate: process.env.AUTO_UPDATE === 'true', selfUpdateIntervalMs: Math.max(30000, parseInt(process.env.AUTO_UPDATE_INTERVAL_MS || '120000', 10)),
};

module.exports = { config, DEFAULT_SETTINGS };
