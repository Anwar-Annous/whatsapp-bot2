const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const LEVELS = { fatal: 0, error: 1, warn: 2, info: 3, debug: 4, trace: 5 };
const CURRENT_LEVEL = LEVELS[LOG_LEVEL] ?? 3;

function shouldLog(level) {
  return (LEVELS[level] ?? 3) <= CURRENT_LEVEL;
}

function formatLog(level, msg, meta = {}) {
  const ts = new Date().toISOString();
  const obj = { ts, level, msg, ...meta };
  return JSON.stringify(obj);
}

function log(level, msg, meta) {
  if (!shouldLog(level)) return;
  const line = formatLog(level, msg, meta);
  if (level === 'error' || level === 'fatal') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }
}

function child(bindings) {
  return {
    fatal: (msg, meta) => log('fatal', msg, { ...bindings, ...meta }),
    error: (msg, meta) => log('error', msg, { ...bindings, ...meta }),
    warn:  (msg, meta) => log('warn',  msg, { ...bindings, ...meta }),
    info:  (msg, meta) => log('info',  msg, { ...bindings, ...meta }),
    debug: (msg, meta) => log('debug', msg, { ...bindings, ...meta }),
    trace: (msg, meta) => log('trace', msg, { ...bindings, ...meta }),
    child: (moreBindings) => child({ ...bindings, ...moreBindings })
  };
}

function requestLogger(req, res, next) {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    log('info', 'HTTP request', {
      method: req.method,
      url: req.url,
      status: res.statusCode,
      durationMs: duration,
      workspaceId: req.workspaceId
    });
  });
  next();
}

module.exports = {
  logger: child({}),
  child,
  requestLogger
};
