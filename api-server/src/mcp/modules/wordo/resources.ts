import type { McpResourceDefinition } from '../../types'
import { wordoStore } from '../../../store/wordoStore'

export const wordoResources: McpResourceDefinition[] = [
  {
    uriPattern: 'kasumi://wordo/document/1/raw',
    module: 'wordo',
    version: '1.0.0',
    description: 'Full document JSON for the current Wordo document',
    mimeType: 'application/json',
    read: async (uri) => ({
      uri,
      mimeType: 'application/json',
      text: JSON.stringify(wordoStore.getDocument(), null, 2),
    }),
  },
  {
    uriPattern: 'kasumi://wordo/document/1/markdown',
    module: 'wordo',
    version: '1.0.0',
    description: 'Current Wordo document exported as Markdown',
    mimeType: 'text/markdown',
    read: async (uri) => ({
      uri,
      mimeType: 'text/markdown',
      text: wordoStore.exportMarkdown(),
    }),
  },
  {
    uriPattern: 'kasumi://wordo/document/1/outline',
    module: 'wordo',
    version: '1.0.0',
    description: 'Heading outline of the current Wordo document',
    mimeType: 'application/json',
    read: async (uri) => ({
      uri,
      mimeType: 'application/json',
      text: JSON.stringify(wordoStore.getOutline(), null, 2),
    }),
  },
]
