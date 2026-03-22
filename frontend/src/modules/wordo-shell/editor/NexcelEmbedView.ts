// ============================================================
// KASUMI WORDO — NexcelEmbed NodeView
// Renders an embedded Nexcel table as a visual card inside the
// document. Reads snapshot data from node attrs for display.
// ============================================================

import type { Node as PmNode } from 'prosemirror-model'
import type { EditorView, NodeView } from 'prosemirror-view'
import { objectRegistry } from '../../../platform/object-registry'

export class NexcelEmbedView implements NodeView {
  dom: HTMLElement
  private node: PmNode

  constructor(node: PmNode, _view: EditorView) {
    this.node = node
    this.dom = this._render(node)
  }

  private _render(node: PmNode): HTMLElement {
    const { sourceObjectId, mode, caption, snapshotData, snapshotAt } = node.attrs as {
      sourceObjectId: string
      mode: 'linked' | 'snapshot'
      caption?: string
      snapshotData?: { headers: string[]; rows: string[][] }
      snapshotAt?: string
    }

    const ref = objectRegistry.get(sourceObjectId)
    const label = ref?.label ?? sourceObjectId

    // Wrapper
    const wrap = document.createElement('div')
    wrap.className = 'wordo-nexcel-embed'
    wrap.contentEditable = 'false'
    wrap.style.cssText = `
      margin: 12px 0; border: 1px solid #c8d8f0; border-radius: 4px;
      background: #f8fbff; overflow: hidden; font-family: "Calibri", Arial, sans-serif;
      font-size: 12px; user-select: none;
    `

    // Header bar
    const header = document.createElement('div')
    header.style.cssText = `
      display: flex; align-items: center; gap: 8px; padding: 6px 10px;
      background: #e8f0fe; border-bottom: 1px solid #c8d8f0;
    `
    const icon = document.createElement('span')
    icon.textContent = mode === 'linked' ? '🔗' : '📋'
    icon.style.fontSize = '12px'

    const titleEl = document.createElement('span')
    titleEl.textContent = label
    titleEl.style.cssText = 'font-weight: 600; color: #1a56e8; flex: 1;'

    const badgeEl = document.createElement('span')
    badgeEl.textContent = mode === 'linked' ? 'LIVE' : 'SNAPSHOT'
    badgeEl.style.cssText = `
      font-size: 9px; font-weight: 700; padding: 1px 6px; border-radius: 10px; letter-spacing: 0.5px;
      background: ${mode === 'linked' ? '#4caf50' : '#888'}; color: #fff;
    `

    header.appendChild(icon)
    header.appendChild(titleEl)
    header.appendChild(badgeEl)
    wrap.appendChild(header)

    // Data table or placeholder
    if (snapshotData && snapshotData.headers.length > 0) {
      const table = document.createElement('table')
      table.style.cssText = 'width: 100%; border-collapse: collapse; font-size: 12px;'

      // Header row
      const thead = document.createElement('thead')
      const headerRow = document.createElement('tr')
      snapshotData.headers.forEach(h => {
        const th = document.createElement('th')
        th.textContent = h
        th.style.cssText = 'padding: 4px 8px; background: #eef2ff; border: 1px solid #d0daf0; font-weight: 600; color: #333; text-align: left;'
        headerRow.appendChild(th)
      })
      thead.appendChild(headerRow)
      table.appendChild(thead)

      // Data rows (show first 5 + ellipsis)
      const tbody = document.createElement('tbody')
      const displayRows = snapshotData.rows.slice(0, 5)
      displayRows.forEach((row, ri) => {
        const tr = document.createElement('tr')
        tr.style.background = ri % 2 === 0 ? '#fff' : '#f7f9ff'
        row.forEach(cell => {
          const td = document.createElement('td')
          td.textContent = cell
          td.style.cssText = 'padding: 3px 8px; border: 1px solid #e0e8f4; color: #333; max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;'
          tr.appendChild(td)
        })
        tbody.appendChild(tr)
      })

      if (snapshotData.rows.length > 5) {
        const tr = document.createElement('tr')
        const td = document.createElement('td')
        td.colSpan = snapshotData.headers.length
        td.textContent = `… ${snapshotData.rows.length - 5} more rows`
        td.style.cssText = 'padding: 4px 8px; color: #999; font-style: italic; text-align: center; background: #f8f8f8;'
        tr.appendChild(td)
        tbody.appendChild(tr)
      }

      table.appendChild(tbody)
      wrap.appendChild(table)
    } else {
      const placeholder = document.createElement('div')
      placeholder.style.cssText = 'padding: 16px; text-align: center; color: #aaa; font-style: italic; font-size: 12px;'
      placeholder.textContent = `${label} — no data loaded yet`
      wrap.appendChild(placeholder)
    }

    // Footer
    const footer = document.createElement('div')
    footer.style.cssText = 'display: flex; align-items: center; justify-content: space-between; padding: 4px 10px; background: #f0f4ff; border-top: 1px solid #dce6f7;'

    const captionEl = document.createElement('span')
    captionEl.textContent = caption || ''
    captionEl.style.cssText = 'color: #666; font-style: italic; font-size: 11px;'

    const metaEl = document.createElement('span')
    metaEl.textContent = snapshotAt ? `Snapshot: ${new Date(snapshotAt).toLocaleDateString()}` : ''
    metaEl.style.cssText = 'color: #aaa; font-size: 10px;'

    footer.appendChild(captionEl)
    footer.appendChild(metaEl)
    wrap.appendChild(footer)

    return wrap
  }

  update(node: PmNode): boolean {
    if (node.type !== this.node.type) return false
    this.node = node
    // Re-render in place
    const newDom = this._render(node)
    this.dom.replaceWith(newDom)
    this.dom = newDom
    return true
  }

  stopEvent(): boolean { return true }
  ignoreMutation(): boolean { return true }
}
