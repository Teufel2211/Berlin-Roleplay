const { createClient } = require('@supabase/supabase-js');
const { config } = require('./config');
const logger = require('./logger');

let client = null;

const TABLES = {
  warteraum: 'eghr_warteraum',
  users: 'eghr_users',
  giveaways: 'eghr_giveaways',
  giveawayParticipants: 'eghr_giveaway_participants',
  applications: 'eghr_applications',
  tickets: 'eghr_tickets',
  ticketTypes: 'eghr_ticket_types',
  ticketSettings: 'eghr_ticket_settings',
  ticketCategories: 'eghr_ticket_categories',
  ticketPanels: 'eghr_ticket_panels',
  ticketQuestions: 'eghr_ticket_questions',
  ticketAnswers: 'eghr_ticket_answers',
  ticketTags: 'eghr_ticket_tags',
  ticketEvents: 'eghr_ticket_events',
  ticketMessages: 'eghr_ticket_messages',
  ticketMembers: 'eghr_ticket_members',
  ticketAssignments: 'eghr_ticket_assignments',
  ticketAutomations: 'eghr_ticket_automations',
  ticketPermissions: 'eghr_ticket_permissions',
  ticketNotifications: 'eghr_ticket_notifications',
  ticketTranscripts: 'eghr_ticket_transcripts',
  ticketTranscriptMessages: 'eghr_ticket_transcript_messages',
  ticketArchives: 'eghr_ticket_archives',
  ticketStatistics: 'eghr_ticket_statistics',
  auditLog: 'eghr_audit_log',
  settings: 'eghr_settings',
  sessions: 'eghr_sessions',
  embeds: 'eghr_embeds',
  interviews: 'eghr_interviews',
  interviewQuestions: 'eghr_interview_questions',
  teamDepartments: 'eghr_team_departments',
  teamRanks: 'eghr_team_ranks',
  teamMembers: 'eghr_team_members',
  teamAbsences: 'eghr_team_absences',
  teamEvents: 'eghr_team_events',
  teamTasks: 'eghr_team_tasks',
  moderationCases: 'eghr_moderation_cases',
  moderationWarnings: 'eghr_moderation_warnings',
  welcomeMessages: 'eghr_welcome_messages',
  verificationAttempts: 'eghr_verification_attempts',
};

function getClient() {
  if (!client) {
    if (!config.supabaseUrl || !config.supabaseServiceRoleKey) throw new Error('SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY fehlen in .env');
    client = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, { auth: { persistSession: false } });
  }
  return client;
}

async function withRetry(fn) {
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try { return await fn(); }
    catch (err) { lastErr = err; if (attempt < 2) { logger.warn(`DB-Aufruf fehlgeschlagen (Versuch ${attempt + 1}): ${err.message}`); await new Promise((r) => setTimeout(r, 500)); } }
  }
  throw lastErr;
}

module.exports = { getClient, TABLES, withRetry };
