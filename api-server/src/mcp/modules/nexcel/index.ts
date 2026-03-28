import { toolRegistry } from '../../ToolRegistry'
import { resourceRegistry } from '../../ResourceRegistry'
import { nexcelTools } from './tools'
import { nexcelResources } from './resources'

export function registerNexcelModule(): void {
  toolRegistry.registerAll(nexcelTools)
  resourceRegistry.registerAll(nexcelResources)
  console.log(`[MCP] nexcel module registered: ${nexcelTools.length} tools, ${nexcelResources.length} resources`)
}
