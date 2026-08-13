const path = require('path');
require('dotenv').config();

const REQUIRED_SECRETS = ['DISCORD_TOKEN', 'CLIENT_ID', 'GUILD_ID', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];

const DEFAULT_SETTINGS = {
  staff_role: 'Staff',
  admin_role: 'Admin',
  warteraum_role: 'Warteraum',
  verified_role: '',
  verify_channel_id: '',
  verify_dm: 'true',
  verify_log_channel_id: '',
  counting_channel_id: '',
  counting_decimal: 'false',
  counting_target: '',
  counting_milestones_enabled: 'true',
  counting_milestone_channel_id: '',
  ticket_category_id: '',
  ticket_panel_channel_id: '',
  ticket_log_channel_id: '',
  max_open_tickets: '1',
  ticket_transcripts_enabled: 'true',
  application_category_id: '',
  application_cooldown_days: '30',
  application_staff_ping: 'true',
  application_questions: '',
  giveaway_channel_id: '',
  giveaway_default_winners: '1',
  giveaway_required_role: '',
  giveaway_announce_channel_id: '',
  warteraum_voice_channel_id: '',
  warteraum_target_channel_id: '',
};

const config = {
  requiredSecrets: REQUIRED_SECRETS,
  discordToken: process.env.DISCORD_TOKEN || '',
  clientId: process.env.CLIENT_ID || '',
  guildId: process.env.GUILD_ID || '',
  discordClientSecret: process.env.DISCORD_CLIENT_SECRET || '',
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  supabaseDbUrl: process.env.SUPABASE_DB_URL || '',
  webPort: parseInt(process.env.WEB_PORT || '3000', 10),
  webUrl: (process.env.WEB_URL || 'http://localhost:3000').replace(/\/+$/, ''),
  dashboardUser: process.env.DASHBOARD_USER || 'admin',
  dashboardPasswordHash: process.env.DASHBOARD_PASSWORD_HASH || '',
  sessionSecret: process.env.SESSION_SECRET || 'notruf-hamburg-dev-secret',
  debug: process.env.DEBUG === '1',
  dataDir: path.join(__dirname, '..', 'data'),
  logDir: path.join(__dirname, '..', 'logs'),
  transcriptDir: path.join(__dirname, '..', 'data', 'transcripts'),
};

module.exports = { config, DEFAULT_SETTINGS };
