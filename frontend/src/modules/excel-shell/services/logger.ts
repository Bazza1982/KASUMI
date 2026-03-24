type LogLevel = 'debug' | 'info' | 'warn' | 'error'
type LogNamespace = 'Grid' | 'Store' | 'Comments' | 'Formatting' | 'ChangeLog' | 'LinkRow' | 'AIContext' | 'Filter' | 'ContextMenu'

const IS_DEV = process.env.NODE_ENV !== 'production'

const LEVEL_PRIORITY: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 }
const MIN_LEVEL: LogLevel = IS_DEV ? 'debug' : 'warn'

const LEVEL_STYLE: Record<LogLevel, string> = {
  debug: 'color: #888',
  info: 'color: #4a9eff',
  warn: 'color: #f0a500',
  error: 'color: #ff4444; font-weight: bold',
}

function log(namespace: LogNamespace, level: LogLevel, action: string, detail?: object) {
  if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[MIN_LEVEL]) return
  const prefix = `[NEXCEL:${namespace}]`
  const msg = detail ? `${action}` : action
  if (detail) {
    console[level === 'debug' ? 'log' : level](`%c${prefix} ${level} ${msg}`, LEVEL_STYLE[level], detail)
  } else {
    console[level === 'debug' ? 'log' : level](`%c${prefix} ${level} ${msg}`, LEVEL_STYLE[level])
  }
}

export const NexcelLogger = {
  grid: (level: LogLevel, action: string, detail?: object) => log('Grid', level, action, detail),
  store: (level: LogLevel, action: string, detail?: object) => log('Store', level, action, detail),
  comments: (level: LogLevel, action: string, detail?: object) => log('Comments', level, action, detail),
  formatting: (level: LogLevel, action: string, detail?: object) => log('Formatting', level, action, detail),
  changeLog: (level: LogLevel, action: string, detail?: object) => log('ChangeLog', level, action, detail),
  linkRow: (level: LogLevel, action: string, detail?: object) => log('LinkRow', level, action, detail),
  aiContext: (level: LogLevel, action: string, detail?: object) => log('AIContext', level, action, detail),
  filter: (level: LogLevel, action: string, detail?: object) => log('Filter', level, action, detail),
  contextMenu: (level: LogLevel, action: string, detail?: object) => log('ContextMenu', level, action, detail),
}
