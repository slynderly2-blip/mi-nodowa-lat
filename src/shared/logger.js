'use strict';
/** src/shared/logger.js — Logger simple con colores */

const colors = {
  reset:  '\x1b[0m',
  cyan:   '\x1b[36m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  red:    '\x1b[31m',
  dim:    '\x1b[2m',
  bold:   '\x1b[1m',
};

function ts() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

const log = {
  info:  (...a) => console.log(`${colors.cyan}[${ts()}] INFO${colors.reset}`, ...a),
  ok:    (...a) => console.log(`${colors.green}[${ts()}] OK  ${colors.reset}`, ...a),
  warn:  (...a) => console.warn(`${colors.yellow}[${ts()}] WARN${colors.reset}`, ...a),
  error: (...a) => console.error(`${colors.red}[${ts()}] ERR ${colors.reset}`, ...a),
  dim:   (...a) => console.log(`${colors.dim}[${ts()}] DBG ${colors.reset}`, ...a),
  req:   (method, url, status, ms) =>
    console.log(`${colors.dim}[${ts()}] ${method.padEnd(6)} ${url.padEnd(40)} → ${status} (${ms}ms)${colors.reset}`),
};

module.exports = log;
