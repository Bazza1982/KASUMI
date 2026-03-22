// ============================================================
// KASUMI WORDO — PDF Printer
// Uses the browser's native print dialog with @media print CSS
// to render each section as a proper page. No external lib needed.
// ============================================================

import type { KasumiDocument } from '../types/document'
import type { LayoutOrchestrator } from '../editor/LayoutOrchestrator'

export function printToPdf(
  kasumiDoc: KasumiDocument,
  orchestrator: LayoutOrchestrator,
): void {
  // Build a standalone HTML document with all section content
  const sections = kasumiDoc.sections
    .map(section => {
      const instance = orchestrator.getSection(section.id)
      if (!instance) return ''
      const ps = section.pageStyle

      // Get current ProseMirror HTML from the DOM
      const editorEl = document.querySelector(
        `[data-section-id="${section.id}"] .ProseMirror`
      ) as HTMLElement | null
      const bodyHtml = editorEl?.innerHTML ?? '<p></p>'

      const isLandscape = ps.orientation === 'landscape'
      const pageW = isLandscape ? '297mm' : '210mm'
      const pageH = isLandscape ? '210mm' : '297mm'

      const wm = section.watermark
      const watermarkHtml = wm?.enabled && wm.text ? `
        <div class="watermark" style="
          position:fixed; top:50%; left:50%; transform:translate(-50%,-50%) rotate(${wm.angle}deg);
          font-size: 72pt; font-weight: 900; color: rgba(180,180,180,${wm.opacity});
          pointer-events:none; user-select:none; white-space:nowrap; z-index:0;
        ">${wm.text}</div>` : ''

      return `
        <div class="wordo-print-section" style="
          width:${pageW}; min-height:${pageH};
          padding:${ps.margins.top}mm ${ps.margins.right}mm ${ps.margins.bottom}mm ${ps.margins.left}mm;
          page-break-after: always; position:relative; box-sizing:border-box;
          background:#fff; overflow:hidden;
        ">
          ${watermarkHtml}
          <div style="position:relative;z-index:1;">${bodyHtml}</div>
        </div>`
    })
    .join('\n')

  const printWindow = window.open('', '_blank', 'width=900,height=700')
  if (!printWindow) {
    alert('Please allow popups to use Print to PDF.')
    return
  }

  printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${kasumiDoc.title}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #fff; font-family: "Calibri", "Segoe UI", Arial, sans-serif; font-size: 14px; line-height: 1.7; }

    h1 { font-size: 26px; font-weight: 700; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px; margin: 16px 0 8px; }
    h2 { font-size: 20px; font-weight: 700; margin: 14px 0 6px; }
    h3 { font-size: 16px; font-weight: 600; margin: 12px 0 4px; }
    h4 { font-size: 14px; font-weight: 600; margin: 10px 0 4px; }
    h5, h6 { font-size: 12px; font-weight: 600; margin: 8px 0 4px; text-transform: uppercase; letter-spacing: 0.04em; }
    p  { margin-bottom: 8px; }
    ul, ol { padding-left: 24px; margin: 6px 0 10px; }
    li { margin: 2px 0; }
    blockquote { border-left: 3px solid #4f8ef7; padding: 4px 12px; background: #f0f5ff; font-style: italic; margin: 10px 0; }
    code { background: #f1f1f1; padding: 1px 5px; border-radius: 3px; font-family: monospace; font-size: 12.5px; }
    strong { font-weight: 700; }
    em { font-style: italic; }
    u  { text-decoration: underline; }

    table { border-collapse: collapse; width: 100%; margin: 12px 0; font-size: 13px; }
    td, th { border: 1px solid #d0d7de; padding: 5px 8px; vertical-align: top; }
    th { background: #f6f8fa; font-weight: 600; }
    tr:nth-child(even) td { background: #fafafa; }

    hr { border: none; border-top: 1px solid #e2e8f0; margin: 16px 0; }

    .wordo-nexcel-embed {
      border: 1px solid #c8d8f0; border-radius: 4px; margin: 12px 0;
      background: #f8fbff; overflow: hidden; font-size: 12px;
    }
    .wordo-nexcel-embed-header {
      background: #e8f0fe; padding: 5px 10px; font-weight: 600; color: #1a56e8;
      border-bottom: 1px solid #c8d8f0; font-size: 11px;
    }

    @media print {
      body { margin: 0; }
      .wordo-print-section { page-break-after: always; }
      .wordo-print-section:last-child { page-break-after: avoid; }

      @page {
        margin: 0;
        size: auto;
      }
    }

    /* Print header/footer via CSS */
    @media print {
      body::after {
        content: "${kasumiDoc.title}";
        position: fixed; bottom: 10mm; right: 15mm;
        font-size: 9pt; color: #999;
      }
    }
  </style>
</head>
<body>
  ${sections}
  <script>
    window.onload = function() {
      setTimeout(function() { window.print(); }, 300);
    };
  </script>
</body>
</html>`)

  printWindow.document.close()
}
