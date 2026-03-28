import { toolRegistry } from '../../ToolRegistry'
import { resourceRegistry } from '../../ResourceRegistry'
import { nexcelTools } from './tools'
import { nexcelWriteTools } from './writeTools'
import { nexcelResources } from './resources'
import { nexcelModelTools } from './modelTools'

export function registerNexcelModule(): void {
  toolRegistry.registerAll(nexcelTools)
  toolRegistry.registerAll(nexcelWriteTools)
  toolRegistry.registerAll(nexcelModelTools)
  resourceRegistry.registerAll(nexcelResources)
  const total = nexcelTools.length + nexcelWriteTools.length + nexcelModelTools.length
  console.log(`[MCP] nexcel module registered: ${total} tools, ${nexcelResources.length} resources`)
}
