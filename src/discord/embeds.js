const { EmbedBuilder } = require('discord.js');

const COLORS = {
  info: 0x2B3A67,
  success: 0x2ECC71,
  error: 0xE74C3C,
  warning: 0xF1C40F,
  giveaway: 0x9B59B6,
  warteraum: 0x3498DB,
};

function decorate(embed, guild) {
  if (guild) {
    embed.setFooter({ text: `Emergency Hamburg Roleplay • ${guild.name}` });
  }
  embed.setTimestamp(new Date());
  return embed;
}

function info(title, description, guild) {
  return decorate(new EmbedBuilder().setColor(COLORS.info).setTitle(title).setDescription(description), guild);
}

function success(title, description, guild) {
  return decorate(new EmbedBuilder().setColor(COLORS.success).setTitle(title).setDescription(description), guild);
}

function error(title, description, guild) {
  return decorate(new EmbedBuilder().setColor(COLORS.error).setTitle(title).setDescription(description), guild);
}

function warning(title, description, guild) {
  return decorate(new EmbedBuilder().setColor(COLORS.warning).setTitle(title).setDescription(description), guild);
}

function giveaway(title, description, guild, color) {
  return decorate(new EmbedBuilder().setColor(color || COLORS.giveaway).setTitle(title).setDescription(description), guild);
}

function warteraum(title, description, guild) {
  return decorate(new EmbedBuilder().setColor(COLORS.warteraum).setTitle(title).setDescription(description), guild);
}

module.exports = { COLORS, decorate, info, success, error, warning, giveaway, warteraum };
