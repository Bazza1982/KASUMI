import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { BaserowHttpClient } from '../../modules/excel-shell/adapters/baserow/client'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeMockFetch(responseBody: unknown, ok = true, status = 200) {
  return vi.fn().mockResolvedValue({
    ok,
    status,
    json: () => Promise.resolve(responseBody),
    text: () => Promise.resolve(JSON.stringify(responseBody)),
  })
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('BaserowHttpClient', () => {
  const config = { baseUrl: 'http://localhost:8000', token: 'test-token' }
  let client: BaserowHttpClient

  beforeEach(() => {
    client = new BaserowHttpClient(config)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // ── get() ─────────────────────────────────────────────────────────────────

  describe('get()', () => {
    it('calls the correct URL', async () => {
      const mockFetch = makeMockFetch({ data: 'ok' })
      vi.stubGlobal('fetch', mockFetch)

      await client.get('/some/path/')

      expect(mockFetch).toHaveBeenCalledOnce()
      const [url] = mockFetch.mock.calls[0] as [string, RequestInit]
      expect(url).toBe('http://localhost:8000/api/some/path/')
    })

    it('sends the Authorization header with the token', async () => {
      const mockFetch = makeMockFetch({ ok: true })
      vi.stubGlobal('fetch', mockFetch)

      await client.get('/path/')

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
      const headers = init?.headers as Record<string, string>
      expect(headers['Authorization']).toBe('Token test-token')
    })

    it('returns parsed JSON from the response', async () => {
      const payload = { tables: [{ id: 1, name: 'Tasks' }] }
      vi.stubGlobal('fetch', makeMockFetch(payload))

      const result = await client.get<typeof payload>('/tables/')
      expect(result).toEqual(payload)
    })
  })

  // ── patch() ───────────────────────────────────────────────────────────────

  describe('patch()', () => {
    it('uses PATCH method', async () => {
      const mockFetch = makeMockFetch({})
      vi.stubGlobal('fetch', mockFetch)

      await client.patch('/row/1/', { field_1: 'hello' })

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
      expect(init?.method).toBe('PATCH')
    })

    it('serializes the body as JSON', async () => {
      const mockFetch = makeMockFetch({})
      vi.stubGlobal('fetch', mockFetch)

      const body = { field_1: 'hello', field_2: 42 }
      await client.patch('/row/1/', body)

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
      expect(init?.body).toBe(JSON.stringify(body))
    })

    it('returns parsed JSON', async () => {
      const payload = { id: 1, field_1: 'hello' }
      vi.stubGlobal('fetch', makeMockFetch(payload))

      const result = await client.patch<typeof payload>('/row/1/', { field_1: 'hello' })
      expect(result).toEqual(payload)
    })
  })

  // ── post() ────────────────────────────────────────────────────────────────

  describe('post()', () => {
    it('uses POST method', async () => {
      const mockFetch = makeMockFetch({ id: 99 })
      vi.stubGlobal('fetch', mockFetch)

      await client.post('/rows/', { field_1: 'new row' })

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
      expect(init?.method).toBe('POST')
    })

    it('serializes the body as JSON', async () => {
      const mockFetch = makeMockFetch({})
      vi.stubGlobal('fetch', mockFetch)

      const body = { field_1: 'value' }
      await client.post('/rows/', body)

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
      expect(init?.body).toBe(JSON.stringify(body))
    })

    it('returns parsed JSON', async () => {
      const payload = { id: 99 }
      vi.stubGlobal('fetch', makeMockFetch(payload))

      const result = await client.post<typeof payload>('/rows/', {})
      expect(result).toEqual(payload)
    })
  })

  // ── delete() ──────────────────────────────────────────────────────────────

  describe('delete()', () => {
    it('uses DELETE method', async () => {
      const mockFetch = makeMockFetch(null)
      vi.stubGlobal('fetch', mockFetch)

      await client.delete('/row/1/')

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
      expect(init?.method).toBe('DELETE')
    })

    it('targets the correct URL', async () => {
      const mockFetch = makeMockFetch(null)
      vi.stubGlobal('fetch', mockFetch)

      await client.delete('/row/42/')

      const [url] = mockFetch.mock.calls[0] as [string, RequestInit]
      expect(url).toBe('http://localhost:8000/api/row/42/')
    })
  })

  // ── Error handling ────────────────────────────────────────────────────────

  describe('non-OK response', () => {
    it('throws an Error when the response status is 404', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        text: () => Promise.resolve('Not Found'),
        json: () => Promise.reject(new Error('no json')),
      })
      vi.stubGlobal('fetch', mockFetch)

      await expect(client.get('/missing/')).rejects.toThrow('404')
    })

    it('error message includes the status code', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal Server Error'),
        json: () => Promise.reject(new Error('no json')),
      })
      vi.stubGlobal('fetch', mockFetch)

      await expect(client.get('/broken/')).rejects.toThrow('500')
    })
  })
})
