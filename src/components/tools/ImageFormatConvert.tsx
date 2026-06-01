'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  RefreshCw,
  Download,
  Loader2,
  Trash2,
  Plus,
  Archive,
  CheckCircle2,
  XCircle,
  ArrowRightLeft,
  AlertCircle,
  Info,
  ImageIcon,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { ToolLayout } from '@/components/shared/ToolLayout';
import { FileDropzone } from '@/components/shared/FileDropzone';
import { useAppStore } from '@/store';
import { formatSize } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useWorkerTask } from '@/hooks/useWorkerTask';
import { createImageWorker } from '@/lib/worker-factories';
import { WorkerBadge } from '@/components/shared/WorkerBadge';
import { saveAs } from 'file-saver';
import JSZip from 'jszip';

type ImageFormat = 'jpeg' | 'png' | 'webp' | 'bmp';

const FORMAT_INFO: Record<ImageFormat, { label: string; mime: string; ext: string; desc: string; supportsQuality: boolean }> = {
  jpeg: { label: 'JPEG', mime: 'image/jpeg', ext: '.jpg', desc: 'Universal, small files', supportsQuality: true },
  png: { label: 'PNG', mime: 'image/png', ext: '.png', desc: 'Lossless, transparency', supportsQuality: false },
  webp: { label: 'WebP', mime: 'image/webp', ext: '.webp', desc: 'Modern, best compression', supportsQuality: true },
  bmp: { label: 'BMP', mime: 'image/bmp', ext: '.bmp', desc: 'Uncompressed, raw', supportsQuality: false },
};

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp', 'image/bmp', 'image/gif'];

function detectInputFormat(file: File): ImageFormat {
  const type = file.type.toLowerCase();
  if (type === 'image/png') return 'png';
  if (type === 'image/webp') return 'webp';
  if (type === 'image/bmp') return 'bmp';
  return 'jpeg';
}

function fileBaseName(file: File): string {
  return file.name.replace(/\.[^.]+$/, '') || 'image';
}

interface ImageEntry {
  id: string;
  file: File;
  preview: string;
  dims: { w: number; h: number };
  inputFormat: ImageFormat;
  hasTransparency?: boolean;
  status: 'idle' | 'converting' | 'done' | 'error';
  result: { url: string; size: number; blob: Blob } | null;
}

/* ─── Smart Format Suggestions ─── */
function getSmartSuggestion(entry: ImageEntry): { format: ImageFormat; reason: string } | null {
  const { inputFormat, hasTransparency } = entry;

  // If image has transparency and user might convert to JPEG (which drops it)
  // We suggest keeping PNG or WebP
  if (hasTransparency && inputFormat === 'png') {
    return {
      format: 'png',
      reason: 'Image has transparency — converting to JPEG or BMP will remove it. Keep PNG or use WebP.',
    };
  }

  // BMP is huge → suggest WebP or JPEG
  if (inputFormat === 'bmp') {
    return {
      format: 'webp',
      reason: 'BMP files are uncompressed and very large. WebP offers the best compression.',
    };
  }

  // JPEG to PNG — warn about file size increase
  if (inputFormat === 'jpeg') {
    return null; // JPEG is already small, no strong suggestion
  }

  return null;
}

/* ─── Main Component ─── */
export function ImageFormatConvert() {
  const { addRecentFile } = useAppStore();
  const { toast } = useToast();

  // ─── Web Worker for format conversion ───
  const { execute: executeImageTask, isWorkerActive } = useWorkerTask(
    createImageWorker,
    async (payload: any, _taskType: string | undefined, _reportProgress: (pct: number, msg: string) => void) => {
      const { imageData, targetFormat, quality, fillBackground } = payload;
      const mime = FORMAT_INFO[targetFormat].mime;
      const bitmap = await createImageBitmap(new Blob([imageData]));
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width; canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d')!;
      if (fillBackground) { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
      ctx.drawImage(bitmap, 0, 0);
      bitmap.close();
      const q = FORMAT_INFO[targetFormat].supportsQuality ? quality / 100 : undefined;
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mime, q));
      return blob ? { blob: await blob.arrayBuffer(), size: blob.size } : null;
  },
    { timeoutMs: 5 * 60 * 1000 },
  );

  const [images, setImages] = useState<ImageEntry[]>([]);
  const [targetFormat, setTargetFormat] = useState<ImageFormat>('png');
  const [quality, setQuality] = useState<[number]>([90]);
  const [batchProcessing, setBatchProcessing] = useState(false);
  const [batchProgress, setBatchProgress] = useState(0);

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      images.forEach((img) => {
        URL.revokeObjectURL(img.preview);
        if (img.result?.url) URL.revokeObjectURL(img.result.url);
      });
    };
  }, []);

  const addFiles = useCallback(
    (files: File[]) => {
      const validFiles = files.filter((f) => ACCEPTED_TYPES.includes(f.type));
      if (validFiles.length === 0) {
        toast({
          title: 'No valid images',
          description: 'Please upload JPG, PNG, WebP, BMP, or GIF images.',
          variant: 'destructive',
        });
        return;
      }

      const newEntries: ImageEntry[] = validFiles.map((file) => ({
        id: crypto.randomUUID(),
        file,
        preview: URL.createObjectURL(file),
        dims: { w: 0, h: 0 },
        inputFormat: detectInputFormat(file),
        status: 'idle',
        result: null,
      }));

      setImages((prev) => [...prev, ...newEntries]);

      // Load dimensions & transparency
      newEntries.forEach((entry) => {
        const img = new Image();
        img.onload = () => {
          let hasTransparency = false;
          try {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d')!;
            ctx.drawImage(img, 0, 0);
            if (entry.inputFormat === 'png' || entry.inputFormat === 'webp') {
              const fullData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
              const positions = [
                0,
                (canvas.width - 1) * 4,
                (canvas.height - 1) * canvas.width * 4,
                ((canvas.height - 1) * canvas.width + canvas.width - 1) * 4,
                Math.floor(canvas.height / 2) * canvas.width * 4 + Math.floor(canvas.width / 2) * 4,
              ];
              for (const pos of positions) {
                if (fullData[pos + 3] < 255) {
                  hasTransparency = true;
                  break;
                }
              }
            }
          } catch {
            hasTransparency = false;
          }

          setImages((prev) =>
            prev.map((e) =>
              e.id === entry.id
                ? { ...e, dims: { w: img.width, h: img.height }, hasTransparency }
                : e,
            ),
          );
        };
        img.src = entry.preview;
      });
    },
    [toast],
  );

  const convertSingle = useCallback(
    async (entryId: string) => {
      const entry = images.find((e) => e.id === entryId);
      if (!entry) return;

      setImages((prev) =>
        prev.map((e) => (e.id === entryId ? { ...e, status: 'converting', result: null } : e)),
      );

      try {
        // Use Web Worker for off-thread format conversion
        const imageData = await entry.file.arrayBuffer();
        const workerResult = await executeImageTask(
          {
            imageData,
            targetFormat,
            quality: quality[0],
            fillBackground: targetFormat === 'jpeg' || targetFormat === 'bmp',
          },
          'convert-image',
        );

        if (!workerResult) throw new Error('Worker returned no result');

        const blob = new Blob([workerResult.blob], { type: FORMAT_INFO[targetFormat].mime });
        const url = URL.createObjectURL(blob);

        setImages((prev) =>
          prev.map((e) =>
            e.id === entryId ? { ...e, status: 'done', result: { url, size: blob.size, blob } } : e,
          ),
        );

        const sizeChange = blob.size - entry.file.size;
        const pct = Math.round((Math.abs(sizeChange) / entry.file.size) * 100);

        toast({
          title: 'Converted!',
          description: `${entry.file.name} → ${FORMAT_INFO[targetFormat].ext.slice(1)} (${sizeChange < 0 ? `-${pct}%` : `+${pct}%`}, ${formatSize(blob.size)})`,
        });
      } catch {
        setImages((prev) =>
          prev.map((e) => (e.id === entryId ? { ...e, status: 'error' } : e)),
        );
        toast({
          title: 'Conversion failed',
          description: `Could not convert ${entry.file.name}. Try a different format.`,
          variant: 'destructive',
        });
      }
    },
    [images, targetFormat, quality, toast, executeImageTask],
  );

  const convertAll = useCallback(async () => {
    const pending = images.filter((e) => e.status !== 'done');
    if (pending.length === 0) return;

    setBatchProcessing(true);
    setBatchProgress(0);

    for (let i = 0; i < pending.length; i++) {
      const entry = pending[i];

      setImages((prev) =>
        prev.map((e) => (e.id === entry.id ? { ...e, status: 'converting', result: null } : e)),
      );

      try {
        // Use Web Worker for off-thread format conversion
        const imageData = await entry.file.arrayBuffer();
        const workerResult = await executeImageTask(
          {
            imageData,
            targetFormat,
            quality: quality[0],
            fillBackground: targetFormat === 'jpeg' || targetFormat === 'bmp',
          },
          'convert-image',
        );

        if (!workerResult) throw new Error('Worker returned no result');

        const blob = new Blob([workerResult.blob], { type: FORMAT_INFO[targetFormat].mime });
        const url = URL.createObjectURL(blob);

        setImages((prev) =>
          prev.map((e) =>
            e.id === entry.id ? { ...e, status: 'done', result: { url, size: blob.size, blob } } : e,
          ),
        );
      } catch {
        setImages((prev) =>
          prev.map((e) => (e.id === entry.id ? { ...e, status: 'error' } : e)),
        );
      }

      setBatchProgress(Math.round(((i + 1) / pending.length) * 100));
    }

    setBatchProcessing(false);
    toast({
      title: 'Batch conversion complete!',
      description: `${pending.length} images converted to ${FORMAT_INFO[targetFormat].label}`,
    });
  }, [images, targetFormat, quality, toast, executeImageTask]);

  const downloadSingle = useCallback(
    (entry: ImageEntry) => {
      if (!entry.result) return;
      const baseName = fileBaseName(entry.file);
      const fileName = `${baseName}${FORMAT_INFO[targetFormat].ext}`;
      saveAs(entry.result.url, fileName);
      addRecentFile({
        id: crypto.randomUUID(),
        name: fileName,
        type: FORMAT_INFO[targetFormat].mime,
        tool: 'image-format-convert',
        size: formatSize(entry.result.size),
        timestamp: Date.now(),
      });
    },
    [targetFormat, addRecentFile],
  );

  const downloadAllAsZip = useCallback(async () => {
    const completed = images.filter((e) => e.status === 'done' && e.result);
    if (completed.length === 0) return;

    try {
      const zip = new JSZip();
      for (const entry of completed) {
        if (!entry.result) continue;
        const baseName = fileBaseName(entry.file);
        zip.file(`${baseName}${FORMAT_INFO[targetFormat].ext}`, entry.result.blob);
      }

      const blob = await zip.generateAsync({ type: 'blob' });
      saveAs(blob, `converted-${FORMAT_INFO[targetFormat].ext.slice(1)}-images.zip`);

      toast({
        title: 'ZIP downloaded',
        description: `${completed.length} images saved as ZIP.`,
      });
    } catch {
      toast({
        title: 'ZIP failed',
        description: 'Could not create ZIP. Please try again.',
        variant: 'destructive',
      });
    }
  }, [images, targetFormat, toast]);

  const removeImage = useCallback((entryId: string) => {
    setImages((prev) => {
      const entry = prev.find((e) => e.id === entryId);
      if (entry) {
        URL.revokeObjectURL(entry.preview);
        if (entry.result?.url) URL.revokeObjectURL(entry.result.url);
      }
      return prev.filter((e) => e.id !== entryId);
    });
  }, []);

  const clearAll = useCallback(() => {
    images.forEach((img) => {
      URL.revokeObjectURL(img.preview);
      if (img.result?.url) URL.revokeObjectURL(img.result.url);
    });
    setImages([]);
    setBatchProgress(0);
  }, []);

  // Stats
  const hasImages = images.length > 0;
  const completedCount = images.filter((e) => e.status === 'done').length;
  const totalInputSize = images.reduce((sum, e) => sum + e.file.size, 0);
  const totalOutputSize = images
    .filter((e) => e.result)
    .reduce((sum, e) => sum + (e.result?.size ?? 0), 0);
  const savingsPercent = totalInputSize > 0 && totalOutputSize > 0
    ? Math.round(((totalInputSize - totalOutputSize) / totalInputSize) * 100)
    : 0;

  // Smart suggestion for first image
  const firstSuggestion = images.length > 0 ? getSmartSuggestion(images[0]) : null;

  return (
    <ToolLayout
      title="Format Convert"
      description="Convert images between JPG, PNG, WebP, and BMP instantly"
      toolId="image-format-convert"
    >
      {!hasImages ? (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <FileDropzone
            onFiles={addFiles}
            accept="image/jpeg,image/png,image/jpg,image/webp,image/bmp,image/gif"
            multiple={true}
            label="Drop images here or click to upload"
            sublabel="Supports JPG, PNG, WebP, BMP — upload multiple for batch conversion"
            icon="image"
          />
        </motion.div>
      ) : (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
          {/* ─── Conversion Settings ─── */}
          <Card>
            <CardContent className="p-6 space-y-5">
              {/* Target Format Selector */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Convert To</Label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {(Object.keys(FORMAT_INFO) as ImageFormat[]).map((fmt) => {
                    const info = FORMAT_INFO[fmt];
                    const isSource = images.some((e) => e.inputFormat === fmt);
                    return (
                      <Tooltip key={fmt}>
                        <TooltipTrigger asChild>
                          <button
                            className={`flex flex-col items-center gap-1 p-3 rounded-xl border-2 transition-all cursor-pointer ${
                              targetFormat === fmt
                                ? 'border-primary bg-primary/5 shadow-sm'
                                : 'border-muted hover:border-muted-foreground/30'
                            } ${isSource ? 'ring-2 ring-amber-400/30' : ''}`}
                            onClick={() => setTargetFormat(fmt)}
                          >
                            <div className="flex items-center gap-1.5">
                              <ArrowRightLeft className={`h-3.5 w-3.5 ${targetFormat === fmt ? 'text-primary' : 'text-muted-foreground'}`} />
                              <span className={`text-sm font-semibold ${targetFormat === fmt ? 'text-primary' : ''}`}>
                                {info.label}
                              </span>
                            </div>
                            <span className="text-[10px] text-muted-foreground">{info.ext}</span>
                            {isSource && (
                              <Badge variant="secondary" className="text-[8px] px-1 h-3 bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400">
                                Source
                              </Badge>
                            )}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">
                          <p className="font-medium">{info.label} ({info.ext})</p>
                          <p className="text-[10px]">{info.desc}</p>
                          {info.supportsQuality && <p className="text-[10px]">Supports quality adjustment</p>}
                          {!info.supportsQuality && <p className="text-[10px]">Lossless — no quality control</p>}
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                </div>
                {images.some((e) => e.inputFormat === targetFormat) && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                    <AlertCircle className="h-3.5 w-3.5" />
                    Some images are already in {FORMAT_INFO[targetFormat].label} format — they will be re-encoded.
                  </p>
                )}
              </div>

              {/* Smart Suggestion */}
              {firstSuggestion && firstSuggestion.format !== targetFormat && (
                <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-2">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 text-xs font-medium hover:bg-amber-100 dark:hover:bg-amber-900 transition-colors cursor-pointer"
                    onClick={() => setTargetFormat(firstSuggestion.format)}
                  >
                    <Info className="h-3.5 w-3.5" />
                    Smart Suggestion: Use {FORMAT_INFO[firstSuggestion.format].label}
                    <span className="text-[10px] opacity-70">— click to apply</span>
                  </button>
                  <span className="text-xs text-muted-foreground">{firstSuggestion.reason}</span>
                </motion.div>
              )}

              {/* Transparency Warning */}
              {images.some((e) => e.hasTransparency) &&
                (targetFormat === 'jpeg' || targetFormat === 'bmp') && (
                <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}>
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800">
                    <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                    <div className="text-xs text-red-700 dark:text-red-300">
                      <p className="font-medium">Transparency will be lost!</p>
                      <p className="mt-0.5">
                        {targetFormat === 'jpeg'
                          ? 'JPEG does not support transparency. Transparent areas will be replaced with white background.'
                          : 'BMP does not support transparency. Transparent areas will be replaced with white background.'}
                      </p>
                      <button
                        type="button"
                        className="mt-1.5 text-xs font-medium underline underline-offset-2 hover:text-red-900 dark:hover:text-red-200"
                        onClick={() => setTargetFormat('png')}
                      >
                        Switch to PNG to preserve transparency →
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Quality Slider (for JPEG & WebP) */}
              {FORMAT_INFO[targetFormat].supportsQuality && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Quality</Label>
                    <Badge variant="secondary" className="font-mono">{quality[0]}%</Badge>
                  </div>
                  <Slider
                    value={quality}
                    onValueChange={(v) => setQuality(v as [number])}
                    min={10}
                    max={100}
                    step={5}
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Small file</span>
                    <span>Best quality</span>
                  </div>
                </div>
              )}

              {/* Background for lossy formats */}
              {(targetFormat === 'jpeg' || targetFormat === 'bmp') && (
                <div className="p-3 rounded-lg bg-muted/50 border">
                  <p className="text-xs text-muted-foreground">
                    🎨 Transparent areas will be filled with <strong>white background</strong> during conversion.
                  </p>
                </div>
              )}

              {/* Add More / Clear */}
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = 'image/jpeg,image/png,image/jpg,image/webp,image/bmp,image/gif';
                    input.multiple = true;
                    input.onchange = (e) => {
                      const files = Array.from((e.target as HTMLInputElement).files || []);
                      if (files.length > 0) addFiles(files);
                    };
                    input.click();
                  }}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add More
                </Button>
                <Button variant="outline" onClick={clearAll}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Clear All
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* ─── Batch Progress ─── */}
          {batchProcessing && (
            <Card>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Converting images...
                  </span>
                  <span className="font-medium">{batchProgress}%</span>
                </div>
                <Progress value={batchProgress} />
              </CardContent>
            </Card>
          )}

          {/* ─── Conversion Summary ─── */}
          {completedCount > 0 && (
            <Card className="border-green-200 dark:border-green-900">
              <CardContent className="p-4">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                    <div>
                      <p className="text-sm font-medium text-green-700 dark:text-green-400">
                        {completedCount} of {images.length} converted to {FORMAT_INFO[targetFormat].label}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-muted-foreground">
                          Total: {formatSize(totalInputSize)} → {formatSize(totalOutputSize)}
                        </span>
                        {savingsPercent !== 0 && (
                          <Badge
                            variant="secondary"
                            className={`text-[10px] ${
                              savingsPercent > 0
                                ? 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400'
                                : 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400'
                            }`}
                          >
                            {savingsPercent > 0 ? `↓ ${savingsPercent}% smaller` : `↑ ${Math.abs(savingsPercent)}% larger`}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <Button size="sm" onClick={downloadAllAsZip} disabled={batchProcessing}>
                    <Archive className="h-4 w-4 mr-1.5" />
                    Download ZIP
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ─── Image List ─── */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium flex items-center gap-2">
                  <ImageIcon className="h-4 w-4" />
                  Images ({images.length})
                  <WorkerBadge active={isWorkerActive} />
                </h3>
                {images.some((e) => e.status === 'idle') && !batchProcessing && (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="gap-1.5"
                      onClick={convertAll}
                      disabled={batchProcessing}
                    >
                      <Zap className="h-3.5 w-3.5" />
                      Convert All
                    </Button>
                  </div>
                )}
              </div>

              <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1 custom-scrollbar">
                <AnimatePresence>
                  {images.map((entry) => {
                    const inputInfo = FORMAT_INFO[entry.inputFormat];
                    const outputInfo = FORMAT_INFO[targetFormat];
                    const isConvertingToSame = entry.inputFormat === targetFormat;

                    return (
                      <motion.div
                        key={entry.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        className="flex items-center gap-3 p-2.5 rounded-xl border bg-card hover:bg-muted/30 transition-colors"
                      >
                        {/* Thumbnail */}
                        <div className="relative h-14 w-14 rounded-lg overflow-hidden bg-muted shrink-0 border">
                          <img
                            src={entry.preview}
                            alt={entry.file.name}
                            className="h-full w-full object-cover"
                          />
                          {/* Status overlay */}
                          {entry.status === 'done' && (
                            <div className="absolute inset-0 bg-green-500/20 flex items-center justify-center">
                              <CheckCircle2 className="h-5 w-5 text-green-600" />
                            </div>
                          )}
                          {entry.status === 'error' && (
                            <div className="absolute inset-0 bg-red-500/20 flex items-center justify-center">
                              <XCircle className="h-5 w-5 text-red-600" />
                            </div>
                          )}
                          {entry.status === 'converting' && (
                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                              <Loader2 className="h-5 w-5 text-white animate-spin" />
                            </div>
                          )}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{entry.file.name}</p>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                              {inputInfo.label}
                            </Badge>
                            <ArrowRightLeft className="h-3 w-3 text-muted-foreground" />
                            <Badge
                              variant={isConvertingToSame ? 'secondary' : 'default'}
                              className="text-[10px] px-1.5 py-0 h-4"
                            >
                              {outputInfo.label}
                            </Badge>
                            {entry.dims.w > 0 && (
                              <span className="text-[10px] text-muted-foreground">
                                {entry.dims.w}×{entry.dims.h}
                              </span>
                            )}
                            {entry.hasTransparency && (
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400">
                                Alpha
                              </Badge>
                            )}
                          </div>

                          {/* Size comparison */}
                          {entry.status === 'done' && entry.result && (
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-xs text-muted-foreground">
                                {formatSize(entry.file.size)}
                              </span>
                              <span className="text-xs">→</span>
                              <span className={`text-xs font-medium ${
                                entry.result.size < entry.file.size ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                              }`}>
                                {formatSize(entry.result.size)}
                              </span>
                              <span className={`text-[10px] ${
                                entry.result.size < entry.file.size ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                              }`}>
                                ({entry.result.size < entry.file.size ? '↓' : '↑'}{Math.abs(Math.round(((entry.result.size - entry.file.size) / entry.file.size) * 100))}%)
                              </span>
                            </div>
                          )}
                          {entry.status === 'idle' && (
                            <p className="text-xs text-muted-foreground mt-1">{formatSize(entry.file.size)}</p>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1 shrink-0">
                          {entry.status === 'done' && (
                            <Button size="icon" variant="ghost" onClick={() => downloadSingle(entry)}>
                              <Download className="h-4 w-4" />
                            </Button>
                          )}
                          {entry.status === 'idle' && !batchProcessing && (
                            <Button size="sm" variant="outline" onClick={() => convertSingle(entry.id)}>
                              <RefreshCw className="h-3.5 w-3.5 mr-1" />
                              Convert
                            </Button>
                          )}
                          <Button size="icon" variant="ghost" onClick={() => removeImage(entry.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            </CardContent>
          </Card>

          {/* ─── Format Reference ─── */}
          <Card>
            <CardContent className="p-4">
              <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                <Info className="h-4 w-4" />
                Format Quick Reference
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {(Object.keys(FORMAT_INFO) as ImageFormat[]).map((fmt) => {
                  const info = FORMAT_INFO[fmt];
                  return (
                    <div
                      key={fmt}
                      className={`p-3 rounded-lg border text-center transition-colors ${
                        targetFormat === fmt
                          ? 'border-primary bg-primary/5'
                          : 'border-muted'
                      }`}
                    >
                      <p className="text-sm font-semibold">{info.label}</p>
                      <p className="text-[10px] text-muted-foreground">{info.ext}</p>
                      <p className="text-xs text-muted-foreground mt-1">{info.desc}</p>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {info.supportsQuality ? '🎨 Quality slider' : '🔒 Lossless'}
                      </p>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </ToolLayout>
  );
}
