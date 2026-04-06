import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DocxPreviewSurface } from '../../modules/wordo-shell/components/DocxPreviewSurface'

const renderAsyncMock = vi.fn()

vi.mock('docx-preview', () => ({
  renderAsync: renderAsyncMock,
}))

describe('DocxPreviewSurface', () => {
  beforeEach(() => {
    renderAsyncMock.mockReset()
    renderAsyncMock.mockResolvedValue(undefined)
  })

  it('renders a DOCX using high-fidelity preview options', async () => {
    const file = new File(['demo'], 'demo.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    })

    render(<DocxPreviewSurface file={file} title="demo" />)

    expect(screen.getByText('Rendering Word document: demo')).toBeInTheDocument()

    await waitFor(() => {
      expect(renderAsyncMock).toHaveBeenCalledTimes(1)
    })

    expect(renderAsyncMock).toHaveBeenCalledWith(
      file,
      expect.any(HTMLDivElement),
      undefined,
      expect.objectContaining({
        className: 'wordo-docx-preview',
        inWrapper: false,
        breakPages: true,
        ignoreLastRenderedPageBreak: false,
        experimental: true,
        useBase64URL: true,
        renderHeaders: true,
        renderFooters: true,
      }),
    )
  })

  it('shows an error banner if preview rendering fails', async () => {
    renderAsyncMock.mockRejectedValueOnce(new Error('bad docx'))

    const file = new File(['broken'], 'broken.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    })

    render(<DocxPreviewSurface file={file} title="broken" />)

    await waitFor(() => {
      expect(screen.getByText('DOCX preview failed.')).toBeInTheDocument()
    })

    expect(screen.getByText('bad docx')).toBeInTheDocument()
  })
})
