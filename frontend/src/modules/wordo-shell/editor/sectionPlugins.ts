import { history, undo, redo } from 'prosemirror-history'
import { keymap } from 'prosemirror-keymap'
import { baseKeymap, toggleMark, setBlockType, wrapIn } from 'prosemirror-commands'
import { wrapInList, splitListItem, liftListItem, sinkListItem } from 'prosemirror-schema-list'
import { inputRules, wrappingInputRule, textblockTypeInputRule } from 'prosemirror-inputrules'
import { tableEditing, columnResizing, goToNextCell } from 'prosemirror-tables'
import { buildBlockIdPlugin } from './blockIdPlugin'
import { buildTrackChangePlugin } from './trackChangePlugin'
import type { WordoSchema } from './schema'

export function buildPlugins(schema: WordoSchema, currentUser = 'user') {
  return [
    history(),
    columnResizing(),
    tableEditing(),
    buildBlockIdPlugin(currentUser),
    buildTrackChangePlugin(),

    keymap({
      'Mod-z': undo,
      'Mod-y': redo,
      'Mod-Shift-z': redo,
      'Mod-b': toggleMark(schema.marks.strong),
      'Mod-i': toggleMark(schema.marks.em),
      'Mod-u': toggleMark(schema.marks.underline),
      'Mod-Shift-x': toggleMark(schema.marks.strikethrough),
      'Mod-Shift-h': toggleMark(schema.marks.highlight),
      'Tab': (state, dispatch) => {
        // Try table navigation first, fall back to list indent
        if (goToNextCell(1)(state, dispatch)) return true
        return sinkListItem(schema.nodes.list_item)(state, dispatch)
      },
      'Shift-Tab': (state, dispatch) => {
        if (goToNextCell(-1)(state, dispatch)) return true
        return liftListItem(schema.nodes.list_item)(state, dispatch)
      },
      'Enter': splitListItem(schema.nodes.list_item),
    }),

    keymap(baseKeymap),

    inputRules({
      rules: [
        textblockTypeInputRule(/^(#{1,6})\s$/, schema.nodes.heading, (match) => ({
          level: match[1].length,
        })),
        wrappingInputRule(/^\s*([-+*])\s$/, schema.nodes.bullet_list),
        wrappingInputRule(/^(\d+)\.\s$/, schema.nodes.ordered_list, (match) => ({
          order: +match[1],
        })),
        wrappingInputRule(/^\s*>\s$/, schema.nodes.blockquote),
      ],
    }),
  ]
}
