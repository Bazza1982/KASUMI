import type { FidelitySnapshot } from '../../../modules/wordo-shell/types/document'

export interface DocxFidelityFixture {
  id: string
  name: string
  html: string
  expectedGrade: FidelitySnapshot['grade']
  minScore: number
}

export const DOCX_FIDELITY_FIXTURES: DocxFidelityFixture[] = [
  {
    id: 'plain_memo',
    name: 'plain business memo',
    html: '<h1>Weekly Memo</h1><p>Alpha update.</p><p>Beta update.</p>',
    expectedGrade: 'high',
    minScore: 0.95,
  },
  {
    id: 'heading_report',
    name: 'heading-heavy report',
    html: '<h1>Annual Report</h1><h2>Overview</h2><p>Summary text.</p><h2>Risks</h2><p>Risk text.</p>',
    expectedGrade: 'high',
    minScore: 0.95,
  },
  {
    id: 'audit_table',
    name: 'audit-style report with tables',
    html: '<p>Findings</p><table><tr><th>Area</th><th>Status</th></tr><tr><td>Cash</td><td>Done</td></tr></table>',
    expectedGrade: 'high',
    minScore: 0.9,
  },
  {
    id: 'image_report',
    name: 'image-heavy report',
    html: '<p>Screenshot evidence</p><img src="https://example.com/audit.png" alt="Audit evidence" /><p>Caption text.</p>',
    expectedGrade: 'high',
    minScore: 0.9,
  },
  {
    id: 'nested_list',
    name: 'nested list document',
    html: '<ul><li>One<ul><li>One-A</li></ul></li><li>Two</li></ul>',
    expectedGrade: 'high',
    minScore: 0.9,
  },
  {
    id: 'section_break',
    name: 'section break and header/footer document',
    html: '<p>Section one intro.</p><hr /><p>Section two body.</p>',
    expectedGrade: 'high',
    minScore: 0.9,
  },
  {
    id: 'compatibility_stress',
    name: 'compatibility-stress document',
    html: '<p>Intro</p><object data="chart.bin"></object><p>Retained warning text</p>',
    expectedGrade: 'low',
    minScore: 0.5,
  },
  {
    id: 'quote_memo',
    name: 'memo with block quote',
    html: '<h1>Field Notes</h1><p>Summary intro.</p><blockquote><p>Quoted risk statement.</p></blockquote><p>Signed off.</p>',
    expectedGrade: 'high',
    minScore: 0.9,
  },
  {
    id: 'ordered_actions',
    name: 'ordered action list',
    html: '<h2>Action Plan</h2><ol><li>Collect evidence</li><li>Review controls</li><li>Finalize memo</li></ol>',
    expectedGrade: 'high',
    minScore: 0.9,
  },
  {
    id: 'mixed_lists',
    name: 'mixed ordered and bullet lists',
    html: '<p>Checklist</p><ol><li>Plan</li><li>Execute</li></ol><ul><li>Issue log</li><li>Escalations</li></ul>',
    expectedGrade: 'high',
    minScore: 0.9,
  },
  {
    id: 'two_tables',
    name: 'dual table working paper',
    html: '<p>Control matrix</p><table><tr><th>Control</th><th>Owner</th></tr><tr><td>Bank rec</td><td>Finance</td></tr></table><p>Exceptions</p><table><tr><th>ID</th><th>Status</th></tr><tr><td>E-01</td><td>Open</td></tr></table>',
    expectedGrade: 'high',
    minScore: 0.9,
  },
  {
    id: 'table_image_combo',
    name: 'table and screenshot combo',
    html: '<h2>Testing pack</h2><table><tr><th>Step</th><th>Outcome</th></tr><tr><td>1</td><td>Pass</td></tr></table><img src="https://example.com/evidence.png" alt="Evidence screenshot" /><p>Attached evidence confirmed.</p>',
    expectedGrade: 'high',
    minScore: 0.88,
  },
  {
    id: 'image_gallery',
    name: 'multiple inline screenshots',
    html: '<p>Evidence set A</p><img src="https://example.com/a.png" alt="A" /><img src="https://example.com/b.png" alt="B" /><p>Both screenshots matched.</p>',
    expectedGrade: 'high',
    minScore: 0.88,
  },
  {
    id: 'long_form_report',
    name: 'long-form narrative report',
    html: '<h1>Long Report</h1><p>Paragraph one with detailed control commentary.</p><p>Paragraph two with additional audit observations and walkthrough notes.</p><p>Paragraph three with remediation updates and sign-off detail.</p><p>Paragraph four with final conclusion and recommended action.</p>',
    expectedGrade: 'high',
    minScore: 0.95,
  },
  {
    id: 'heading_table_list',
    name: 'headings with table and list',
    html: '<h1>Quarterly Review</h1><h2>Highlights</h2><ul><li>Revenue stable</li><li>Controls improved</li></ul><h2>Metrics</h2><table><tr><th>Metric</th><th>Value</th></tr><tr><td>Exceptions</td><td>2</td></tr></table>',
    expectedGrade: 'high',
    minScore: 0.9,
  },
  {
    id: 'blank_paragraphs',
    name: 'sparse memo with blank lines',
    html: '<h1>Status Update</h1><p></p><p>Line item one.</p><p></p><p>Line item two.</p>',
    expectedGrade: 'high',
    minScore: 0.9,
  },
  {
    id: 'compatibility_svg',
    name: 'svg compatibility retention',
    html: '<p>Vector object below.</p><svg><text>chart</text></svg><p>Reference kept.</p>',
    expectedGrade: 'low',
    minScore: 0.5,
  },
  {
    id: 'compatibility_canvas',
    name: 'canvas compatibility retention',
    html: '<p>Rendered canvas snapshot.</p><canvas></canvas><p>Fallback retained.</p>',
    expectedGrade: 'low',
    minScore: 0.5,
  },
  {
    id: 'compatibility_embed',
    name: 'embedded media compatibility retention',
    html: '<p>Embedded workbook below.</p><embed src="sheet.bin" /><p>Placeholder generated.</p>',
    expectedGrade: 'low',
    minScore: 0.5,
  },
  {
    id: 'compatibility_math',
    name: 'math object compatibility retention',
    html: '<p>Formula preview.</p><math><mi>x</mi><mo>=</mo><mn>1</mn></math><p>Equation retained as reference.</p>',
    expectedGrade: 'low',
    minScore: 0.5,
  },
  {
    id: 'multi_section_style',
    name: 'section break style handoff',
    html: '<h1>Section One</h1><p>Intro body.</p><hr /><h2>Section Two</h2><p>Continuation body.</p>',
    expectedGrade: 'high',
    minScore: 0.9,
  },
  {
    id: 'table_heavy_register',
    name: 'register with wide table content',
    html: '<p>Risk register</p><table><tr><th>Risk</th><th>Description</th><th>Owner</th></tr><tr><td>R1</td><td>Delayed reconciliation</td><td>AP</td></tr><tr><td>R2</td><td>Access overlap</td><td>IT</td></tr></table>',
    expectedGrade: 'high',
    minScore: 0.9,
  },
  {
    id: 'quote_table_combo',
    name: 'quote plus appendix table',
    html: '<blockquote><p>Management response retained verbatim.</p></blockquote><p>Appendix</p><table><tr><th>Item</th><th>Value</th></tr><tr><td>A</td><td>Closed</td></tr></table>',
    expectedGrade: 'high',
    minScore: 0.9,
  },
  {
    id: 'dense_bullets',
    name: 'dense bullet findings',
    html: '<h2>Findings</h2><ul><li>Segregation issue</li><li>Review gap</li><li>Untimely approval</li><li>Missing evidence</li></ul>',
    expectedGrade: 'high',
    minScore: 0.9,
  },
  {
    id: 'image_caption_flow',
    name: 'image with intro and caption flow',
    html: '<p>Screenshot summary.</p><img src="https://example.com/control-shot.png" alt="Control screenshot" /><p>Figure 1. User access review.</p><p>Interpretation notes.</p>',
    expectedGrade: 'high',
    minScore: 0.88,
  },
  {
    id: 'mixed_heading_quote_list',
    name: 'heading quote and checklist',
    html: '<h1>Audit Debrief</h1><blockquote><p>Key issue escalated.</p></blockquote><ol><li>Notify owner</li><li>Track remediation</li></ol><p>Close once evidence lands.</p>',
    expectedGrade: 'high',
    minScore: 0.9,
  },
]
