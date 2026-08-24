'use strict';

const COMPONENTS_V2 = 1 << 15;
const EPHEMERAL = 1 << 6;

let installed = false;

function isV2Container(entry) {
  return Boolean(entry) && (entry.type === 17 || entry.__v2 === true);
}

function upgrade(obj, isEdit) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj) || !Array.isArray(obj.embeds)) return;
  if (!obj.embeds.some(isV2Container)) return;
  const containers = obj.embeds.map((e) => {
    if (!e || typeof e !== 'object') return e;
    const { __v2, ...rest } = e;
    return rest;
  });
  obj.components = [...containers, ...(Array.isArray(obj.components) ? obj.components : [])];
  delete obj.embeds;
  let flags = Number(obj.flags || 0);
  if (obj.ephemeral) {
    flags |= EPHEMERAL;
    delete obj.ephemeral;
  }
  flags |= COMPONENTS_V2;
  obj.flags = flags;
}

function install() {
  if (installed) return;
  installed = true;
  const { REST } = require('@discordjs/rest');
  const original = REST.prototype.request;
  REST.prototype.request = async function requestWithComponentsV2(options = {}) {
    try {
      const isEdit = String(options.method || '').toUpperCase() === 'PATCH';
      upgrade(options.body, isEdit);
      if (options.body && typeof options.body === 'object' && options.body.data) upgrade(options.body.data, isEdit);
    } catch (_) {}
    return original.call(this, options);
  };
}

module.exports = { install };
