/**
 * KASUMI OpenAPI 3.0 Spec Generator
 */

function param(name: string, location: 'path' | 'query', description: string, required = true) {
  return { name, in: location, description, required, schema: { type: 'string' } }
}

function body(description: string, properties: Record<string, unknown>) {
  return {
    required: true,
    content: {
      'application/json': {
        schema: { type: 'object', description, properties },
      },
    },
  }
}

function ok200(description: string, dataSchema?: unknown) {
  return {
    200: {
      description,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              ok:   { type: 'boolean', example: true },
              data: dataSchema ?? { type: 'object' },
            },
          },
        },
      },
    },
    400: { description: 'Bad request — { ok: false, error: string }' },
    404: { description: 'Not found — { ok: false, error: string }' },
  }
}

export function generateOpenApiSpec() {
  return {
    openapi: '3.0.3',
    info: {
      title:       'KASUMI AI-Native Interface',
      version:     '1.0.0',
      description: 'REST API for KASUMI Intelligent Workspace Platform. Provides full programmatic access to NEXCEL (spreadsheet) and WORDO (document) shells for AI agents and CLI tools.',
      contact:     { name: 'KASUMI Team' },
    },
    servers: [
      { url: 'http://localhost:3001', description: 'Local dev server' },
    ],
    tags: [
      { name: 'Health',    description: 'Service health and shell state' },
      { name: 'Nexcel',    description: 'KASUMI Nexcel spreadsheet operations' },
      { name: 'Wordo',     description: 'KASUMI WORDO document operations' },
    ],
    paths: {

      // ── Global ───────────────────────────────────────────────────────────
      '/api/health': {
        get: {
          tags: ['Health'], operationId: 'getHealth', summary: 'Service health check',
          responses: ok200('Service is healthy'),
        },
      },
      '/api/shell': {
        get: {
          tags: ['Health'], operationId: 'getShell', summary: 'Get active shell',
          responses: ok200('Current shell', { type: 'object', properties: { active_shell: { type: 'string', enum: ['nexcel', 'wordo'] } } }),
        },
        put: {
          tags: ['Health'], operationId: 'setShell', summary: 'Switch active shell',
          requestBody: body('Switch shell', { shell: { type: 'string', enum: ['nexcel', 'wordo'] } }),
          responses: ok200('Shell switched'),
        },
      },
      '/api/docs': {
        get: {
          tags: ['Health'], operationId: 'getDocs', summary: 'OpenAPI 3.0 specification (this document)',
          responses: { 200: { description: 'OpenAPI JSON' } },
        },
      },

      // ── NEXCEL ───────────────────────────────────────────────────────────
      '/api/nexcel/state': {
        get: { tags: ['Nexcel'], operationId: 'nexcelGetState', summary: 'Full sheet state snapshot', responses: ok200('State snapshot') },
      },
      '/api/nexcel/data': {
        get: {
          tags: ['Nexcel'], operationId: 'nexcelGetData', summary: 'Get all rows (paginated)',
          parameters: [
            param('page',      'query', 'Page number (default 1)',    false),
            param('page_size', 'query', 'Rows per page (default 100, max 1000)', false),
          ],
          responses: ok200('Paginated rows'),
        },
      },
      '/api/nexcel/columns': {
        get:  { tags: ['Nexcel'], operationId: 'nexcelGetColumns', summary: 'Get column definitions', responses: ok200('Field list') },
        post: {
          tags: ['Nexcel'], operationId: 'nexcelAddColumn', summary: 'Add a new column',
          requestBody: body('New column', { name: { type: 'string' }, type: { type: 'string', example: 'text' } }),
          responses: ok200('Created column', {}),
        },
      },
      '/api/nexcel/columns/{id}': {
        put: {
          tags: ['Nexcel'], operationId: 'nexcelUpdateColumn', summary: 'Update a column',
          parameters: [param('id', 'path', 'Column ID')],
          requestBody: body('Column fields to update', { name: { type: 'string' } }),
          responses: ok200('Updated column'),
        },
        delete: {
          tags: ['Nexcel'], operationId: 'nexcelDeleteColumn', summary: 'Delete a column',
          parameters: [param('id', 'path', 'Column ID')],
          responses: ok200('Deleted'),
        },
      },
      '/api/nexcel/rows': {
        post: {
          tags: ['Nexcel'], operationId: 'nexcelInsertRow', summary: 'Insert a new row',
          requestBody: body('Row data', { fields: { type: 'object', example: { 1: 'Task name', 5: 'Alice' } } }),
          responses: ok200('Created row', {}),
        },
      },
      '/api/nexcel/rows/batch': {
        post: {
          tags: ['Nexcel'], operationId: 'nexcelBatchRows', summary: 'Batch insert and/or update rows',
          requestBody: body('Batch payload', {
            insert: { type: 'array', items: { type: 'object' } },
            update: { type: 'array', items: { type: 'object' } },
          }),
          responses: ok200('Batch result'),
        },
      },
      '/api/nexcel/rows/{id}': {
        put: {
          tags: ['Nexcel'], operationId: 'nexcelUpdateRow', summary: 'Update a row by ID',
          parameters: [param('id', 'path', 'Row ID')],
          requestBody: body('Field values', { fields: { type: 'object' } }),
          responses: ok200('Updated row'),
        },
        delete: {
          tags: ['Nexcel'], operationId: 'nexcelDeleteRow', summary: 'Delete a row by ID',
          parameters: [param('id', 'path', 'Row ID')],
          responses: ok200('Deleted'),
        },
      },
      '/api/nexcel/sort': {
        post: {
          tags: ['Nexcel'], operationId: 'nexcelSort', summary: 'Sort rows by a field',
          requestBody: body('Sort params', { field_id: { type: 'integer' }, direction: { type: 'string', enum: ['asc', 'desc'] } }),
          responses: ok200('Sort applied'),
        },
      },
      '/api/nexcel/filter': {
        post: {
          tags: ['Nexcel'], operationId: 'nexcelFilter', summary: 'Filter rows',
          requestBody: body('Filter params', {
            field_id: { type: 'integer' },
            operator: { type: 'string', enum: ['equals', 'not_equals', 'contains', 'starts_with', 'gt', 'lt'] },
            value:    { type: 'string' },
          }),
          responses: ok200('Filtered rows'),
        },
      },
      '/api/nexcel/search': {
        get: {
          tags: ['Nexcel'], operationId: 'nexcelSearch', summary: 'Full-text search across all fields',
          parameters: [param('q', 'query', 'Search query')],
          responses: ok200('Matching rows'),
        },
      },
      '/api/nexcel/format': {
        post: {
          tags: ['Nexcel'], operationId: 'nexcelFormat', summary: 'Set cell format',
          requestBody: body('Format params', {
            row_id:   { type: 'integer' },
            field_id: { type: 'integer' },
            format:   { type: 'object', properties: { bold: { type: 'boolean' }, italic: { type: 'boolean' }, bgColor: { type: 'string' }, textColor: { type: 'string' }, align: { type: 'string' } } },
          }),
          responses: ok200('Format applied'),
        },
      },
      '/api/nexcel/conditional-format': {
        get:  { tags: ['Nexcel'], operationId: 'nexcelGetCondFmt', summary: 'Get conditional format rules', responses: ok200('Rules list') },
        post: {
          tags: ['Nexcel'], operationId: 'nexcelAddCondFmt', summary: 'Add a conditional format rule',
          requestBody: body('Rule definition', {
            field_id:   { type: 'integer' },
            field_name: { type: 'string' },
            operator:   { type: 'string', enum: ['equals', 'not_equals', 'contains', 'gt', 'lt'] },
            value:      { type: 'string' },
            bg_color:   { type: 'string', example: '#fef08a' },
            text_color: { type: 'string' },
          }),
          responses: ok200('Created rule', {}),
        },
      },
      '/api/nexcel/conditional-format/{id}': {
        delete: {
          tags: ['Nexcel'], operationId: 'nexcelDeleteCondFmt', summary: 'Delete a conditional format rule',
          parameters: [param('id', 'path', 'Rule ID')],
          responses: ok200('Deleted'),
        },
      },
      '/api/nexcel/import': {
        post: {
          tags: ['Nexcel'], operationId: 'nexcelImport', summary: 'Import CSV data',
          requestBody: body('CSV string', { csv: { type: 'string', example: 'Name,Status\nTask A,Todo' } }),
          responses: ok200('Import result'),
        },
      },
      '/api/nexcel/export': {
        get: {
          tags: ['Nexcel'], operationId: 'nexcelExport', summary: 'Export as CSV or JSON',
          parameters: [param('format', 'query', 'csv (default) or json', false)],
          responses: { 200: { description: 'CSV file or JSON' } },
        },
      },
      '/api/nexcel/undo': {
        post: { tags: ['Nexcel'], operationId: 'nexcelUndo', summary: 'Undo last mutation', responses: ok200('Undo result') },
      },
      '/api/nexcel/redo': {
        post: { tags: ['Nexcel'], operationId: 'nexcelRedo', summary: 'Redo last undone mutation', responses: ok200('Redo result') },
      },
      '/api/nexcel/clipboard/copy': {
        post: {
          tags: ['Nexcel'], operationId: 'nexcelCopy', summary: 'Copy rows to clipboard',
          requestBody: body('Row IDs to copy', { row_ids: { type: 'array', items: { type: 'integer' } } }),
          responses: ok200('Copy result'),
        },
      },
      '/api/nexcel/clipboard/paste': {
        post: {
          tags: ['Nexcel'], operationId: 'nexcelPaste', summary: 'Paste clipboard rows',
          requestBody: body('Paste options', { start_row: { type: 'integer', description: 'Insert after this row ID (optional)' } }),
          responses: ok200('Paste result'),
        },
      },
      '/api/nexcel/access-mode': {
        get: { tags: ['Nexcel'], operationId: 'nexcelGetMode', summary: 'Get access mode', responses: ok200('Current mode') },
        put: {
          tags: ['Nexcel'], operationId: 'nexcelSetMode', summary: 'Set access mode',
          requestBody: body('Mode', { mode: { type: 'string', enum: ['data-entry', 'analyst', 'admin'] } }),
          responses: ok200('Mode updated'),
        },
      },
      '/api/nexcel/comments': {
        get:  { tags: ['Nexcel'], operationId: 'nexcelGetComments', summary: 'Get all cell comments', responses: ok200('Comments') },
        post: {
          tags: ['Nexcel'], operationId: 'nexcelAddComment', summary: 'Add a cell comment',
          requestBody: body('Comment', { cell_ref: { type: 'string', example: 'A1' }, text: { type: 'string' }, author: { type: 'string' } }),
          responses: ok200('Created comment', {}),
        },
      },
      '/api/nexcel/comments/{id}': {
        delete: {
          tags: ['Nexcel'], operationId: 'nexcelDeleteComment', summary: 'Delete a comment',
          parameters: [param('id', 'path', 'Comment ID')],
          responses: ok200('Deleted'),
        },
      },

      // ── WORDO ────────────────────────────────────────────────────────────
      '/api/wordo/state': {
        get: { tags: ['Wordo'], operationId: 'wordoGetState', summary: 'Document state snapshot', responses: ok200('State') },
      },
      '/api/wordo/document': {
        get: { tags: ['Wordo'], operationId: 'wordoGetDocument', summary: 'Get full document (JSON IR)', responses: ok200('Document') },
        put: {
          tags: ['Wordo'], operationId: 'wordoUpdateDocument', summary: 'Replace document',
          requestBody: body('Document fields', { title: { type: 'string' }, sections: { type: 'array' } }),
          responses: ok200('Updated document'),
        },
      },
      '/api/wordo/document/markdown': {
        get: { tags: ['Wordo'], operationId: 'wordoGetMarkdown', summary: 'Export document as Markdown', responses: { 200: { description: 'Markdown text' } } },
        put: {
          tags: ['Wordo'], operationId: 'wordoImportMarkdown', summary: 'Import Markdown as document',
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { markdown: { type: 'string' } } } } } },
          responses: ok200('Imported document'),
        },
      },
      '/api/wordo/outline': {
        get: { tags: ['Wordo'], operationId: 'wordoGetOutline', summary: 'Get document heading outline', responses: ok200('Heading tree') },
      },
      '/api/wordo/blocks': {
        post: {
          tags: ['Wordo'], operationId: 'wordoInsertBlock', summary: 'Insert a block',
          requestBody: body('Block definition', {
            type:          { type: 'string', enum: ['paragraph', 'heading', 'bullet_list', 'ordered_list', 'blockquote', 'code_block', 'table'] },
            content:       { type: 'string' },
            attrs:         { type: 'object', example: { level: 1 } },
            section_id:    { type: 'string' },
            after_block_id:{ type: 'string' },
          }),
          responses: ok200('Created block', {}),
        },
      },
      '/api/wordo/blocks/{id}': {
        put: {
          tags: ['Wordo'], operationId: 'wordoUpdateBlock', summary: 'Update a block',
          parameters: [param('id', 'path', 'Block ID')],
          requestBody: body('Block fields', { content: { type: 'string' }, type: { type: 'string' }, attrs: { type: 'object' } }),
          responses: ok200('Updated block'),
        },
        delete: {
          tags: ['Wordo'], operationId: 'wordoDeleteBlock', summary: 'Delete a block',
          parameters: [param('id', 'path', 'Block ID')],
          responses: ok200('Deleted'),
        },
      },
      '/api/wordo/selection': {
        get: { tags: ['Wordo'], operationId: 'wordoGetSelection', summary: 'Get current selection (browser-side reference)', responses: ok200('Selection info') },
      },
      '/api/wordo/format': {
        post: {
          tags: ['Wordo'], operationId: 'wordoFormat', summary: 'Apply format marks to a block',
          requestBody: body('Format', { block_id: { type: 'string' }, marks: { type: 'object', example: { bold: true } } }),
          responses: ok200('Block updated'),
        },
      },
      '/api/wordo/comments': {
        get:  { tags: ['Wordo'], operationId: 'wordoGetComments', summary: 'Get all comments', responses: ok200('Comments') },
        post: {
          tags: ['Wordo'], operationId: 'wordoAddComment', summary: 'Add a comment',
          requestBody: body('Comment', { text: { type: 'string' }, author: { type: 'string' }, anchor: { type: 'string' } }),
          responses: ok200('Created comment', {}),
        },
      },
      '/api/wordo/comments/{id}': {
        delete: {
          tags: ['Wordo'], operationId: 'wordoDeleteComment', summary: 'Delete a comment',
          parameters: [param('id', 'path', 'Comment ID')],
          responses: ok200('Deleted'),
        },
      },
      '/api/wordo/track-changes': {
        get: { tags: ['Wordo'], operationId: 'wordoGetChanges', summary: 'Get tracked changes', responses: ok200('Changes') },
      },
      '/api/wordo/track-changes/accept': {
        post: {
          tags: ['Wordo'], operationId: 'wordoAcceptChanges', summary: 'Accept tracked changes',
          requestBody: body('IDs to accept (omit for all)', { ids: { type: 'array', items: { type: 'string' } } }),
          responses: ok200('Accept result'),
        },
      },
      '/api/wordo/track-changes/reject': {
        post: {
          tags: ['Wordo'], operationId: 'wordoRejectChanges', summary: 'Reject tracked changes',
          requestBody: body('IDs to reject (omit for all)', { ids: { type: 'array', items: { type: 'string' } } }),
          responses: ok200('Reject result'),
        },
      },
      '/api/wordo/export/docx': {
        get: { tags: ['Wordo'], operationId: 'wordoExportDocx', summary: 'Export as .docx (Electron only)', responses: { 501: { description: 'Requires Electron desktop app' } } },
      },
      '/api/wordo/export/pdf': {
        get: { tags: ['Wordo'], operationId: 'wordoExportPdf', summary: 'Export as PDF (browser print context only)', responses: { 501: { description: 'Requires browser print context' } } },
      },
      '/api/wordo/access-mode': {
        get: { tags: ['Wordo'], operationId: 'wordoGetMode', summary: 'Get access mode', responses: ok200('Mode') },
        put: {
          tags: ['Wordo'], operationId: 'wordoSetMode', summary: 'Set access mode',
          requestBody: body('Mode', { mode: { type: 'string', enum: ['data-entry', 'analyst', 'admin'] } }),
          responses: ok200('Mode updated'),
        },
      },
    },
  }
}
