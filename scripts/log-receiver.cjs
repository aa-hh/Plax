#!/usr/bin/env node
/**
 * Mac-side HTTP log sink for Plax TV debug (webOS 4).
 * TV POSTs JSON to /log; lines append to logs/tv.log and stdout.
 *
 * Usage: npm run log:receive
 *        PORT=8765 node scripts/log-receiver.cjs
 */

var http = require('http');
var fs = require('fs');
var path = require('path');
var os = require('os');

var DEFAULT_PORT = 8765;
// Dev-only LAN log sink: the TV is a separate device, so by default we must
// listen on all interfaces for it to POST in. Override with LOG_RECEIVER_HOST
// (e.g. a specific LAN IP) to narrow the exposure on untrusted networks.
var HOST = process.env.LOG_RECEIVER_HOST || '0.0.0.0';
var LOG_DIR = path.join(__dirname, '..', 'logs');
var LOG_FILE = path.join(LOG_DIR, 'tv.log');

function pad2(n) {
  return n < 10 ? '0' + n : String(n);
}

function formatStdoutTimestamp(date) {
  date = date || new Date();
  return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate()) +
    ' ' + pad2(date.getHours()) + ':' + pad2(date.getMinutes()) + ':' + pad2(date.getSeconds());
}

/**
 * Normalize one log entry from JSON object or plain text line.
 * @param {string|object} input
 * @returns {{ level: string, tag: string, message: string, ts: string, line: string }}
 */
function normalizeLogEntry(input) {
  var level = 'log';
  var tag = 'tv';
  var message = '';
  var ts = new Date().toISOString();

  if (input && typeof input === 'object' && !Array.isArray(input)) {
    if (input.level != null) level = String(input.level);
    if (input.tag != null) tag = String(input.tag);
    if (input.message != null) message = String(input.message);
    else if (input.msg != null) message = String(input.msg);
    if (input.ts != null) ts = String(input.ts);
    if (input.detail != null && input.detail !== '') {
      message = message ? message + ' ' + String(input.detail) : String(input.detail);
    }
  } else {
    message = String(input == null ? '' : input).trim();
  }

  var line = ts + ' [' + level + '] [' + tag + '] ' + message;
  return { level: level, tag: tag, message: message, ts: ts, line: line };
}

/**
 * Parse request body into one or more log lines.
 * @param {string} body
 * @param {string} contentType
 * @returns {string[]}
 */
function parseLogBody(body, contentType) {
  var trimmed = (body || '').trim();
  if (!trimmed) return [];

  var ct = (contentType || '').toLowerCase();
  if (ct.indexOf('application/json') !== -1 || trimmed.charAt(0) === '{' || trimmed.charAt(0) === '[') {
    try {
      var parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map(function (item) { return normalizeLogEntry(item).line; });
      }
      return [normalizeLogEntry(parsed).line];
    } catch (e) {
      return [normalizeLogEntry(trimmed).line];
    }
  }

  return trimmed.split(/\r?\n/).filter(Boolean).map(function (row) {
    return normalizeLogEntry(row).line;
  });
}

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function ensureLogFile() {
  ensureLogDir();
  if (!fs.existsSync(LOG_FILE)) {
    fs.writeFileSync(LOG_FILE, '', 'utf8');
  }
}

function getLanIpHint() {
  var nets = os.networkInterfaces();
  var candidates = [];
  Object.keys(nets).forEach(function (name) {
    (nets[name] || []).forEach(function (iface) {
      if (iface && iface.family === 'IPv4' && !iface.internal) {
        candidates.push(iface.address);
      }
    });
  });
  return candidates[0] || '192.168.x.x';
}

function appendLogLines(lines) {
  if (!lines.length) return;
  ensureLogDir();
  var blob = lines.join('\n') + '\n';
  fs.appendFileSync(LOG_FILE, blob, 'utf8');
  lines.forEach(function (line) {
    console.log('[' + formatStdoutTimestamp() + '] ' + line);
  });
}

function readRequestBody(req) {
  return new Promise(function (resolve, reject) {
    var chunks = [];
    req.on('data', function (chunk) { chunks.push(chunk); });
    req.on('end', function () {
      resolve(Buffer.concat(chunks).toString('utf8'));
    });
    req.on('error', reject);
  });
}

function createLogReceiverServer(options) {
  options = options || {};
  var logFile = options.logFile || LOG_FILE;

  function append(lines) {
    if (!lines.length) return;
    var dir = path.dirname(logFile);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(logFile, lines.join('\n') + '\n', 'utf8');
    lines.forEach(function (line) {
      console.log('[' + formatStdoutTimestamp() + '] ' + line);
    });
  }

  return http.createServer(function (req, res) {
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('ok\n');
      return;
    }

    if (req.method !== 'POST' || req.url !== '/log') {
      res.writeHead(req.method === 'OPTIONS' ? 204 : 404, {
        'Content-Type': 'text/plain',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      });
      res.end(req.method === 'OPTIONS' ? '' : 'Not found\n');
      return;
    }

    readRequestBody(req).then(function (body) {
      var lines = parseLogBody(body, req.headers['content-type']);
      append(lines);
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*'
      });
      res.end();
    }).catch(function (err) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Bad request: ' + (err && err.message ? err.message : String(err)) + '\n');
    });
  });
}

function startServer() {
  var port = Number(process.env.PORT) || DEFAULT_PORT;
  ensureLogFile();
  var server = createLogReceiverServer();
  server.on('error', function (err) {
    if (err && err.code === 'EADDRINUSE') {
      console.error('Port ' + port + ' in use — kill with: lsof -i :' + port);
      console.error('Or use another port: PORT=8766 npm run log:receive');
      process.exit(1);
    }
    console.error('Log receiver failed:', err && err.message ? err.message : err);
    process.exit(1);
  });
  server.listen(port, HOST, function () {
    var lan = getLanIpHint();
    var sinkUrl = 'http://' + lan + ':' + port + '/log';
    console.log('Plax TV log receiver ready.');
    console.log('Tail logs: tail -f logs/tv.log');
    console.log('Log file: ' + LOG_FILE);
    console.log('POST endpoint: http://0.0.0.0:' + port + '/log');
    console.log('TV Settings → Log sink URL → ' + sinkUrl);
    console.log('Mac LAN IP hint: ' + lan + ' (use this if the TV cannot reach localhost)');
    console.log('Or: ares-launch -p \'{"debug":1,"logSink":"' + sinkUrl + '"}\' ...');
  });
  return server;
}

if (require.main === module) {
  startServer();
}

module.exports = {
  parseLogBody,
  normalizeLogEntry,
  createLogReceiverServer,
  DEFAULT_PORT,
  LOG_FILE
};
