import { toolRegistry } from '../../ToolRegistry'
import { promptRegistry } from '../../PromptRegistry'
import type { McpToolDefinition } from '../../types'
import { systemPrompts } from './prompts'

const systemTools: McpToolDefinition[] = [
  {
    name: 'system_ping',
    module: 'system',
    version: '1.0.0',
    description: 'Check server health and return server info.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => ({
      content: [{ type: 'text', text: JSON.stringify({
        status: 'ok',
        server: 'kasumi-mcp-server',
        version: '1.0.0',
        modules: ['nexcel', 'wordo', 'cross', 'system'],
        toolCount: toolRegistry.size(),
        promptCount: promptRegistry.size(),
        timestamp: new Date().toISOString(),
      }, null, 2) }],
    }),
  },
  {
    name: 'system_list_tools',
    module: 'system',
    version: '1.0.0',
    description: 'List all available MCP tools, optionally filtered by module.',
    inputSchema: {
      type: 'object',
      properties: {
        module: { type: 'string', description: 'Filter by module name (e.g. "nexcel")' },
      },
    },
    handler: async (args) => {
      const all = toolRegistry.listAll()
      const filtered = args.module
        ? all.filter(t => t.module === String(args.module))
        : all
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
]

export function registerSystemModule(): void {
  toolRegistry.registerAll(systemTools)
  promptRegistry.registerAll(systemPrompts)
  console.log(`[MCP] system module registered: ${systemTools.length} tools, ${systemPrompts.length} prompts`)
}
