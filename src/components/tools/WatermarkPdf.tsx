'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Stamp,
  Loader2,
  Download,
  FileText,
  Trash2,
  ImageIcon,
  Type,
  RotateCw,
  Grid3x3,
  Palette,
  Eye,
  Settings2,
  Maximize2,
  X,
  ZoomIn,
  ZoomOut,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { ToolLayout } from '@/components/shared/ToolLayout';
import { FileDropzone } from '@/components/shared/FileDropzone';
import { useAppStore } from '@/store';
import { formatSize, parsePageRange } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { PDFDocument, rgb, StandardFonts, degrees } from 'pdf-lib';
import { saveAs } from 'file-saver';
import { useWorkerTask } from '@/hooks/useWorkerTask';
import { createPdfWorker } from '@/lib/worker-factories';
import { WorkerBadge } from '@/components/shared/WorkerBadge';

/* ─── Types ─── */
type WatermarkType = 'text' | 'image';
type Position = 'center' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
type PageScope = 'all' | 'specific' | 'odd' | 'even';

const TEXT_PRESETS = [
  { label: 'DRAFT', value: 'DRAFT' },
  { label: 'CONFIDENTIAL', value: 'CONFIDENTIAL' },
  { label: 'COPY', value: 'COPY' },
  { label: 'SAMPLE', value: 'SAMPLE' },
  { label: 'DO NOT COPY', value: 'DO NOT COPY' },
  { label: 'APPROVED', value: 'APPROVED' },
  { label: 'ORIGINAL', value: 'ORIGINAL' },
  { label: 'VOID', value: 'VOID' },
  { label: 'URGENT', value: 'URGENT' },
  { label: 'Custom', value: '' },
];

const COLOR_PRESETS = [
  { label: 'Black', value: '#000000' },
  { label: 'Red', value: '#ff0000' },
  { label: 'Blue', value: '#0000ff' },
  { label: 'Gray', value: '#808080' },
  { label: 'Custom', value: 'custom' },
];

/* ─── Helpers ─── */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.substring(0, 2), 16) / 255,
    g: parseInt(h.substring(2, 4), 16) / 255,
    b: parseInt(h.substring(4, 6), 16) / 255,
  };
}

async function loadPdfjs() {
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
  return pdfjsLib;
}

// Generate higher-res thumbnails for live preview rendering
async function generateThumbnails(buffer: ArrayBuffer, maxPages: number): Promise<string[]> {
  const pdfjsLib = await loadPdfjs();
  const pdf = await pdfjsLib.getDocument({ data: buffer.slice(0) }).promise;
  const count = Math.min(pdf.numPages, maxPages);
  const thumbs: string[] = [];
  for (let i = 1; i <= count; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 0.5 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d')!;
    await page.render({ canvasContext: ctx, viewport }).promise;
    thumbs.push(canvas.toDataURL('image/png'));
  }
  return thumbs;
}

// Generate a single high-res page for fullscreen preview
async function generateHiResPage(buffer: ArrayBuffer, pageNum: number, scale: number): Promise<string> {
  const pdfjsLib = await loadPdfjs();
  const pdf = await pdfjsLib.getDocument({ data: buffer.slice(0) }).promise;
  const page = await pdf.getPage(pageNum);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d')!;
  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas.toDataURL('image/png');
}

/* ─── Canvas-based Live Preview Renderer ─── */
function renderWatermarkOnCanvas(
  thumbDataUrl: string,
  options: {
    wmType: WatermarkType;
    wmText: string;
    fontSize: number;
    resolvedColor: string;
    wmOpacity: number;
    wmRotation: number;
    wmPosition: Position;
    tiled: boolean;
    wmImagePreview: string | null;
    wmImageScale: number;
    isAffected: boolean;
  },
): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;

      // Draw the page background
      ctx.drawImage(img, 0, 0);

      if (!options.isAffected) {
        // Not affected — just return original
        resolve(canvas.toDataURL('image/jpeg', 0.85));
        return;
      }

      // Dim unaffected slightly for contrast
      // Actually we already check isAffected, so here we draw watermark

      const { wmType, wmText, fontSize, resolvedColor, wmOpacity, wmRotation, wmPosition, tiled, wmImagePreview, wmImageScale } = options;

      if (wmType === 'text' && wmText.trim()) {
        // Scale font relative to canvas size (PDF default is ~595×842 at 72dpi)
        const scaleFactor = Math.min(canvas.width, canvas.height) / 600;
        const scaledFontSize = fontSize * scaleFactor;

        ctx.save();
        ctx.globalAlpha = wmOpacity / 100;
        ctx.font = `bold ${scaledFontSize}px Helvetica, Arial, sans-serif`;
        ctx.fillStyle = resolvedColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        if (tiled) {
          // Tiled mode
          const metrics = ctx.measureText(wmText);
          const textW = metrics.width;
          const textH = scaledFontSize;
          const spacingX = textW + 40 * scaleFactor;
          const spacingY = scaledFontSize * 1.8;
          const diagonal = Math.sqrt(canvas.width * canvas.width + canvas.height * canvas.height);

          for (let y = -canvas.height; y < canvas.height + diagonal; y += spacingY) {
            for (let x = -canvas.width; x < canvas.width + diagonal; x += spacingX) {
              ctx.save();
              ctx.translate(x, y);
              ctx.rotate((wmRotation * Math.PI) / 180);
              ctx.fillText(wmText, 0, 0);
              ctx.restore();
            }
          }
        } else {
          // Single position
          const pos = getPositionCoords(wmPosition, canvas.width, canvas.height, scaledFontSize);
          ctx.translate(pos.x, pos.y);
          ctx.rotate((wmRotation * Math.PI) / 180);
          ctx.fillText(wmText, 0, 0);
        }
        ctx.restore();
      } else if (wmType === 'image' && wmImagePreview) {
        // Image watermark on canvas
        const wmImg = new Image();
        wmImg.onload = () => {
          const imgW = (canvas.width * wmImageScale) / 100;
          const imgH = (wmImg.height / wmImg.width) * imgW;
          const pos = getPositionCoords(wmPosition, canvas.width, canvas.height, imgH);

          ctx.save();
          ctx.globalAlpha = wmOpacity / 100;
          ctx.translate(pos.x, pos.y);
          ctx.rotate((wmRotation * Math.PI) / 180);
          ctx.drawImage(wmImg, -imgW / 2, -imgH / 2, imgW, imgH);
          ctx.restore();
          resolve(canvas.toDataURL('image/jpeg', 0.85));
        };
        wmImg.onerror = () => resolve(canvas.toDataURL('image/jpeg', 0.85));
        wmImg.src = wmImagePreview;
        return;
      }

      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => resolve('');
    img.src = thumbDataUrl;
  });
}

function getPositionCoords(position: Position, w: number, h: number, size: number) {
  const pad = Math.min(w, h) * 0.05;
  switch (position) {
    case 'top-left':    return { x: pad + size / 2, y: pad + size / 2 };
    case 'top-right':   return { x: w - pad - size / 2, y: pad + size / 2 };
    case 'bottom-left': return { x: pad + size / 2, y: h - pad - size / 2 };
    case 'bottom-right':return { x: w - pad - size / 2, y: h - pad - size / 2 };
    default:            return { x: w / 2, y: h / 2 }; // center
  }
}

// Render watermark on a single hi-res image for fullscreen preview
function renderWatermarkHiRes(
  pageDataUrl: string,
  options: {
    wmType: WatermarkType;
    wmText: string;
    fontSize: number;
    resolvedColor: string;
    wmOpacity: number;
    wmRotation: number;
    wmPosition: Position;
    tiled: boolean;
    wmImagePreview: string | null;
    wmImageScale: number;
  },
): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);

      const { wmType, wmText, fontSize, resolvedColor, wmOpacity, wmRotation, wmPosition, tiled, wmImagePreview, wmImageScale } = options;
      const scaleFactor = Math.min(canvas.width, canvas.height) / 600;
      const scaledFontSize = fontSize * scaleFactor;

      if (wmType === 'text' && wmText.trim()) {
        ctx.save();
        ctx.globalAlpha = wmOpacity / 100;
        ctx.font = `bold ${scaledFontSize}px Helvetica, Arial, sans-serif`;
        ctx.fillStyle = resolvedColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        if (tiled) {
          const metrics = ctx.measureText(wmText);
          const textW = metrics.width;
          const spacingX = textW + 40 * scaleFactor;
          const spacingY = scaledFontSize * 1.8;
          const diagonal = Math.sqrt(canvas.width ** 2 + canvas.height ** 2);
          for (let y = -canvas.height; y < canvas.height + diagonal; y += spacingY) {
            for (let x = -canvas.width; x < canvas.width + diagonal; x += spacingX) {
              ctx.save();
              ctx.translate(x, y);
              ctx.rotate((wmRotation * Math.PI) / 180);
              ctx.fillText(wmText, 0, 0);
              ctx.restore();
            }
          }
        } else {
          const pos = getPositionCoords(wmPosition, canvas.width, canvas.height, scaledFontSize);
          ctx.translate(pos.x, pos.y);
          ctx.rotate((wmRotation * Math.PI) / 180);
          ctx.fillText(wmText, 0, 0);
        }
        ctx.restore();
      } else if (wmType === 'image' && wmImagePreview) {
        const wmImg = new Image();
        wmImg.onload = () => {
          const imgW = (canvas.width * wmImageScale) / 100;
          const imgH = (wmImg.height / wmImg.width) * imgW;
          const pos = getPositionCoords(wmPosition, canvas.width, canvas.height, imgH);
          ctx.save();
          ctx.globalAlpha = wmOpacity / 100;
          ctx.translate(pos.x, pos.y);
          ctx.rotate((wmRotation * Math.PI) / 180);
          ctx.drawImage(wmImg, -imgW / 2, -imgH / 2, imgW, imgH);
          ctx.restore();
          resolve(canvas.toDataURL('image/png'));
        };
        wmImg.onerror = () => resolve(pageDataUrl);
        wmImg.src = wmImagePreview;
        return;
      }
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => resolve(pageDataUrl);
    img.src = pageDataUrl;
  });
}

/* ─── Main Component ─── */
export function WatermarkPdf() {
  const { addRecentFile } = useAppStore();
  const { toast } = useToast();

  // ─── Web Worker for watermark application ───
  interface WmWorkerPayload {
    fileData: ArrayBuffer;
    wmType: WatermarkType;
    wmText: string;
    fontSize: number;
    fontColor: string;
    wmOpacity: number;
    wmRotation: number;
    wmPosition: Position;
    tiled: boolean;
    wmImageData?: ArrayBuffer;
    wmImageMime?: string;
    wmImageScale: number;
    affectedPageIndices: number[];
  }
  interface WmWorkerResult {
    blob: ArrayBuffer;
    affectedCount: number;
  }

  const wmFallback = useCallback(async (
    payload: WmWorkerPayload,
    _taskType: string | undefined,
    _reportProgress: (percent: number, message: string) => void
  ): Promise<WmWorkerResult> => {
    const pdfDoc = await PDFDocument.load(payload.fileData.slice(0), { ignoreEncryption: true });
    const pages = pdfDoc.getPages();
    const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const colorRgb = hexToRgb(payload.fontColor);

    for (const pageIdx of payload.affectedPageIndices) {
      const page = pages[pageIdx];
      const { width, height } = page.getSize();
      if (payload.wmType === 'text') {
        const textWidth = font.widthOfTextAtSize(payload.wmText, payload.fontSize);
        const textHeight = font.heightAtSize(payload.fontSize);
        if (payload.tiled) {
          const diagonal = Math.sqrt(width * width + height * height);
          for (let y = -height; y < height + diagonal; y += payload.fontSize * 2) {
            for (let x = -width; x < width + diagonal; x += textWidth + 60) {
              page.drawText(payload.wmText, { x, y, size: payload.fontSize, font, color: rgb(colorRgb.r, colorRgb.g, colorRgb.b), opacity: payload.wmOpacity / 100, rotate: degrees(payload.wmRotation) });
            }
          }
        } else {
          let x: number, y: number;
          switch (payload.wmPosition) {
            case 'center': x = (width - textWidth) / 2; y = (height - textHeight) / 2; break;
            case 'top-left': x = 30; y = height - 30 - textHeight; break;
            case 'top-right': x = width - textWidth - 30; y = height - 30 - textHeight; break;
            case 'bottom-left': x = 30; y = 30; break;
            case 'bottom-right': x = width - textWidth - 30; y = 30; break;
            default: x = (width - textWidth) / 2; y = (height - textHeight) / 2;
          }
          page.drawText(payload.wmText, { x, y, size: payload.fontSize, font, color: rgb(colorRgb.r, colorRgb.g, colorRgb.b), opacity: payload.wmOpacity / 100, rotate: degrees(payload.wmRotation) });
        }
      }
    }
    const pdfBytes = await pdfDoc.save();
    return { blob: pdfBytes, affectedCount: payload.affectedPageIndices.length };
  }, []);

  const { execute: executeWmTask, progress: workerProgress, isWorkerActive } = useWorkerTask<WmWorkerPayload, WmWorkerResult>(
    createPdfWorker,
    wmFallback,
    { timeoutMs: 5 * 60 * 1000 },
  );

  // Sync worker progress to local state
  useEffect(() => {
    if (workerProgress.percent > 0 && workerProgress.message) {
      setProgress(workerProgress.percent);
    }
  }, [workerProgress]);

  // File state
  const [file, setFile] = useState<File | null>(null);
  const [fileBuffer, setFileBuffer] = useState<ArrayBuffer | null>(null);
  const [pageCount, setPageCount] = useState(0);

  // Thumbnails (raw from pdfjs)
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [thumbLoading, setThumbLoading] = useState(false);

  // Live preview canvases (rendered with watermark)
  const [livePreviews, setLivePreviews] = useState<string[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Watermark type
  const [wmType, setWmType] = useState<WatermarkType>('text');

  // Text watermark settings
  const [wmText, setWmText] = useState('DRAFT');
  const [fontSize, setFontSize] = useState(48);
  const [fontColor, setFontColor] = useState('#808080');
  const [customColor, setCustomColor] = useState('#ff0000');
  const [wmOpacity, setWmOpacity] = useState(30);
  const [wmRotation, setWmRotation] = useState(-45);
  const [wmPosition, setWmPosition] = useState<Position>('center');
  const [tiled, setTiled] = useState(false);

  // Image watermark settings
  const [wmImage, setWmImage] = useState<File | null>(null);
  const [wmImagePreview, setWmImagePreview] = useState<string | null>(null);
  const [wmImageScale, setWmImageScale] = useState(20);

  // Page scope
  const [pageScope, setPageScope] = useState<PageScope>('all');
  const [pageRange, setPageRange] = useState('');

  // Processing
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<Blob | null>(null);

  // Fullscreen preview
  const [fullscreenPage, setFullscreenPage] = useState<number | null>(null);
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
  const [fullscreenLoading, setFullscreenLoading] = useState(false);
  const [fullscreenZoom, setFullscreenZoom] = useState(1);
  const previewRenderRef = useRef(0);

  // Reset
  const resetAll = useCallback(() => {
    setFile(null);
    setFileBuffer(null);
    setPageCount(0);
    setThumbnails([]);
    setLivePreviews([]);
    setWmText('DRAFT');
    setFontSize(48);
    setFontColor('#808080');
    setWmOpacity(30);
    setWmRotation(-45);
    setWmPosition('center');
    setTiled(false);
    setWmImage(null);
    setWmImagePreview(null);
    setPageScope('all');
    setPageRange('');
    setResult(null);
    setProcessing(false);
    setFullscreenPage(null);
    setFullscreenImage(null);
  }, []);

  // Load PDF
  const handleFiles = useCallback(
    async (files: File[]) => {
      const pdf = files.find((f) => f.type === 'application/pdf');
      if (!pdf) return;
      try {
        const buffer = await pdf.arrayBuffer();
        const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
        setPageCount(pdfDoc.getPageCount());
        setFile(pdf);
        setFileBuffer(buffer);
        setResult(null);
        setLivePreviews([]);
      } catch {
        toast({ title: 'Cannot open PDF', description: 'File may be corrupted or password-protected.', variant: 'destructive' });
      }
    },
    [toast],
  );

  // Load watermark image
  const handleWmImage = useCallback((files: File[]) => {
    const img = files.find((f) => f.type.startsWith('image/'));
    if (img) {
      setWmImage(img);
      const url = URL.createObjectURL(img);
      setWmImagePreview(url);
    }
  }, []);

  // Generate raw thumbnails
  useEffect(() => {
    if (!fileBuffer) return;
    let cancelled = false;
    setThumbLoading(true);
    generateThumbnails(fileBuffer, 30)
      .then((t) => { if (!cancelled) { setThumbnails(t); setThumbLoading(false); } })
      .catch(() => { if (!cancelled) { setThumbnails([]); setThumbLoading(false); } });
    return () => { cancelled = true; };
  }, [fileBuffer]);

  // Resolve color
  const resolvedColor = fontColor === 'custom' ? customColor : fontColor;

  // Affected pages
  const getAffectedPages = useCallback((): number[] => {
    if (pageScope === 'all') return Array.from({ length: pageCount }, (_, i) => i);
    if (pageScope === 'odd') return Array.from({ length: Math.ceil(pageCount / 2) }, (_, i) => i * 2);
    if (pageScope === 'even') return Array.from({ length: Math.floor(pageCount / 2) }, (_, i) => i * 2 + 1);
    if (pageRange.trim()) return parsePageRange(pageRange, pageCount).map((n) => n - 1);
    return [];
  }, [pageScope, pageRange, pageCount]);

  const affectedPagesList = getAffectedPages();

  // ─── LIVE PREVIEW: Re-render canvases when any watermark setting changes ───
  useEffect(() => {
    if (thumbnails.length === 0) { setLivePreviews([]); return; }

    const renderId = ++previewRenderRef.current;
    setPreviewLoading(true);

    const timer = setTimeout(async () => {
      try {
        const previews: string[] = [];
        for (let i = 0; i < thumbnails.length; i++) {
          if (renderId !== previewRenderRef.current) return;
          const isAffected = affectedPagesList.includes(i);
          const canRender = wmType === 'text' ? wmText.trim().length > 0 : !!wmImagePreview;

          if (isAffected && canRender) {
            const rendered = await renderWatermarkOnCanvas(thumbnails[i], {
              wmType, wmText, fontSize, resolvedColor, wmOpacity, wmRotation, wmPosition, tiled, wmImagePreview, wmImageScale, isAffected: true,
            });
            previews.push(rendered);
          } else {
            previews.push(thumbnails[i]);
          }
        }
        if (renderId === previewRenderRef.current) {
          setLivePreviews(previews);
          setPreviewLoading(false);
        }
      } catch {
        if (renderId === previewRenderRef.current) {
          setLivePreviews(thumbnails);
          setPreviewLoading(false);
        }
      }
    }, 200); // 200ms debounce

    return () => clearTimeout(timer);
  }, [wmType, wmText, fontSize, resolvedColor, wmOpacity, wmRotation, wmPosition, tiled, wmImagePreview, wmImageScale, affectedPagesList.length, thumbnails]);

  // Fullscreen preview handler
  const openFullscreenPreview = useCallback(async (pageIndex: number) => {
    if (!fileBuffer) return;
    setFullscreenPage(pageIndex);
    setFullscreenLoading(true);
    setFullscreenZoom(1);
    try {
      const hiResPage = await generateHiResPage(fileBuffer, pageIndex + 1, 2.0);
      const withWm = await renderWatermarkHiRes(hiResPage, {
        wmType, wmText, fontSize, resolvedColor, wmOpacity, wmRotation, wmPosition, tiled, wmImagePreview, wmImageScale,
      });
      setFullscreenImage(withWm);
    } catch {
      toast({ title: 'Failed to render preview', variant: 'destructive' });
    } finally {
      setFullscreenLoading(false);
    }
  }, [fileBuffer, wmType, wmText, fontSize, resolvedColor, wmOpacity, wmRotation, wmPosition, tiled, wmImagePreview, wmImageScale, toast]);

  // Apply watermark to full-res PDF
  const applyWatermark = useCallback(async () => {
    if (!fileBuffer || !file) return;
    setProcessing(true);
    setProgress(0);
    setResult(null);

    try {
      const affected = affectedPagesList;
      const wmImageData = wmType === 'image' && wmImage ? await wmImage.arrayBuffer() : undefined;
      const wmImageMime = wmImage?.type;

      // Use Web Worker for off-thread watermark application
      const workerResult = await executeWmTask(
        {
          fileData: fileBuffer.slice(0),
          wmType,
          wmText,
          fontSize,
          fontColor: resolvedColor,
          wmOpacity,
          wmRotation,
          wmPosition,
          tiled,
          wmImageData,
          wmImageMime,
          wmImageScale,
          affectedPageIndices: affected,
        },
        'watermark-pdf',
      );

      const blob = new Blob([workerResult.blob], { type: 'application/pdf' });
      setResult(blob);

      addRecentFile({
        id: crypto.randomUUID(),
        name: `watermarked-${file.name}`,
        type: 'application/pdf',
        tool: 'watermark-pdf',
        size: formatSize(blob.size),
        timestamp: Date.now(),
      });

      toast({
        title: 'Watermark applied!',
        description: `${workerResult.affectedCount} page${workerResult.affectedCount > 1 ? 's' : ''} watermarked · ${formatSize(blob.size)}`,
      });
    } catch (err) {
      console.error('Watermark error:', err);
      toast({ title: 'Failed to apply watermark', description: 'The PDF may be corrupted or encrypted.', variant: 'destructive' });
    } finally {
      setProcessing(false);
    }
  }, [file, fileBuffer, wmType, wmText, fontSize, resolvedColor, wmOpacity, wmRotation, wmPosition, tiled, wmImage, wmImageScale, affectedPagesList, addRecentFile, toast, executeWmTask]);

  const handleDownload = useCallback(() => {
    if (!result || !file) return;
    saveAs(result, `watermarked-${file.name}`);
    toast({ title: 'Downloaded', description: 'Your watermarked PDF has been saved.' });
  }, [result, file, toast]);

  // Apply & Download in one step
  const handleApplyAndDownload = useCallback(async () => {
    await applyWatermark();
    // Small delay to let result state update
    setTimeout(() => {
      if (result) {
        saveAs(result, `watermarked-${file?.name || 'watermarked.pdf'}`);
        toast({ title: 'Downloaded', description: 'Your watermarked PDF has been saved.' });
      }
    }, 500);
  }, [applyWatermark, result, file, toast]);

  const canApply = !processing && file !== null && (wmType === 'image' ? wmImage !== null : wmText.trim().length > 0) && affectedPagesList.length > 0;

  // Which previews to show
  const displayPreviews = livePreviews.length > 0 ? livePreviews : thumbnails;

  return (
    <ToolLayout
      title="Watermark PDF"
      description="Add text or image watermarks to any PDF"
      toolId="watermark-pdf"
    >
      {!file ? (
        <FileDropzone
          onFiles={handleFiles}
          accept=".pdf,application/pdf"
          multiple={false}
          label="Drop PDF here or click to upload"
          sublabel="Add text or logo watermarks to your PDF pages"
        />
      ) : (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
          {/* File Info */}
          <Card>
            <CardContent className="p-4 flex items-center gap-4">
              <div className="h-10 w-10 rounded-lg bg-red-100 dark:bg-red-950 flex items-center justify-center flex-shrink-0">
                <FileText className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{file.name}</p>
                <p className="text-sm text-muted-foreground">{pageCount} pages · {formatSize(file.size)}</p>
              </div>
              <Button variant="ghost" size="icon" onClick={resetAll}><Trash2 className="h-4 w-4" /></Button>
            </CardContent>
          </Card>

          {/* ─── LIVE PREVIEW SECTION ─── */}
          {(thumbLoading || displayPreviews.length > 0) && (
            <Card className="border-primary/30">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Eye className="h-4 w-4 text-primary" />
                    Live Preview
                    {previewLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                  </CardTitle>
                  <Badge variant="secondary" className="text-[10px] font-mono">
                    {affectedPagesList.length}/{pageCount} pages
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Preview updates in real-time as you change settings. Click a page to zoom in.
                </p>
              </CardHeader>
              <CardContent>
                {thumbLoading ? (
                  <div className="flex items-center gap-2 mb-3">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Rendering page previews...</span>
                  </div>
                ) : null}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 max-h-[450px] overflow-y-auto pr-1 custom-scrollbar">
                  {(thumbLoading ? Array.from({ length: Math.min(pageCount, 12) }) : displayPreviews).map((thumb, idx) => {
                    const isAffected = affectedPagesList.includes(idx);
                    const src = typeof thumb === 'string' ? thumb : '';
                    return (
                      <button
                        key={idx}
                        onClick={() => !thumbLoading && isAffected && openFullscreenPreview(idx)}
                        className={`relative rounded-lg overflow-hidden border-2 transition-all text-left cursor-pointer group ${
                          isAffected
                            ? 'border-primary ring-2 ring-primary/20 hover:ring-primary/40'
                            : 'border-muted opacity-50 hover:opacity-70'
                        }`}
                      >
                        {src ? (
                          <img src={src} alt={`Page ${idx + 1}`} className="w-full h-auto" />
                        ) : (
                          <Skeleton className="aspect-[3/4] rounded-none" />
                        )}
                        {/* Zoom icon on hover for affected pages */}
                        {isAffected && !thumbLoading && (
                          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30">
                            <div className="w-8 h-8 rounded-full bg-white/90 dark:bg-black/90 flex items-center justify-center">
                              <ZoomIn className="h-4 w-4 text-primary" />
                            </div>
                          </div>
                        )}
                        <div className={`absolute bottom-0 left-0 right-0 text-[10px] px-1.5 py-0.5 text-center font-medium ${
                          isAffected ? 'bg-primary text-primary-foreground' : 'bg-black/60 text-white'
                        }`}>
                          Page {idx + 1}
                        </div>
                      </button>
                    );
                  })}
                </div>
                {pageCount > 30 && (
                  <p className="text-xs text-muted-foreground mt-2 text-center">Showing first 30 of {pageCount} pages</p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Watermark Settings */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Settings2 className="h-4 w-4" />
                Watermark Settings
                <WorkerBadge active={isWorkerActive} />
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Type Toggle */}
              <Tabs value={wmType} onValueChange={(v) => setWmType(v as WatermarkType)}>
                <TabsList className="w-full">
                  <TabsTrigger value="text" className="flex-1 gap-1.5">
                    <Type className="h-3.5 w-3.5" />
                    Text Watermark
                  </TabsTrigger>
                  <TabsTrigger value="image" className="flex-1 gap-1.5">
                    <ImageIcon className="h-3.5 w-3.5" />
                    Image Watermark
                  </TabsTrigger>
                </TabsList>

                {/* Text Mode */}
                <TabsContent value="text" className="space-y-5 mt-5">
                  {/* Presets */}
                  <div className="space-y-2">
                    <Label>Quick Presets</Label>
                    <div className="flex flex-wrap gap-2">
                      {TEXT_PRESETS.map((preset) => (
                        <Button
                          key={preset.label}
                          variant={wmText === preset.value ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => preset.value && setWmText(preset.value)}
                          className="text-xs"
                        >
                          {preset.label}
                        </Button>
                      ))}
                    </div>
                  </div>

                  {/* Custom Text */}
                  <div className="space-y-2">
                    <Label htmlFor="wm-text">Watermark Text</Label>
                    <Input
                      id="wm-text"
                      value={wmText}
                      onChange={(e) => setWmText(e.target.value)}
                      placeholder="Enter custom watermark text..."
                      maxLength={100}
                    />
                  </div>

                  {/* Font Size */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label>Font Size</Label>
                      <Badge variant="secondary" className="font-mono">{fontSize}px</Badge>
                    </div>
                    <Slider value={[fontSize]} onValueChange={(v) => setFontSize(v[0])} min={12} max={200} step={2} />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Small (12px)</span>
                      <span>Large (200px)</span>
                    </div>
                  </div>
                </TabsContent>

                {/* Image Mode */}
                <TabsContent value="image" className="space-y-5 mt-5">
                  <div className="space-y-2">
                    <Label>Watermark Image</Label>
                    <FileDropzone
                      onFiles={handleWmImage}
                      accept="image/png,image/jpeg,image/jpg"
                      multiple={false}
                      label="Drop watermark image here"
                      sublabel="PNG or JPEG — logo, signature, stamp"
                      icon="image"
                      variant="compact"
                    />
                    {wmImagePreview && (
                      <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border">
                        <img src={wmImagePreview} alt="Watermark" className="h-12 w-12 object-contain rounded border" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{wmImage.name}</p>
                          <p className="text-xs text-muted-foreground">{formatSize(wmImage.size)}</p>
                        </div>
                        <Button size="sm" variant="ghost" onClick={() => { setWmImage(null); setWmImagePreview(null); }}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label>Image Size (% of page width)</Label>
                      <Badge variant="secondary" className="font-mono">{wmImageScale}%</Badge>
                    </div>
                    <Slider value={[wmImageScale]} onValueChange={(v) => setWmImageScale(v[0])} min={5} max={80} step={1} />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>5%</span>
                      <span>80%</span>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>

              {/* ─── Common Settings ─── */}

              {wmType === 'text' && (
                <div className="space-y-2">
                  <Label>Color</Label>
                  <div className="flex flex-wrap gap-2">
                    {COLOR_PRESETS.map((preset) => (
                      <button
                        key={preset.label}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm transition-all ${
                          fontColor === preset.value
                            ? 'border-primary bg-primary/5 font-medium'
                            : 'border-muted hover:border-muted-foreground/30'
                        }`}
                        onClick={() => setFontColor(preset.value)}
                      >
                        <div
                          className="h-4 w-4 rounded border border-muted-foreground/20"
                          style={{ backgroundColor: preset.value === 'custom' ? customColor : preset.value }}
                        />
                        {preset.label}
                      </button>
                    ))}
                  </div>
                  {fontColor === 'custom' && (
                    <div className="flex items-center gap-2 mt-1">
                      <input type="color" value={customColor} onChange={(e) => setCustomColor(e.target.value)} className="h-8 w-12 rounded border cursor-pointer" />
                      <span className="text-sm text-muted-foreground font-mono">{customColor}</span>
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Opacity</Label>
                  <Badge variant="secondary" className="font-mono">{wmOpacity}%</Badge>
                </div>
                <Slider value={[wmOpacity]} onValueChange={(v) => setWmOpacity(v[0])} min={5} max={100} step={5} />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Very faint (5%)</span>
                  <span>Fully visible (100%)</span>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-1.5">
                    <RotateCw className="h-3.5 w-3.5" />
                    Rotation
                  </Label>
                  <Badge variant="secondary" className="font-mono">{wmRotation}°</Badge>
                </div>
                <Slider value={[wmRotation]} onValueChange={(v) => setWmRotation(v[0])} min={-180} max={180} step={5} />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>-180°</span>
                  <span>0° (horizontal)</span>
                  <span>180°</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Position</Label>
                <Select value={wmPosition} onValueChange={(v) => setWmPosition(v as Position)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="center">Center (diagonal)</SelectItem>
                    <SelectItem value="top-left">Top Left</SelectItem>
                    <SelectItem value="top-right">Top Right</SelectItem>
                    <SelectItem value="bottom-left">Bottom Left</SelectItem>
                    <SelectItem value="bottom-right">Bottom Right</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {wmType === 'text' && (
                <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                  <div className="flex items-center gap-2">
                    <Grid3x3 className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <Label className="text-sm font-medium">Tiled / Repeated</Label>
                      <p className="text-xs text-muted-foreground">Stamp across entire page diagonally</p>
                    </div>
                  </div>
                  <button
                    className={`relative w-10 h-6 rounded-full transition-colors ${tiled ? 'bg-primary' : 'bg-muted'}`}
                    onClick={() => setTiled(!tiled)}
                  >
                    <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${tiled ? 'translate-x-4' : ''}`} />
                  </button>
                </div>
              )}

              {/* Page Scope */}
              <div className="space-y-3">
                <Label>Apply to Pages</Label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {([
                    { val: 'all', label: 'All Pages', sub: `${pageCount}` },
                    { val: 'odd', label: 'Odd Pages', sub: '1, 3, 5...' },
                    { val: 'even', label: 'Even Pages', sub: '2, 4, 6...' },
                    { val: 'specific', label: 'Specific', sub: 'Custom range' },
                  ] as const).map((opt) => (
                    <Button
                      key={opt.val}
                      variant={pageScope === opt.val ? 'default' : 'outline'}
                      size="sm"
                      className="flex flex-col h-auto py-2.5"
                      onClick={() => setPageScope(opt.val)}
                    >
                      <span className="text-xs font-medium">{opt.label}</span>
                      <span className="text-[10px] opacity-70">{opt.sub}</span>
                    </Button>
                  ))}
                </div>
              </div>

              {pageScope === 'specific' && (
                <div className="space-y-2">
                  <Label htmlFor="page-range">Page Range</Label>
                  <Input
                    id="page-range"
                    placeholder="e.g., 1-3, 5, 7-end"
                    value={pageRange}
                    onChange={(e) => setPageRange(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">Separate with commas. Use dashes for ranges (1-{pageCount}).</p>
                  {affectedPagesList.length > 0 && (
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="font-mono">{affectedPagesList.length}</Badge>
                      <span className="text-xs text-muted-foreground">pages selected</span>
                    </div>
                  )}
                </div>
              )}

              {/* Preview Summary */}
              <div className="p-3 rounded-lg bg-muted/50 border space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <Eye className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">Preview Summary</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <span className="text-muted-foreground">Type:</span>
                  <span className="font-medium">{wmType === 'text' ? `Text: "${wmText}"` : 'Image watermark'}</span>
                  <span className="text-muted-foreground">Opacity:</span>
                  <span className="font-medium">{wmOpacity}%</span>
                  <span className="text-muted-foreground">Rotation:</span>
                  <span className="font-medium">{wmRotation}°</span>
                  <span className="text-muted-foreground">Position:</span>
                  <span className="font-medium">{wmPosition}{tiled ? ' (tiled)' : ''}</span>
                  <span className="text-muted-foreground">Pages:</span>
                  <span className="font-medium">{affectedPagesList.length} of {pageCount}</span>
                  {wmType === 'text' && (
                    <>
                      <span className="text-muted-foreground">Color:</span>
                      <span className="font-medium flex items-center gap-1">
                        <span className="inline-block w-3 h-3 rounded border" style={{ backgroundColor: resolvedColor }} />
                        {resolvedColor}
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Progress */}
              {processing && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span>Applying watermark...</span>
                    <span className="font-medium">{progress}%</span>
                  </div>
                  <Progress value={progress} />
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3">
                <Button
                  className="flex-1"
                  size="lg"
                  disabled={!canApply}
                  onClick={applyWatermark}
                >
                  {processing ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Applying...
                    </>
                  ) : (
                    <>
                      <Stamp className="h-4 w-4 mr-2" />
                      Apply to {affectedPagesList.length} Page{affectedPagesList.length !== 1 ? 's' : ''}
                    </>
                  )}
                </Button>
                {result && (
                  <Button size="lg" variant="outline" className="gap-2" onClick={handleDownload}>
                    <Download className="h-4 w-4" />
                    Download
                  </Button>
                )}
              </div>

              {/* Apply & Download quick action (when result is ready) */}
              {result && (
                <Button
                  className="w-full"
                  size="lg"
                  variant="default"
                  onClick={() => {
                    saveAs(result, `watermarked-${file?.name || 'document.pdf'}`);
                    toast({ title: 'Downloaded!', description: 'Your watermarked PDF has been saved.' });
                  }}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download Watermarked PDF ({formatSize(result.size)})
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Result Card */}
          {result && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <Card className="border-emerald-200 dark:border-emerald-900 bg-emerald-50/50 dark:bg-emerald-950/30">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center">
                        <Stamp className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Watermark Applied Successfully!</p>
                        <p className="text-xs text-muted-foreground">
                          {affectedPagesList.length} pages · {formatSize(result.size)}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => { setResult(null); }}>
                        <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                        Re-edit
                      </Button>
                      <Button size="sm" onClick={handleDownload}>
                        <Download className="h-3.5 w-3.5 mr-1.5" />
                        Download PDF
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </motion.div>
      )}

      {/* ─── Fullscreen Preview Modal ─── */}
      <AnimatePresence>
        {fullscreenPage !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center p-4"
            onClick={() => setFullscreenPage(null)}
          >
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              className="relative max-w-[90vw] max-h-[90vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between bg-background border rounded-t-xl px-4 py-3">
                <div className="flex items-center gap-3">
                  <Eye className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">
                    Page {fullscreenPage + 1} — Full Preview
                  </span>
                  {previewLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                </div>
                <div className="flex items-center gap-2">
                  {/* Zoom controls */}
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setFullscreenZoom(Math.max(0.5, fullscreenZoom - 0.25))}>
                    <ZoomOut className="h-4 w-4" />
                  </Button>
                  <span className="text-xs font-mono w-12 text-center">{Math.round(fullscreenZoom * 100)}%</span>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setFullscreenZoom(Math.min(3, fullscreenZoom + 0.25))}>
                    <ZoomIn className="h-4 w-4" />
                  </Button>
                  {/* Page navigation */}
                  {fullscreenPage > 0 && (
                    <Button variant="ghost" size="sm" className="h-8 text-xs"
                      onClick={() => openFullscreenPreview(fullscreenPage - 1)}
                    >
                      ← Prev
                    </Button>
                  )}
                  {fullscreenPage < pageCount - 1 && (
                    <Button variant="ghost" size="sm" className="h-8 text-xs"
                      onClick={() => openFullscreenPreview(fullscreenPage + 1)}
                    >
                      Next →
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => setFullscreenPage(null)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Image */}
              <div className="bg-muted/50 border-x border-b rounded-b-xl overflow-auto max-h-[80vh] flex items-center justify-center p-4"
                style={{ minWidth: '300px', minHeight: '200px' }}
              >
                {fullscreenLoading ? (
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <span className="text-sm text-muted-foreground">Rendering full preview...</span>
                  </div>
                ) : fullscreenImage ? (
                  <img
                    src={fullscreenImage}
                    alt={`Page ${fullscreenPage + 1} preview`}
                    style={{ transform: `scale(${fullscreenZoom})`, transformOrigin: 'center', transition: 'transform 0.2s ease' }}
                    className="max-w-none shadow-lg"
                  />
                ) : (
                  <span className="text-sm text-muted-foreground">No preview available</span>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </ToolLayout>
  );
}
