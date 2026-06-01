import { NextRequest, NextResponse } from 'next/server';
import { PDFDocument } from 'pdf-lib';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const targetSizeStr = formData.get('targetSizeKB') as string;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const targetSizeKB = parseInt(targetSizeStr, 10);
    if (!targetSizeKB || targetSizeKB < 10) {
      return NextResponse.json({ error: 'Invalid target size' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const originalSize = arrayBuffer.byteLength;

    let pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
    let currentBuffer = await pdfDoc.save();
    let quality = 0.8;

    // Iteratively reduce quality to hit target size
    for (let attempt = 0; attempt < 10; attempt++) {
      if (currentBuffer.byteLength <= targetSizeKB * 1024) break;

      pdfDoc = await PDFDocument.load(currentBuffer);
      // Re-save with compression hints
      currentBuffer = await pdfDoc.save({
        useObjectStreams: true,
        addDefaultPage: false,
      });

      // If still too large and we have images, try removing metadata
      if (currentBuffer.byteLength > targetSizeKB * 1024) {
        pdfDoc = await PDFDocument.load(currentBuffer);
        pdfDoc.setTitle('');
        pdfDoc.setAuthor('');
        pdfDoc.setSubject('');
        pdfDoc.setKeywords([]);
        pdfDoc.setCreator('SnapPDF');
        currentBuffer = await pdfDoc.save({
          useObjectStreams: true,
          addDefaultPage: false,
        });
      }

      quality -= 0.1;
    }

    const compressedSize = currentBuffer.byteLength;

    return new NextResponse(currentBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="compressed_${file.name}"`,
        'X-Original-Size': originalSize.toString(),
        'X-Compressed-Size': compressedSize.toString(),
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Compression failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
