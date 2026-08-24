const COLORS = {
  info: 0x2B3A67,
  success: 0x2ECC71,
  error: 0xE74C3C,
  warning: 0xF1C40F,
  giveaway: 0x9B59B6,
  warteraum: 0x3498DB,
};

function footerText(guild) {
  return guild ? `Emergency Hamburg Roleplay • ${guild.name}` : 'Emergency Hamburg Roleplay';
}

function v2(opts = {}) {
  const {
    color = COLORS.info,
    title = '',
    description = '',
    fields = [],
    thumbnail = '',
    image = '',
    footer = '',
    guild = null,
    components = [],
  } = opts;
  const children = [];
  const texts = [];
  if (title) texts.push(`## ${title}`);
  if (description) texts.push(String(description));
  if (texts.length) {
    const section = { type: 9, components: [{ type: 10, content: texts.join('\n\n') }] };
    if (thumbnail) section.accessory = { type: 11, media: { url: String(thumbnail) } };
    children.push(section);
  }
  for (const field of Array.isArray(fields) ? fields.slice(0, 25) : []) {
    if (!field || !field.name || !field.value) continue;
    children.push({ type: 10, content: `**${field.name}**\n${field.value}` });
  }
  if (image) children.push({ type: 12, items: [{ media: { url: String(image) } }] });
  for (const row of Array.isArray(components) ? components : []) children.push(row);
  children.push({ type: 14, divider: true, spacing: 1 });
  children.push({ type: 10, content: `-# ${footer || footerText(guild)}` });
  return { type: 17, accent_color: Number(color) || COLORS.info, components: children };
}

function info(title, description, guild) {
  return v2({ color: COLORS.info, title, description, guild });
}

function success(title, description, guild) {
  return v2({ color: COLORS.success, title, description, guild });
}

function error(title, description, guild) {
  return v2({ color: COLORS.error, title, description, guild });
}

function warning(title, description, guild) {
  return v2({ color: COLORS.warning, title, description, guild });
}

function giveaway(title, description, guild, color, opts = {}) {
  return v2({ color: color || COLORS.giveaway, title, description, guild, footer: opts.footer || '' });
}

function warteraum(title, description, guild) {
  return v2({ color: COLORS.warteraum, title, description, guild });
}

module.exports = { COLORS, v2, footerText, info, success, error, warning, giveaway, warteraum };
