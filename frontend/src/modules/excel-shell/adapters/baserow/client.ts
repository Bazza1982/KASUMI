export interface BaserowConfig {
  baseUrl: string
  token: string
}

export class BaserowHttpClient {
  constructor(private config: BaserowConfig) {}

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const url = `${this.config.baseUrl}/api${path}`
    const res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Token ${this.config.token}`,
        ...options?.headers,
      },
    })
    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Baserow API error ${res.status}: ${err}`)
    }
    return res.json() as Promise<T>
  }

  async get<T>(path: string): Promise<T> {
    return this.request<T>(path)
  }

  async patch<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, { method: 'PATCH', body: JSON.stringify(body) })
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, { method: 'POST', body: JSON.stringify(body) })
  }

  async delete(path: string): Promise<void> {
    await this.request<void>(path, { method: 'DELETE' })
  }
}
