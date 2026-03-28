import type { McpPromptDefinition, McpPromptListEntry } from './types'

class PromptRegistry {
  private prompts = new Map<string, McpPromptDefinition>()

  register(prompt: McpPromptDefinition): void {
    if (this.prompts.has(prompt.name)) {
      throw new Error(`[PromptRegistry] Duplicate prompt name: ${prompt.name}`)
    }
    this.prompts.set(prompt.name, prompt)
  }

  registerAll(prompts: McpPromptDefinition[]): void {
    for (const p of prompts) this.register(p)
  }

  get(name: string): McpPromptDefinition | undefined {
    return this.prompts.get(name)
  }

  list(): McpPromptListEntry[] {
    return Array.from(this.prompts.values()).map(p => ({
      name: p.name,
      description: p.description,
      arguments: p.arguments,
    }))
  }

  size(): number {
    return this.prompts.size
  }
}

export const promptRegistry = new PromptRegistry()
