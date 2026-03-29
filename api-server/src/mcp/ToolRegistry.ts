import type { McpToolDefinition, McpToolListEntry } from './types'

/**
 * ToolRegistry — central store for all MCP tools.
 *
 * Modules register their tools here. The MCP router dispatches
 * `tools/list` and `tools/call` requests through this registry.
 *
 * Usage:
 *   toolRegistry.register(myTool)
 *   toolRegistry.list()        → McpToolListEntry[]
 *   toolRegistry.get('name')   → McpToolDefinition | undefined
 */
class ToolRegistry {
  private tools = new Map<string, McpToolDefinition>()

  /** Register a single tool. Throws if name already registered (prevents silent overwrites). */
  register(tool: McpToolDefinition): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`ToolRegistry: duplicate tool name "${tool.name}"`)
    }
    this.tools.set(tool.name, tool)
  }

  /** Register multiple tools at once. */
  registerAll(tools: McpToolDefinition[]): void {
    for (const tool of tools) this.register(tool)
  }

  /** Get tool by name. Returns undefined if not found. */
  get(name: string): McpToolDefinition | undefined {
    return this.tools.get(name)
  }

  /** List all non-deprecated tools in MCP wire format. */
  list(): McpToolListEntry[] {
    return Array.from(this.tools.values())
      .filter(t => !t.deprecated)
      .map(t => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
        ...(t.outputSchema !== undefined && { outputSchema: t.outputSchema }),
        ...(t.readOnly      !== undefined && { readOnly:      t.readOnly }),
      }))
  }

  /** List all tools including deprecated ones (for admin/debug). */
  listAll(): McpToolDefinition[] {
    return Array.from(this.tools.values())
  }

  size(): number {
    return this.tools.size
  }
}

export const toolRegistry = new ToolRegistry()
