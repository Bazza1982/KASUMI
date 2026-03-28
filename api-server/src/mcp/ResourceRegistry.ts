import type { McpResourceDefinition, McpResourceListEntry, McpResourceContent, McpRequestContext } from './types'

/**
 * ResourceRegistry — central store for all MCP resources.
 *
 * Resources are read-only URI-addressable objects (vs tools which are
 * imperative operations). A resource URI is matched against registered
 * patterns (e.g. `kasumi://nexcel/sheet/{sheetId}/raw`).
 */
class ResourceRegistry {
  private resources: McpResourceDefinition[] = []

  register(resource: McpResourceDefinition): void {
    this.resources.push(resource)
  }

  registerAll(resources: McpResourceDefinition[]): void {
    for (const r of resources) this.register(r)
  }

  /**
   * List all resources.
   * For pattern-based resources we emit one entry per pattern.
   */
  list(): McpResourceListEntry[] {
    return this.resources.map(r => ({
      uri: r.uriPattern,
      name: r.description,
      description: r.description,
      mimeType: r.mimeType,
    }))
  }

  /**
   * Read a resource by concrete URI.
   * Matches the URI against all registered patterns and calls the first match.
   */
  async read(uri: string, ctx: McpRequestContext): Promise<McpResourceContent | null> {
    for (const resource of this.resources) {
      const params = matchUri(uri, resource.uriPattern)
      if (params !== null) {
        return resource.read(uri, params, ctx)
      }
    }
    return null
  }
}

/**
 * Match a concrete URI against a pattern like `kasumi://nexcel/sheet/{sheetId}/raw`.
 * Returns extracted params or null if no match.
 */
function matchUri(uri: string, pattern: string): Record<string, string> | null {
  const patternParts = pattern.split('/')
  const uriParts = uri.split('/')
  if (patternParts.length !== uriParts.length) return null

  const params: Record<string, string> = {}
  for (let i = 0; i < patternParts.length; i++) {
    const pp = patternParts[i]
    const up = uriParts[i]
    if (pp.startsWith('{') && pp.endsWith('}')) {
      params[pp.slice(1, -1)] = decodeURIComponent(up)
    } else if (pp !== up) {
      return null
    }
  }
  return params
}

export const resourceRegistry = new ResourceRegistry()
