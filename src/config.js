const path = require('path');
require('dotenv').config();

const REQUIRED_SECRETS = ['DISCORD_TOKEN', 'CLIENT_ID', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];

const DEFAULT_SETTINGS = {
  staff_roles: '',
  admin_roles: '',
  warteraum_roles: '',
  verified_roles: '',
  giveaway_required_roles: '',
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
  giveaway_announce_channel_id: '',
  warteraum_voice_channel_id: '',
  warteraum_target_channel_id: '',
  interview_channel_id: '',
  interview_max_per_section: '20',
  interview_pass_threshold: '45',
};

const config = {
  requiredSecrets: REQUIRED_SECRETS,
  discordToken: process.env.DISCORD_TOKEN || '',
  clientId: process.env.CLIENT_ID || '',
  ownerUserId: process.env.OWNER_USER_ID || '1370372526001356972',
  discordClientSecret: process.env.DISCORD_CLIENT_SECRET || '',
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  supabaseDbUrl: process.env.SUPABASE_DB_URL || '',
  webPort: parseInt(process.env.WEB_PORT || '3000', 10),
  webUrl: (process.env.WEB_URL || 'http://localhost:3000').replace(/\/+$/, ''),
  sessionSecret: process.env.SESSION_SECRET || 'notruf-hamburg-dev-secret',
  debug: process.env.DEBUG === '1',
  dataDir: path.join(__dirname, '..', 'data'),
  logDir: path.join(__dirname, '..', 'logs'),
  transcriptDir: path.join(__dirname, '..', 'data', 'transcripts'),
};

module.exports = { config, DEFAULT_SETTINGS };
