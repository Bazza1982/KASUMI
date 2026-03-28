import { Request, Response, NextFunction } from 'express'

export function ok<T>(data: T) {
  return { ok: true as const, data }
}

export function err(message: string, code: number) {
  return { ok: false as const, error: message, code }
}

export function notFound(req: Request, res: Response) {
  res.status(404).json(err(`Route not found: ${req.method} ${req.path}`, 404))
}

export function errorHandler(error: Error, _req: Request, res: Response, _next: NextFunction) {
  console.error('[KASUMI API]', error)
  res.status(500).json(err(error.message || 'Internal server error', 500))
}
