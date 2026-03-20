import type React from 'react'
import type { FieldMeta } from '../types'

// Renders a raw field value to a display string
export function renderCellValue(value: unknown, field: FieldMeta): string {
  if (value === null || value === undefined || value === '') return ''

  switch (field.type) {
    case 'boolean':
      return value ? '☑' : '☐'

    case 'single_select': {
      const sel = value as { value?: string } | null
      return sel?.value ?? ''
    }

    case 'multiple_select': {
      const arr = value as Array<{ value?: string }> | null
      return (arr ?? []).map(s => s.value).filter(Boolean).join(', ')
    }

    case 'date':
    case 'created_on':
    case 'last_modified': {
      if (!value) return ''
      try {
        const d = new Date(value as string)
        if (isNaN(d.getTime())) return String(value)
        if (field.dateIncludeTime) {
          return d.toLocaleString()
        }
        return d.toLocaleDateString()
      } catch {
        return String(value)
      }
    }

    case 'number': {
      const n = parseFloat(String(value))
      if (isNaN(n)) return String(value)
      const decimals = field.numberDecimalPlaces ?? 0
      return n.toFixed(decimals)
    }

    case 'file': {
      const files = value as Array<{ visible_name?: string }> | null
      if (!files || !files.length) return ''
      return files.map(f => f.visible_name || '').join(', ')
    }

    case 'link_row': {
      const links = value as Array<{ value?: string }> | null
      if (!links || !links.length) return ''
      return links.map(l => l.value || '').join(', ')
    }

    default:
      return String(value)
  }
}

// Returns background color for a cell based on its value (for select fields)
export function getCellBgColor(value: unknown, field: FieldMeta): string | undefined {
  if (field.type === 'boolean') {
    return value ? '#e8f5e9' : undefined
  }
  return undefined
}

// Returns a CSS color class name for select option colors
export const SELECT_COLORS: Record<string, string> = {
  blue:        '#e3f2fd',
  light_blue:  '#e1f5fe',
  purple:      '#f3e5f5',
  red:         '#ffebee',
  green:       '#e8f5e9',
  yellow:      '#fffde7',
  orange:      '#fff3e0',
  pink:        '#fce4ec',
  cyan:        '#e0f7fa',
  dark_blue:   '#e8eaf6',
  dark_green:  '#e0f2f1',
  dark_red:    '#fbe9e7',
  gray:        '#f5f5f5',
  light_gray:  '#fafafa',
}

export function getSelectOptionStyle(color: string): React.CSSProperties {
  return {
    backgroundColor: SELECT_COLORS[color] || '#f5f5f5',
    borderRadius: '3px',
    padding: '1px 5px',
    fontSize: '12px',
    display: 'inline-block',
    maxWidth: '100%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  }
}
