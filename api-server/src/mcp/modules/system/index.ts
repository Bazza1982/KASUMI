import { toolRegistry } from '../../ToolRegistry'
import { resourceRegistry } from '../../ResourceRegistry'
import { promptRegistry } from '../../PromptRegistry'
import { serverStats } from '../../stats'
import { getAuditSummary, getAuditLog } from '../../audit'
import { DEV_MODE } from '../../auth'
import type { McpToolDefinition } from '../../types'
import { systemPrompts } from './prompts'

const MODULES = ['nexcel', 'wordo', 'cross', 'system']

const systemTools: McpToolDefinition[] = [
  {
    name: 'system_ping',
    module: 'system',
    version: '2.0.0',
    description: 'Check server health and return server info.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => ({
      content: [{ type: 'text', text: JSON.stringify({
        status: 'ok',
        server: 'kasumi-mcp-server',
        version: '2.0.0',
        modules: MODULES,
        toolCount: toolRegistry.size(),
        promptCount: promptRegistry.size(),
        authMode: DEV_MODE ? 'open (dev)' : 'key-based',
        timestamp: new Date().toISOString(),
      }, null, 2) }],
    }),
  },

  {
    name: 'system_list_tools',
    module: 'system',
    version: '2.0.0',
    description: 'List all available MCP tools, optionally filtered by module.',
    inputSchema: {
      type: 'object',
      properties: {
        module:           { type: 'string',  description: 'Filter by module name (e.g. "nexcel")' },
        includeDeprecated:{ type: 'boolean', description: 'Include deprecated tools (default false)' },
      },
    },
    handler: async (args) => {
      const all = toolRegistry.listAll()
      const byModule = args.module ? all.filter(t => t.module === String(args.module)) : all
      const filtered = args.includeDeprecated ? byModule : byModule.filter(t => !t.deprecated)
      return {
        content: [{ type: 'text', text: JSON.stringify(
          filtered.map(t => ({
            name: t.name,
            module: t.module,
            version: t.version,
            description: t.description,
            deprecated: t.deprecated ?? false,
            replacedBy: t.replacedBy,
          })),
          null, 2,
        ) }],
      }
    },
  },

  {
    name: 'system_get_capabilities',
    module: 'system',
    version: '2.0.0',
    description:
      'Return the full capability inventory of this KASUMI MCP server: ' +
      'all modules, tools (by module), resources, and prompt templates.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => {
      const allTools = toolRegistry.listAll()
      const byModule: Record<string, unknown[]> = {}
      for (const m of MODULES) {
        byModule[m] = allTools
          .filter(t => t.module === m)
          .map(t => ({
            name: t.name,
            version: t.version,
            description: t.description,
            deprecated: t.deprecated ?? false,
          }))
      }
      return {
        content: [{ type: 'text', text: JSON.stringify({
          server: 'kasumi-mcp-server',
          version: '2.0.0',
          modules: MODULES,
          tools: byModule,
          resources: resourceRegistry.list(),
          prompts: promptRegistry.list(),
          totalTools: allTools.filter(t => !t.deprecated).length,
          totalDeprecated: allTools.filter(t => t.deprecated).length,
        }, null, 2) }],
      }
    },
  },

  {
    name: 'system_get_stats',
    module: 'system',
    version: '2.0.0',
    description:
      'Return server performance stats: request counts, uptime, top tools, audit summary. ' +
      'Requires admin permission tier.',
    inputSchema: {
      type: 'object',
      properties: {
        includeAuditLog: { type: 'boolean', description: 'Include the last 20 audit records (default false)' },
      },
    },
    handler: async (args) => {
      const data: Record<string, unknown> = {
        performance: serverStats.get(),
        audit: getAuditSummary(),
      }
      if (args.includeAuditLog) {
        data.recentAuditLog = getAuditLog({ limit: 20 })
      }
      return {
        content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
      }
    },
  },
]

export function registerSystemModule(): void {
  toolRegistry.registerAll(systemTools)
  promptRegistry.registerAll(systemPrompts)
  console.log(`[MCP] system module registered: ${systemTools.length} tools, ${systemPrompts.length} prompts`)
}
