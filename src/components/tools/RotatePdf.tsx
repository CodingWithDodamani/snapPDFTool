'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  RotateCw, RotateCcw, Loader2, Download, FileText, Trash2, Undo2,
  FlipHorizontal2, FlipVertical2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ToolLayout } from '@/components/shared/ToolLayout';
import { FileDropzone } from '@/components/shared/FileDropzone';
import { useAppStore } from '@/store';
import { formatSize, parsePageRange, cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { PDFDocument, degrees, rgb } from 'pdf-lib';
import { saveAs } from 'file-saver';

/* ─── Types ─── */
type ApplyTo = 'all' | 'specific' | 'odd' | 'even';

interface PageOperation {
  rotation: number;
  flipH: boolean;
  flipV: boolean;
}

/* ─── Constants ─── */
const MAX_THUMBNAILS = 30;
const THUMB_SCALE = 0.3;
const RENDER_SCALE = 2;

/* ─── Helpers ─── */
const normalizeRotation = (deg: number): number => ((deg % 360) + 360) % 360;

const formatRotationLabel = (deg: number): string => {
  const n = normalizeRotation(deg);
  if (n === 0) return '0°';
  return `${n}°`;
};

async function loadPdfjs() {
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
  return pdfjsLib;
}

async function generateThumbnails(
  buffer: ArrayBuffer,
  maxPages: number,
): Promise<string[]> {
  const pdfjsLib = await loadPdfjs();
  const pdf = await pdfjsLib.getDocument({ data: buffer.slice(0) }).promise;
  const count = Math.min(pdf.numPages, maxPages);
  const thumbs: string[] = [];

  for (let i = 1; i <= count; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: THUMB_SCALE });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d')!;
    await page.render({ canvasContext: ctx, viewport }).promise;
    thumbs.push(canvas.toDataURL('image/jpeg', 0.6));
  }

  return thumbs;
}

const getTransformStyle = (op: PageOperation): string => {
  const parts: string[] = [];
  const n = normalizeRotation(op.rotation);
  if (n !== 0) parts.push(`rotate(${n}deg)`);
  if (op.flipH) parts.push('scaleX(-1)');
  if (op.flipV) parts.push('scaleY(-1)');
  return parts.join(' ') || 'none';
};

const getRotationIcon = (val: number) => {
  if (val === 0) return <span className="text-muted-foreground">—</span>;
  if (val === 90) return <RotateCw className="h-4 w-4" />;
  if (val === -90) return <RotateCcw className="h-4 w-4" />;
  if (val === 180)
    return (
      <RotateCw className="h-4 w-4" style={{ transform: 'rotate(180deg)' }} />
    );
  return null;
};

/* ─── Component ─── */
export function RotatePdf() {
  const { addRecentFile } = useAppStore();
  const { toast } = useToast();

  /* file state */
  const [file, setFile] = useState<File | null>(null);
  const [fileBuffer, setFileBuffer] = useState<ArrayBuffer | null>(null);
  const [pageCount, setPageCount] = useState(0);

  /* mode */
  const [mode, setMode] = useState<'batch' | 'perpage'>('batch');

  /* batch mode */
  const [batchRotation, setBatchRotation] = useState(90);
  const [batchFlipH, setBatchFlipH] = useState(false);
  const [batchFlipV, setBatchFlipV] = useState(false);
  const [applyTo, setApplyTo] = useState<ApplyTo>('all');
  const [specificPages, setSpecificPages] = useState('');

  /* per-page mode */
  const [pageOps, setPageOps] = useState<PageOperation[]>([]);

  /* thumbnails */
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [thumbLoading, setThumbLoading] = useState(false);

  /* processing */
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<Blob | null>(null);
  const [processedInfo, setProcessedInfo] = useState<{
    count: number;
    total: number;
  } | null>(null);

  /* ── derived ── */
  const clearResult = useCallback(() => setResult(null), []);

  const affectedPages = useMemo(() => {
    if (pageCount === 0) return [];
    if (applyTo === 'all')
      return Array.from({ length: pageCount }, (_, i) => i + 1);
    if (applyTo === 'odd')
      return Array.from(
        { length: Math.ceil(pageCount / 2) },
        (_, i) => i * 2 + 1,
      );
    if (applyTo === 'even')
      return Array.from(
        { length: Math.floor(pageCount / 2) },
        (_, i) => (i + 1) * 2,
      );
    if (specificPages.trim()) return parsePageRange(specificPages, pageCount);
    return [];
  }, [applyTo, specificPages, pageCount]);

  const canApply = useMemo(() => {
    if (processing) return false;
    if (mode === 'batch') {
      if (applyTo === 'specific' && specificPages.trim() === '') return false;
      if (batchRotation === 0 && !batchFlipH && !batchFlipV) return false;
      return true;
    }
    return pageOps.some(
      (op) => op.rotation !== 0 || op.flipH || op.flipV,
    );
  }, [
    mode,
    processing,
    applyTo,
    specificPages,
    batchRotation,
    batchFlipH,
    batchFlipV,
    pageOps,
  ]);

  const activeOpsCount = useMemo(
    () =>
      pageOps.filter((op) => op.rotation !== 0 || op.flipH || op.flipV).length,
    [pageOps],
  );

  /* ── effects ── */
  useEffect(() => {
    if (!fileBuffer) {
      setThumbnails([]);
      return;
    }
    let cancelled = false;
    setThumbLoading(true);
    generateThumbnails(fileBuffer, MAX_THUMBNAILS)
      .then((thumbs) => {
        if (!cancelled) {
          setThumbnails(thumbs);
          setThumbLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setThumbnails([]);
          setThumbLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [fileBuffer]);

  useEffect(() => {
    if (pageCount > 0) {
      setPageOps(
        Array.from({ length: pageCount }, () => ({
          rotation: 0,
          flipH: false,
          flipV: false,
        })),
      );
    }
  }, [pageCount]);

  /* ── handlers ── */
  const handleFiles = useCallback(
    async (files: File[]) => {
      const pdf = files.find((f) => f.type === 'application/pdf');
      if (!pdf) return;
      try {
        const buffer = await pdf.arrayBuffer();
        const pdfDoc = await PDFDocument.load(buffer, {
          ignoreEncryption: true,
        });
        setPageCount(pdfDoc.getPageCount());
        setFile(pdf);
        setFileBuffer(buffer);
        setResult(null);
        setProcessedInfo(null);
      } catch (err) {
        console.error('Failed to load PDF:', err);
        toast({
          title: 'Cannot open PDF',
          description:
            'The file may be corrupted or password-protected. Please try another PDF.',
          variant: 'destructive',
        });
      }
    },
    [toast],
  );

  const handleReset = useCallback(() => {
    setFile(null);
    setFileBuffer(null);
    setPageCount(0);
    setBatchRotation(90);
    setBatchFlipH(false);
    setBatchFlipV(false);
    setApplyTo('all');
    setSpecificPages('');
    setPageOps([]);
    setThumbnails([]);
    setProgress(0);
    setResult(null);
    setProcessedInfo(null);
    setProcessing(false);
  }, []);

  const handleResetOperations = useCallback(() => {
    setBatchRotation(90);
    setBatchFlipH(false);
    setBatchFlipV(false);
    setApplyTo('all');
    setSpecificPages('');
    setPageOps((prev) =>
      prev.map(() => ({ rotation: 0, flipH: false, flipV: false })),
    );
    setResult(null);
    setProcessedInfo(null);
  }, []);

  const rotatePageBy = useCallback(
    (pi: number, delta: number) => {
      setPageOps((prev) =>
        prev.map((op, i) =>
          i !== pi
            ? op
            : { ...op, rotation: normalizeRotation(op.rotation + delta) },
        ),
      );
      clearResult();
    },
    [clearResult],
  );

  const toggleFlip = useCallback(
    (pi: number, axis: 'flipH' | 'flipV') => {
      setPageOps((prev) =>
        prev.map((op, i) =>
          i !== pi ? op : { ...op, [axis]: !op[axis] },
        ),
      );
      clearResult();
    },
    [clearResult],
  );

  /* ── process ── */
  const processPdf = useCallback(async () => {
    if (!file || !fileBuffer) return;
    setProcessing(true);
    setProgress(0);

    try {
      const pdfDoc = await PDFDocument.load(fileBuffer.slice(0), {
        ignoreEncryption: true,
      });
      const pages = pdfDoc.getPages();
      const operationsMap = new Map<number, PageOperation>();

      if (mode === 'batch') {
        let indices: number[];
        if (applyTo === 'all') {
          indices = pages.map((_, i) => i);
        } else if (applyTo === 'odd') {
          indices = [];
          for (let i = 0; i < pages.length; i += 2) indices.push(i);
        } else if (applyTo === 'even') {
          indices = [];
          for (let i = 1; i < pages.length; i += 2) indices.push(i);
        } else {
          const parsed = parsePageRange(specificPages, pages.length);
          if (parsed.length === 0) {
            toast({
              title: 'No valid pages',
              description: `Enter page numbers between 1 and ${pages.length}.`,
              variant: 'destructive',
            });
            setProcessing(false);
            return;
          }
          indices = parsed.map((n) => n - 1);
        }

        if (indices.length === 0) {
          toast({
            title: 'No pages selected',
            variant: 'destructive',
          });
          setProcessing(false);
          return;
        }

        for (const pi of indices) {
          operationsMap.set(pi, {
            rotation: batchRotation,
            flipH: batchFlipH,
            flipV: batchFlipV,
          });
        }
      } else {
        for (let i = 0; i < pageOps.length; i++) {
          const op = pageOps[i];
          if (op.rotation !== 0 || op.flipH || op.flipV) {
            operationsMap.set(i, op);
          }
        }
      }

      if (operationsMap.size === 0) {
        toast({
          title: 'No operations to apply',
          description: 'Set rotation or flip for at least one page.',
          variant: 'destructive',
        });
        setProcessing(false);
        return;
      }

      const totalOps = operationsMap.size;
      let done = 0;
      const needsFlip = Array.from(operationsMap.values()).some(
        (op) => op.flipH || op.flipV,
      );

      let pdfjsLib: any = null;
      let sourcePdf: any = null;

      if (needsFlip) {
        pdfjsLib = await loadPdfjs();
        sourcePdf = await pdfjsLib
          .getDocument({ data: fileBuffer.slice(0) })
          .promise;
      }

      for (const [pageIndex, op] of operationsMap) {
        const page = pages[pageIndex];

        if (!op.flipH && !op.flipV) {
          /* rotation only – pdf-lib (fast, lossless) */
          const cur = Number(page.getRotation().angle);
          page.setRotation(degrees(cur + op.rotation));
        } else {
          /* flip – canvas-based re-render */
          const srcPage = await sourcePdf.getPage(pageIndex + 1);
          const viewport = srcPage.getViewport({ scale: RENDER_SCALE });

          const renderCanvas = document.createElement('canvas');
          renderCanvas.width = viewport.width;
          renderCanvas.height = viewport.height;
          const renderCtx = renderCanvas.getContext('2d')!;
          await srcPage.render({
            canvasContext: renderCtx,
            viewport,
          }).promise;

          const rotDeg = normalizeRotation(op.rotation);
          const isSwapped = rotDeg === 90 || rotDeg === 270;
          const outW = isSwapped ? viewport.height : viewport.width;
          const outH = isSwapped ? viewport.width : viewport.height;

          const outCanvas = document.createElement('canvas');
          outCanvas.width = outW;
          outCanvas.height = outH;
          const outCtx = outCanvas.getContext('2d')!;
          outCtx.save();
          outCtx.translate(outW / 2, outH / 2);
          outCtx.rotate((op.rotation * Math.PI) / 180);
          if (op.flipH) outCtx.scale(-1, 1);
          if (op.flipV) outCtx.scale(1, -1);
          outCtx.drawImage(
            renderCanvas,
            -viewport.width / 2,
            -viewport.height / 2,
          );
          outCtx.restore();

          const dataUrl = outCanvas.toDataURL('image/png');
          const b64 = dataUrl.split(',')[1];
          const binStr = atob(b64);
          const pngBytes = new Uint8Array(binStr.length);
          for (let j = 0; j < binStr.length; j++)
            pngBytes[j] = binStr.charCodeAt(j);

          const image = await pdfDoc.embedPng(pngBytes);
          const newW = outW / RENDER_SCALE;
          const newH = outH / RENDER_SCALE;

          page.setSize(newW, newH);
          page.setRotation(degrees(0));
          page.drawRectangle({
            x: 0,
            y: 0,
            width: newW,
            height: newH,
            color: rgb(1, 1, 1),
          });
          page.drawImage(image, { x: 0, y: 0, width: newW, height: newH });
        }

        done++;
        setProgress(Math.round((done / totalOps) * 100));
        await new Promise((r) => setTimeout(r, 0));
      }

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      setResult(blob);
      setProcessedInfo({ count: totalOps, total: pages.length });

      addRecentFile({
        id: crypto.randomUUID(),
        name: `rotated-${file.name}`,
        type: 'application/pdf',
        tool: 'rotate-pdf',
        size: formatSize(blob.size),
        timestamp: Date.now(),
      });

      toast({
        title: 'Processing complete',
        description: `Successfully processed ${totalOps} page${totalOps > 1 ? 's' : ''}.`,
      });
    } catch (err) {
      console.error('Processing error:', err);
      toast({
        title: 'Processing failed',
        description: 'The PDF may be corrupted or encrypted.',
        variant: 'destructive',
      });
    } finally {
      setProcessing(false);
    }
  }, [
    file,
    fileBuffer,
    mode,
    batchRotation,
    batchFlipH,
    batchFlipV,
    applyTo,
    specificPages,
    pageOps,
    addRecentFile,
    toast,
  ]);

  const handleDownload = useCallback(() => {
    if (!result || !file) return;
    saveAs(result, `rotated-${file.name}`);
    toast({
      title: 'Downloaded',
      description: 'Your processed PDF has been saved.',
    });
  }, [result, file, toast]);

  /* ── display helpers ── */
  const formatPageList = (pgs: number[]): string => {
    if (pgs.length <= 6) return pgs.join(', ');
    return `${pgs.slice(0, 4).join(', ')}, …, ${pgs.slice(-2).join(', ')}`;
  };

  const batchOp: PageOperation = useMemo(
    () => ({
      rotation: batchRotation,
      flipH: batchFlipH,
      flipV: batchFlipV,
    }),
    [batchRotation, batchFlipH, batchFlipV],
  );

  const hasBatchOp = batchRotation !== 0 || batchFlipH || batchFlipV;

  /* ── render ── */
  return (
    <TooltipProvider delayDuration={300}>
      <ToolLayout
        title="Rotate PDF"
        description="Rotate, flip, and transform PDF pages with per-page control"
      >
        {!file ? (
          <FileDropzone
            onFiles={handleFiles}
            accept=".pdf,application/pdf"
            multiple={false}
            label="Drop PDF here or click to upload"
            sublabel="Select a PDF to rotate or flip its pages"
          />
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-6"
          >
            {/* ── File Info ── */}
            <Card>
              <CardContent className="p-4 flex items-center gap-4">
                <div className="h-10 w-10 rounded-lg bg-red-100 dark:bg-red-950 flex items-center justify-center flex-shrink-0">
                  <FileText className="h-5 w-5 text-red-600 dark:text-red-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{file.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {pageCount} pages · {formatSize(file.size)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleReset}
                  title="Remove file and start over"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>

            {/* ── Prominent Reset All ── */}
            <motion.div whileTap={{ scale: 0.98 }}>
              <Button
                variant="outline"
                size="lg"
                className="w-full border-dashed text-muted-foreground hover:text-foreground gap-2"
                onClick={handleResetOperations}
                disabled={processing}
              >
                <Undo2 className="h-5 w-5" />
                Reset All Operations
              </Button>
            </motion.div>

            {/* ── Mode Tabs ── */}
            <Tabs
              value={mode}
              onValueChange={(v: string) => {
                setMode(v as 'batch' | 'perpage');
                clearResult();
              }}
            >
              <TabsList className="w-full">
                <TabsTrigger value="batch" className="flex-1">
                  Batch Mode
                </TabsTrigger>
                <TabsTrigger value="perpage" className="flex-1">
                  Per-Page
                </TabsTrigger>
              </TabsList>

              {/* ═══════ BATCH MODE ═══════ */}
              <TabsContent value="batch" className="space-y-6 mt-6">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">
                      Batch Operations
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {/* Rotation */}
                    <div className="space-y-3">
                      <Label>Rotation</Label>
                      <div className="grid grid-cols-4 gap-2">
                        {(
                          [
                            { val: 0, label: 'None' },
                            { val: 90, label: '90° CW' },
                            { val: -90, label: '90° CCW' },
                            { val: 180, label: '180°' },
                          ] as const
                        ).map((opt) => (
                          <Button
                            key={opt.val}
                            variant={
                              batchRotation === opt.val ? 'default' : 'outline'
                            }
                            onClick={() => {
                              setBatchRotation(opt.val);
                              clearResult();
                            }}
                            className="flex flex-col items-center gap-1 h-auto py-3"
                            disabled={processing}
                          >
                            {getRotationIcon(opt.val)}
                            <span className="text-xs">{opt.label}</span>
                          </Button>
                        ))}
                      </div>
                    </div>

                    {/* Flip */}
                    <div className="space-y-3">
                      <Label>Flip</Label>
                      <div className="grid grid-cols-2 gap-3">
                        <Button
                          variant={batchFlipH ? 'default' : 'outline'}
                          onClick={() => {
                            setBatchFlipH(!batchFlipH);
                            clearResult();
                          }}
                          className="h-auto py-3 gap-2"
                          disabled={processing}
                        >
                          <FlipHorizontal2 className="h-4 w-4" />
                          <span className="text-sm">Flip Horizontal</span>
                        </Button>
                        <Button
                          variant={batchFlipV ? 'default' : 'outline'}
                          onClick={() => {
                            setBatchFlipV(!batchFlipV);
                            clearResult();
                          }}
                          className="h-auto py-3 gap-2"
                          disabled={processing}
                        >
                          <FlipVertical2 className="h-4 w-4" />
                          <span className="text-sm">Flip Vertical</span>
                        </Button>
                      </div>
                    </div>

                    <Separator />

                    {/* Apply To */}
                    <div className="space-y-3">
                      <Label>Apply To</Label>
                      <RadioGroup
                        value={applyTo}
                        onValueChange={(v) => {
                          setApplyTo(v as ApplyTo);
                          clearResult();
                        }}
                        disabled={processing}
                        className="space-y-2"
                      >
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="all" id="apply-all" />
                          <Label htmlFor="apply-all" className="font-normal">
                            All pages
                            <span className="text-muted-foreground ml-1.5">
                              ({pageCount})
                            </span>
                          </Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="odd" id="apply-odd" />
                          <Label htmlFor="apply-odd" className="font-normal">
                            Odd pages
                            <span className="text-muted-foreground ml-1.5">
                              (1, 3, 5…)
                            </span>
                          </Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="even" id="apply-even" />
                          <Label htmlFor="apply-even" className="font-normal">
                            Even pages
                            <span className="text-muted-foreground ml-1.5">
                              (2, 4, 6…)
                            </span>
                          </Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem
                            value="specific"
                            id="apply-specific"
                          />
                          <Label
                            htmlFor="apply-specific"
                            className="font-normal"
                          >
                            Specific pages
                          </Label>
                        </div>
                      </RadioGroup>
                    </div>

                    {/* Specific Pages Input */}
                    {applyTo === 'specific' && (
                      <div className="space-y-2">
                        <Label htmlFor="specific-pages">Page Numbers</Label>
                        <Input
                          id="specific-pages"
                          placeholder="e.g., 1, 3, 5-7"
                          value={specificPages}
                          onChange={(e) => {
                            setSpecificPages(e.target.value);
                            clearResult();
                          }}
                          disabled={processing}
                        />
                        <p className="text-xs text-muted-foreground">
                          Separate with commas. Use dashes for ranges (1-
                          {pageCount}).
                        </p>
                      </div>
                    )}

                    {/* Affected pages info */}
                    {affectedPages.length > 0 && applyTo !== 'all' && (
                      <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 border">
                        <Badge variant="secondary" className="font-mono">
                          {affectedPages.length}
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          page{affectedPages.length !== 1 ? 's' : ''} will be
                          processed:
                          <span className="font-medium text-foreground ml-1">
                            {formatPageList(affectedPages)}
                          </span>
                        </span>
                      </div>
                    )}

                    {/* Thumbnail Preview */}
                    {thumbLoading && (
                      <div className="space-y-2">
                        <Label className="text-sm text-muted-foreground">
                          Generating preview…
                        </Label>
                        <div className="flex gap-2 overflow-x-auto pb-2">
                          {Array.from({
                            length: Math.min(pageCount, MAX_THUMBNAILS),
                          }).map((_, i) => (
                            <Skeleton
                              key={i}
                              className="h-20 w-14 rounded-lg flex-shrink-0"
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    {!thumbLoading && thumbnails.length > 0 && (
                      <div className="space-y-2">
                        <Label className="text-sm text-muted-foreground">
                          Preview
                          {pageCount > MAX_THUMBNAILS && (
                            <span className="ml-1">
                              (showing first {MAX_THUMBNAILS} of {pageCount})
                            </span>
                          )}
                        </Label>
                        <div className="flex gap-2 overflow-x-auto pb-2">
                          {thumbnails.map((thumb, i) => {
                            const isAffected = affectedPages.includes(i + 1);
                            return (
                              <div
                                key={i}
                                className={cn(
                                  'relative flex-shrink-0 rounded-lg overflow-hidden border-2 transition-all',
                                  isAffected && hasBatchOp
                                    ? 'border-primary shadow-sm'
                                    : 'border-border/50 opacity-50',
                                )}
                              >
                                <img
                                  src={thumb}
                                  alt={`Page ${i + 1}`}
                                  className="w-14 h-auto block"
                                  style={{
                                    transform:
                                      isAffected && hasBatchOp
                                        ? getTransformStyle(batchOp)
                                        : 'none',
                                    transition: 'transform 0.3s ease',
                                  }}
                                />
                                <span className="absolute bottom-0 inset-x-0 text-center text-[9px] bg-black/60 text-white py-px">
                                  {i + 1}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Progress */}
                    {processing && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span>Processing pages…</span>
                          <span>{progress}%</span>
                        </div>
                        <Progress value={progress} />
                      </div>
                    )}

                    {/* Apply */}
                    <Button
                      className="w-full"
                      size="lg"
                      disabled={!canApply}
                      onClick={processPdf}
                    >
                      {processing ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Processing…
                        </>
                      ) : (
                        <>
                          <RotateCw className="h-4 w-4 mr-2" />
                          Apply Operations
                        </>
                      )}
                    </Button>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* ═══════ PER-PAGE MODE ═══════ */}
              <TabsContent value="perpage" className="space-y-6 mt-6">
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">
                        Per-Page Operations
                      </CardTitle>
                      {activeOpsCount > 0 && (
                        <Badge variant="secondary">
                          {activeOpsCount} page{activeOpsCount > 1 ? 's' : ''}
                        </Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Loading skeletons */}
                    {thumbLoading && (
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                        {Array.from({
                          length: Math.min(pageCount, MAX_THUMBNAILS),
                        }).map((_, i) => (
                          <div key={i} className="space-y-2">
                            <Skeleton className="aspect-[3/4] w-full rounded-lg" />
                            <Skeleton className="h-4 w-12 mx-auto" />
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Thumbnail Grid */}
                    {!thumbLoading && pageOps.length > 0 && (
                      <>
                        {pageCount > MAX_THUMBNAILS && (
                          <p className="text-xs text-muted-foreground">
                            Thumbnails shown for first {MAX_THUMBNAILS} pages.
                            Operations can still be set for all {pageCount}{' '}
                            pages.
                          </p>
                        )}

                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 max-h-[600px] overflow-y-auto">
                          {pageOps.map((op, i) => {
                            const thumb = thumbnails[i];
                            const hasOp =
                              op.rotation !== 0 || op.flipH || op.flipV;
                            return (
                              <motion.div
                                key={i}
                                layout
                                className={cn(
                                  'rounded-xl border-2 overflow-hidden transition-colors',
                                  hasOp
                                    ? 'border-primary bg-primary/[0.03]'
                                    : 'border-border',
                                )}
                              >
                                {/* Thumbnail area */}
                                <div className="relative bg-muted/30 aspect-[3/4] flex items-center justify-center overflow-hidden">
                                  {thumb ? (
                                    <img
                                      src={thumb}
                                      alt={`Page ${i + 1}`}
                                      className="max-w-full max-h-full object-contain"
                                      style={{
                                        transform: getTransformStyle(op),
                                        transition: 'transform 0.3s ease',
                                      }}
                                    />
                                  ) : (
                                    <div className="flex flex-col items-center gap-1 text-muted-foreground">
                                      <FileText className="h-6 w-6" />
                                      <span className="text-xs">
                                        Page {i + 1}
                                      </span>
                                    </div>
                                  )}

                                  {/* Page number */}
                                  <span className="absolute top-1 left-1 text-[10px] font-medium bg-black/60 text-white px-1.5 py-0.5 rounded">
                                    {i + 1}
                                  </span>

                                  {/* Operation indicators */}
                                  {hasOp && (
                                    <div className="absolute top-1 right-1 flex gap-0.5">
                                      {op.rotation !== 0 && (
                                        <span className="text-[9px] bg-primary text-primary-foreground px-1 py-0.5 rounded font-mono">
                                          {formatRotationLabel(op.rotation)}
                                        </span>
                                      )}
                                      {op.flipH && (
                                        <span className="text-[9px] bg-orange-500 text-white px-1 py-0.5 rounded font-medium">
                                          H
                                        </span>
                                      )}
                                      {op.flipV && (
                                        <span className="text-[9px] bg-orange-500 text-white px-1 py-0.5 rounded font-medium">
                                          V
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </div>

                                {/* Controls */}
                                <div className="p-1.5">
                                  <div className="flex gap-1 justify-center">
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-7 w-7"
                                          onClick={() => rotatePageBy(i, 90)}
                                          disabled={processing}
                                        >
                                          <RotateCw className="h-3.5 w-3.5" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        Rotate 90° CW
                                      </TooltipContent>
                                    </Tooltip>

                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-7 w-7"
                                          onClick={() => rotatePageBy(i, -90)}
                                          disabled={processing}
                                        >
                                          <RotateCcw className="h-3.5 w-3.5" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        Rotate 90° CCW
                                      </TooltipContent>
                                    </Tooltip>

                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          variant={
                                            op.flipH ? 'default' : 'ghost'
                                          }
                                          size="icon"
                                          className="h-7 w-7"
                                          onClick={() => toggleFlip(i, 'flipH')}
                                          disabled={processing}
                                        >
                                          <FlipHorizontal2 className="h-3.5 w-3.5" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        Flip Horizontal
                                      </TooltipContent>
                                    </Tooltip>

                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          variant={
                                            op.flipV ? 'default' : 'ghost'
                                          }
                                          size="icon"
                                          className="h-7 w-7"
                                          onClick={() => toggleFlip(i, 'flipV')}
                                          disabled={processing}
                                        >
                                          <FlipVertical2 className="h-3.5 w-3.5" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        Flip Vertical
                                      </TooltipContent>
                                    </Tooltip>
                                  </div>
                                </div>
                              </motion.div>
                            );
                          })}
                        </div>

                        {/* Progress */}
                        {processing && (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between text-sm">
                              <span>Processing pages…</span>
                              <span>{progress}%</span>
                            </div>
                            <Progress value={progress} />
                          </div>
                        )}

                        {/* Apply All */}
                        <Button
                          className="w-full"
                          size="lg"
                          disabled={!canApply}
                          onClick={processPdf}
                        >
                          {processing ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Processing…
                            </>
                          ) : (
                            <>
                              <RotateCw className="h-4 w-4 mr-2" />
                              Apply All Operations
                            </>
                          )}
                        </Button>
                      </>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>

            {/* ── Result Card ── */}
            {result && processedInfo && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <Card className="border-green-200 dark:border-green-900">
                  <CardContent className="p-6 space-y-4">
                    <h3 className="font-semibold text-green-700 dark:text-green-400">
                      Operations Complete!
                    </h3>

                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant="default"
                        className="bg-green-600 text-white"
                      >
                        <RotateCw className="h-3 w-3" />
                        {processedInfo.count} of {processedInfo.total} pages
                      </Badge>
                      <Badge variant="outline">
                        {mode === 'batch' ? 'Batch' : 'Per-Page'}
                      </Badge>
                      {(mode === 'batch' &&
                        (batchFlipH || batchFlipV)) ||
                      (mode === 'perpage' &&
                        pageOps.some((o) => o.flipH || o.flipV)) ? (
                        <Badge variant="secondary">Flip Applied</Badge>
                      ) : null}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="text-center p-3 rounded-lg bg-muted">
                        <p className="text-sm text-muted-foreground">
                          Original
                        </p>
                        <p className="text-lg font-bold">
                          {formatSize(file.size)}
                        </p>
                      </div>
                      <div className="text-center p-3 rounded-lg bg-green-50 dark:bg-green-950">
                        <p className="text-sm text-green-600 dark:text-green-400">
                          Processed
                        </p>
                        <p className="text-lg font-bold text-green-700 dark:text-green-400">
                          {formatSize(result.size)}
                        </p>
                      </div>
                    </div>

                    <Separator />

                    <Button className="w-full" onClick={handleDownload}>
                      <Download className="h-4 w-4 mr-2" />
                      Download Processed PDF
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </motion.div>
        )}
      </ToolLayout>
    </TooltipProvider>
  );
}
