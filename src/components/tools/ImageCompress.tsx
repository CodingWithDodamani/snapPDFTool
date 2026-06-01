'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ImageMinus,
  Download,
  Loader2,
  Trash2,
  FileArchive,
  CheckCircle2,
  AlertCircle,
  Plus,
  X,
  Target,
  Lightbulb,
  Globe,
  Mail,
  Printer,
  Share2,
  MessageCircle,
  Settings2,
  Info,
  GripVertical,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
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
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
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

type OutputFormat = 'jpeg' | 'png' | 'webp';

const MIME_MAP: Record<OutputFormat, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

const EXT_MAP: Record<OutputFormat, string> = {
  jpeg: '.jpg',
  png: '.png',
  webp: '.webp',
};

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'];

function detectFormat(file: File): OutputFormat {
  if (file.type === 'image/png') return 'png';
  if (file.type === 'image/webp') return 'webp';
  return 'jpeg';
}

function fileBaseName(file: File): string {
  const name = file.name.replace(/\.[^.]+$/, '');
  return name || 'image';
}

interface ImageEntry {
  id: string;
  file: File;
  preview: string;
  dims: { w: number; h: number };
  inputFormat: OutputFormat;
  estimatedSize: string;
  status: 'idle' | 'compressing' | 'done' | 'error';
  result: { url: string; size: number; blob: Blob } | null;
  hasTransparency?: boolean;
}

type CompressMode = 'quality' | 'targetSize';

const TARGET_PRESETS = [
  { label: '20 KB (Govt Form)', value: 20 },
  { label: '50 KB (Passport)', value: 50 },
  { label: '100 KB (Signature)', value: 100 },
  { label: '200 KB', value: 200 },
  { label: '500 KB', value: 500 },
];

/* ─── Compression Profiles ─── */
interface CompressionProfile {
  id: string;
  label: string;
  quality: number;
  format: OutputFormat;
  icon: React.ReactNode;
  description: string;
}

const COMPRESSION_PROFILES: CompressionProfile[] = [
  { id: 'web', label: 'Web', quality: 75, format: 'jpeg', icon: <Globe className="h-3.5 w-3.5" />, description: 'Optimized for websites' },
  { id: 'email', label: 'Email', quality: 60, format: 'jpeg', icon: <Mail className="h-3.5 w-3.5" />, description: 'Small for email attachments' },
  { id: 'print', label: 'Print', quality: 95, format: 'png', icon: <Printer className="h-3.5 w-3.5" />, description: 'High quality for printing' },
  { id: 'social', label: 'Social', quality: 80, format: 'jpeg', icon: <Share2 className="h-3.5 w-3.5" />, description: 'Balanced for Instagram/Facebook' },
  { id: 'whatsapp', label: 'WhatsApp', quality: 70, format: 'jpeg', icon: <MessageCircle className="h-3.5 w-3.5" />, description: 'Optimized for WhatsApp sharing' },
];

/* ─── Smart Format Suggestion ─── */
interface FormatSuggestion {
  format: OutputFormat;
  message: string;
  reason: string;
}

function getFormatSuggestion(entry: ImageEntry): FormatSuggestion | null {
  const { inputFormat, hasTransparency, file } = entry;

  // PNG with transparency → suggest PNG or WebP
  if (inputFormat === 'png' && hasTransparency) {
    return {
      format: 'png',
      message: 'PNG recommended',
      reason: 'Image has transparency — PNG or WebP preserves alpha channel',
    };
  }

  // JPEG → suggest JPEG
  if (inputFormat === 'jpeg') {
    return null; // Already the default for JPEG
  }

  // Large file (>2MB) → suggest WebP
  if (file.size > 2 * 1024 * 1024) {
    return {
      format: 'webp',
      message: 'WebP recommended',
      reason: 'Large file — WebP offers better compression at similar quality',
    };
  }

  return null;
}

/* ─── Before/After Slider Component ─── */
function BeforeAfterSlider({
  originalSrc,
  compressedSrc,
  label,
}: {
  originalSrc: string;
  compressedSrc: string;
  label: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [sliderPos, setSliderPos] = useState(50);
  const isDragging = useRef(false);

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
      const pct = (x / rect.width) * 100;
      setSliderPos(pct);
    },
    []
  );

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    isDragging.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    handlePointerMove(e);
  }, [handlePointerMove]);

  const handlePointerUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">Before / After Comparison</Label>
      <div
        ref={containerRef}
        className="relative w-full overflow-hidden rounded-xl border bg-muted cursor-col-resize select-none"
        style={{ aspectRatio: '16/10' }}
        onPointerMove={handlePointerMove}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
      >
        {/* Compressed (bottom layer — full width) */}
        <img
          src={compressedSrc}
          alt="Compressed"
          className="absolute inset-0 w-full h-full object-contain"
          draggable={false}
        />

        {/* Original (top layer — clipped from left) */}
        <div
          className="absolute inset-0 overflow-hidden"
          style={{ clipPath: `inset(0 ${100 - sliderPos}% 0 0)` }}
        >
          <img
            src={originalSrc}
            alt="Original"
            className="absolute inset-0 w-full h-full object-contain"
            draggable={false}
          />
        </div>

        {/* Slider handle line */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_8px_rgba(0,0,0,0.5)] pointer-events-none z-10"
          style={{ left: `${sliderPos}%` }}
        >
          {/* Handle circle */}
          <div className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center w-8 h-8 rounded-full bg-white shadow-lg border border-gray-200">
            <GripVertical className="h-4 w-4 text-gray-600" />
          </div>
        </div>

        {/* Labels */}
        <div className="absolute top-2 left-2 z-20 pointer-events-none">
          <Badge variant="secondary" className="text-[10px] bg-black/60 text-white border-0">
            Before
          </Badge>
        </div>
        <div className="absolute top-2 right-2 z-20 pointer-events-none">
          <Badge variant="secondary" className="text-[10px] bg-black/60 text-white border-0">
            After
          </Badge>
        </div>
      </div>
      <p className="text-xs text-muted-foreground text-center">
        Drag the slider to compare original vs compressed — <span className="font-medium">{label}</span>
      </p>
    </div>
  );
}

/* ─── Main Component ─── */
export function ImageCompress() {
  const { addRecentFile } = useAppStore();
  const { toast } = useToast();

  // ─── Web Worker for image compression (target-size mode) ───
  const { execute: executeImageTask, isWorkerActive } = useWorkerTask(
    createImageWorker,
    // Main-thread fallback — uses canvas-based compression
    async (payload: any, _taskType: string | undefined, _reportProgress: (pct: number, msg: string) => void) => {
      // For compress-image fallback: just return a canvas-compressed blob
      const { imageData, targetKB, format, quality } = payload;
      const mime = MIME_MAP[format === 'png' ? 'jpeg' : format];
      const bitmap = await createImageBitmap(new Blob([imageData]));
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width; canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, 0, 0);
      bitmap.close();
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mime, quality / 100));
      return blob ? { blob: await blob.arrayBuffer(), finalWidth: canvas.width, finalHeight: canvas.height, finalSize: blob.size } : null;
  },
    { timeoutMs: 5 * 60 * 1000 },
  );

  const [images, setImages] = useState<ImageEntry[]>([]);
  const [quality, setQuality] = useState<[number]>([75]);
  const [outputFormat, setOutputFormat] = useState<OutputFormat>('jpeg');
  const [compressMode, setCompressMode] = useState<CompressMode>('quality');
  const [targetKB, setTargetKB] = useState<number>(100);
  const [batchProcessing, setBatchProcessing] = useState(false);
  const [batchProgress, setBatchProgress] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const estimationTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  /* ─── P2 State ─── */
  const [activeProfile, setActiveProfile] = useState<string>('custom');
  const [stripExif, setStripExif] = useState(true);

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      images.forEach((img) => {
        URL.revokeObjectURL(img.preview);
        if (img.result?.url) URL.revokeObjectURL(img.result.url);
      });
      estimationTimersRef.current.forEach((t) => clearTimeout(t));
    };
  }, []);

  const addFiles = useCallback(
    (files: File[]) => {
      const validFiles = files.filter((f) => ACCEPTED_TYPES.includes(f.type));
      if (validFiles.length === 0) {
        toast({
          title: 'No valid images',
          description: 'Please upload JPG, PNG, or WebP images.',
          variant: 'destructive',
        });
        return;
      }

      const newEntries: ImageEntry[] = validFiles.map((file) => ({
        id: crypto.randomUUID(),
        file,
        preview: URL.createObjectURL(file),
        dims: { w: 0, h: 0 },
        inputFormat: detectFormat(file),
        estimatedSize: '',
        status: 'idle',
        result: null,
      }));

      setImages((prev) => {
        if (prev.length === 0) {
          setOutputFormat(newEntries[0].inputFormat);
        }
        return [...prev, ...newEntries];
      });

      // Load dimensions and check transparency for each new entry
      newEntries.forEach((entry) => {
        const img = new Image();
        img.onload = () => {
          // Check for transparency
          let hasTransparency = false;
          try {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d')!;
            ctx.drawImage(img, 0, 0);
            const data = ctx.getImageData(0, 0, 1, 1); // Sample a pixel
            // Quick check: if PNG, we'll check a few pixels
            if (entry.inputFormat === 'png') {
              const fullData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
              // Check corners and center for alpha < 255
              const positions = [
                0, // top-left
                (canvas.width - 1) * 4, // top-right
                (canvas.height - 1) * canvas.width * 4, // bottom-left
                ((canvas.height - 1) * canvas.width + canvas.width - 1) * 4, // bottom-right
                Math.floor(canvas.height / 2) * canvas.width * 4 + Math.floor(canvas.width / 2) * 4, // center
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
                : e
            )
          );
        };
        img.src = entry.preview;
      });
    },
    [toast]
  );

  // Real-time size estimation (debounced per image)
  useEffect(() => {
    if (images.length === 0) return;

    estimationTimersRef.current.forEach((t) => clearTimeout(t));
    estimationTimersRef.current.clear();

    images.forEach((entry) => {
      if (!entry.preview || entry.dims.w === 0) return;

      const timer = setTimeout(async () => {
        try {
          const imageEl = await new Promise<HTMLImageElement>((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = entry.preview;
          });

          const canvas = document.createElement('canvas');
          canvas.width = imageEl.width;
          canvas.height = imageEl.height;
          const ctx = canvas.getContext('2d')!;
          ctx.drawImage(imageEl, 0, 0);

          const mime = MIME_MAP[outputFormat];
          const q = outputFormat === 'png' ? undefined : quality[0] / 100;

          const blob = await new Promise<Blob | null>((resolve) => {
            canvas.toBlob(resolve, mime, q);
          });

          setImages((prev) =>
            prev.map((e) =>
              e.id === entry.id
                ? { ...e, estimatedSize: blob ? formatSize(blob.size) : '--' }
                : e
            )
          );
        } catch {
          setImages((prev) =>
            prev.map((e) => (e.id === entry.id ? { ...e, estimatedSize: '--' } : e))
          );
        }
      }, 300);

      estimationTimersRef.current.set(entry.id, timer);
    });

    return () => {
      estimationTimersRef.current.forEach((t) => clearTimeout(t));
    };
  }, [images.map((i) => i.preview).join(','), quality, outputFormat, images.length]);

  /**
   * Binary-search JPEG quality to hit a target file size.
   * Falls back to dimension reduction if quality alone isn't enough.
   */
  const compressToTargetSize = useCallback(
    async (entry: ImageEntry): Promise<Blob | null> => {
      const effectiveFormat = outputFormat === 'png' ? 'jpeg' : outputFormat;

      // Try Web Worker first for heavy binary-search compression
      try {
        const imageData = await entry.file.arrayBuffer();
        const workerResult = await executeImageTask(
          { imageData, targetKB, format: effectiveFormat, quality: quality[0] },
          'compress-image',
        );
        if (workerResult) {
          const mime = MIME_MAP[effectiveFormat];
          return new Blob([workerResult.blob], { type: mime });
        }
      } catch {
        // Worker failed — fall through to main-thread canvas compression
      }

      // ── Main-thread fallback ──
      const targetBytes = targetKB * 1024;
      const mime = MIME_MAP[effectiveFormat];

      const imageEl = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = entry.preview;
      });

      if (entry.file.size <= targetBytes) {
        const canvas = document.createElement('canvas');
        canvas.width = imageEl.width; canvas.height = imageEl.height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(imageEl, 0, 0);
        return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mime, 0.92));
      }

      let lo = 0.05; let hi = 0.95;
      let bestBlob: Blob | null = null; let bestDiff = Infinity;
      for (let i = 0; i < 10; i++) {
        const mid = Math.round((lo + hi) * 100) / 100;
        const canvas = document.createElement('canvas');
        canvas.width = imageEl.width; canvas.height = imageEl.height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(imageEl, 0, 0);
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mime, mid));
        if (blob) {
          const diff = Math.abs(blob.size - targetBytes);
          if (diff < bestDiff) { bestDiff = diff; bestBlob = blob; }
          if (blob.size <= targetBytes) { lo = mid + 0.05; } else { hi = mid - 0.05; }
        } else { hi = mid - 0.05; }
      }
      if (bestBlob && bestBlob.size > targetBytes) {
        for (let scale = 0.9; scale >= 0.3; scale -= 0.1) {
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(imageEl.width * scale); canvas.height = Math.round(imageEl.height * scale);
          const ctx = canvas.getContext('2d')!;
          ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(imageEl, 0, 0, canvas.width, canvas.height);
          const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mime, 0.5));
          if (blob && blob.size <= targetBytes) {
            let qLo = 0.5; let qHi = 0.95; let dimBestBlob = blob;
            for (let j = 0; j < 5; j++) {
              const qMid = Math.round((qLo + qHi) * 100) / 100;
              const c2 = document.createElement('canvas');
              c2.width = canvas.width; c2.height = canvas.height;
              const ctx2 = c2.getContext('2d')!;
              ctx2.drawImage(imageEl, 0, 0, c2.width, c2.height);
              const b2 = await new Promise<Blob | null>((resolve) => c2.toBlob(resolve, mime, qMid));
              if (b2 && b2.size <= targetBytes) { dimBestBlob = b2; qLo = qMid + 0.05; } else { qHi = qMid - 0.05; }
            }
            return dimBestBlob;
          }
        }
        return bestBlob;
      }
      return bestBlob;
    },
    [targetKB, outputFormat, quality, executeImageTask]
  );

  const compressSingle = useCallback(
    async (entryId: string) => {
      setImages((prev) =>
        prev.map((e) => (e.id === entryId ? { ...e, status: 'compressing', result: null } : e))
      );

      const entry = images.find((e) => e.id === entryId);
      if (!entry) return;

      try {
        let blob: Blob | null;

        if (compressMode === 'targetSize') {
          blob = await compressToTargetSize(entry);
        } else {
          const imageEl = await new Promise<HTMLImageElement>((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = entry.preview;
          });

          const canvas = document.createElement('canvas');
          canvas.width = imageEl.width;
          canvas.height = imageEl.height;
          const ctx = canvas.getContext('2d')!;
          ctx.drawImage(imageEl, 0, 0);

          const mime = MIME_MAP[outputFormat];
          const q = outputFormat === 'png' ? undefined : quality[0] / 100;

          blob = await new Promise<Blob | null>((resolve) => {
            canvas.toBlob(resolve, mime, q);
          });
        }

        if (!blob) throw new Error('Failed to create blob');

        const url = URL.createObjectURL(blob);

        setImages((prev) =>
          prev.map((e) =>
            e.id === entryId
              ? { ...e, status: 'done', result: { url, size: blob.size, blob } }
              : e
          )
        );

        const reduction = Math.round(((entry.file.size - blob.size) / entry.file.size) * 100);
        const exifNote = stripExif ? ' (EXIF stripped)' : ' (EXIF stripped by canvas)';
        toast({
          title: 'Image compressed',
          description: `${entry.file.name} — ${formatSize(blob.size)} (${reduction > 0 ? `-${reduction}%` : `+${Math.abs(reduction)}%`})${exifNote}`,
        });
      } catch {
        setImages((prev) =>
          prev.map((e) => (e.id === entryId ? { ...e, status: 'error' } : e))
        );
        toast({
          title: 'Compression failed',
          description: `Could not compress ${entry.file.name}. Please try again.`,
          variant: 'destructive',
        });
      }
    },
    [images, outputFormat, quality, compressMode, compressToTargetSize, toast, stripExif]
  );

  const compressAll = useCallback(async () => {
    const pending = images.filter((e) => e.status !== 'done');
    if (pending.length === 0) return;

    setBatchProcessing(true);
    setBatchProgress(0);

    for (let i = 0; i < pending.length; i++) {
      const entry = pending[i];
      setImages((prev) =>
        prev.map((e) =>
          e.id === entry.id ? { ...e, status: 'compressing', result: null } : e
        )
      );

      try {
        let blob: Blob | null;

        if (compressMode === 'targetSize') {
          blob = await compressToTargetSize(entry);
        } else {
          const imageEl = await new Promise<HTMLImageElement>((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = entry.preview;
          });

          const canvas = document.createElement('canvas');
          canvas.width = imageEl.width;
          canvas.height = imageEl.height;
          const ctx = canvas.getContext('2d')!;
          ctx.drawImage(imageEl, 0, 0);

          const mime = MIME_MAP[outputFormat];
          const q = outputFormat === 'png' ? undefined : quality[0] / 100;

          blob = await new Promise<Blob | null>((resolve) => {
            canvas.toBlob(resolve, mime, q);
          });
        }

        if (!blob) throw new Error('Failed to create blob');

        const url = URL.createObjectURL(blob);

        setImages((prev) =>
          prev.map((e) =>
            e.id === entry.id
              ? { ...e, status: 'done', result: { url, size: blob.size, blob } }
              : e
          )
        );
      } catch {
        setImages((prev) =>
          prev.map((e) => (e.id === entry.id ? { ...e, status: 'error' } : e))
        );
      }

      setBatchProgress(Math.round(((i + 1) / pending.length) * 100));
    }

    setBatchProcessing(false);
    toast({
      title: 'Batch complete',
      description: `${pending.length} images processed.`,
    });
  }, [images, outputFormat, quality, compressMode, compressToTargetSize, toast]);

  const downloadSingle = useCallback(
    (entry: ImageEntry) => {
      if (!entry.result || !entry.file) return;
      const baseName = fileBaseName(entry.file);
      const fileName = `compressed-${baseName}${EXT_MAP[outputFormat]}`;
      saveAs(entry.result.url, fileName);
      addRecentFile({
        id: crypto.randomUUID(),
        name: fileName,
        type: MIME_MAP[outputFormat],
        tool: 'image-compress',
        size: formatSize(entry.result.size),
        timestamp: Date.now(),
      });
      toast({
        title: 'Downloaded',
        description: `${fileName} saved.`,
      });
    },
    [outputFormat, addRecentFile, toast]
  );

  const downloadAllAsZip = useCallback(async () => {
    const completed = images.filter((e) => e.status === 'done' && e.result);
    if (completed.length === 0) return;

    try {
      const zip = new JSZip();
      for (const entry of completed) {
        if (!entry.result) continue;
        const baseName = fileBaseName(entry.file);
        const fileName = `compressed-${baseName}${EXT_MAP[outputFormat]}`;
        zip.file(fileName, entry.result.blob);
      }

      const blob = await zip.generateAsync({ type: 'blob' });
      saveAs(blob, `compressed-images-${Date.now()}.zip`);

      toast({
        title: 'ZIP downloaded',
        description: `${completed.length} images saved as ZIP.`,
      });
    } catch {
      toast({
        title: 'ZIP creation failed',
        description: 'Could not create the ZIP file. Please try again.',
        variant: 'destructive',
      });
    }
  }, [images, outputFormat, toast]);

  const removeImage = useCallback(
    (entryId: string) => {
      setImages((prev) => {
        const entry = prev.find((e) => e.id === entryId);
        if (entry) {
          URL.revokeObjectURL(entry.preview);
          if (entry.result?.url) URL.revokeObjectURL(entry.result.url);
        }
        return prev.filter((e) => e.id !== entryId);
      });
    },
    []
  );

  const clearAll = useCallback(() => {
    images.forEach((img) => {
      URL.revokeObjectURL(img.preview);
      if (img.result?.url) URL.revokeObjectURL(img.result.url);
    });
    setImages([]);
    setBatchProgress(0);
  }, []);

  /* ─── Profile handler ─── */
  const handleProfileSelect = useCallback(
    (profileId: string) => {
      setActiveProfile(profileId);
      if (profileId === 'custom') return;

      const profile = COMPRESSION_PROFILES.find((p) => p.id === profileId);
      if (!profile) return;

      setQuality([profile.quality]);
      setOutputFormat(profile.format);
      setCompressMode('quality');
      toast({
        title: `${profile.label} profile applied`,
        description: `Quality: ${profile.quality}% · Format: ${profile.format.toUpperCase()} · ${profile.description}`,
      });
    },
    [toast]
  );

  /* ─── Smart format suggestion for first image ─── */
  const formatSuggestion = images.length > 0 ? getFormatSuggestion(images[0]) : null;

  const applyFormatSuggestion = useCallback(
    (suggestion: FormatSuggestion) => {
      setOutputFormat(suggestion.format);
      setActiveProfile('custom');
      toast({
        title: 'Format suggestion applied',
        description: suggestion.reason,
      });
    },
    [toast]
  );

  const hasImages = images.length > 0;
  const completedCount = images.filter((e) => e.status === 'done').length;
  const totalOriginalSize = images.reduce((sum, e) => sum + e.file.size, 0);
  const totalCompressedSize = images
    .filter((e) => e.result)
    .reduce((sum, e) => sum + (e.result?.size ?? 0), 0);

  return (
    <ToolLayout
      title="Compress Image"
      description="Reduce image file size while maintaining quality"
    >
      {!hasImages ? (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <FileDropzone
            onFiles={addFiles}
            accept="image/jpeg,image/png,image/jpg,image/webp"
            multiple={true}
            label="Drop images here or click to upload"
            sublabel="Supports JPG, PNG, and WebP — upload multiple for batch mode"
            icon="image"
          />
        </motion.div>
      ) : (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
          {/* ─── Controls Card ─── */}
          <Card>
            <CardContent className="p-6 space-y-6">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Compression Settings</Label>
                <WorkerBadge active={isWorkerActive} />
              </div>

              {/* ─── Compression Profiles ─── */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Compression Profile</Label>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  {COMPRESSION_PROFILES.map((profile) => (
                    <Tooltip key={profile.id}>
                      <TooltipTrigger asChild>
                        <Button
                          variant={activeProfile === profile.id ? 'default' : 'outline'}
                          size="sm"
                          className="w-full gap-1 text-xs py-1.5"
                          onClick={() => handleProfileSelect(profile.id)}
                        >
                          {profile.icon}
                          <span className="truncate">{profile.label}</span>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">
                        <p className="font-medium">{profile.label}</p>
                        <p className="text-[10px] opacity-80">{profile.description}</p>
                        <p className="text-[10px] opacity-80">Quality: {profile.quality}% · {profile.format.toUpperCase()}</p>
                      </TooltipContent>
                    </Tooltip>
                  ))}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant={activeProfile === 'custom' ? 'default' : 'outline'}
                        size="sm"
                        className="w-full gap-1 text-xs py-1.5"
                        onClick={() => setActiveProfile('custom')}
                      >
                        <Settings2 className="h-3.5 w-3.5" />
                        <span className="truncate">Custom</span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      <p className="font-medium">Custom</p>
                      <p className="text-[10px] opacity-80">Manually set quality and format</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                {activeProfile !== 'custom' && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Info className="h-3 w-3" />
                    Profile active — change settings below or select &quot;Custom&quot; for manual control
                  </p>
                )}
              </div>

              <div className="h-px bg-border" />

              {/* Compress Mode Selector */}
              <div className="space-y-2">
                <Label>Compression Mode</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant={compressMode === 'quality' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => { setCompressMode('quality'); setActiveProfile('custom'); }}
                    className="gap-1.5"
                  >
                    <ImageMinus className="h-4 w-4" />
                    Quality
                  </Button>
                  <Button
                    variant={compressMode === 'targetSize' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => { setCompressMode('targetSize'); setActiveProfile('custom'); }}
                    className="gap-1.5"
                  >
                    <Target className="h-4 w-4" />
                    Target Size
                  </Button>
                </div>
              </div>

              {/* Target Size Mode */}
              {compressMode === 'targetSize' && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="space-y-3"
                >
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1.5">
                      <Target className="h-3.5 w-3.5" />
                      Target File Size
                    </Label>
                    <div className="flex flex-wrap gap-2">
                      {TARGET_PRESETS.map((preset) => (
                        <Button
                          key={preset.value}
                          variant={targetKB === preset.value ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setTargetKB(preset.value)}
                          className="text-xs"
                        >
                          {preset.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Label htmlFor="custom-target-kb" className="whitespace-nowrap">
                      Custom (KB):
                    </Label>
                    <Input
                      id="custom-target-kb"
                      type="number"
                      min={5}
                      max={10240}
                      value={targetKB}
                      onChange={(e) => setTargetKB(Math.max(5, Number(e.target.value)))}
                      className="w-28"
                    />
                    <span className="text-sm text-muted-foreground">= {formatSize(targetKB * 1024)}</span>
                  </div>
                  {outputFormat === 'png' && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                      <AlertCircle className="h-3.5 w-3.5" />
                      PNG is lossless — switching to JPEG for target size mode.
                    </p>
                  )}
                </motion.div>
              )}

              {/* Output format with Smart Suggestion */}
              <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                <Label className="sm:w-36 shrink-0 mt-2">Output Format</Label>
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <Select
                      value={outputFormat}
                      onValueChange={(v) => { setOutputFormat(v as OutputFormat); setActiveProfile('custom'); }}
                    >
                      <SelectTrigger className="w-full sm:w-48">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="jpeg">JPEG</SelectItem>
                        <SelectItem value="png">PNG</SelectItem>
                        <SelectItem value="webp">WebP</SelectItem>
                      </SelectContent>
                    </Select>
                    {outputFormat === 'png' && (
                      <Badge variant="secondary" className="text-xs whitespace-nowrap">
                        Quality slider ignored
                      </Badge>
                    )}
                  </div>

                  {/* Smart Format Suggestion */}
                  {formatSuggestion && formatSuggestion.format !== outputFormat && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex items-center gap-2"
                    >
                      <button
                        type="button"
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 text-xs font-medium hover:bg-amber-100 dark:hover:bg-amber-900 transition-colors cursor-pointer"
                        onClick={() => applyFormatSuggestion(formatSuggestion)}
                      >
                        <Lightbulb className="h-3.5 w-3.5" />
                        {formatSuggestion.message}
                        <span className="text-[10px] opacity-70">— click to apply</span>
                      </button>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent side="bottom">
                          <p className="max-w-[240px]">{formatSuggestion.reason}</p>
                        </TooltipContent>
                      </Tooltip>
                    </motion.div>
                  )}
                </div>
              </div>

              {/* Quality slider (only in quality mode, and not for PNG) */}
              {compressMode === 'quality' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Compression Quality</Label>
                  <span className="text-sm font-mono">{quality[0]}%</span>
                </div>
                <Slider
                  value={quality}
                  onValueChange={(v) => { setQuality(v as [number]); setActiveProfile('custom'); }}
                  min={1}
                  max={100}
                  step={1}
                  disabled={outputFormat === 'png'}
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Max compression</span>
                  <span>Original quality</span>
                </div>
              </div>
              )}

              {/* ─── EXIF Toggle ─── */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="exif-toggle" className="text-sm">Strip EXIF metadata</Label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="bottom">
                        <p className="max-w-[280px]">
                          EXIF data includes camera info, GPS location, timestamps, etc.
                          Canvas processing strips EXIF by default.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <Switch
                    id="exif-toggle"
                    checked={stripExif}
                    onCheckedChange={setStripExif}
                  />
                </div>
                {!stripExif && (
                  <motion.p
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1.5"
                  >
                    <AlertCircle className="h-3.5 w-3.5" />
                    Canvas processing strips EXIF by default — metadata cannot be preserved client-side
                  </motion.p>
                )}
                <p className="text-xs text-muted-foreground">
                  {stripExif ? 'EXIF data will be removed from compressed images.' : 'Note: EXIF is always stripped during canvas processing.'}
                </p>

                {/* EXIF info display for first image */}
                {images.length > 0 && images[0].dims.w > 0 && (
                  <div className="p-2.5 rounded-lg bg-muted/50 space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Image Info</p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
                      <span className="text-muted-foreground">Dimensions:</span>
                      <span className="font-mono">{images[0].dims.w} × {images[0].dims.h}px</span>
                      <span className="text-muted-foreground">Input format:</span>
                      <span className="font-mono">{images[0].inputFormat.toUpperCase()}</span>
                      {images[0].hasTransparency && (
                        <>
                          <span className="text-muted-foreground">Transparency:</span>
                          <span className="font-mono text-amber-600 dark:text-amber-400">Detected</span>
                        </>
                      )}
                      <span className="text-muted-foreground">File size:</span>
                      <span className="font-mono">{formatSize(images[0].file.size)}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {stripExif ? '🔒 Camera, GPS & timestamps will be removed' : '⚠️ EXIF stripped by canvas (unavoidable)'}
                    </p>
                  </div>
                )}
              </div>

              {/* Add more / clear */}
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => {
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.accept = 'image/jpeg,image/png,image/jpg,image/webp';
                  input.multiple = true;
                  input.onchange = (e) => {
                    const files = Array.from((e.target as HTMLInputElement).files || []);
                    if (files.length > 0) addFiles(files);
                  };
                  input.click();
                }}>
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
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Compressing images…
                  </span>
                  <span className="font-mono">{batchProgress}%</span>
                </div>
                <Progress value={batchProgress} />
              </CardContent>
            </Card>
          )}

          {/* ─── Summary bar (when batch) ─── */}
          {images.length > 1 && completedCount > 0 && (
            <Card>
              <CardContent className="p-4 flex flex-wrap items-center gap-4 text-sm">
                <span className="text-muted-foreground">
                  {completedCount}/{images.length} compressed
                </span>
                <span className="text-muted-foreground">
                  Total: {formatSize(totalOriginalSize)} →{' '}
                  <span className="font-bold text-green-700 dark:text-green-400">
                    {formatSize(totalCompressedSize)}
                  </span>
                </span>
                {completedCount === images.length && (
                  <Button size="sm" className="ml-auto" onClick={downloadAllAsZip}>
                    <FileArchive className="h-4 w-4 mr-2" />
                    Download All as ZIP
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          {/* ─── Image List ─── */}
          <ScrollArea className="max-h-[520px]">
            <div className="space-y-3 pr-1">
              <AnimatePresence mode="popLayout">
                {images.map((entry) => {
                  const reduction = entry.result
                    ? Math.round(((entry.file.size - entry.result.size) / entry.file.size) * 100)
                    : 0;

                  return (
                    <motion.div
                      key={entry.id}
                      layout
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -24 }}
                      transition={{ duration: 0.2 }}
                    >
                      <Card>
                        <CardContent className="p-4">
                          <div className="flex items-center gap-3">
                            {/* Thumbnail */}
                            <div className="h-14 w-14 rounded-lg overflow-hidden bg-muted flex-shrink-0">
                              <img
                                src={entry.preview}
                                alt={entry.file.name}
                                className="h-full w-full object-cover"
                              />
                            </div>

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                              <p className="font-medium truncate text-sm">
                                {entry.file.name}
                              </p>
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                                {entry.dims.w > 0 && (
                                  <span>
                                    {entry.dims.w} × {entry.dims.h}px
                                  </span>
                                )}
                                <span>{formatSize(entry.file.size)}</span>
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                  {entry.inputFormat.toUpperCase()}
                                </Badge>
                                {entry.hasTransparency && (
                                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-amber-600 dark:text-amber-400 border-amber-300 dark:border-amber-700">
                                    Alpha
                                  </Badge>
                                )}
                              </div>
                            </div>

                            {/* Status / Actions */}
                            <div className="flex items-center gap-2 shrink-0">
                              {entry.status === 'idle' && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => compressSingle(entry.id)}
                                  disabled={batchProcessing}
                                >
                                  <ImageMinus className="h-4 w-4 mr-1" />
                                  Compress
                                </Button>
                              )}

                              {entry.status === 'compressing' && (
                                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                              )}

                              {entry.status === 'done' && entry.result && (
                                <>
                                  <div className="hidden sm:flex items-center gap-2 text-xs">
                                    <span className="text-muted-foreground line-through">
                                      {formatSize(entry.file.size)}
                                    </span>
                                    <span className="text-green-700 dark:text-green-400 font-bold">
                                      {formatSize(entry.result.size)}
                                    </span>
                                    <Badge
                                      variant={reduction > 0 ? 'default' : 'secondary'}
                                      className={
                                        reduction > 0
                                          ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                                          : ''
                                      }
                                    >
                                      {reduction > 0 ? `-${reduction}%` : `+${Math.abs(reduction)}%`}
                                    </Badge>
                                  </div>
                                  <Button
                                    size="sm"
                                    onClick={() => downloadSingle(entry)}
                                  >
                                    <Download className="h-4 w-4 mr-1" />
                                  </Button>
                                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                                </>
                              )}

                              {entry.status === 'error' && (
                                <>
                                  <Badge variant="destructive" className="text-xs">
                                    Error
                                  </Badge>
                                  <AlertCircle className="h-4 w-4 text-destructive" />
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => compressSingle(entry.id)}
                                  >
                                    Retry
                                  </Button>
                                </>
                              )}

                              {/* Estimated size (idle state) */}
                              {entry.status === 'idle' && entry.estimatedSize && (
                                <span className="text-xs text-muted-foreground hidden sm:inline">
                                  ≈ {entry.estimatedSize}
                                </span>
                              )}

                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => removeImage(entry.id)}
                                disabled={entry.status === 'compressing'}
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          </ScrollArea>

          {/* ─── Batch Actions ─── */}
          {images.length > 1 && !batchProcessing && (
            <Card>
              <CardContent className="p-4">
                <Button
                  className="w-full"
                  size="lg"
                  onClick={compressAll}
                  disabled={completedCount === images.length}
                >
                  {completedCount > 0 ? (
                    <>
                      <ImageMinus className="h-4 w-4 mr-2" />
                      Compress Remaining ({images.length - completedCount})
                    </>
                  ) : (
                    <>
                      <ImageMinus className="h-4 w-4 mr-2" />
                      Compress All {images.length} Images
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          )}

          {/* ─── Single image detailed view ─── */}
          {images.length === 1 && images[0] && (
            <Card>
              <CardContent className="p-6 space-y-4">

                {/* ─── Before/After Comparison Slider ─── */}
                {images[0].status === 'done' && images[0].result && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: 0.1 }}
                  >
                    <BeforeAfterSlider
                      originalSrc={images[0].preview}
                      compressedSrc={images[0].result.url}
                      label={`${images[0].dims.w} × ${images[0].dims.h}px · ${outputFormat.toUpperCase()}`}
                    />
                  </motion.div>
                )}

                {images[0].estimatedSize && images[0].status === 'idle' && (
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted">
                    <span className="text-sm text-muted-foreground">Estimated output size</span>
                    <span className="text-sm font-bold">{images[0].estimatedSize}</span>
                  </div>
                )}

                {images[0].status === 'done' && images[0].result && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="text-center p-3 rounded-lg bg-muted">
                      <p className="text-xs text-muted-foreground">Original</p>
                      <p className="text-lg font-bold">
                        {formatSize(images[0].file.size)}
                      </p>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-green-50 dark:bg-green-950">
                      <p className="text-xs text-green-600 dark:text-green-400">
                        Compressed
                      </p>
                      <p className="text-lg font-bold text-green-700 dark:text-green-400">
                        {formatSize(images[0].result.size)}
                      </p>
                    </div>
                  </div>
                )}

                <Button
                  className="w-full"
                  size="lg"
                  disabled={images[0].status === 'compressing'}
                  onClick={() => compressSingle(images[0].id)}
                >
                  {images[0].status === 'compressing' ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Compressing…
                    </>
                  ) : images[0].status === 'done' ? (
                    <>
                      <ImageMinus className="h-4 w-4 mr-2" />
                      Re-compress
                    </>
                  ) : (
                    <>
                      <ImageMinus className="h-4 w-4 mr-2" />
                      Compress Image
                    </>
                  )}
                </Button>

                {images[0].status === 'done' && (
                  <Button
                    className="w-full"
                    variant="outline"
                    onClick={() => downloadSingle(images[0])}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download Compressed Image
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
        </motion.div>
      )}
    </ToolLayout>
  );
}
