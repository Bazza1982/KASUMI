// ============================================================
// KASUMI WORDO — Logger
// Structured, zero-dependency logger for all WORDO modules.
// Log level can be controlled per-module via localStorage:
//   localStorage.setItem('wordo_log_level', 'debug')
//   localStorage.setItem('wordo_log_level_TrackChange', 'debug')
// ============================================================

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

const LEVEL_STYLE: Record<LogLevel, string> = {
  debug: 'color: #888',
  info:  'color: #2196f3; font-weight: bold',
  warn:  'color: #ff9800; font-weight: bold',
  error: 'color: #f44336; font-weight: bold',
}

function getConfiguredLevel(module: string): LogLevel {
  try {
    const moduleKey = `wordo_log_level_${module}`
    const globalKey = 'wordo_log_level'
    const raw = localStorage.getItem(moduleKey) ?? localStorage.getItem(globalKey)
    if (raw && raw in LEVEL_RANK) return raw as LogLevel
  } catch {
    // localStorage not available (SSR / test environment)
  }
  // Default: debug in development, info in production
  return process.env.NODE_ENV === 'development' ? 'debug' : 'info'
}

export interface Logger {
  debug(action: string, detail?: unknown): void
  info(action: string, detail?: unknown): void
  warn(action: string, detail?: unknown): void
  error(action: string, detail?: unknown): void
}

export function createLogger(module: string): Logger {
  function log(level: LogLevel, action: string, detail?: unknown): void {
    const configuredLevel = getConfiguredLevel(module)
    if (LEVEL_RANK[level] < LEVEL_RANK[configuredLevel]) return

    const timestamp = new Date().toISOString().slice(11, 23) // HH:MM:SS.mmm
    const tag = `[WORDO:${module}]`

    if (detail !== undefined) {
      console[level === 'debug' ? 'log' : level](
        `%c${tag} ${level.padEnd(5)} ${action}`,
        LEVEL_STYLE[level],
        detail,
      )
    } else {
      console[level === 'debug' ? 'log' : level](
        `%c${tag} ${level.padEnd(5)} ${action}`,
        LEVEL_STYLE[level],
      )
    }

    // In error cases, also log timestamp for correlation
    if (level === 'error') {
      console.error(`%c${tag} timestamp: ${timestamp}`, 'color: #888')
    }
  }

  return {
    debug: (action, detail) => log('debug', action, detail),
    info:  (action, detail) => log('info',  action, detail),
    warn:  (action, detail) => log('warn',  action, detail),
    error: (action, detail) => log('error', action, detail),
  }
}
