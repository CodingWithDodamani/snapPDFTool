'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Crop,
  RotateCw,
  RotateCcw,
  FlipHorizontal2,
  FlipVertical2,
  Download,
  Loader2,
  Trash2,
  Lock,
  Unlock,
  ImageIcon,
  Palette,
  Compass,
  Layers,
  Archive,
  X,
  Check,
  Maximize2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ToolLayout } from '@/components/shared/ToolLayout';
import { FileDropzone } from '@/components/shared/FileDropzone';
import { useAppStore } from '@/store';
import { saveAs } from 'file-saver';
import JSZip from 'jszip';
import { formatSize } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

// ── Constants ────────────────────────────────────────────────────────────────

type AspectPreset = 'free' | '1:1' | '4:3' | '3:4' | '16:9' | '9:16' | '3:2' | '2:3';

const ASPECT_RATIOS: Record<Exclude<AspectPreset, 'free'>, number> = {
  '1:1': 1,
  '4:3': 4 / 3,
  '3:4': 3 / 4,
  '16:9': 16 / 9,
  '9:16': 9 / 16,
  '3:2': 3 / 2,
  '2:3': 2 / 3,
};

const ASPECT_PRESET_LABELS: { value: AspectPreset; label: string }[] = [
  { value: 'free', label: 'Free' },
  { value: '1:1', label: '1:1' },
  { value: '4:3', label: '4:3' },
  { value: '3:4', label: '3:4' },
  { value: '16:9', label: '16:9' },
  { value: '9:16', label: '9:16' },
  { value: '3:2', label: '3:2' },
  { value: '2:3', label: '2:3' },
];

const FILTERS: Record<string, string> = {
  none: '',
  grayscale: 'grayscale(100%)',
  sepia: 'sepia(80%)',
  warm: 'saturate(1.3) brightness(1.05) hue-rotate(-10deg)',
  cool: 'saturate(0.9) brightness(1.05) hue-rotate(15deg)',
  vintage: 'sepia(40%) contrast(0.85) brightness(0.95)',
  noir: 'grayscale(100%) contrast(1.5) brightness(0.9)',
  brightness: 'brightness(1.2)',
  contrast: 'contrast(1.3)',
};

const FILTER_PRESETS: { key: string; label: string }[] = [
  { key: 'none', label: 'Original' },
  { key: 'grayscale', label: 'Grayscale' },
  { key: 'sepia', label: 'Sepia' },
  { key: 'warm', label: 'Warm' },
  { key: 'cool', label: 'Cool' },
  { key: 'vintage', label: 'Vintage' },
  { key: 'noir', label: 'Noir' },
  { key: 'brightness', label: 'Bright+' },
  { key: 'contrast', label: 'Contrast+' },
];

interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

type OutputFormat = 'jpeg' | 'png' | 'webp';

interface BatchResult {
  url: string;
  blob: Blob;
  name: string;
}

function getOutputFormatFromFileType(fileType: string): OutputFormat {
  if (fileType === 'image/png') return 'png';
  if (fileType === 'image/webp') return 'webp';
  return 'jpeg';
}

function getMimeType(format: OutputFormat): string {
  return format === 'jpeg' ? 'image/jpeg' : format === 'png' ? 'image/png' : 'image/webp';
}

// ── Core rendering engine ───────────────────────────────────────────────────

async function renderProcessedImage(opts: {
  sourceUrl: string;
  cropX: number;
  cropY: number;
  cropW: number;
  cropH: number;
  applyCrop: boolean;
  rotationDeg: number;
  flipH: boolean;
  flipV: boolean;
  filter: string;
  outWidth: number;
  outHeight: number;
  mimeType: string;
  quality: number;
}): Promise<Blob> {
  const {
    sourceUrl,
    cropX,
    cropY,
    cropW,
    cropH,
    applyCrop,
    rotationDeg,
    flipH,
    flipV,
    filter,
    outWidth,
    outHeight,
    mimeType,
    quality,
  } = opts;

  const imageEl = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = sourceUrl;
  });

  const srcW = applyCrop ? cropW : imageEl.width;
  const srcH = applyCrop ? cropH : imageEl.height;
  const sx = applyCrop ? cropX : 0;
  const sy = applyCrop ? cropY : 0;

  const rad = (rotationDeg * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const canvasW = Math.round(srcW * cos + srcH * sin);
  const canvasH = Math.round(srcW * sin + srcH * cos);

  const canvas = document.createElement('canvas');
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext('2d')!;

  if (filter) ctx.filter = filter;

  ctx.save();
  ctx.translate(canvasW / 2, canvasH / 2);
  ctx.rotate(rad);
  ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
  ctx.drawImage(imageEl, sx, sy, srcW, srcH, -srcW / 2, -srcH / 2, srcW, srcH);
  ctx.restore();

  let finalCanvas = canvas;
  if (outWidth > 0 && outHeight > 0) {
    finalCanvas = document.createElement('canvas');
    finalCanvas.width = outWidth;
    finalCanvas.height = outHeight;
    const fCtx = finalCanvas.getContext('2d')!;
    fCtx.drawImage(canvas, 0, 0, outWidth, outHeight);
  }

  return new Promise((resolve, reject) => {
    finalCanvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Failed to create image blob'));
      },
      mimeType,
      quality
    );
  });
}

// ── Component ────────────────────────────────────────────────────────────────

export function ImageCropRotate() {
  const { addRecentFile } = useAppStore();
  const { toast } = useToast();

  // Single-image state
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [originalDims, setOriginalDims] = useState({ w: 0, h: 0 });
  const [rotation, setRotation] = useState(0);
  const [straightenAngle, setStraightenAngle] = useState(0);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [cropRect, setCropRect] = useState<CropRect>({ x: 0, y: 0, w: 0, h: 0 });
  const [cropActive, setCropActive] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState('none');
  const [outputWidth, setOutputWidth] = useState(0);
  const [outputHeight, setOutputHeight] = useState(0);
  const [resizeAspectLock, setResizeAspectLock] = useState(false);
  const [lockedAspect, setLockedAspect] = useState(1);
  const [aspectPreset, setAspectPreset] = useState<AspectPreset>('free');
  const [outputFormat, setOutputFormat] = useState<OutputFormat>('jpeg');
  const [outputQuality, setOutputQuality] = useState(95);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState('');
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);

  // Batch state
  const [batchMode, setBatchMode] = useState(false);
  const [batchFiles, setBatchFiles] = useState<File[]>([]);
  const [batchPreviews, setBatchPreviews] = useState<string[]>([]);
  const [batchProcessing, setBatchProcessing] = useState(false);
  const [batchResults, setBatchResults] = useState<BatchResult[]>([]);

  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const urlsRef = useRef<Set<string>>(new Set());

  const draggingRef = useRef<{
    type: 'move' | 'resize';
    handle?: string;
    startX: number;
    startY: number;
    startRect: CropRect;
  } | null>(null);

  // Computed
  const displayScale = Math.min(1, 600 / Math.max(originalDims.w, originalDims.h, 1));
  const totalRotation = rotation + straightenAngle;

  const mimeType = getMimeType(outputFormat);
  const quality = outputFormat === 'png' ? undefined : outputQuality / 100;

  // ── URL management ────────────────────────────────────────────────────────

  const createUrl = useCallback((src: File | Blob) => {
    const url = URL.createObjectURL(src);
    urlsRef.current.add(url);
    return url;
  }, []);

  const revokeUrl = useCallback((url: string) => {
    URL.revokeObjectURL(url);
    urlsRef.current.delete(url);
  }, []);

  // ── Reset helpers ────────────────────────────────────────────────────────

  const resetEditState = useCallback(() => {
    setRotation(0);
    setStraightenAngle(0);
    setFlipH(false);
    setFlipV(false);
    setCropActive(false);
    setCropRect({ x: 0, y: 0, w: 0, h: 0 });
    setSelectedFilter('none');
    setOutputWidth(0);
    setOutputHeight(0);
    setResizeAspectLock(false);
    setAspectPreset('free');
    setOutputQuality(95);
    setResult('');
    setResultBlob(null);
  }, []);

  const clearSingle = useCallback(() => {
    if (preview) revokeUrl(preview);
    if (result) revokeUrl(result);
    setFile(null);
    setPreview('');
    setOriginalDims({ w: 0, h: 0 });
    resetEditState();
  }, [preview, result, revokeUrl, resetEditState]);

  const clearBatch = useCallback(() => {
    batchPreviews.forEach((u) => revokeUrl(u));
    batchResults.forEach((r) => revokeUrl(r.url));
    setBatchFiles([]);
    setBatchPreviews([]);
    setBatchResults([]);
    resetEditState();
    setOriginalDims({ w: 0, h: 0 });
  }, [batchPreviews, batchResults, revokeUrl, resetEditState]);

  // ── File handlers ─────────────────────────────────────────────────────────

  const handleFiles = useCallback(
    (files: File[]) => {
      const img = files.find((f) =>
        ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'].includes(f.type)
      );
      if (!img) return;

      if (preview) revokeUrl(preview);
      if (result) revokeUrl(result);

      resetEditState();
      setOutputFormat(getOutputFormatFromFileType(img.type));
      const url = createUrl(img);
      setFile(img);
      setPreview(url);

      const imageEl = new Image();
      imageEl.onload = () => {
        setOriginalDims({ w: imageEl.width, h: imageEl.height });
        setCropRect({
          x: 10,
          y: 10,
          w: imageEl.width - 20,
          h: imageEl.height - 20,
        });
      };
      imageEl.src = url;
    },
    [preview, result, revokeUrl, resetEditState, createUrl]
  );

  const handleBatchFiles = useCallback(
    (files: File[]) => {
      const images = files.filter((f) =>
        ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'].includes(f.type)
      );
      if (images.length === 0) return;

      // Revoke old URLs
      batchPreviews.forEach((u) => revokeUrl(u));
      batchResults.forEach((r) => revokeUrl(r.url));

      resetEditState();
      const newPreviews = images.map((f) => createUrl(f));
      setBatchFiles(images);
      setBatchPreviews(newPreviews);
      setBatchResults([]);
      setOutputFormat(getOutputFormatFromFileType(images[0].type));

      // Load first image dimensions for crop preview
      const imageEl = new Image();
      imageEl.onload = () => {
        setOriginalDims({ w: imageEl.width, h: imageEl.height });
        setCropRect({
          x: 10,
          y: 10,
          w: imageEl.width - 20,
          h: imageEl.height - 20,
        });
      };
      imageEl.src = newPreviews[0];
    },
    [batchPreviews, batchResults, revokeUrl, resetEditState, createUrl]
  );

  // ── Aspect ratio ─────────────────────────────────────────────────────────

  const recalcCropForAspect = useCallback(
    (preset: AspectPreset) => {
      if (preset === 'free' || originalDims.w === 0 || originalDims.h === 0) return;
      const ratio = ASPECT_RATIOS[preset];
      if (!ratio) return;

      const imgW = originalDims.w;
      const imgH = originalDims.h;
      let cropW: number;
      let cropH: number;

      if (ratio >= 1) {
        cropW = imgW;
        cropH = imgW / ratio;
        if (cropH > imgH) {
          cropH = imgH;
          cropW = imgH * ratio;
        }
      } else {
        cropH = imgH;
        cropW = imgH * ratio;
        if (cropW > imgW) {
          cropW = imgW;
          cropH = imgW / ratio;
        }
      }

      const margin = 0.05;
      cropW *= 1 - margin;
      cropH *= 1 - margin;
      cropW = Math.round(cropW);
      cropH = Math.round(cropH);

      setCropRect({
        x: Math.round((imgW - cropW) / 2),
        y: Math.round((imgH - cropH) / 2),
        w: cropW,
        h: cropH,
      });
    },
    [originalDims.w, originalDims.h]
  );

  const handleAspectChange = useCallback(
    (preset: AspectPreset) => {
      setAspectPreset(preset);
      if (preset !== 'free' && cropActive) {
        recalcCropForAspect(preset);
      }
    },
    [cropActive, recalcCropForAspect]
  );

  // ── Rotation & Straighten ──────────────────────────────────────────────────

  const rotateBy = useCallback((deg: number) => {
    setRotation((prev) => (prev + deg) % 360);
  }, []);

  // ── Resize handlers ───────────────────────────────────────────────────────

  const handleToggleAspectLock = useCallback(
    (checked: boolean) => {
      setResizeAspectLock(checked);
      if (checked) {
        const baseW = cropActive ? cropRect.w : originalDims.w;
        const baseH = cropActive ? cropRect.h : originalDims.h;
        if (baseW > 0 && baseH > 0) {
          setLockedAspect(baseW / baseH);
          if (outputWidth === 0) setOutputWidth(baseW);
          if (outputHeight === 0) setOutputHeight(baseH);
        }
      }
    },
    [cropActive, cropRect, originalDims, outputWidth, outputHeight]
  );

  const handleOutputWidthChange = useCallback(
    (val: string) => {
      const w = parseInt(val) || 0;
      setOutputWidth(w);
      if (resizeAspectLock && lockedAspect > 0 && w > 0) {
        setOutputHeight(Math.round(w / lockedAspect));
      }
    },
    [resizeAspectLock, lockedAspect]
  );

  const handleOutputHeightChange = useCallback(
    (val: string) => {
      const h = parseInt(val) || 0;
      setOutputHeight(h);
      if (resizeAspectLock && lockedAspect > 0 && h > 0) {
        setOutputWidth(Math.round(h * lockedAspect));
      }
    },
    [resizeAspectLock, lockedAspect]
  );

  // ── Processing ───────────────────────────────────────────────────────────

  const applyCropAndRotate = useCallback(async () => {
    const imgUrl = batchMode ? batchPreviews[0] : preview;
    if (!imgUrl || (!file && !batchMode)) return;
    setProcessing(true);

    try {
      const blob = await renderProcessedImage({
        sourceUrl: imgUrl,
        cropX: cropRect.x,
        cropY: cropRect.y,
        cropW: cropRect.w,
        cropH: cropRect.h,
        applyCrop: cropActive,
        rotationDeg: totalRotation,
        flipH,
        flipV,
        filter: FILTERS[selectedFilter] || '',
        outWidth: outputWidth,
        outHeight: outputHeight,
        mimeType,
        quality: quality ?? 0.95,
      });

      if (result) revokeUrl(result);
      const url = URL.createObjectURL(blob);
      urlsRef.current.add(url);
      setResult(url);
      setResultBlob(blob);
    } catch (err) {
      console.error('Processing error:', err);
      toast({
        title: 'Processing failed',
        description: 'An error occurred while processing your image. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setProcessing(false);
    }
  }, [
    preview,
    file,
    batchMode,
    batchPreviews,
    cropRect,
    cropActive,
    totalRotation,
    flipH,
    flipV,
    selectedFilter,
    outputWidth,
    outputHeight,
    mimeType,
    quality,
    result,
    revokeUrl,
    toast,
  ]);

  const processBatch = useCallback(async () => {
    if (batchPreviews.length === 0) return;
    setBatchProcessing(true);
    const results: BatchResult[] = [];

    // Revoke old result URLs
    batchResults.forEach((r) => revokeUrl(r.url));
    setBatchResults([]);

    try {
      for (let i = 0; i < batchFiles.length; i++) {
        const bFile = batchFiles[i];
        const bUrl = batchPreviews[i];

        // Get image dimensions for proportional crop scaling
        const imgEl = await new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = bUrl;
        });

        const scaleX = imgEl.width / Math.max(originalDims.w, 1);
        const scaleY = imgEl.height / Math.max(originalDims.h, 1);

        let cropX = 0,
          cropY = 0,
          cropW = imgEl.width,
          cropH = imgEl.height;
        if (cropActive) {
          cropX = Math.min(Math.round(cropRect.x * scaleX), imgEl.width - 1);
          cropY = Math.min(Math.round(cropRect.y * scaleY), imgEl.height - 1);
          cropW = Math.min(Math.round(cropRect.w * scaleX), imgEl.width - cropX);
          cropH = Math.min(Math.round(cropRect.h * scaleY), imgEl.height - cropY);
        }

        const blob = await renderProcessedImage({
          sourceUrl: bUrl,
          cropX,
          cropY,
          cropW,
          cropH,
          applyCrop: cropActive,
          rotationDeg: totalRotation,
          flipH,
          flipV,
          filter: FILTERS[selectedFilter] || '',
          outWidth: outputWidth,
          outHeight: outputHeight,
          mimeType,
          quality: quality ?? 0.95,
        });

        const url = URL.createObjectURL(blob);
        urlsRef.current.add(url);
        const baseName = bFile.name.replace(/\.[^.]+$/, '');
        const extMap: Record<OutputFormat, string> = { jpeg: 'jpg', png: 'png', webp: 'webp' };
        results.push({
          url,
          blob,
          name: `${baseName}-edited.${extMap[outputFormat]}`,
        });
      }
      setBatchResults(results);
      toast({
        title: 'Batch processing complete',
        description: `${results.length} images processed successfully.`,
      });
    } catch (err) {
      console.error('Batch processing error:', err);
      toast({
        title: 'Batch processing failed',
        description: 'An error occurred during batch processing. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setBatchProcessing(false);
    }
  }, [
    batchFiles,
    batchPreviews,
    batchResults,
    originalDims,
    cropActive,
    cropRect,
    totalRotation,
    flipH,
    flipV,
    selectedFilter,
    outputWidth,
    outputHeight,
    mimeType,
    quality,
    outputFormat,
    revokeUrl,
    toast,
  ]);

  // ── Download ───────────────────────────────────────────────────────────────

  const handleDownload = useCallback(() => {
    if (!result || (!file && !batchMode)) return;
    const extMap: Record<OutputFormat, string> = { jpeg: 'jpg', png: 'png', webp: 'webp' };
    const fileName = `edited-${Date.now()}.${extMap[outputFormat]}`;
    saveAs(result, fileName);
    addRecentFile({
      id: crypto.randomUUID(),
      name: fileName,
      type: mimeType,
      tool: 'image-crop-rotate',
      size: formatSize(resultBlob?.size ?? file?.size ?? 0),
      timestamp: Date.now(),
    });
    toast({
      title: 'Image downloaded',
      description: `${fileName} (${formatSize(resultBlob?.size ?? 0)})`,
    });
  }, [result, resultBlob, file, batchMode, outputFormat, mimeType, addRecentFile, toast]);

  const handleBatchDownload = useCallback(async () => {
    if (batchResults.length === 0) return;
    try {
      const zip = new JSZip();
      for (const item of batchResults) {
        zip.file(item.name, item.blob);
      }
      const content = await zip.generateAsync({ type: 'blob' });
      saveAs(content, `batch-edited-${Date.now()}.zip`);
      toast({
        title: 'ZIP downloaded',
        description: `${batchResults.length} images packaged successfully.`,
      });
    } catch (err) {
      console.error('ZIP creation error:', err);
      toast({
        title: 'ZIP download failed',
        description: 'Failed to create ZIP archive.',
        variant: 'destructive',
      });
    }
  }, [batchResults, toast]);

  // ── Crop pointer handlers ────────────────────────────────────────────────

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!cropActive || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const corners = [
        { handle: 'tl', cx: cropRect.x * displayScale, cy: cropRect.y * displayScale },
        {
          handle: 'tr',
          cx: (cropRect.x + cropRect.w) * displayScale,
          cy: cropRect.y * displayScale,
        },
        {
          handle: 'bl',
          cx: cropRect.x * displayScale,
          cy: (cropRect.y + cropRect.h) * displayScale,
        },
        {
          handle: 'br',
          cx: (cropRect.x + cropRect.w) * displayScale,
          cy: (cropRect.y + cropRect.h) * displayScale,
        },
      ];

      for (const corner of corners) {
        if (Math.abs(x - corner.cx) < 12 && Math.abs(y - corner.cy) < 12) {
          draggingRef.current = {
            type: 'resize',
            handle: corner.handle,
            startX: x,
            startY: y,
            startRect: { ...cropRect },
          };
          e.preventDefault();
          return;
        }
      }

      const cx = cropRect.x * displayScale;
      const cy = cropRect.y * displayScale;
      const cw = cropRect.w * displayScale;
      const ch = cropRect.h * displayScale;
      if (x >= cx && x <= cx + cw && y >= cy && y <= cy + ch) {
        draggingRef.current = {
          type: 'move',
          startX: x,
          startY: y,
          startRect: { ...cropRect },
        };
        e.preventDefault();
      }
    },
    [cropActive, cropRect, displayScale]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!draggingRef.current) return;
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;

      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const dx = (x - draggingRef.current.startX) / displayScale;
      const dy = (y - draggingRef.current.startY) / displayScale;
      const sr = draggingRef.current.startRect;

      if (draggingRef.current.type === 'move') {
        const newX = Math.max(0, Math.min(originalDims.w - sr.w, sr.x + dx));
        const newY = Math.max(0, Math.min(originalDims.h - sr.h, sr.y + dy));
        setCropRect((prev) => ({
          ...prev,
          x: Math.round(newX),
          y: Math.round(newY),
        }));
      } else if (draggingRef.current.type === 'resize') {
        const handle = draggingRef.current.handle!;
        let { x: nx, y: ny, w: nw, h: nh } = sr;

        if (handle.includes('l')) {
          nx = sr.x + dx;
          nw = sr.w - dx;
        } else if (handle.includes('r')) {
          nw = sr.w + dx;
        }
        if (handle.includes('t')) {
          ny = sr.y + dy;
          nh = sr.h - dy;
        } else if (handle.includes('b')) {
          nh = sr.h + dy;
        }

        if (aspectPreset !== 'free') {
          const ratio = ASPECT_RATIOS[aspectPreset];
          if (ratio) {
            if (handle === 'br' || handle === 'bl') {
              nw = Math.max(20, nw);
              nh = nw / ratio;
            } else if (handle === 'tr' || handle === 'tl') {
              nw = Math.max(20, nw);
              nh = nw / ratio;
              if (handle === 'tl') ny = sr.y + sr.h - nh;
            } else {
              nw = Math.max(20, nw);
              nh = nw / ratio;
            }
          }
        }

        if (nw < 20) {
          nw = 20;
          if (handle.includes('l')) nx = sr.x + sr.w - 20;
        }
        if (nh < 20) {
          nh = 20;
          if (handle.includes('t')) ny = sr.y + sr.h - 20;
        }
        nx = Math.max(0, nx);
        ny = Math.max(0, ny);
        if (nx + nw > originalDims.w) nw = originalDims.w - nx;
        if (ny + nh > originalDims.h) nh = originalDims.h - ny;

        setCropRect({
          x: Math.round(nx),
          y: Math.round(ny),
          w: Math.round(nw),
          h: Math.round(nh),
        });
      }
    },
    [displayScale, originalDims, aspectPreset]
  );

  const handlePointerUp = useCallback(() => {
    draggingRef.current = null;
  }, []);

  // ── Live crop preview ────────────────────────────────────────────────────

  useEffect(() => {
    if (!cropActive || !preview || cropRect.w === 0 || cropRect.h === 0 || !previewCanvasRef.current) {
      const canvas = previewCanvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
      return;
    }

    let cancelled = false;
    const rafId = requestAnimationFrame(() => {
      if (cancelled) return;
      const canvas = previewCanvasRef.current;
      if (!canvas) return;

      const img = new Image();
      img.onload = () => {
        if (cancelled) return;

        const maxPreviewW = 240;
        const previewScale = Math.min(maxPreviewW / cropRect.w, 200 / cropRect.h, 1);
        const drawW = Math.round(cropRect.w * previewScale);
        const drawH = Math.round(cropRect.h * previewScale);

        canvas.width = drawW;
        canvas.height = drawH;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const filterStr = FILTERS[selectedFilter] || '';
        if (filterStr) ctx.filter = filterStr;

        ctx.clearRect(0, 0, drawW, drawH);
        ctx.drawImage(
          img,
          cropRect.x,
          cropRect.y,
          cropRect.w,
          cropRect.h,
          0,
          0,
          drawW,
          drawH
        );
      };
      img.src = preview;
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
    };
  }, [cropActive, preview, cropRect.x, cropRect.y, cropRect.w, cropRect.h, selectedFilter]);

  // ── Cleanup ───────────────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      urlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  // ── Computed output dims label ───────────────────────────────────────────

  const outputDimsLabel = (() => {
    if (outputWidth > 0 && outputHeight > 0) {
      return `${outputWidth} × ${outputHeight} px`;
    }
    if (cropActive && cropRect.w > 0 && cropRect.h > 0) {
      const rad = (totalRotation * Math.PI) / 180;
      const cos = Math.abs(Math.cos(rad));
      const sin = Math.abs(Math.sin(rad));
      const w = Math.round(cropRect.w * cos + cropRect.h * sin);
      const h = Math.round(cropRect.w * sin + cropRect.h * cos);
      return `${w} × ${h} px (auto)`;
    }
    if (originalDims.w > 0) {
      const rad = (totalRotation * Math.PI) / 180;
      const cos = Math.abs(Math.cos(rad));
      const sin = Math.abs(Math.sin(rad));
      const w = Math.round(originalDims.w * cos + originalDims.h * sin);
      const h = Math.round(originalDims.w * sin + originalDims.h * cos);
      return `${w} × ${h} px (auto)`;
    }
    return '—';
  })();

  // ── Common UI: Crop Overlay ──────────────────────────────────────────────

  const activePreview = batchMode ? batchPreviews[0] : preview;

  const cropOverlayJsx = cropActive && activePreview && (
    <>
      <div
        className="absolute border-2 border-white pointer-events-none"
        style={{
          left: cropRect.x * displayScale,
          top: cropRect.y * displayScale,
          width: cropRect.w * displayScale,
          height: cropRect.h * displayScale,
          boxShadow: '0 0 0 9999px rgba(0,0,0,0.4)',
        }}
      >
        {['33.33%', '66.66%'].map((pos) => (
          <div key={pos} className="absolute pointer-events-none" style={{ left: pos, top: 0, bottom: 0, borderLeft: '1px dashed rgba(255,255,255,0.5)' }} />
        ))}
        {['33.33%', '66.66%'].map((pos) => (
          <div key={pos} className="absolute pointer-events-none" style={{ top: pos, left: 0, right: 0, borderTop: '1px dashed rgba(255,255,255,0.5)' }} />
        ))}
      </div>
      {(
        [
          { h: 'tl', sx: cropRect.x * displayScale - 6, sy: cropRect.y * displayScale - 6 },
          { h: 'tr', sx: (cropRect.x + cropRect.w) * displayScale - 6, sy: cropRect.y * displayScale - 6 },
          { h: 'bl', sx: cropRect.x * displayScale - 6, sy: (cropRect.y + cropRect.h) * displayScale - 6 },
          { h: 'br', sx: (cropRect.x + cropRect.w) * displayScale - 6, sy: (cropRect.y + cropRect.h) * displayScale - 6 },
        ] as const
      ).map(({ h, sx, sy }) => (
        <div key={h} className="absolute w-3 h-3 bg-white border border-gray-400 rounded-sm pointer-events-none" style={{ left: sx, top: sy }} />
      ))}
    </>
  );

  // ── Common UI: Controls Tabs ────────────────────────────────────────────

  const controlsTabsJsx = (
    <Tabs defaultValue="transform" className="w-full">
      <TabsList className="w-full">
        <TabsTrigger value="transform" className="flex-1 gap-1">
          <Crop className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Transform</span>
        </TabsTrigger>
        <TabsTrigger value="filter" className="flex-1 gap-1">
          <Palette className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Filter</span>
        </TabsTrigger>
        <TabsTrigger value="resize" className="flex-1 gap-1">
          <Maximize2 className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Resize</span>
        </TabsTrigger>
      </TabsList>

      {/* ── Transform Tab ─────────────────────────────────────────────── */}
      <TabsContent value="transform" className="space-y-4 pt-2">
        {/* Rotation */}
        <div className="space-y-3">
          <Label>Rotation</Label>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => rotateBy(-90)}>
              <RotateCcw className="h-4 w-4 mr-1" />
              90° CCW
            </Button>
            <Button variant="outline" size="sm" onClick={() => rotateBy(90)}>
              <RotateCw className="h-4 w-4 mr-1" />
              90° CW
            </Button>
          </div>
          <div className="flex items-center gap-3">
            <Label htmlFor="custom-angle" className="whitespace-nowrap">
              Custom:
            </Label>
            <Input
              id="custom-angle"
              type="number"
              min={-359}
              max={359}
              value={rotation}
              onChange={(e) => setRotation(Number(e.target.value) % 360)}
              className="w-24"
            />
            <span className="text-sm text-muted-foreground">degrees</span>
          </div>
        </div>

        {/* Straighten */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Compass className="h-4 w-4 text-muted-foreground" />
            <Label>Straighten</Label>
            <span className="ml-auto text-sm font-mono text-muted-foreground">
              {straightenAngle > 0 ? '+' : ''}{straightenAngle}°
            </span>
          </div>
          <Slider
            value={[straightenAngle]}
            onValueChange={(v) => setStraightenAngle(v[0])}
            min={-45}
            max={45}
            step={0.5}
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>-45°</span>
            <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => setStraightenAngle(0)}>
              Reset
            </Button>
            <span>+45°</span>
          </div>
        </div>

        {/* Flip */}
        <div className="space-y-3">
          <Label>Flip</Label>
          <div className="flex gap-2">
            <Button variant={flipH ? 'default' : 'outline'} size="sm" onClick={() => setFlipH(!flipH)}>
              <FlipHorizontal2 className="h-4 w-4 mr-1" />
              Horizontal
            </Button>
            <Button variant={flipV ? 'default' : 'outline'} size="sm" onClick={() => setFlipV(!flipV)}>
              <FlipVertical2 className="h-4 w-4 mr-1" />
              Vertical
            </Button>
          </div>
        </div>

        {/* Crop toggle */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="crop-toggle"
              checked={cropActive}
              onChange={(e) => {
                setCropActive(e.target.checked);
                if (e.target.checked && aspectPreset !== 'free') {
                  recalcCropForAspect(aspectPreset);
                }
              }}
              className="h-4 w-4 rounded border-gray-300"
            />
            <Label htmlFor="crop-toggle">Enable Crop</Label>
          </div>
        </div>

        {/* Aspect Ratio Presets */}
        <AnimatePresence>
          {cropActive && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-3 overflow-hidden"
            >
              <div className="flex items-center gap-2">
                {aspectPreset !== 'free' ? (
                  <Lock className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <Unlock className="h-4 w-4 text-muted-foreground" />
                )}
                <Label>Aspect Ratio</Label>
              </div>
              <div className="flex flex-wrap gap-2">
                {ASPECT_PRESET_LABELS.map(({ value, label }) => (
                  <Button
                    key={value}
                    variant={aspectPreset === value ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => handleAspectChange(value)}
                    className="text-xs px-2.5"
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </TabsContent>

      {/* ── Filter Tab ───────────────────────────────────────────────── */}
      <TabsContent value="filter" className="space-y-4 pt-2">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Palette className="h-4 w-4 text-muted-foreground" />
            <Label>Filter Presets</Label>
          </div>
          <div className="grid grid-cols-5 sm:grid-cols-9 gap-2">
            {FILTER_PRESETS.map(({ key, label }) => (
              <motion.button
                key={key}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setSelectedFilter(key)}
                className={`relative flex flex-col items-center gap-1 p-1 rounded-lg border-2 transition-colors ${
                  selectedFilter === key
                    ? 'border-primary bg-primary/5'
                    : 'border-transparent hover:border-border'
                }`}
              >
                <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-md overflow-hidden bg-muted">
                  {activePreview && (
                    <img
                      src={activePreview}
                      alt={label}
                      className="w-full h-full object-cover"
                      style={{ filter: FILTERS[key] || 'none' }}
                    />
                  )}
                </div>
                <span className="text-[10px] leading-tight text-muted-foreground truncate w-full text-center">
                  {label}
                </span>
                {selectedFilter === key && (
                  <div className="absolute top-0.5 right-0.5">
                    <Check className="h-3 w-3 text-primary" />
                  </div>
                )}
              </motion.button>
            ))}
          </div>
          {selectedFilter !== 'none' && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                Active: {FILTER_PRESETS.find((f) => f.key === selectedFilter)?.label}
              </span>
              <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setSelectedFilter('none')}>
                Remove Filter
              </Button>
            </div>
          )}
        </div>
      </TabsContent>

      {/* ── Resize Tab ───────────────────────────────────────────────── */}
      <TabsContent value="resize" className="space-y-4 pt-2">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Maximize2 className="h-4 w-4 text-muted-foreground" />
            <Label>Output Dimensions</Label>
          </div>
          <p className="text-xs text-muted-foreground">
            Leave empty to use natural dimensions after crop/rotate.
          </p>
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <Label htmlFor="out-width" className="text-xs mb-1">
                Width (px)
              </Label>
              <Input
                id="out-width"
                type="number"
                min={1}
                max={10000}
                placeholder="Auto"
                value={outputWidth || ''}
                onChange={(e) => handleOutputWidthChange(e.target.value)}
              />
            </div>
            <div className="flex items-center pt-5">
              {resizeAspectLock ? (
                <Lock className="h-4 w-4 text-primary cursor-pointer" onClick={() => handleToggleAspectLock(false)} />
              ) : (
                <Unlock className="h-4 w-4 text-muted-foreground cursor-pointer" onClick={() => handleToggleAspectLock(true)} />
              )}
            </div>
            <div className="flex-1">
              <Label htmlFor="out-height" className="text-xs mb-1">
                Height (px)
              </Label>
              <Input
                id="out-height"
                type="number"
                min={1}
                max={10000}
                placeholder="Auto"
                value={outputHeight || ''}
                onChange={(e) => handleOutputHeightChange(e.target.value)}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="aspect-lock"
              checked={resizeAspectLock}
              onCheckedChange={handleToggleAspectLock}
            />
            <Label htmlFor="aspect-lock" className="text-sm">
              Lock aspect ratio
            </Label>
          </div>
          {(outputWidth > 0 || outputHeight > 0) && (
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setOutputWidth(0); setOutputHeight(0); }}>
              Reset to Auto
            </Button>
          )}
        </div>
        <div className="rounded-lg bg-muted/50 p-3 text-sm">
          <span className="text-muted-foreground">Output dimensions: </span>
          <span className="font-medium">{outputDimsLabel}</span>
        </div>
      </TabsContent>
    </Tabs>
  );

  // ── Common UI: Output Format & Quality ────────────────────────────────────

  const outputSettingsJsx = (
    <>
      <div className="space-y-3">
        <Label>Output Format</Label>
        <Select value={outputFormat} onValueChange={(val) => setOutputFormat(val as OutputFormat)}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="jpeg">JPEG (.jpg)</SelectItem>
            <SelectItem value="png">PNG (.png)</SelectItem>
            <SelectItem value="webp">WebP (.webp)</SelectItem>
          </SelectContent>
        </Select>
        {outputFormat === 'png' && (
          <p className="text-xs text-muted-foreground">
            PNG is lossless — quality settings are not applicable.
          </p>
        )}
      </div>

      {outputFormat !== 'png' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Quality</Label>
            <span className="text-sm text-muted-foreground font-mono">{outputQuality}%</span>
          </div>
          <Slider
            value={[outputQuality]}
            onValueChange={(val) => setOutputQuality(val[0])}
            min={10}
            max={100}
            step={5}
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Smaller file</span>
            <span>Better quality</span>
          </div>
        </div>
      )}
    </>
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <ToolLayout
      title="Crop & Rotate Image"
      description="Crop, rotate, filter, and resize your images"
    >
      {/* Batch Mode Toggle */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-muted-foreground" />
              <Label htmlFor="batch-toggle" className="text-sm font-medium">
                Batch Mode
              </Label>
            </div>
            <Switch
              id="batch-toggle"
              checked={batchMode}
              onCheckedChange={(checked) => {
                setBatchMode(checked);
                if (checked) {
                  clearSingle();
                } else {
                  clearBatch();
                }
              }}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {batchMode
              ? 'Upload multiple images and apply the same edits to all.'
              : 'Edit a single image with crop, rotation, filters, and resize.'}
          </p>
        </CardContent>
      </Card>

      <AnimatePresence mode="wait">
        {batchMode ? (
          /* ── BATCH MODE ──────────────────────────────────────────────── */
          <motion.div key="batch" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6">
            {batchFiles.length === 0 ? (
              <FileDropzone
                onFiles={handleBatchFiles}
                accept="image/jpeg,image/png,image/jpg,image/webp"
                multiple={true}
                label="Drop images here or click to upload"
                sublabel="Upload multiple images for batch processing"
              />
            ) : (
              <>
                {/* Batch file list */}
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Layers className="h-4 w-4 text-muted-foreground" />
                        <Label className="text-sm font-medium">
                          {batchFiles.length} image{batchFiles.length > 1 ? 's' : ''} selected
                        </Label>
                      </div>
                      <Button variant="ghost" size="sm" onClick={clearBatch}>
                        <Trash2 className="h-4 w-4 mr-1" />
                        Clear All
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
                      {batchFiles.map((bFile, i) => (
                        <div
                          key={i}
                          className="relative group w-16 h-16 rounded-lg overflow-hidden bg-muted border border-border"
                        >
                          <img
                            src={batchPreviews[i]}
                            alt={bFile.name}
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                            <button
                              onClick={() => {
                                revokeUrl(batchPreviews[i]);
                                setBatchFiles((prev) => prev.filter((_, j) => j !== i));
                                setBatchPreviews((prev) => prev.filter((_, j) => j !== i));
                              }}
                              className="opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <X className="h-4 w-4 text-white" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Preview of first image with crop overlay */}
                {originalDims.w > 0 && (
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <ImageIcon className="h-4 w-4 text-muted-foreground" />
                        <Label className="text-sm font-medium">Preview (1st image)</Label>
                        <span className="text-xs text-muted-foreground">
                          {originalDims.w} × {originalDims.h}px
                        </span>
                      </div>
                      <div
                        ref={containerRef}
                        className="relative mx-auto overflow-hidden bg-muted rounded-lg cursor-crosshair touch-none select-none"
                        style={{
                          width: originalDims.w * displayScale,
                          height: originalDims.h * displayScale,
                        }}
                        onPointerDown={handlePointerDown}
                        onPointerMove={handlePointerMove}
                        onPointerUp={handlePointerUp}
                        onPointerLeave={handlePointerUp}
                      >
                        <img
                          src={batchPreviews[0]}
                          alt="Source"
                          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                          draggable={false}
                        />
                        {cropOverlayJsx}
                      </div>
                      {cropActive && (
                        <div className="flex items-center justify-center gap-4 mt-3 text-sm text-muted-foreground">
                          <span>
                            Crop: {cropRect.w} × {cropRect.h}px
                          </span>
                          <span>
                            Position: ({cropRect.x}, {cropRect.y})
                          </span>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Crop preview */}
                {cropActive && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                    <Card>
                      <CardContent className="p-4">
                        <div className="flex items-center gap-2 mb-3">
                          <ImageIcon className="h-4 w-4 text-muted-foreground" />
                          <Label className="text-sm font-medium">Crop Preview</Label>
                        </div>
                        <div className="flex flex-col items-center">
                          <div className="rounded-lg overflow-hidden border border-border bg-muted/50">
                            <canvas ref={previewCanvasRef} className="block max-w-full" style={{ maxHeight: 200 }} />
                          </div>
                          <p className="mt-2 text-xs text-muted-foreground">Output: {outputDimsLabel}</p>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                )}

                {/* Controls */}
                <Card>
                  <CardContent className="p-6 space-y-6">
                    {controlsTabsJsx}
                    {outputSettingsJsx}
                    <Button
                      className="w-full"
                      size="lg"
                      disabled={batchProcessing || batchFiles.length === 0}
                      onClick={processBatch}
                    >
                      {batchProcessing ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Processing {batchFiles.length} images...
                        </>
                      ) : (
                        <>
                          <Crop className="h-4 w-4 mr-2" />
                          Process All ({batchFiles.length})
                        </>
                      )}
                    </Button>
                  </CardContent>
                </Card>

                {/* Batch Results */}
                {batchResults.length > 0 && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                    <Card className="border-green-200 dark:border-green-900">
                      <CardContent className="p-4 space-y-4">
                        <div className="flex items-center justify-between">
                          <h3 className="font-semibold text-green-700 dark:text-green-400">
                            Batch Complete!
                          </h3>
                          <span className="text-sm text-muted-foreground">
                            {batchResults.length} image{batchResults.length > 1 ? 's' : ''}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-h-96 overflow-y-auto">
                          {batchResults.map((item, i) => (
                            <div key={i} className="rounded-lg overflow-hidden border border-border bg-muted/50">
                              <div className="aspect-square">
                                <img
                                  src={item.url}
                                  alt={item.name}
                                  className="w-full h-full object-cover"
                                />
                              </div>
                              <div className="p-2">
                                <p className="text-xs truncate">{item.name}</p>
                                <p className="text-xs text-muted-foreground">{formatSize(item.blob.size)}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                        <Button className="w-full" onClick={handleBatchDownload}>
                          <Archive className="h-4 w-4 mr-2" />
                          Download All as ZIP
                        </Button>
                      </CardContent>
                    </Card>
                  </motion.div>
                )}
              </>
            )}
          </motion.div>
        ) : (
          /* ── SINGLE IMAGE MODE ────────────────────────────────────────── */
          <motion.div key="single" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6">
            {!file ? (
              <FileDropzone
                onFiles={handleFiles}
                accept="image/jpeg,image/png,image/jpg,image/webp"
                multiple={false}
                label="Drop image here or click to upload"
                sublabel="Supports JPG, PNG, and WebP"
              />
            ) : (
              <>
                {/* File Info */}
                <Card>
                  <CardContent className="p-4 flex items-center gap-4">
                    <div className="h-10 w-10 rounded-lg overflow-hidden bg-muted flex-shrink-0">
                      <img src={preview} alt="Preview" className="h-full w-full object-cover" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{file.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {originalDims.w} × {originalDims.h}px · {formatSize(file.size)}
                      </p>
                    </div>
                    <Button variant="ghost" size="icon" onClick={clearSingle}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </CardContent>
                </Card>

                {/* Image Preview */}
                <Card>
                  <CardContent className="p-4">
                    <div
                      ref={containerRef}
                      className="relative mx-auto overflow-hidden bg-muted rounded-lg cursor-crosshair touch-none select-none"
                      style={{
                        width: originalDims.w * displayScale,
                        height: originalDims.h * displayScale,
                      }}
                      onPointerDown={handlePointerDown}
                      onPointerMove={handlePointerMove}
                      onPointerUp={handlePointerUp}
                      onPointerLeave={handlePointerUp}
                    >
                      <img
                        src={preview}
                        alt="Source"
                        className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                        draggable={false}
                      />
                      {cropOverlayJsx}
                    </div>
                    {cropActive && (
                      <div className="flex items-center justify-center gap-4 mt-3 text-sm text-muted-foreground">
                        <span>
                          Crop: {cropRect.w} × {cropRect.h}px
                        </span>
                        <span>
                          Position: ({cropRect.x}, {cropRect.y})
                        </span>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Live Crop Preview */}
                {cropActive && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 0 }}>
                    <Card>
                      <CardContent className="p-4">
                        <div className="flex items-center gap-2 mb-3">
                          <ImageIcon className="h-4 w-4 text-muted-foreground" />
                          <Label className="text-sm font-medium">Crop Preview</Label>
                        </div>
                        <div className="flex flex-col items-center">
                          <div className="rounded-lg overflow-hidden border border-border bg-muted/50">
                            <canvas ref={previewCanvasRef} className="block max-w-full" style={{ maxHeight: 200 }} />
                          </div>
                          <p className="mt-2 text-xs text-muted-foreground">Output: {outputDimsLabel}</p>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                )}

                {/* Controls */}
                <Card>
                  <CardContent className="p-6 space-y-6">
                    {controlsTabsJsx}
                    {outputSettingsJsx}
                    <Button
                      className="w-full"
                      size="lg"
                      disabled={processing}
                      onClick={applyCropAndRotate}
                    >
                      {processing ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Processing...
                        </>
                      ) : (
                        <>
                          <Crop className="h-4 w-4 mr-2" />
                          Apply Changes
                        </>
                      )}
                    </Button>
                  </CardContent>
                </Card>

                {/* Result */}
                {result && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                    <Card className="border-green-200 dark:border-green-900">
                      <CardContent className="p-4 space-y-4">
                        <div className="flex items-center justify-between">
                          <h3 className="font-semibold text-green-700 dark:text-green-400">
                            Editing Complete!
                          </h3>
                          {resultBlob && (
                            <span className="text-sm text-muted-foreground">
                              {formatSize(resultBlob.size)}
                            </span>
                          )}
                        </div>
                        <div className="rounded-lg overflow-hidden max-h-64 mx-auto">
                          <img
                            src={result}
                            alt="Result"
                            className="max-w-full max-h-64 mx-auto object-contain"
                          />
                        </div>
                        <Button className="w-full" onClick={handleDownload}>
                          <Download className="h-4 w-4 mr-2" />
                          Download Edited Image
                        </Button>
                      </CardContent>
                    </Card>
                  </motion.div>
                )}
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </ToolLayout>
  );
}
