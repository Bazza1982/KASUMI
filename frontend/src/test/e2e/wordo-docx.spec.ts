import { expect, test, type Page } from '@playwright/test'
import mammoth from 'mammoth'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createMemoDocxBuffer } from '../fixtures/wordo/generateDocxFixture'

const seedWordoSession = async (page: Page) => {
  await page.addInitScript(() => {
    localStorage.setItem('kasumi_use_mock', 'true')
    localStorage.setItem('kasumi_active_shell', 'wordo')
    sessionStorage.setItem('kasumi_splash_seen', '1')
  })
}

test.describe('Wordo DOCX fidelity preview', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(test.info().project.name !== 'chromium', 'visual snapshot baseline is only maintained for Chromium')
    await seedWordoSession(page)
    await page.setViewportSize({ width: 1440, height: 1200 })
    await page.goto('/')
    await page.waitForTimeout(800)
  })

  test('keeps a stable DOCX preview screenshot and editable diagnostics baseline', async ({ page }) => {
    const docxBuffer = await createMemoDocxBuffer()

    await page.getByTestId('wordo-docx-file-input').setInputFiles({
      name: 'weekly-memo.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buffer: docxBuffer,
    })

    await expect(page.getByText('DOCX fidelity mode:')).toBeVisible({ timeout: 15000 })
    const previewShell = page.getByTestId('wordo-docx-preview-shell')
    await expect(previewShell.getByText('Rendering Word document: weekly memo')).toBeHidden({ timeout: 15000 })
    await expect(previewShell.locator('article')).toContainText('Weekly Memo')
    await expect(previewShell.locator('article')).toContainText('Audit status: green.')
    await expect(previewShell).toHaveScreenshot('wordo-docx-preview-memo.png', {
      animations: 'disabled',
      caret: 'hide',
    })

    await page.getByRole('button', { name: /convert to editable wordo format/i }).click()
    await expect(page.getByText('DOCX diagnostics:')).toBeVisible({ timeout: 15000 })
    await expect(page.getByText(/tables preserved/i)).toBeVisible()
    await expect(page.getByText(/text chars retained/i)).toBeVisible()
  })

  test('supports import to editable, edit, export, and DOCX round-trip smoke', async ({ page }) => {
    const docxBuffer = await createMemoDocxBuffer()

    await page.getByTestId('wordo-docx-file-input').setInputFiles({
      name: 'weekly-memo.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buffer: docxBuffer,
    })

    await expect(page.getByText('DOCX fidelity mode:')).toBeVisible({ timeout: 15000 })
    await page.getByRole('button', { name: /convert to editable wordo format/i }).click()

    const diagnostics = page.getByTestId('wordo-docx-diagnostics-banner')
    await expect(diagnostics).toBeVisible({ timeout: 15000 })

    const editor = page.locator('[data-testid^="wordo-editor-surface-"] .ProseMirror').first()
    await expect(editor).toBeVisible()
    const appendOk = await page.evaluate(() => {
      return (window as any).__kasumiWordoTest?.appendParagraph('Edited conclusion from Playwright export smoke.') ?? false
    })
    expect(appendOk).toBe(true)

    await expect(editor).toContainText('Edited conclusion from Playwright export smoke.')

    await page.getByRole('button', { name: 'File' }).click()
    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: /save as \.docx/i }).click()
    const download = await downloadPromise

    expect(download.suggestedFilename()).toBe('weekly memo.docx')

    const tempDir = await mkdtemp(join(tmpdir(), 'wordo-docx-export-'))
    const savedPath = join(tempDir, download.suggestedFilename())

    try {
      await download.saveAs(savedPath)
      const buffer = await readFile(savedPath)
      const roundTrip = await mammoth.extractRawText({ buffer })
      const normalizedText = roundTrip.value.replace(/\s+/g, ' ').trim()

      expect(normalizedText).toContain('Weekly Memo')
      expect(normalizedText).toContain('Audit status: green.')
      expect(normalizedText).toContain('Edited conclusion from Playwright export smoke.')
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  })
})
