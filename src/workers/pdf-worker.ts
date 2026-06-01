/**
 * PDF Processing Web Worker for SnapPDF
 *
 * Handles heavy PDF operations in a dedicated worker thread to keep the main thread responsive.
 * Uses OffscreenCanvas for rendering, pdfjs-dist for reading, pdf-lib for manipulation,
 * and jsPDF for rebuilding compressed PDFs.
 *
 * Message Protocol:
 *   Request:  { id: string; type: 'compress-pdf'; payload: CompressPdfPayload }
 *   Progress: { id: string; type: 'progress'; payload: ProgressPayload }
 *   Result:   { id: string; type: 'result'; payload: ResultPayload }
 *   Error:    { id: string; type: 'error'; payload: ErrorPayload }
 */

/* -------------------------------------------------------------------------- */
/*  Type definitions                                                          */
/* -------------------------------------------------------------------------- */

interface WorkerRequest {
  id: string;
  type: 'compress-pdf';
  payload: CompressPdfPayload;
}

interface CompressPdfPayload {
  fileData: ArrayBuffer;
  targetKB: number;
  strategy: 'auto' | 'quality' | 'compression';
}

interface WorkerResponse {
  id: string;
  type: 'progress' | 'result' | 'error';
  payload: ProgressPayload | ResultPayload | ErrorPayload;
}

interface ProgressPayload {
  stage: string;
  percent: number;
  message: string;
  /** current binary-search iteration (0-based) */
  iteration?: number;
  /** total planned iterations */
  maxIterations?: number;
  /** current page being rendered (1-based) */
  page?: number;
  /** total pages in document */
  totalPages?: number;
}

interface ResultPayload {
  blob: ArrayBuffer;
  finalSize: number;
  /** true when the final size exceeds the target */
  targetNotMet?: boolean;
}

interface ErrorPayload {
  message: string;
  code?: string;
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

/** Convert a Blob to a base-64 data-URL string (FileReader is available in workers) */
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read blob as data URL'));
    reader.readAsDataURL(blob);
  });
}

/** Post a typed progress message back to the main thread */
function postProgress(id: string, payload: ProgressPayload): void {
  const msg: WorkerResponse = { id, type: 'progress', payload };
  self.postMessage(msg);
}

/** Post a final result back to the main thread, transferring the ArrayBuffer */
function postResult(id: string, payload: ResultPayload): void {
  const msg: WorkerResponse = { id, type: 'result', payload };
  self.postMessage(msg, [payload.blob]);
}

/** Post an error back to the main thread */
function postError(id: string, payload: ErrorPayload): void {
  const msg: WorkerResponse = { id, type: 'error', payload };
  self.postMessage(msg);
}

/* -------------------------------------------------------------------------- */
/*  Lossless compression via pdf-lib                                           */
/* -------------------------------------------------------------------------- */

async function tryLosslessCompression(sourceArrayBuffer: ArrayBuffer): Promise<ArrayBuffer> {
  const { PDFDocument } = await import('pdf-lib');
  const pdfDoc = await PDFDocument.load(sourceArrayBuffer, {
    ignoreEncryption: true,
  });
  // Strip all metadata to save bytes
  pdfDoc.setTitle('');
  pdfDoc.setAuthor('');
  pdfDoc.setSubject('');
  pdfDoc.setKeywords([]);
  pdfDoc.setProducer('');
  pdfDoc.setCreator('');
  return pdfDoc.save({ useObjectStreams: true, addDefaultPage: false });
}

/* -------------------------------------------------------------------------- */
/*  Page rendering with pdfjs-dist + OffscreenCanvas                          */
/* -------------------------------------------------------------------------- */

interface RenderedPage {
  dataUrl: string;
  width: number;
  height: number;
}

async function renderPagesToJpeg(
  sourceArrayBuffer: ArrayBuffer,
  scale: number,
  quality: number,
  id: string,
  onProgress?: (page: number, total: number) => void,
): Promise<RenderedPage[]> {
  const pdfjsLib = await import('pdfjs-dist');

  // We are already inside a Web Worker — disable pdfjs-dist's internal worker
  // to avoid it trying to spawn a sub-worker.
  pdfjsLib.GlobalWorkerOptions.workerSrc = '';

  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(sourceArrayBuffer),
    useSystemFonts: true,
    isEvalSupported: false,
    useWorkerFetch: false,
  });

  const pdfDoc = await loadingTask.promise;
  const totalPages = pdfDoc.numPages;
  const pages: RenderedPage[] = [];

  for (let i = 1; i <= totalPages; i++) {
    const page = await pdfDoc.getPage(i);
    const viewport = page.getViewport({ scale });

    const canvasWidth = Math.round(viewport.width);
    const canvasHeight = Math.round(viewport.height);

    // OffscreenCanvas — no DOM required
    const canvas = new OffscreenCanvas(canvasWidth, canvasHeight);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error(`Failed to get 2D context for page ${i}`);

    await page.render({ canvasContext: ctx, viewport }).promise;

    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality });
    const dataUrl = await blobToDataUrl(blob);

    pages.push({ dataUrl, width: canvasWidth, height: canvasHeight });

    // Report per-page progress if callback provided
    if (onProgress) onProgress(i, totalPages);
    postProgress(id, {
      stage: 'render-page',
      percent: 0,
      message: `Rendering page ${i}/${totalPages}`,
      page: i,
      totalPages,
    });
  }

  return pages;
}

/* -------------------------------------------------------------------------- */
/*  Rebuild PDF from rendered JPEG pages via jsPDF                            */
/* -------------------------------------------------------------------------- */

async function rebuildPdfFromImages(pages: RenderedPage[]): Promise<ArrayBuffer> {
  const { jsPDF } = await import('jspdf');

  const firstPage = pages[0];
  // Convert pixel dimensions → mm at 72 DPI (pdfjs renders at 72 base DPI × scale)
  const pxToMm = 25.4 / 72;
  const pageWidthMm = (firstPage.width / 1.5) * pxToMm;
  const pageHeightMm = (firstPage.height / 1.5) * pxToMm;

  const isLandscape = pageWidthMm > pageHeightMm;
  const doc = new jsPDF({
    orientation: isLandscape ? 'landscape' : 'portrait',
    unit: 'mm',
    format: [pageWidthMm, pageHeightMm],
  });

  for (let i = 0; i < pages.length; i++) {
    if (i > 0) doc.addPage([pageWidthMm, pageHeightMm]);
    doc.addImage(pages[i].dataUrl, 'JPEG', 0, 0, pageWidthMm, pageHeightMm);
  }

  return doc.output('arraybuffer');
}

/* -------------------------------------------------------------------------- */
/*  Core: compressToTarget — binary search for optimal JPEG quality          */
/* -------------------------------------------------------------------------- */

async function compressToTarget(
  fileData: ArrayBuffer,
  targetKB: number,
  strategy: 'auto' | 'quality' | 'compression',
  id: string,
): Promise<ResultPayload> {
  const targetBytes = targetKB * 1024;

  // ── Stage 1: Lossless pass ─────────────────────────────────────────────
  postProgress(id, {
    stage: 'lossless',
    percent: 5,
    message: 'Optimizing PDF structure (lossless)...',
  });

  let losslessBuffer: ArrayBuffer;
  try {
    losslessBuffer = await tryLosslessCompression(fileData);
  } catch (err) {
    postProgress(id, {
      stage: 'lossless',
      percent: 5,
      message: 'Lossless pass failed — skipping to lossy compression.',
    });
    losslessBuffer = fileData;
  }

  // If lossless is already small enough, return immediately
  if (losslessBuffer.byteLength <= targetBytes) {
    postProgress(id, {
      stage: 'done',
      percent: 100,
      message: 'Lossless compression sufficient.',
    });
    return { blob: losslessBuffer, finalSize: losslessBuffer.byteLength };
  }

  // ── Stage 2: Get page count ────────────────────────────────────────────
  postProgress(id, {
    stage: 'page-count',
    percent: 8,
    message: 'Analyzing PDF pages...',
  });

  const { PDFDocument } = await import('pdf-lib');
  const sourcePdf = await PDFDocument.load(fileData, { ignoreEncryption: true });
  const pageCount = sourcePdf.getPageCount();
  const originalPerPageSize = fileData.byteLength / pageCount;

  // ── Stage 3: Calculate render scale ─────────────────────────────────────
  postProgress(id, {
    stage: 'calculate',
    percent: 10,
    message: 'Calculating compression parameters...',
  });

  let baseScale = 1.5;
  if (strategy === 'quality') baseScale = 2.0;
  if (strategy === 'compression') baseScale = 0.8;
  const scaleFactor = Math.max(
    0.5,
    Math.min(baseScale, Math.sqrt(targetBytes / (originalPerPageSize * 2))),
  );

  // ── Stage 4: Binary search on JPEG quality ─────────────────────────────
  let lo = strategy === 'compression' ? 0.03 : 0.05;
  let hi = strategy === 'quality' ? 0.98 : 0.95;
  const maxIterations = strategy === 'quality' ? 12 : 8;

  let bestResult: ArrayBuffer | null = null;
  let bestSize = Infinity;

  for (let iteration = 0; iteration < maxIterations && lo <= hi; iteration++) {
    const mid = Math.round((lo + hi) * 100) / 100;

    postProgress(id, {
      stage: 'binary-search',
      percent: Math.min(90, 10 + (iteration + 1) * 10),
      message: `Quality ${Math.round(mid * 100)}% (iteration ${iteration + 1}/${maxIterations})...`,
      iteration,
      maxIterations,
    });

    try {
      const pages = await renderPagesToJpeg(fileData, scaleFactor, mid, id);
      const rebuilt = await rebuildPdfFromImages(pages);
      const size = rebuilt.byteLength;

      if (size <= targetBytes) {
        // This quality level produces a file under the target — remember it
        // and try a higher quality
        bestResult = rebuilt;
        bestSize = size;
        lo = mid + 0.03;
      } else {
        // Too large — lower quality
        hi = mid - 0.03;
      }
    } catch {
      // Rendering failure at this quality — lower the upper bound
      hi = mid - 0.03;
    }
  }

  // ── Stage 5: Maximum compression fallback ───────────────────────────────
  if (!bestResult) {
    postProgress(id, {
      stage: 'fallback',
      percent: 92,
      message: 'Maximum compression fallback...',
    });

    try {
      const pages = await renderPagesToJpeg(fileData, scaleFactor, 0.03, id);
      const rebuilt = await rebuildPdfFromImages(pages);
      bestResult = rebuilt;
      bestSize = rebuilt.byteLength;
    } catch {
      // Absolute fallback — return the lossless result
      bestResult = losslessBuffer;
      bestSize = losslessBuffer.byteLength;
    }
  }

  postProgress(id, {
    stage: 'done',
    percent: 100,
    message: 'Compression complete.',
  });

  return {
    blob: bestResult,
    finalSize: bestSize,
    targetNotMet: bestSize > targetBytes,
  };
}

/* -------------------------------------------------------------------------- */
/*  Watermark PDF task                                                         */
/* -------------------------------------------------------------------------- */

interface WatermarkPdfPayload {
  fileData: ArrayBuffer;
  wmType: 'text' | 'image';
  wmText: string;
  fontSize: number;
  fontColor: string;
  wmOpacity: number;
  wmRotation: number;
  wmPosition: 'center' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  tiled: boolean;
  wmImageData?: ArrayBuffer;
  wmImageMime?: string;
  wmImageScale: number;
  affectedPageIndices: number[];
}

interface WatermarkPdfResult {
  blob: ArrayBuffer;
  affectedCount: number;
}

function hexToRgbWorker(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.substring(0, 2), 16) / 255,
    g: parseInt(h.substring(2, 4), 16) / 255,
    b: parseInt(h.substring(4, 6), 16) / 255,
  };
}

async function handleWatermarkPdf(
  id: string,
  payload: WatermarkPdfPayload,
): Promise<WatermarkPdfResult> {
  const { fileData, wmType, wmText, fontSize, fontColor, wmOpacity, wmRotation, wmPosition, tiled, wmImageData, wmImageMime, wmImageScale, affectedPageIndices } = payload;

  postProgress(id, {
    stage: 'load',
    percent: 5,
    message: 'Loading PDF...',
  });

  const { PDFDocument, rgb, StandardFonts, degrees } = await import('pdf-lib');
  const pdfDoc = await PDFDocument.load(fileData, { ignoreEncryption: true });
  const pages = pdfDoc.getPages();
  const colorRgb = hexToRgbWorker(fontColor);

  postProgress(id, {
    stage: 'embed',
    percent: 10,
    message: 'Embedding resources...',
  });

  const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // Embed watermark image if needed
  let embeddedImage: Awaited<ReturnType<typeof pdfDoc.embedPng>> | null = null;
  if (wmType === 'image' && wmImageData) {
    try {
      if (wmImageMime === 'image/png') {
        embeddedImage = await pdfDoc.embedPng(new Uint8Array(wmImageData));
      } else {
        embeddedImage = await pdfDoc.embedJpg(new Uint8Array(wmImageData));
      }
    } catch {
      // Try alternate format
      try {
        if (wmImageMime === 'image/png') {
          embeddedImage = await pdfDoc.embedJpg(new Uint8Array(wmImageData));
        } else {
          embeddedImage = await pdfDoc.embedPng(new Uint8Array(wmImageData));
        }
      } catch {
        postError(id, { message: 'Failed to embed watermark image. Use PNG or JPEG.' });
        throw new Error('Image embed failed');
      }
    }
  }

  // Apply watermark to affected pages
  for (let i = 0; i < affectedPageIndices.length; i++) {
    const pageIdx = affectedPageIndices[i];
    const page = pages[pageIdx];
    const { width, height } = page.getSize();

    if (wmType === 'text') {
      const textWidth = font.widthOfTextAtSize(wmText, fontSize);
      const textHeight = font.heightAtSize(fontSize);

      if (tiled) {
        const diagonal = Math.sqrt(width * width + height * height);
        const spacingX = textWidth + 60;
        const spacingY = fontSize * 2;
        for (let y = -height; y < height + diagonal; y += spacingY) {
          for (let x = -width; x < width + diagonal; x += spacingX) {
            page.drawText(wmText, {
              x, y, size: fontSize, font,
              color: rgb(colorRgb.r, colorRgb.g, colorRgb.b),
              opacity: wmOpacity / 100,
              rotate: degrees(wmRotation),
            });
          }
        }
      } else {
        let x: number, y: number;
        switch (wmPosition) {
          case 'center': x = (width - textWidth) / 2; y = (height - textHeight) / 2; break;
          case 'top-left': x = 30; y = height - 30 - textHeight; break;
          case 'top-right': x = width - textWidth - 30; y = height - 30 - textHeight; break;
          case 'bottom-left': x = 30; y = 30; break;
          case 'bottom-right': x = width - textWidth - 30; y = 30; break;
          default: x = (width - textWidth) / 2; y = (height - textHeight) / 2;
        }
        page.drawText(wmText, {
          x, y, size: fontSize, font,
          color: rgb(colorRgb.r, colorRgb.g, colorRgb.b),
          opacity: wmOpacity / 100,
          rotate: degrees(wmRotation),
        });
      }
    } else if (wmType === 'image' && embeddedImage) {
      const imgWidth = (width * wmImageScale) / 100;
      const imgHeight = (embeddedImage.height / embeddedImage.width) * imgWidth;
      let x: number, y: number;
      switch (wmPosition) {
        case 'center': x = (width - imgWidth) / 2; y = (height - imgHeight) / 2; break;
        case 'top-left': x = 20; y = height - imgHeight - 20; break;
        case 'top-right': x = width - imgWidth - 20; y = height - imgHeight - 20; break;
        case 'bottom-left': x = 20; y = 20; break;
        case 'bottom-right': x = width - imgWidth - 20; y = 20; break;
        default: x = (width - imgWidth) / 2; y = (height - imgHeight) / 2;
      }
      page.drawImage(embeddedImage, {
        x, y, width: imgWidth, height: imgHeight,
        opacity: wmOpacity / 100,
        rotate: degrees(wmRotation),
      });
    }

    const pct = Math.round(10 + ((i + 1) / affectedPageIndices.length) * 85);
    postProgress(id, {
      stage: 'apply',
      percent: pct,
      message: `Watermarking page ${i + 1}/${affectedPageIndices.length}...`,
      page: i + 1,
      totalPages: affectedPageIndices.length,
    });
  }

  postProgress(id, { stage: 'save', percent: 98, message: 'Saving PDF...' });

  const pdfBytes = await pdfDoc.save();

  postProgress(id, { stage: 'done', percent: 100, message: 'Watermark applied!' });

  return { blob: pdfBytes, affectedCount: affectedPageIndices.length };
}

/* -------------------------------------------------------------------------- */
/*  Markdown to PDF task                                                      */
/* -------------------------------------------------------------------------- */

interface MdBlock {
  type: 'heading1' | 'heading2' | 'heading3' | 'paragraph' | 'bullet' | 'code' | 'hr' | 'blockquote';
  content: string;
}

interface MdSettings {
  pageSize: string;
  fontSize: number;
  marginTop: number;
  marginBottom: number;
  marginLeft: number;
  marginRight: number;
  title: string;
  pageNumbers: boolean;
}

interface MdToPdfPayload {
  markdown: string;
  settings: MdSettings;
}

interface MdToPdfResult {
  blob: ArrayBuffer;
  pageCount: number;
}

const WORKER_PAGE_SIZES: Record<string, { value: string; label: string; width: number; height: number }> = {
  A4: { value: 'A4', label: 'A4', width: 595.28, height: 841.89 },
  Letter: { value: 'Letter', label: 'US Letter', width: 612, height: 792 },
  Legal: { value: 'Legal', label: 'US Legal', width: 612, height: 1008 },
};

function parseMdWorker(text: string): MdBlock[] {
  const lines = text.split('\n');
  const blocks: MdBlock[] = [];
  let inCodeBlock = false;
  let codeContent = '';

  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      if (inCodeBlock) {
        blocks.push({ type: 'code', content: codeContent.trimEnd() });
        codeContent = '';
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      continue;
    }
    if (inCodeBlock) { codeContent += line + '\n'; continue; }
    if (line.trim() === '') continue;
    if (line.startsWith('### ')) blocks.push({ type: 'heading3', content: line.slice(4).trim() });
    else if (line.startsWith('## ')) blocks.push({ type: 'heading2', content: line.slice(3).trim() });
    else if (line.startsWith('# ')) blocks.push({ type: 'heading1', content: line.slice(2).trim() });
    else if (line.startsWith('> ')) blocks.push({ type: 'blockquote', content: line.slice(2).trim() });
    else if (line.trim() === '---' || line.trim() === '***' || line.trim() === '___') blocks.push({ type: 'hr', content: '' });
    else if (/^[-*+]\s/.test(line)) blocks.push({ type: 'bullet', content: line.replace(/^[-*+]\s/, '').trim() });
    else blocks.push({ type: 'paragraph', content: line.trim() });
  }
  if (inCodeBlock && codeContent) blocks.push({ type: 'code', content: codeContent.trimEnd() });
  return blocks;
}

function wrapTextWorker(text: string, font: any, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    if (!word) continue;
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const w = font.widthOfTextAtSize(testLine, size);
    if (w > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines.length > 0 ? lines : [''];
}

function stripBoldWorker(text: string): string {
  return text.replace(/\*\*(.*?)\*\*/g, '$1');
}

async function handleMdToPdf(
  id: string,
  payload: MdToPdfPayload,
): Promise<MdToPdfResult> {
  const { markdown, settings } = payload;

  postProgress(id, { stage: 'init', percent: 5, message: 'Creating PDF...' });

  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const pdfDoc = await PDFDocument.create();

  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const courier = await pdfDoc.embedFont(StandardFonts.Courier);

  const pageSizeInfo = WORKER_PAGE_SIZES[settings.pageSize] || WORKER_PAGE_SIZES.A4;
  let page = pdfDoc.addPage([pageSizeInfo.width, pageSizeInfo.height]);
  let { width, height } = page.getSize();
  const contentWidth = width - settings.marginLeft - settings.marginRight;
  let y = height - settings.marginTop;

  postProgress(id, { stage: 'title', percent: 8, message: 'Drawing title...' });

  // Title
  if (settings.title) {
    const titleLines = wrapTextWorker(settings.title, helveticaBold, 20, contentWidth);
    for (const tl of titleLines) {
      page.drawText(tl, { x: settings.marginLeft, y, size: 20, font: helveticaBold, color: rgb(0.1, 0.1, 0.1) });
      y -= 24;
    }
    y -= 10;
    page.drawLine({ start: { x: settings.marginLeft, y }, end: { x: width - settings.marginRight, y }, thickness: 0.5, color: rgb(0.7, 0.7, 0.7) });
    y -= 15;
  }

  const blocks = parseMdWorker(markdown);
  const totalBlocks = blocks.length;

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const blockPct = Math.round(8 + ((i + 1) / totalBlocks) * 85);
    postProgress(id, { stage: 'blocks', percent: blockPct, message: `Rendering block ${i + 1}/${totalBlocks}...` });

    const ensureSpace = (needed: number) => {
      if (y - needed < settings.marginBottom) {
        if (settings.pageNumbers) {
          const pn = `Page ${pdfDoc.getPageCount()}`;
          const pnW = helvetica.widthOfTextAtSize(pn, 8);
          page.drawText(pn, { x: (width - pnW) / 2, y: settings.marginBottom - 20, size: 8, font: helvetica, color: rgb(0.5, 0.5, 0.5) });
        }
        page = pdfDoc.addPage([pageSizeInfo.width, pageSizeInfo.height]);
        ({ width, height } = page.getSize());
        y = height - settings.marginTop;
      }
    };

    switch (block.type) {
      case 'heading1': {
        const rawText = stripBoldWorker(block.content);
        const lines = wrapTextWorker(rawText, helveticaBold, 22, contentWidth);
        ensureSpace(lines.length * 26 + 8);
        y -= 8;
        for (const line of lines) { ensureSpace(26); page.drawText(line, { x: settings.marginLeft, y, size: 22, font: helveticaBold, color: rgb(0.1, 0.1, 0.1) }); y -= 26; }
        y -= 6;
        page.drawLine({ start: { x: settings.marginLeft, y }, end: { x: Math.min(settings.marginLeft + contentWidth * 0.3, width - settings.marginRight), y }, thickness: 1, color: rgb(0.2, 0.2, 0.2) });
        y -= 10;
        break;
      }
      case 'heading2': {
        const rawText = stripBoldWorker(block.content);
        const lines = wrapTextWorker(rawText, helveticaBold, 16, contentWidth);
        ensureSpace(lines.length * 20 + 6);
        y -= 6;
        for (const line of lines) { ensureSpace(20); page.drawText(line, { x: settings.marginLeft, y, size: 16, font: helveticaBold, color: rgb(0.15, 0.15, 0.15) }); y -= 20; }
        y -= 6;
        break;
      }
      case 'heading3': {
        const rawText = stripBoldWorker(block.content);
        const lines = wrapTextWorker(rawText, helveticaBold, 13, contentWidth);
        ensureSpace(lines.length * 17 + 4);
        y -= 4;
        for (const line of lines) { ensureSpace(17); page.drawText(line, { x: settings.marginLeft, y, size: 13, font: helveticaBold, color: rgb(0.2, 0.2, 0.2) }); y -= 17; }
        y -= 4;
        break;
      }
      case 'paragraph': {
        const parts = block.content.split(/(\*\*.*?\*\*)/g);
        ensureSpace(20);
        for (const part of parts) {
          if (part.startsWith('**') && part.endsWith('**')) {
            const boldText = part.slice(2, -2);
            const boldLines = wrapTextWorker(boldText, helveticaBold, settings.fontSize, contentWidth);
            for (const bl of boldLines) { ensureSpace(settings.fontSize + 4); page.drawText(bl, { x: settings.marginLeft, y, size: settings.fontSize, font: helveticaBold, color: rgb(0.1, 0.1, 0.1) }); y -= settings.fontSize + 4; }
          } else if (part.trim()) {
            const regLines = wrapTextWorker(part, helvetica, settings.fontSize, contentWidth);
            for (const rl of regLines) { ensureSpace(settings.fontSize + 4); page.drawText(rl, { x: settings.marginLeft, y, size: settings.fontSize, font: helvetica, color: rgb(0.15, 0.15, 0.15) }); y -= settings.fontSize + 4; }
          }
        }
        y -= 4;
        break;
      }
      case 'bullet': {
        const bulletX = settings.marginLeft + 12;
        const textX = settings.marginLeft + 24;
        const bulletTextWidth = contentWidth - 24;
        ensureSpace(settings.fontSize + 4);
        page.drawText('•', { x: bulletX, y, size: settings.fontSize, font: helvetica, color: rgb(0.3, 0.3, 0.3) });
        const parts = block.content.split(/(\*\*.*?\*\*)/g);
        let firstLine = true;
        for (const part of parts) {
          if (part.startsWith('**') && part.endsWith('**')) {
            const boldText = part.slice(2, -2);
            const boldLines = wrapTextWorker(boldText, helveticaBold, settings.fontSize, bulletTextWidth);
            for (let li = 0; li < boldLines.length; li++) {
              if (!firstLine || li > 0) { ensureSpace(settings.fontSize + 4); y -= settings.fontSize + 4; }
              page.drawText(boldLines[li], { x: textX, y, size: settings.fontSize, font: helveticaBold, color: rgb(0.1, 0.1, 0.1) });
              firstLine = false;
            }
          } else if (part.trim()) {
            const regLines = wrapTextWorker(part, helvetica, settings.fontSize, bulletTextWidth);
            for (let li = 0; li < regLines.length; li++) {
              if (!firstLine || li > 0) { ensureSpace(settings.fontSize + 4); y -= settings.fontSize + 4; }
              page.drawText(regLines[li], { x: textX, y, size: settings.fontSize, font: helvetica, color: rgb(0.15, 0.15, 0.15) });
              firstLine = false;
            }
          }
        }
        y -= 4;
        break;
      }
      case 'blockquote': {
        const bqX = settings.marginLeft + 16;
        const bqWidth = contentWidth - 20;
        ensureSpace(20);
        y -= 4;
        page.drawLine({ start: { x: settings.marginLeft + 6, y: y + settings.fontSize + 4 }, end: { x: settings.marginLeft + 6, y }, thickness: 2, color: rgb(0.6, 0.6, 0.6) });
        const rawText = stripBoldWorker(block.content);
        const lines = wrapTextWorker(rawText, helvetica, settings.fontSize, bqWidth);
        for (const line of lines) { ensureSpace(settings.fontSize + 4); page.drawText(line, { x: bqX, y, size: settings.fontSize, font: helvetica, color: rgb(0.35, 0.35, 0.35) }); y -= settings.fontSize + 4; }
        y -= 6;
        break;
      }
      case 'code': {
        const codeLines = block.content.split('\n');
        const codeFontSize = Math.max(8, settings.fontSize - 1);
        const codeX = settings.marginLeft + 8;
        const lineHeight = codeFontSize + 4;
        const blockPadding = 10;
        const totalCodeHeight = codeLines.length * lineHeight + blockPadding * 2;

        ensureSpace(lineHeight + blockPadding * 2);
        page.drawRectangle({ x: settings.marginLeft, y: y - totalCodeHeight + blockPadding, width: contentWidth, height: totalCodeHeight, color: rgb(0.95, 0.95, 0.95), borderColor: rgb(0.85, 0.85, 0.85), borderWidth: 0.5 });
        y -= blockPadding;

        for (const codeLine of codeLines) {
          if (y - lineHeight < settings.marginBottom) {
            if (settings.pageNumbers) {
              const pn = `Page ${pdfDoc.getPageCount()}`;
              const pnW = helvetica.widthOfTextAtSize(pn, 8);
              page.drawText(pn, { x: (width - pnW) / 2, y: settings.marginBottom - 20, size: 8, font: helvetica, color: rgb(0.5, 0.5, 0.5) });
            }
            page = pdfDoc.addPage([pageSizeInfo.width, pageSizeInfo.height]);
            ({ width, height } = page.getSize());
            y = height - settings.marginTop;
          }
          page.drawText(codeLine || ' ', { x: codeX, y, size: codeFontSize, font: courier, color: rgb(0.2, 0.2, 0.2) });
          y -= lineHeight;
        }
        y -= blockPadding + 4;
        break;
      }
      case 'hr': {
        ensureSpace(20);
        y -= 8;
        page.drawLine({ start: { x: settings.marginLeft, y }, end: { x: width - settings.marginRight, y }, thickness: 0.5, color: rgb(0.7, 0.7, 0.7) });
        y -= 8;
        break;
      }
    }
  }

  // Last page number
  if (settings.pageNumbers) {
    const pn = `Page ${pdfDoc.getPageCount()}`;
    const pnW = helvetica.widthOfTextAtSize(pn, 8);
    page.drawText(pn, { x: (width - pnW) / 2, y: settings.marginBottom - 20, size: 8, font: helvetica, color: rgb(0.5, 0.5, 0.5) });
  }

  if (settings.title) pdfDoc.setTitle(settings.title);
  pdfDoc.setProducer('SnapPDF');
  pdfDoc.setCreator('SnapPDF');

  postProgress(id, { stage: 'save', percent: 98, message: 'Saving PDF...' });
  const pdfBytes = await pdfDoc.save();

  postProgress(id, { stage: 'done', percent: 100, message: 'PDF generated!' });
  return { blob: pdfBytes, pageCount: pdfDoc.getPageCount() };
}

/* -------------------------------------------------------------------------- */
/*  Message handler                                                           */
/* -------------------------------------------------------------------------- */

type WorkerTaskType = 'compress-pdf' | 'watermark-pdf' | 'md-to-pdf';

self.onmessage = async (event: MessageEvent) => {
  const { id, type, payload } = event.data;

  try {
    switch (type as WorkerTaskType) {
      case 'compress-pdf': {
        const p = payload as CompressPdfPayload;
        const result = await compressToTarget(p.fileData, p.targetKB, p.strategy as 'auto' | 'quality' | 'compression', id);
        postResult(id, result);
        break;
      }
      case 'watermark-pdf': {
        const result = await handleWatermarkPdf(id, payload as WatermarkPdfPayload);
        postResult(id, result);
        break;
      }
      case 'md-to-pdf': {
        const result = await handleMdToPdf(id, payload as MdToPdfPayload);
        postResult(id, result);
        break;
      }
      default:
        postError(id, { message: `Unknown worker task type: "${type}"` });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    postError(id, { message });
  }
};

// Type-only export so TypeScript recognises this as a module (prevents ESLint
// complaints about a file that only has top-level side-effects).
export type { WorkerRequest, WorkerResponse, CompressPdfPayload, ProgressPayload, ResultPayload, ErrorPayload };
