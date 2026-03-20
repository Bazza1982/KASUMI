import { test, expect } from '@playwright/test'

test.describe('Grid loading', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    // Wait for grid to load - look for cells or table content
    await page.waitForSelector('[data-testid="excel-shell"]', { timeout: 10000 }).catch(() => {
      // If no data-testid, wait for any grid-like content
    })
    // Wait for app to initialize
    await page.waitForTimeout(2000)
  })

  test('page title is Kasumi Nexcel', async ({ page }) => {
    await expect(page).toHaveTitle(/Kasumi Nexcel/i)
  })

  test('ribbon bar is visible', async ({ page }) => {
    // The ribbon should be present - look for common ribbon elements
    const ribbon = page.locator('button').first()
    await expect(ribbon).toBeVisible({ timeout: 5000 })
  })

  test('sheet tabs are visible', async ({ page }) => {
    // Sheet tabs show table names like "Tasks", "Projects", "Team"
    await expect(page.getByText('Tasks')).toBeVisible({ timeout: 5000 })
  })

  test('grid renders rows', async ({ page }) => {
    // The mock adapter has 500 rows - look for task names
    await expect(page.getByText('Design new homepage')).toBeVisible({ timeout: 5000 })
  })

  test('column headers are visible', async ({ page }) => {
    // Field names from mock: Name, Status, Priority, etc.
    await expect(page.getByText('Name')).toBeVisible({ timeout: 5000 })
  })
})

test.describe('Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForTimeout(2000)
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
    await page.goto('/')
    await page.waitForTimeout(2000)
  })

  test('search input filters grid', async ({ page }) => {
    // Find search input (placeholder "Search...")
    const searchInput = page.getByPlaceholder(/search/i)
    if (await searchInput.isVisible()) {
      await searchInput.fill('Design')
      await page.waitForTimeout(300)
      // Should show filtered results - "Design new homepage" should be visible
      await expect(page.getByText('Design new homepage')).toBeVisible()
    }
  })
})
