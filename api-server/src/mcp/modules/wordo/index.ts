import { toolRegistry } from '../../ToolRegistry'
import { resourceRegistry } from '../../ResourceRegistry'
import { wordoTools } from './tools'
import { wordoModelTools } from './modelTools'
import { wordoResources } from './resources'

export function registerWordoModule(): void {
  toolRegistry.registerAll(wordoTools)
  toolRegistry.registerAll(wordoModelTools)
  resourceRegistry.registerAll(wordoResources)
  const total = wordoTools.length + wordoModelTools.length
  console.log(`[MCP] wordo module registered: ${total} tools, ${wordoResources.length} resources`)
}
