/**
 * System-level MCP prompt templates.
 * These are reusable prompt builders that help AI agents work with KASUMI data.
 */
import type { McpPromptDefinition } from '../../types'
import { nexcelStore } from '../../../store/nexcelStore'
import { wordoStore } from '../../../store/wordoStore'

export const systemPrompts: McpPromptDefinition[] = [

  // ─── Nexcel prompts ────────────────────────────────────────────────────────

  {
    name: 'analyse_sheet',
    module: 'system',
    version: '1.0.0',
    description: 'Build a prompt for an AI agent to analyse the current Nexcel sheet and produce insights.',
    arguments: [
      { name: 'question', description: 'Optional specific question about the data', required: false },
    ],
    build: async (args) => {
      const fields = nexcelStore.fields
      const { rows, total } = nexcelStore.getRows({ size: 5 })
      const schema = fields.map(f => `  - ${f.name} (${f.type})`).join('\n')
      const sampleRows = rows.map(r =>
        fields.map(f => `${f.name}: ${r.fields[f.id] ?? ''}`).join(', ')
      ).join('\n')

      const question = args.question
        ? `\n\nSpecific question: ${args.question}`
        : '\n\nPlease provide a concise analysis with key insights and any data quality observations.'

      return [{
        role: 'user',
        content: {
          type: 'text',
          text: `You are a data analyst. Analyse the following spreadsheet data.

Sheet: "${nexcelStore.sheetName}"
Total rows: ${total}
Columns (${fields.length}):
${schema}

Sample rows (first ${rows.length}):
${sampleRows}${question}`,
        },
      }]
    },
  },

  {
    name: 'generate_formula',
    module: 'system',
    version: '1.0.0',
    description: 'Build a prompt for an AI agent to write a spreadsheet formula for a specific calculation.',
    arguments: [
      { name: 'task', description: 'What the formula should calculate', required: true },
      { name: 'targetField', description: 'Name of the column to write the formula into', required: false },
    ],
    build: async (args) => {
      const fields = nexcelStore.fields
      const columnList = fields.map(f => `${f.name} (${f.type})`).join(', ')

      return [{
        role: 'user',
        content: {
          type: 'text',
          text: `You are a spreadsheet expert. Write a formula for the following task.

Available columns: ${columnList}

Task: ${args.task || '(not specified)'}
${args.targetField ? `Target column: ${args.targetField}` : ''}

Respond with:
1. The formula string (using standard Excel/Google Sheets syntax)
2. A brief explanation of how it works
3. Any caveats or edge cases to be aware of`,
        },
      }]
    },
  },

  // ─── Wordo prompts ─────────────────────────────────────────────────────────

  {
    name: 'summarise_document',
    module: 'system',
    version: '1.0.0',
    description: 'Build a prompt for an AI agent to summarise the current Wordo document.',
    arguments: [
      { name: 'style', description: '"brief" (3 sentences), "detailed" (full summary), or "bullets" (key points)', required: false },
    ],
    build: async (args) => {
      const md = wordoStore.exportMarkdown()
      const style = args.style ?? 'brief'
      const styleInstr =
        style === 'detailed'  ? 'Write a detailed summary covering all major sections.' :
        style === 'bullets'   ? 'Return a bullet-point list of the key points.' :
                                'Write a brief summary in 2-3 sentences.'

      return [{
        role: 'user',
        content: {
          type: 'text',
          text: `Summarise the following document.\n\n${styleInstr}\n\n---\n\n${md}`,
        },
      }]
    },
  },

  {
    name: 'improve_document',
    module: 'system',
    version: '1.0.0',
    description: 'Build a prompt for an AI agent to review and suggest improvements to a Wordo document.',
    arguments: [
      { name: 'focus', description: 'Aspect to focus on: "clarity", "structure", "tone", or "completeness"', required: false },
    ],
    build: async (args) => {
      const md = wordoStore.exportMarkdown()
      const focus = args.focus ?? 'clarity'

      return [{
        role: 'user',
        content: {
          type: 'text',
          text: `You are a professional editor. Review the document below and suggest improvements, focusing on ${focus}.

Provide specific, actionable suggestions referencing the section or paragraph that needs work.

---

${md}`,
        },
      }]
    },
  },

  // ─── Cross-module prompts ──────────────────────────────────────────────────

  {
    name: 'data_report',
    module: 'system',
    version: '1.0.0',
    description: 'Build a prompt to generate a written report in Wordo based on the current Nexcel sheet data.',
    arguments: [
      { name: 'reportTitle', description: 'Title for the report', required: false },
      { name: 'audience',    description: 'Intended audience (e.g. "executives", "team")', required: false },
    ],
    build: async (args) => {
      const fields = nexcelStore.fields
      const { rows, total } = nexcelStore.getRows({ size: 10 })
      const schema = fields.map(f => `  - ${f.name} (${f.type})`).join('\n')
      const sampleRows = rows.map(r =>
        fields.map(f => `${f.name}: ${r.fields[f.id] ?? ''}`).join(', ')
      ).join('\n')

      const title = args.reportTitle ?? `${nexcelStore.sheetName} Report`
      const audience = args.audience ?? 'stakeholders'

      return [{
        role: 'user',
        content: {
          type: 'text',
          text: `You are a business analyst. Generate a written report titled "${title}" for ${audience}, based on the following spreadsheet data.

Sheet: "${nexcelStore.sheetName}" (${total} rows total)
Columns:
${schema}

Sample data (first ${rows.length} rows):
${sampleRows}

Structure the report with:
1. Executive Summary
2. Key Findings
3. Data Highlights
4. Recommendations

Use clear, professional language suitable for ${audience}.`,
        },
      }]
    },
  },
]
