/**
 * MCP server bootstrap — registers all modules into the registry.
 * Call once at application startup before the Express routes are mounted.
 */
import { registerSystemModule } from './modules/system/index'
import { registerNexcelModule } from './modules/nexcel/index'

let started = false

export function startMcpServer(): void {
  if (started) return
  started = true

  registerSystemModule()
  registerNexcelModule()

  console.log('[MCP] KASUMI MCP server ready')
}
