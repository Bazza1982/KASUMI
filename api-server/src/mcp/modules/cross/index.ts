import { toolRegistry } from '../../ToolRegistry'
import { crossTools } from './tools'

export function registerCrossModule(): void {
  toolRegistry.registerAll(crossTools)
  console.log(`[MCP] cross module registered: ${crossTools.length} tools`)
}
