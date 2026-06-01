import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const width = parseInt(formData.get('width') as string, 10);
    const height = parseInt(formData.get('height') as string, 10);
    const quality = parseInt(formData.get('quality') as string, 10) || 80;
    const targetKB = parseInt(formData.get('targetKB') as string, 10) || 0;
    const format = (formData.get('format') as string) || 'jpeg';

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    let pipeline = sharp(buffer);

    // Get metadata for aspect ratio
    const metadata = await pipeline.metadata();
    const origWidth = metadata.width || 1;
    const origHeight = metadata.height || 1;

    // Calculate dimensions
    let finalWidth = width || origWidth;
    let finalHeight = height || origHeight;

    // If target KB is specified, we need to find the right quality
    if (targetKB > 0) {
      finalWidth = width || origWidth;
      finalHeight = height || origHeight;

      // If only one dimension specified, maintain aspect ratio
      if (width && !height) {
        finalHeight = Math.round((width / origWidth) * origHeight);
      } else if (height && !width) {
        finalWidth = Math.round((height / origHeight) * origWidth);
      }

      let currentQuality = quality;
      let outputBuffer = await pipeline
        .resize(finalWidth, finalHeight, { fit: 'fill' })
        .jpeg({ quality: currentQuality })
        .toBuffer();

      // Binary search for right quality
      let minQ = 1;
      let maxQ = quality;

      for (let i = 0; i < 10; i++) {
        if (outputBuffer.byteLength <= targetKB * 1024) {
          // Try higher quality
          minQ = currentQuality;
          currentQuality = Math.round((currentQuality + maxQ) / 2);
        } else {
          // Try lower quality
          maxQ = currentQuality;
          currentQuality = Math.round((minQ + currentQuality) / 2);
        }

        pipeline = sharp(buffer);
        outputBuffer = await pipeline
          .resize(finalWidth, finalHeight, { fit: 'fill' })
          .jpeg({ quality: currentQuality })
          .toBuffer();
      }

      return new NextResponse(outputBuffer, {
        headers: {
          'Content-Type': 'image/jpeg',
          'Content-Disposition': `attachment; filename="resized_${file.name.replace(/\.[^.]+$/, '.jpg')}"`,
          'X-Final-Size': outputBuffer.byteLength.toString(),
          'X-Dimensions': `${finalWidth}x${finalHeight}`,
        },
      });
    }

    // Simple resize without target file size
    if (width && !height) {
      finalHeight = Math.round((width / origWidth) * origHeight);
    } else if (height && !width) {
      finalWidth = Math.round((height / origHeight) * origWidth);
    }

    pipeline = sharp(buffer);

    const outputFormat = format === 'png' ? 'png' : 'jpeg';
    const outputBuffer = await pipeline
      .resize(finalWidth, finalHeight, { fit: 'fill' })
      [outputFormat]({ quality: quality / 100 })
      .toBuffer();

    return new NextResponse(outputBuffer, {
      headers: {
        'Content-Type': `image/${outputFormat}`,
        'Content-Disposition': `attachment; filename="resized_${file.name.replace(/\.[^.]+$/, outputFormat === 'png' ? '.png' : '.jpg')}"`,
        'X-Final-Size': outputBuffer.byteLength.toString(),
        'X-Dimensions': `${finalWidth}x${finalHeight}`,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Image processing failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
