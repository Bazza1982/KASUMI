import { test, expect, type Page } from '@playwright/test'

const seedMockSession = async (page: Page) => {
  await page.addInitScript(() => {
    localStorage.setItem('kasumi_use_mock', 'true')
    localStorage.setItem('kasumi_active_shell', 'nexcel')
    sessionStorage.setItem('kasumi_splash_seen', '1')
  })
}

test.describe('Grid loading', () => {
  test.beforeEach(async ({ page }) => {
    await seedMockSession(page)
    await page.goto('/')
    await page.waitForSelector('[data-testid="excel-shell"]', { timeout: 10000 })
    await page.waitForSelector('[data-testid="formula-bar-input"]', { timeout: 10000 })
    await page.waitForSelector('[data-testid="grid-cell-0-0"]', { timeout: 10000 })
    await page.waitForTimeout(500)
  })

  test('page title uses the unified Kasumi brand', async ({ page }) => {
    await expect(page).toHaveTitle(/KASUMI - Where Documents Meet Intelligence/i)
  })

  test('ribbon bar is visible', async ({ page }) => {
    // The ribbon should be present - look for common ribbon elements
    const ribbon = page.locator('button').first()
    await expect(ribbon).toBeVisible({ timeout: 5000 })
  })

  test('sheet tabs are visible', async ({ page }) => {
    await expect(page.getByText('Tasks')).toBeVisible({ timeout: 5000 })
  })

  test('grid renders rows', async ({ page }) => {
    await expect(page.getByTestId('grid-cell-0-0')).toContainText('Design new homepage')
  })

  test('column headers are visible', async ({ page }) => {
    await expect(page.getByText('Name', { exact: true })).toBeVisible({ timeout: 5000 })
  })
})

test.describe('Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await seedMockSession(page)
    await page.goto('/')
    await page.waitForSelector('[data-testid="grid-cell-0-0"]', { timeout: 10000 })
  })

  test('can switch sheet tabs', async ({ page }) => {
    // Click on Projects tab
    await page.getByText('Projects').click()
    await page.waitForTimeout(500)
    // Should still be on the page without errors
    await expect(page).not.toHaveURL(/error/)
  })
})

test.describe('Search', () => {
  test.beforeEach(async ({ page }) => {
    await seedMockSession(page)
    await page.goto('/')
    await page.waitForSelector('[data-testid="grid-cell-0-0"]', { timeout: 10000 })
  })

  test('search input filters grid', async ({ page }) => {
    // Find search input (placeholder "Search...")
    const searchInput = page.getByPlaceholder(/search/i)
    if (await searchInput.isVisible()) {
      await searchInput.fill('Design')
      await page.waitForTimeout(300)
      await expect(page.getByTestId('grid-cell-0-0')).toContainText('Design')
    }
  })
})

test.describe('Formula editing', () => {
  test.beforeEach(async ({ page }) => {
    await seedMockSession(page)
    await page.goto('/')
    await page.waitForSelector('[data-testid="grid-cell-0-0"]', { timeout: 10000 })
    await page.waitForSelector('[data-testid="formula-bar-input"]', { timeout: 10000 })
    await page.waitForTimeout(500)
  })

  test('formula bar replaces the argument under the caret when grid selection changes', async ({ page }) => {
    const formulaBar = page.getByTestId('formula-bar-input')

    await formulaBar.click()
    await formulaBar.fill('=SUM(A1,B2)')
    await formulaBar.click({ position: { x: 58, y: 10 } })

    await page.getByTestId('grid-cell-2-2').click()

    await expect(formulaBar).toHaveValue('=SUM(C3,B2)')
  })

  test('grid inline editing shows function hints and updates the active argument slot', async ({ page }) => {
    await page.getByTestId('grid-cell-0-0').dblclick()
    const inlineEditor = page.getByTestId('grid-inline-editor')
    const formulaBar = page.getByTestId('formula-bar-input')
    await inlineEditor.fill('=XLOOKUP(A1,')

    await expect(page.getByTestId('grid-formula-argument-badge')).toHaveText('Arg 2')
    await expect(page.getByTestId('grid-formula-function-hint')).toContainText('XLOOKUP(')

    await page.getByTestId('grid-cell-1-1').click()

    await expect(formulaBar).toHaveValue('=XLOOKUP(A1,B2')
    await expect(page.getByTestId('grid-formula-argument-badge')).toHaveText('Arg 2')
    await expect(page.getByTestId('grid-inline-formula-hint-overlay')).toBeVisible()
  })

  test('typing into a selected cell starts editing without duplicating characters', async ({ page }) => {
    await page.getByTestId('grid-cell-0-1').click()
    const inlineEditor = page.getByTestId('grid-inline-editor')
    const formulaBar = page.getByTestId('formula-bar-input')

    await page.keyboard.type('di')

    await expect(inlineEditor).toHaveValue('di')
    await expect(formulaBar).toHaveValue('di')
  })

  test('paste selects the full pasted rectangle from the original anchor cell', async ({ page }) => {
    await page.getByTestId('grid-cell-0-0').click()
    await page.evaluate(() => {
      const data = new DataTransfer()
      data.setData('text/plain', 'North\tSouth\nEast\tWest')
      window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
    })

    await expect(page.getByTestId('grid-cell-0-0')).toContainText('North')
    await expect(page.getByTestId('grid-cell-1-0')).toContainText('East')
    await expect(page.locator('[data-testid="formula-bar-input"]')).toHaveValue('North')
    await expect(page.getByTestId('grid-cell-0-0')).toHaveCSS('outline-style', 'solid')
    await expect(page.getByText('A1:B2')).toBeVisible()
  })

  test('fill handle extends the selection and carries values downward', async ({ page }) => {
    await page.getByTestId('grid-cell-0-0').click()
    await page.keyboard.down('Shift')
    await page.getByTestId('grid-cell-1-0').click()
    await page.keyboard.up('Shift')

    const handle = page.getByTestId('grid-fill-handle')
    const targetCell = page.getByTestId('grid-cell-3-0')
    const handleBox = await handle.boundingBox()
    const targetBox = await targetCell.boundingBox()
    if (!handleBox || !targetBox) throw new Error('Fill handle target not rendered')

    await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2)
    await page.mouse.down()
    await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 8 })
    await page.mouse.up()

    await expect(page.getByTestId('grid-cell-2-0')).toContainText('Design new homepage')
    await expect(page.getByTestId('grid-cell-3-0')).toContainText('Fix login bug')
    await expect(page.getByTestId('grid-cell-3-0')).toHaveCSS('outline-style', 'solid')
    await expect(page.getByText('A1:A4')).toBeVisible()
  })

  test('column widths and row heights can be resized from their headers', async ({ page }) => {
    const columnHeader = page.getByTestId('grid-column-header-0')
    const columnHandle = page.getByTestId('grid-column-resize-0')
    const rowHeader = page.getByTestId('grid-row-header-0')
    const rowHandle = page.getByTestId('grid-row-resize-0')

    const headerBoxBefore = await columnHeader.boundingBox()
    const rowBoxBefore = await rowHeader.boundingBox()
    if (!headerBoxBefore || !rowBoxBefore) throw new Error('Resize targets not rendered')

    const columnHandleBox = await columnHandle.boundingBox()
    const rowHandleBox = await rowHandle.boundingBox()
    if (!columnHandleBox || !rowHandleBox) throw new Error('Resize handles not rendered')

    await page.mouse.move(columnHandleBox.x + columnHandleBox.width / 2, columnHandleBox.y + columnHandleBox.height / 2)
    await page.mouse.down()
    await page.mouse.move(columnHandleBox.x + 40, columnHandleBox.y + columnHandleBox.height / 2, { steps: 8 })
    await page.mouse.up()

    await page.mouse.move(rowHandleBox.x + rowHandleBox.width / 2, rowHandleBox.y + rowHandleBox.height / 2)
    await page.mouse.down()
    await page.mouse.move(rowHandleBox.x + rowHandleBox.width / 2, rowHandleBox.y + 18, { steps: 8 })
    await page.mouse.up()

    const headerBoxAfter = await columnHeader.boundingBox()
    const rowBoxAfter = await rowHeader.boundingBox()
    if (!headerBoxAfter || !rowBoxAfter) throw new Error('Resized targets not rendered')

    expect(headerBoxAfter.width).toBeGreaterThan(headerBoxBefore.width + 20)
    expect(rowBoxAfter.height).toBeGreaterThan(rowBoxBefore.height + 8)
  })

  test('double-clicking a column boundary auto-fits the width', async ({ page }) => {
    const columnHeader = page.getByTestId('grid-column-header-0')
    const columnHandle = page.getByTestId('grid-column-resize-0')

    const headerBoxBefore = await columnHeader.boundingBox()
    const handleBox = await columnHandle.boundingBox()
    if (!headerBoxBefore || !handleBox) throw new Error('Column resize target not rendered')

    await page.mouse.dblclick(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2)

    const headerBoxAfter = await columnHeader.boundingBox()
    if (!headerBoxAfter) throw new Error('Auto-fit result not rendered')

    expect(headerBoxAfter.width).not.toBe(headerBoxBefore.width)
    expect(headerBoxAfter.width).toBeGreaterThanOrEqual(60)
  })

  test('header context menus can set column width and row height', async ({ page }) => {
    const columnHeader = page.getByTestId('grid-column-header-0')
    const rowHeader = page.getByTestId('grid-row-header-0')

    const headerBoxBefore = await columnHeader.boundingBox()
    const rowBoxBefore = await rowHeader.boundingBox()
    if (!headerBoxBefore || !rowBoxBefore) throw new Error('Header targets not rendered')

    page.once('dialog', async dialog => {
      expect(dialog.message()).toContain('Column Width')
      await dialog.accept('180')
    })
    await columnHeader.click({ button: 'right' })
    await page.getByText('Column Width...', { exact: true }).click()

    page.once('dialog', async dialog => {
      expect(dialog.message()).toContain('Row Height')
      await dialog.accept('44')
    })
    await rowHeader.click({ button: 'right' })
    await page.getByText('Row Height...', { exact: true }).click()

    const headerBoxAfter = await columnHeader.boundingBox()
    const rowBoxAfter = await rowHeader.boundingBox()
    if (!headerBoxAfter || !rowBoxAfter) throw new Error('Resized header targets not rendered')

    expect(headerBoxAfter.width).toBeGreaterThan(headerBoxBefore.width + 40)
    expect(rowBoxAfter.height).toBeGreaterThan(rowBoxBefore.height + 10)
  })

  test('Home ribbon Wrap Text toggles wrapped cell rendering', async ({ page }) => {
    const cell = page.getByTestId('grid-cell-0-0')
    await cell.click()
    await page.getByTitle('Wrap Text').click()

    const whiteSpace = await cell.locator('span').first().evaluate(node => window.getComputedStyle(node).whiteSpace)
    expect(whiteSpace).toBe('pre-wrap')
  })
})
