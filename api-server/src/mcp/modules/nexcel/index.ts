import { toolRegistry } from '../../ToolRegistry'
import { resourceRegistry } from '../../ResourceRegistry'
import { nexcelTools } from './tools'
import { nexcelWriteTools } from './writeTools'
import { nexcelResources } from './resources'

export function registerNexcelModule(): void {
  toolRegistry.registerAll(nexcelTools)
  toolRegistry.registerAll(nexcelWriteTools)
  resourceRegistry.registerAll(nexcelResources)
  const total = nexcelTools.length + nexcelWriteTools.length
  console.log(`[MCP] nexcel module registered: ${total} tools, ${nexcelResources.length} resources`)
}
