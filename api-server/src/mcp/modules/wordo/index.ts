import { toolRegistry } from '../../ToolRegistry'
import { resourceRegistry } from '../../ResourceRegistry'
import { wordoTools } from './tools'
import { wordoResources } from './resources'

export function registerWordoModule(): void {
  toolRegistry.registerAll(wordoTools)
  resourceRegistry.registerAll(wordoResources)
  console.log(`[MCP] wordo module registered: ${wordoTools.length} tools, ${wordoResources.length} resources`)
}
