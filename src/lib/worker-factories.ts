/**
 * Worker Factory Utilities for SnapPDF
 *
 * Provides memoized factory functions for creating Web Workers.
 * Used with the `useWorkerTask` hook to offload heavy processing
 * (PDF compression, image processing, etc.) off the main thread.
 *
 * Usage in a component:
 *   const { execute, progress, isWorkerActive } = useWorkerTask(
 *     createPdfWorker,
 *     mainThreadFallback,
 *     { timeoutMs: 10 * 60 * 1000 }
 *   );
 *   const result = await execute(payload, 'compress-pdf');
 */

/** Factory for the PDF processing worker (handles compress-pdf) */
export function createPdfWorker(): Worker {
  return new Worker(
    new URL('../workers/pdf-worker.ts', import.meta.url)
  );
}

/** Factory for the Image processing worker (handles compress-image, resize-image, convert-image, encode-base64) */
export function createImageWorker(): Worker {
  return new Worker(
    new URL('../workers/image-worker.ts', import.meta.url)
  );
}

/**
 * Returns a display name for a worker task type.
 * Used in UI to show users what's happening in the background.
 */
export function getWorkerTaskLabel(taskType: string): string {
  const labels: Record<string, string> = {
    'compress-pdf': 'PDF Compression',
    'compress-image': 'Image Compression',
    'resize-image': 'Image Resize',
    'convert-image': 'Format Conversion',
    'encode-base64': 'Base64 Encoding',
    'watermark-pdf': 'PDF Watermarking',
    'md-to-pdf': 'Markdown to PDF',
  };
  return labels[taskType] || 'Processing';
}
