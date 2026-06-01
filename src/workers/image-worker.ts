/**
 * Image Processing Web Worker
 *
 * Runs ALL heavy image operations off the main thread using OffscreenCanvas.
 * No DOM APIs are used — only Worker-compatible APIs (createImageBitmap,
 * OffscreenCanvas, convertToBlob, structured clone / transfer).
 *
 * Supported in: Chrome 69+, Firefox 105+, Edge 79+, Safari 16.4+
 *
 * Message protocol
 * ────────────────
 * Incoming:
 *   { id: string; type: TaskType; payload: TaskPayload }
 *
 * Outgoing:
 *   { id: string; type: 'progress',  payload: { percent: number; message: string } }
 *   { id: string; type: 'result',    payload: TaskResult }
 *   { id: string; type: 'error',     payload: { message: string } }
 */

/* ────────────────────────────────────────────
   Types
   ──────────────────────────────────────────── */

type TaskType =
  | 'compress-image'
  | 'resize-image'
  | 'convert-image'
  | 'encode-base64';

interface WorkerRequest {
  id: string;
  type: TaskType;
  payload: unknown;
}

interface WorkerResponse {
  id: string;
  type: 'progress' | 'result' | 'error';
  payload: unknown;
}

/* ── Task payloads ── */

interface CompressImagePayload {
  imageData: ArrayBuffer;
  targetKB: number;
  format: 'jpeg' | 'png' | 'webp';
  quality: number;
}

interface ResizeImagePayload {
  imageData: ArrayBuffer;
  width: number;
  height: number;
  format: string;
  quality: number;
  mode: 'pixels' | 'filesize';
  targetKB?: number;
}

interface ConvertImagePayload {
  imageData: ArrayBuffer;
  targetFormat: string;
  quality: number;
  fillBackground: boolean;
}

interface EncodeBase64Payload {
  imageData: ArrayBuffer;
  includeDataUri: boolean;
}

/* ── Task results ── */

interface CompressImageResult {
  blob: ArrayBuffer;
  finalWidth: number;
  finalHeight: number;
  finalSize: number;
}

interface ResizeImageResult {
  blob: ArrayBuffer;
  width: number;
  height: number;
  size: number;
}

interface ConvertImageResult {
  blob: ArrayBuffer;
  size: number;
}

interface EncodeBase64Result {
  base64: string;
  length: number;
}

/* ────────────────────────────────────────────
   MIME helpers
   ──────────────────────────────────────────── */

const FORMAT_MIME: Record<string, string> = {
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  bmp: 'image/bmp',
};

/** Formats that support a quality parameter */
const LOSSY_FORMATS = new Set(['jpeg', 'jpg', 'webp']);

/** Formats that do not support alpha — need white background fill */
const NO_ALPHA_FORMATS = new Set(['jpeg', 'jpg', 'bmp']);

function getMime(format: string): string {
  return FORMAT_MIME[format.toLowerCase()] ?? 'image/png';
}

/* ────────────────────────────────────────────
   Helpers
   ──────────────────────────────────────────── */

/**
 * Load an ArrayBuffer of image bytes into an ImageBitmap.
 * Works in Web Workers (no DOM required).
 */
async function loadImageBitmap(data: ArrayBuffer): Promise<ImageBitmap> {
  const blob = new Blob([data]);
  return createImageBitmap(blob);
}

/**
 * Draw an ImageBitmap onto an OffscreenCanvas and return the canvas.
 * Optionally fills a white background first.
 */
function drawToCanvas(
  bitmap: ImageBitmap,
  width: number,
  height: number,
  fillWhite = false,
): OffscreenCanvas {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to get 2d context from OffscreenCanvas');

  if (fillWhite) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, width, height);

  return canvas;
}

/**
 * Convert an OffscreenCanvas to an ArrayBuffer blob.
 * Returns null if conversion fails.
 */
async function canvasToBuffer(
  canvas: OffscreenCanvas,
  mime: string,
  quality?: number,
): Promise<ArrayBuffer | null> {
  const options: BlobPropertyBag = { type: mime };
  if (quality !== undefined && LOSSY_FORMATS.has(mime.split('/')[1]?.toLowerCase() ?? '')) {
    // OffscreenCanvas.convertToBlob accepts a `quality` key
    (options as Record<string, unknown>).quality = quality;
  }

  const blob = await canvas.convertToBlob(options);
  return blob.arrayBuffer();
}

/* ────────────────────────────────────────────
   Messaging helpers
   ──────────────────────────────────────────── */

/** Post a typed message back to the main thread. */
function post(
  id: string,
  type: WorkerResponse['type'],
  payload: unknown,
  transfer?: Transferable[],
): void {
  const msg: WorkerResponse = { id, type, payload };
  if (transfer && transfer.length > 0) {
    self.postMessage(msg, transfer);
  } else {
    self.postMessage(msg);
  }
}

function postProgress(id: string, percent: number, message: string): void {
  post(id, 'progress', { percent, message });
}

function postResult(id: string, payload: unknown, transfer?: Transferable[]): void {
  post(id, 'result', payload, transfer);
}

function postError(id: string, message: string): void {
  post(id, 'error', { message });
}

/* ────────────────────────────────────────────
   Task: compress-image
   Binary search quality, then reduce dimensions
   ──────────────────────────────────────────── */

async function handleCompressImage(
  id: string,
  payload: CompressImagePayload,
): Promise<void> {
  const { imageData, targetKB, format, quality } = payload;
  const targetBytes = targetKB * 1024;
  const mime = getMime(format);

  // Force JPEG for PNG target-size mode (PNG is lossless)
  const effectiveMime = format === 'png' && targetKB > 0 ? 'image/jpeg' : mime;
  const fillWhite = NO_ALPHA_FORMATS.has(effectiveMime.split('/')[1]?.toLowerCase() ?? '');

  const bitmap = await loadImageBitmap(imageData);
  const origW = bitmap.width;
  const origH = bitmap.height;

  postProgress(id, 5, 'Image loaded, starting compression…');

  // ── Phase 1: Binary search quality at original dimensions ──
  let lo = 0.05;
  let hi = 0.95;
  let bestBuffer: ArrayBuffer | null = null;
  let bestSize = Infinity;

  const MAX_ITER = 10;
  for (let i = 0; i < MAX_ITER; i++) {
    const mid = Math.round((lo + hi) * 100) / 100;
    const canvas = drawToCanvas(bitmap, origW, origH, fillWhite);
    const buf = await canvasToBuffer(canvas, effectiveMime, mid);

    if (buf) {
      const size = buf.byteLength;
      const diff = Math.abs(size - targetBytes);

      if (diff < Math.abs(bestSize - targetBytes) || bestBuffer === null) {
        bestBuffer = buf;
        bestSize = size;
      }

      if (size <= targetBytes) {
        lo = mid + 0.05;
      } else {
        hi = mid - 0.05;
      }

      const pct = Math.round(5 + ((i + 1) / MAX_ITER) * 60);
      postProgress(id, pct, `Quality search ${i + 1}/${MAX_ITER} — q=${mid.toFixed(2)} → ${(size / 1024).toFixed(1)}KB`);
    } else {
      hi = mid - 0.05;
    }
  }

  // ── Phase 2: If still too large, progressively reduce dimensions ──
  if (bestBuffer && bestSize > targetBytes) {
    postProgress(id, 68, 'Quality alone insufficient — reducing dimensions…');

    for (let scale = 0.9; scale >= 0.3; scale -= 0.1) {
      const w = Math.round(origW * scale);
      const h = Math.round(origH * scale);
      const canvas = drawToCanvas(bitmap, w, h, fillWhite);
      const buf = await canvasToBuffer(canvas, effectiveMime, 0.5);

      if (buf && buf.byteLength <= targetBytes) {
        // Within target — do a fine quality search at these dimensions
        let qLo = 0.5;
        let qHi = 0.95;
        let dimBest = buf;

        for (let j = 0; j < 5; j++) {
          const qMid = Math.round((qLo + qHi) * 100) / 100;
          const c2 = drawToCanvas(bitmap, w, h, fillWhite);
          const b2 = await canvasToBuffer(c2, effectiveMime, qMid);

          if (b2) {
            if (b2.byteLength <= targetBytes) {
              dimBest = b2;
              qLo = qMid + 0.05;
            } else {
              qHi = qMid - 0.05;
            }
          }
        }

        bestBuffer = dimBest;
        bestSize = dimBest.byteLength;
        break;
      }
    }
  }

  bitmap.close();

  if (!bestBuffer) {
    postError(id, 'Compression failed — could not produce a valid output.');
    return;
  }

  const result: CompressImageResult = {
    blob: bestBuffer,
    finalWidth: origW,
    finalHeight: origH,
    finalSize: bestBuffer.byteLength,
  };

  postProgress(id, 100, 'Compression complete');
  postResult(id, result, [bestBuffer]);
}

/* ────────────────────────────────────────────
   Task: resize-image
   Two modes: exact pixel dimensions or target file size
   ──────────────────────────────────────────── */

async function handleResizeImage(
  id: string,
  payload: ResizeImagePayload,
): Promise<void> {
  const { imageData, width, height, format, quality, mode, targetKB } = payload;
  const mime = getMime(format);
  const fillWhite = NO_ALPHA_FORMATS.has(format.toLowerCase());

  const bitmap = await loadImageBitmap(imageData);
  const origW = bitmap.width;
  const origH = bitmap.height;

  postProgress(id, 10, 'Image loaded, resizing…');

  let resultBuf: ArrayBuffer | null = null;
  let finalW = width;
  let finalH = height;

  if (mode === 'pixels') {
    // ── Exact pixel dimensions ──
    const canvas = drawToCanvas(bitmap, width, height, fillWhite);
    const q = LOSSY_FORMATS.has(format.toLowerCase()) ? quality / 100 : undefined;
    resultBuf = await canvasToBuffer(canvas, mime, q);
    postProgress(id, 80, 'Pixel resize complete');
  } else {
    // ── Target file size mode: binary search dimensions + quality ──
    const targetBytes = (targetKB ?? 100) * 1024;
    // Use JPEG for file-size mode (most predictable compression)
    const effectiveMime = 'image/jpeg';
    const effFillWhite = true;

    let bestBuf: ArrayBuffer | null = null;
    let bestSize = Infinity;
    let bw = origW;
    let bh = origH;

    const TOTAL_STEPS = 20;
    for (let i = 0; i < TOTAL_STEPS; i++) {
      const scale = Math.pow(0.85, Math.floor(i / 4));
      const w = Math.max(1, Math.round(origW * scale));
      const h = Math.max(1, Math.round(origH * scale));
      const q = Math.max(0.05, 0.9 - i * 0.05);

      const canvas = drawToCanvas(bitmap, w, h, effFillWhite);
      const buf = await canvasToBuffer(canvas, effectiveMime, q);

      if (buf) {
        const size = buf.byteLength;
        if (size <= targetBytes || Math.abs(size - targetBytes) < Math.abs(bestSize - targetBytes)) {
          bestBuf = buf;
          bestSize = size;
          bw = w;
          bh = h;
        }
        if (size <= targetBytes) break;

        const pct = Math.round(10 + ((i + 1) / TOTAL_STEPS) * 80);
        postProgress(id, pct, `Resize search ${i + 1}/${TOTAL_STEPS} — ${w}×${h} q=${q.toFixed(2)} → ${(size / 1024).toFixed(1)}KB`);
      }
    }

    resultBuf = bestBuf;
    finalW = bw;
    finalH = bh;
  }

  bitmap.close();

  if (!resultBuf) {
    postError(id, 'Resize failed — could not produce a valid output.');
    return;
  }

  const result: ResizeImageResult = {
    blob: resultBuf,
    width: finalW,
    height: finalH,
    size: resultBuf.byteLength,
  };

  postProgress(id, 100, 'Resize complete');
  postResult(id, result, [resultBuf]);
}

/* ────────────────────────────────────────────
   Task: convert-image
   Change image format using OffscreenCanvas
   ──────────────────────────────────────────── */

async function handleConvertImage(
  id: string,
  payload: ConvertImagePayload,
): Promise<void> {
  const { imageData, targetFormat, quality, fillBackground } = payload;
  const mime = getMime(targetFormat);
  const needsBg =
    fillBackground || NO_ALPHA_FORMATS.has(targetFormat.toLowerCase());

  const bitmap = await loadImageBitmap(imageData);
  const w = bitmap.width;
  const h = bitmap.height;

  postProgress(id, 30, 'Image loaded, converting format…');

  const canvas = drawToCanvas(bitmap, w, h, needsBg);
  const q = LOSSY_FORMATS.has(targetFormat.toLowerCase()) ? quality / 100 : undefined;
  const buf = await canvasToBuffer(canvas, mime, q);

  bitmap.close();

  if (!buf) {
    postError(id, 'Format conversion failed — could not produce output blob.');
    return;
  }

  postProgress(id, 90, 'Conversion complete');

  const result: ConvertImageResult = {
    blob: buf,
    size: buf.byteLength,
  };

  postResult(id, result, [buf]);
}

/* ────────────────────────────────────────────
   Task: encode-base64
   Convert raw image bytes to a base64 string
   ──────────────────────────────────────────── */

async function handleEncodeBase64(
  id: string,
  payload: EncodeBase64Payload,
): Promise<void> {
  const { imageData, includeDataUri } = payload;

  postProgress(id, 20, 'Encoding image to base64…');

  // We need the MIME type to construct a data URI. Parse the image header
  // to guess the type when no explicit MIME is given.
  const mime = guessMimeFromArrayBuffer(imageData);
  const dataUriPrefix = includeDataUri ? `data:${mime};base64,` : '';

  // Convert ArrayBuffer → Uint8Array → binary string → base64
  const bytes = new Uint8Array(imageData);
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    // Use TextDecoder for performance (available in workers)
    binary += new TextDecoder().decode(chunk);
  }

  const raw = btoa(binary);
  const base64 = dataUriPrefix + raw;

  postProgress(id, 90, 'Encoding complete');

  const result: EncodeBase64Result = {
    base64,
    length: raw.length,
  };

  // Base64 is a string, not transferable — send via structured clone
  postResult(id, result);
}

/**
 * Guess MIME type from the magic bytes at the start of an ArrayBuffer.
 */
function guessMimeFromArrayBuffer(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf.slice(0, 12));
  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  // PNG: 89 50 4E 47
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  // WebP: 52 49 46 46 ... 57 45 42 50
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'image/webp';
  // GIF: 47 49 46 38
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) return 'image/gif';
  // BMP: 42 4D
  if (bytes[0] === 0x42 && bytes[1] === 0x4d) return 'image/bmp';
  // Fallback
  return 'image/png';
}

/* ────────────────────────────────────────────
   Message dispatcher
   ──────────────────────────────────────────── */

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { id, type, payload } = event.data;

  try {
    switch (type) {
      case 'compress-image':
        await handleCompressImage(id, payload as CompressImagePayload);
        break;

      case 'resize-image':
        await handleResizeImage(id, payload as ResizeImagePayload);
        break;

      case 'convert-image':
        await handleConvertImage(id, payload as ConvertImagePayload);
        break;

      case 'encode-base64':
        await handleEncodeBase64(id, payload as EncodeBase64Payload);
        break;

      default:
        postError(id, `Unknown task type: "${type}"`);
    }
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'An unexpected error occurred.';
    postError(id, message);
  }
};
