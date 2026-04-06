import type { PlatformCommand } from '../../../platform/command-bus'
import type { SemanticCommandContext } from './SemanticCommandService'
import { executeSemanticCommand, getWordoDocumentCommandSurface } from './SemanticCommandService'
import type { ExecuteResult } from './CommandExecutor'
import type { WordoDocumentCommandSpec, WordoMcpToolDefinition } from '../types/commands'

const WORDO_MCP_TOOL_PREFIX = 'wordo.'

function inferJsonSchemaType(field: string): string {
  if (field.endsWith('Id')) return 'string'
  if (field === 'pageStyle' || field === 'header' || field === 'footer' || field === 'watermark' || field === 'patch' || field === 'block') {
    return 'object'
  }
  if (field.startsWith('after')) return ['afterBlockId', 'afterSectionId'].includes(field) ? ['string', 'null'].join('|') : 'string'
  if (field === 'newText') return 'string'
  return 'string'
}

function toToolDefinition(spec: WordoDocumentCommandSpec): WordoMcpToolDefinition {
  return {
    name: `${WORDO_MCP_TOOL_PREFIX}${spec.type}`,
    description: spec.description,
    inputSchema: {
      type: 'object',
      properties: Object.fromEntries(
        spec.payload.map(field => [field, {
          type: inferJsonSchemaType(field),
          description: `${field} for ${spec.type}`,
        }]),
      ),
      required: spec.payload.filter(field => !field.startsWith('after')),
      additionalProperties: false,
    },
    annotations: {
      shell: 'wordo',
      commandType: spec.type,
      layoutImpact: spec.layoutImpact,
    },
  }
}

export function getWordoMcpToolDefinitions(): WordoMcpToolDefinition[] {
  return getWordoDocumentCommandSurface().map(toToolDefinition)
}

export function buildPlatformCommandFromMcpToolCall(
  toolName: string,
  args: Record<string, unknown>,
): PlatformCommand {
  if (!toolName.startsWith(WORDO_MCP_TOOL_PREFIX)) {
    throw new Error(`Unsupported Wordo MCP tool: ${toolName}`)
  }

  const type = toolName.slice(WORDO_MCP_TOOL_PREFIX.length)
  const spec = getWordoDocumentCommandSurface().find(item => item.type === type)
  if (!spec) {
    throw new Error(`Unknown Wordo command type for MCP tool: ${type}`)
  }

  return {
    shell: 'wordo',
    type,
    fromAI: true,
    targetId: typeof args.sectionId === 'string' ? args.sectionId : undefined,
    payload: args,
  }
}

export function executeWordoMcpToolCall(
  toolName: string,
  args: Record<string, unknown>,
  context: SemanticCommandContext,
): ExecuteResult {
  const command = buildPlatformCommandFromMcpToolCall(toolName, args)
  return executeSemanticCommand(command, context)
}
