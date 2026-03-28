import { toolRegistry } from '../../ToolRegistry'
import { resourceRegistry } from '../../ResourceRegistry'
import { wordoTools } from './tools'
import { wordoModelTools } from './modelTools'
import { wordoResources } from './resources'
import { wordoAiTools } from './aiTools'

export function registerWordoModule(): void {
  toolRegistry.registerAll(wordoTools)
  toolRegistry.registerAll(wordoModelTools)
  toolRegistry.registerAll(wordoAiTools)
  resourceRegistry.registerAll(wordoResources)
  const total = wordoTools.length + wordoModelTools.length + wordoAiTools.length
  console.log(`[MCP] wordo module registered: ${total} tools, ${wordoResources.length} resources`)
}
