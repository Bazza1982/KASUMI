export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'KASUMI AI-Native API',
    version: '1.0.0',
    description: `
## KASUMI AI-Native REST API

Complete programmatic interface for the KASUMI Intelligent Workspace Platform.

**Two shells exposed:**
- **NEXCEL** — Excel-like spreadsheet operations (rows, columns, format, sort, filter)
- **WORDO** — Word-like document operations (blocks, sections, comments, track changes)

**Authentication:** None required (local development server)
**CORS:** Enabled for all origins
**Base URL:** http://localhost:3001
    `.trim(),
    contact: { name: 'KASUMI Platform', email: 'api@kasumi.app' },
    license: { name: 'MIT' },
  },
  servers: [
    { url: 'http://localhost:3001', description: 'Local development' },
  ],
  tags: [
    { name: 'Global', description: 'Health check and shell switching' },
    { name: 'NEXCEL Data', description: 'Row and data operations' },
    { name: 'NEXCEL Columns', description: 'Column/field management' },
    { name: 'NEXCEL Format', description: 'Cell formatting and conditional rules' },
    { name: 'NEXCEL Import/Export', description: 'Import CSV, export data' },
    { name: 'NEXCEL Clipboard', description: 'Copy/paste operations' },
    { name: 'WORDO Document', description: 'Document-level operations' },
    { name: 'WORDO Blocks', description: 'Block-level content operations' },
    { name: 'WORDO Comments', description: 'Annotation and comment management' },
    { name: 'WORDO Track Changes', description: 'Track changes workflow' },
  ],
  components: {
    schemas: {
      ApiSuccess: {
        type: 'object',
        properties: {
          ok: { type: 'boolean', example: true },
          data: { type: 'object' },
        },
      },
      ApiError: {
        type: 'object',
        properties: {
          ok: { type: 'boolean', example: false },
          error: { type: 'string' },
          code: { type: 'integer' },
        },
      },
      FieldMeta: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          name: { type: 'string' },
          type: { type: 'string', enum: ['text','long_text','number','boolean','date','email','url','phone_number','single_select','multiple_select','formula','created_on','last_modified'] },
          order: { type: 'integer' },
          primary: { type: 'boolean' },
          readOnly: { type: 'boolean' },
          selectOptions: { type: 'array', items: { type: 'object', properties: { id: { type: 'integer' }, value: { type: 'string' }, color: { type: 'string' } } } },
        },
      },
      RowRecord: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          order: { type: 'string' },
          fields: { type: 'object', additionalProperties: true, description: 'fieldId (number) → value (any)' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      Block: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          type: { type: 'string', enum: ['paragraph','heading','list_item','table','code_block','blockquote','page_break','nexcel_embed'] },
        },
      },
      Comment: {
        type: 'object',
        required: ['sectionId', 'text'],
        properties: {
          id: { type: 'string' },
          sectionId: { type: 'string', description: 'Required. ID of the section to attach the comment to. Get section IDs from GET /api/wordo/document.' },
          blockId: { type: 'string', description: 'Optional. ID of the specific block within the section.' },
          anchorText: { type: 'string', description: 'Optional. Selected text that anchors the comment.' },
          text: { type: 'string', description: 'Required. Comment body text.' },
          author: { type: 'string', description: 'Optional. Defaults to "API User".' },
          resolved: { type: 'boolean' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
    },
  },
  paths: {
    // ── Global ──────────────────────────────────────────────────────────────
    '/api/health': {
      get: {
        tags: ['Global'],
        summary: 'Health check',
        description: 'Returns server status, uptime, and shell summaries.',
        responses: {
          200: { description: 'Server is healthy', content: { 'application/json': { schema: { '$ref': '#/components/schemas/ApiSuccess' } } } },
        },
      },
    },
    '/api/shell': {
      get: {
        tags: ['Global'], summary: 'Get active shell',
        responses: { 200: { description: 'Active shell name', content: { 'application/json': { schema: { '$ref': '#/components/schemas/ApiSuccess' } } } } },
      },
      put: {
        tags: ['Global'], summary: 'Switch active shell',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { shell: { type: 'string', enum: ['nexcel', 'wordo'] } } } } } },
        responses: { 200: { description: 'Shell switched' } },
      },
    },
    '/api/docs': {
      get: {
        tags: ['Global'], summary: 'OpenAPI interactive documentation',
        description: 'Swagger UI documentation for all endpoints.',
        responses: { 200: { description: 'HTML documentation page' } },
      },
    },

    // ── NEXCEL ───────────────────────────────────────────────────────────────
    '/api/nexcel/state': {
      get: { tags: ['NEXCEL Data'], summary: 'Full Nexcel state snapshot', responses: { 200: { description: 'State summary' } } },
    },
    '/api/nexcel/data': {
      get: {
        tags: ['NEXCEL Data'], summary: 'Get rows with optional filtering, sorting, and pagination',
        parameters: [
          { name: 'search', in: 'query', schema: { type: 'string' }, description: 'Full-text search across all fields' },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'size', in: 'query', schema: { type: 'integer', default: 100 } },
          { name: 'sort_field', in: 'query', schema: { type: 'integer' }, description: 'Field ID to sort by' },
          { name: 'sort_dir', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'] } },
          { name: 'filter', in: 'query', schema: { type: 'string' }, description: 'JSON array of FilterRule objects' },
        ],
        responses: { 200: { description: 'Paginated rows' } },
      },
    },
    '/api/nexcel/rows': {
      post: {
        tags: ['NEXCEL Data'], summary: 'Insert new row',
        requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { fields: { type: 'object', description: 'fieldId → value' } } } } } },
        responses: { 201: { description: 'Created row' } },
      },
    },
    '/api/nexcel/rows/{id}': {
      put: {
        tags: ['NEXCEL Data'], summary: 'Update row fields',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { fields: { type: 'object' } } } } } },
        responses: { 200: { description: 'Updated row' }, 404: { description: 'Row not found' } },
      },
      delete: {
        tags: ['NEXCEL Data'], summary: 'Delete row',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: { 200: { description: 'Deleted' }, 404: { description: 'Not found' } },
      },
    },
    '/api/nexcel/rows/batch': {
      post: {
        tags: ['NEXCEL Data'], summary: 'Batch insert/update rows',
        requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { ops: { type: 'array', items: { type: 'object', properties: { id: { type: 'integer' }, fields: { type: 'object' } } } } } } } } },
        responses: { 200: { description: 'Affected rows' } },
      },
    },
    '/api/nexcel/columns': {
      get: { tags: ['NEXCEL Columns'], summary: 'List all columns (field definitions)', responses: { 200: { description: 'Field list' } } },
      post: {
        tags: ['NEXCEL Columns'], summary: 'Add new column',
        requestBody: { content: { 'application/json': { schema: { '$ref': '#/components/schemas/FieldMeta' } } } },
        responses: { 201: { description: 'Created field' } },
      },
    },
    '/api/nexcel/columns/{id}': {
      put: { tags: ['NEXCEL Columns'], summary: 'Update column', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'Updated field' } } },
      delete: { tags: ['NEXCEL Columns'], summary: 'Delete column', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'Deleted' } } },
    },
    '/api/nexcel/search': {
      get: {
        tags: ['NEXCEL Data'], summary: 'Full-text search across all rows',
        parameters: [{ name: 'q', in: 'query', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Matching rows' } },
      },
    },
    '/api/nexcel/sort': {
      post: {
        tags: ['NEXCEL Data'], summary: 'Sort rows by field',
        requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { fieldId: { type: 'integer' }, direction: { type: 'string', enum: ['asc','desc'] } } } } } },
        responses: { 200: { description: 'Sorted rows' } },
      },
    },
    '/api/nexcel/filter': {
      post: {
        tags: ['NEXCEL Data'], summary: 'Filter rows by rules',
        requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { filter: { type: 'array' } } } } } },
        responses: { 200: { description: 'Filtered rows' } },
      },
    },
    '/api/nexcel/format': {
      post: {
        tags: ['NEXCEL Format'], summary: 'Set cell format (bold, color, alignment)',
        requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { rowId: { type: 'integer' }, fieldId: { type: 'integer' }, format: { type: 'object' } } } } } },
        responses: { 200: { description: 'Applied format' } },
      },
    },
    '/api/nexcel/conditional-format': {
      get: { tags: ['NEXCEL Format'], summary: 'List conditional format rules', responses: { 200: { description: 'Rules list' } } },
      post: {
        tags: ['NEXCEL Format'], summary: 'Add conditional format rule',
        requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { fieldId: { type: 'integer' }, condition: { type: 'string' }, value: { type: 'string' }, bgColor: { type: 'string' } } } } } },
        responses: { 201: { description: 'Created rule' } },
      },
    },
    '/api/nexcel/conditional-format/{id}': {
      delete: { tags: ['NEXCEL Format'], summary: 'Delete conditional rule', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Deleted' } } },
    },
    '/api/nexcel/import': {
      post: {
        tags: ['NEXCEL Import/Export'], summary: 'Import CSV data',
        requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { csv: { type: 'string', description: 'Full CSV string with header row' } } } } } },
        responses: { 200: { description: 'Import result' } },
      },
    },
    '/api/nexcel/export': {
      get: {
        tags: ['NEXCEL Import/Export'], summary: 'Export as CSV',
        parameters: [{ name: 'format', in: 'query', schema: { type: 'string', default: 'csv' } }],
        responses: { 200: { description: 'CSV file download' } },
      },
    },
    '/api/nexcel/undo': {
      post: { tags: ['NEXCEL Data'], summary: 'Undo last operation (up to 50 steps)', responses: { 200: { description: 'Undo result' } } },
    },
    '/api/nexcel/redo': {
      post: { tags: ['NEXCEL Data'], summary: 'Redo previously undone operation', responses: { 200: { description: 'Redo result' } } },
    },
    '/api/nexcel/clipboard/copy': {
      post: {
        tags: ['NEXCEL Clipboard'], summary: 'Copy cells to server clipboard',
        description: 'Two modes: (1) Discrete — pass rowIds + fieldIds arrays. (2) Range — pass selection: { startRow, endRow, startCol, endCol } to mimic GUI box-select.',
        requestBody: { content: { 'application/json': { schema: { type: 'object', properties: {
          rowIds:    { type: 'array', items: { type: 'integer' }, description: 'Discrete row IDs (mode 1)' },
          fieldIds:  { type: 'array', items: { type: 'integer' }, description: 'Discrete field IDs (mode 1)' },
          selection: { type: 'object', description: 'GUI-style range (mode 2)', properties: {
            startRow: { type: 'integer' }, endRow: { type: 'integer' },
            startCol: { type: 'integer' }, endCol: { type: 'integer' },
          }},
        } } } } },
        responses: { 200: { description: 'Copied — returns rowIds, fieldIds, and count' } },
      },
    },
    '/api/nexcel/clipboard/paste': {
      post: {
        tags: ['NEXCEL Clipboard'], summary: 'Paste from server clipboard at target position',
        requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { targetRowId: { type: 'integer' }, targetFieldId: { type: 'integer' } } } } } },
        responses: { 200: { description: 'Pasted rows' } },
      },
    },
    '/api/nexcel/access-mode': {
      get: { tags: ['NEXCEL Data'], summary: 'Get current access mode', responses: { 200: { description: 'Mode' } } },
      put: {
        tags: ['NEXCEL Data'], summary: 'Set access mode',
        requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { mode: { type: 'string', enum: ['data-entry','analyst','admin'] } } } } } },
        responses: { 200: { description: 'Updated mode' } },
      },
    },

    // ── WORDO ────────────────────────────────────────────────────────────────
    '/api/wordo/state': {
      get: { tags: ['WORDO Document'], summary: 'Document state snapshot', responses: { 200: { description: 'State summary' } } },
    },
    '/api/wordo/document': {
      get: { tags: ['WORDO Document'], summary: 'Get full document JSON', responses: { 200: { description: 'KasumiDocument object' } } },
      put: {
        tags: ['WORDO Document'], summary: 'Replace document',
        requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { title: { type: 'string' }, sections: { type: 'array' } } } } } },
        responses: { 200: { description: 'Updated document' } },
      },
    },
    '/api/wordo/document/markdown': {
      get: { tags: ['WORDO Document'], summary: 'Export document as Markdown', responses: { 200: { description: 'Markdown text', content: { 'text/markdown': {} } } } },
      put: {
        tags: ['WORDO Document'], summary: 'Import document from Markdown',
        requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { markdown: { type: 'string' }, title: { type: 'string' } } } } } },
        responses: { 200: { description: 'Imported document' } },
      },
    },
    '/api/wordo/outline': {
      get: { tags: ['WORDO Document'], summary: 'Get document heading outline', responses: { 200: { description: 'Heading list with sectionId and level' } } },
    },
    '/api/wordo/blocks': {
      post: {
        tags: ['WORDO Blocks'], summary: 'Insert a new block into a section',
        requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { sectionId: { type: 'string' }, block: { '$ref': '#/components/schemas/Block' }, afterBlockId: { type: 'string' } } } } } },
        responses: { 201: { description: 'Inserted block' }, 404: { description: 'Section not found' } },
      },
    },
    '/api/wordo/blocks/{id}': {
      put: {
        tags: ['WORDO Blocks'], summary: 'Update a block',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { content: { 'application/json': { schema: { '$ref': '#/components/schemas/Block' } } } },
        responses: { 200: { description: 'Updated block' }, 404: { description: 'Not found' } },
      },
      delete: {
        tags: ['WORDO Blocks'], summary: 'Delete a block',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Deleted' }, 404: { description: 'Not found' } },
      },
    },
    '/api/wordo/format': {
      post: {
        tags: ['WORDO Blocks'], summary: 'Apply inline formatting marks to a block',
        requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { blockId: { type: 'string' }, marks: { type: 'object', description: 'e.g. {"bold":true,"italic":false}' } } } } } },
        responses: { 200: { description: 'Updated block' } },
      },
    },
    '/api/wordo/comments': {
      get: {
        tags: ['WORDO Comments'], summary: 'List comments',
        parameters: [{ name: 'resolved', in: 'query', schema: { type: 'string', enum: ['true','false'] }, description: 'Filter by resolved state' }],
        responses: { 200: { description: 'Comments list' } },
      },
      post: {
        tags: ['WORDO Comments'], summary: 'Add a comment',
        requestBody: { content: { 'application/json': { schema: { '$ref': '#/components/schemas/Comment' } } } },
        responses: { 201: { description: 'Created comment' } },
      },
    },
    '/api/wordo/comments/{id}': {
      delete: {
        tags: ['WORDO Comments'], summary: 'Delete a comment',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Deleted' } },
      },
    },
    '/api/wordo/comments/{id}/resolve': {
      post: {
        tags: ['WORDO Comments'], summary: 'Mark comment as resolved',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Resolved comment' } },
      },
    },
    '/api/wordo/track-changes': {
      get: { tags: ['WORDO Track Changes'], summary: 'Get track change state and pending changes', responses: { 200: { description: 'Changes' } } },
    },
    '/api/wordo/track-changes/toggle': {
      post: { tags: ['WORDO Track Changes'], summary: 'Toggle track changes on/off', responses: { 200: { description: 'New enabled state' } } },
    },
    '/api/wordo/track-changes/accept': {
      post: {
        tags: ['WORDO Track Changes'], summary: 'Accept a change or all changes',
        requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { id: { type: 'string' }, all: { type: 'boolean' } } } } } },
        responses: { 200: { description: 'Accepted count' } },
      },
    },
    '/api/wordo/track-changes/reject': {
      post: {
        tags: ['WORDO Track Changes'], summary: 'Reject a change or all changes',
        requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { id: { type: 'string' }, all: { type: 'boolean' } } } } } },
        responses: { 200: { description: 'Rejected count' } },
      },
    },
    '/api/wordo/export/markdown': {
      get: { tags: ['WORDO Document'], summary: 'Download document as Markdown file', responses: { 200: { description: 'Markdown file' } } },
    },
    '/api/wordo/export/docx': {
      get: { tags: ['WORDO Document'], summary: 'DOCX export info (browser-side required)', responses: { 200: { description: 'Export note' } } },
    },
    '/api/wordo/export/pdf': {
      get: { tags: ['WORDO Document'], summary: 'PDF export info (browser-side required)', responses: { 200: { description: 'Export note' } } },
    },
    '/api/wordo/access-mode': {
      get: { tags: ['WORDO Document'], summary: 'Get access mode', responses: { 200: { description: 'Mode' } } },
      put: {
        tags: ['WORDO Document'], summary: 'Set access mode',
        requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { mode: { type: 'string', enum: ['data-entry','analyst','admin'] } } } } } },
        responses: { 200: { description: 'Updated mode' } },
      },
    },
  },
}
