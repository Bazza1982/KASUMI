import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx'

export async function createMemoDocxBuffer(): Promise<Buffer> {
  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            children: [new TextRun('Weekly Memo')],
          }),
          new Paragraph('Audit status: green.'),
          new Paragraph('Key controls were tested and no exceptions were found.'),
        ],
      },
    ],
  })

  return Buffer.from(await Packer.toBuffer(doc))
}
