'use client';

import { useState, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  FileImage,
  Loader2,
  FileText,
  Download,
  Trash2,
  Archive,
  ImageIcon,
  Check,
  ZoomIn,
  Palette,
  Settings2,
  ChevronDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ToolLayout } from '@/components/shared/ToolLayout';
import { FileDropzone } from '@/components/shared/FileDropzone';
import { useAppStore } from '@/store';
import { saveAs } from 'file-saver';
import JSZip from 'jszip';
import { formatSize } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

type ImageFormat = 'png' | 'jpeg' | 'webp';
type DpiPreset = number;

interface PageImage {
  pageNumber: number;
  dataUrl: string;
  blob: Blob;
  width: number;
  height: number;
  size: number;
  selected: boolean;
}

const FORMAT_EXT: Record<ImageFormat, string> = { png: 'png', jpeg: 'jpg', webp: 'webp' };
const FORMAT_MIME: Record<ImageFormat, string> = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' };

const DPI_OPTIONS = [
  { label: '72 DPI (Screen)', value: 72 },
  { label: '150 DPI (Good)', value: 150 },
  { label: '200 DPI (High)', value: 200 },
  { label: '300 DPI (Print)', value: 300 },
];

const BG_OPTIONS = [
  { label: 'White', value: '#ffffff' },
  { label: 'Transparent', value: 'transparent' },
  { label: 'Black', value: '#000000' },
  { label: 'Custom', value: 'custom' },
];

export function PdfToImage() {
  const { addRecentFile } = useAppStore();
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [pdfBuffer, setPdfBuffer] = useState<ArrayBuffer | null>(null);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState('');

  // Thumbnails
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [thumbnailsLoading, setThumbnailsLoading] = useState(false);

  // Settings
  const [format, setFormat] = useState<ImageFormat>('png');
  const [dpi, setDpi] = useState<DpiPreset>(150);
  const [quality, setQuality] = useState(90);
  const [bgColor, setBgColor] = useState('#ffffff');
  const [bgOption, setBgOption] = useState('White');
  const [customBgColor, setCustomBgColor] = useState('#f5f5f5');

  // Results
  const [pages, setPages] = useState<PageImage[]>([]);
  const [zipBlob, setZipBlob] = useState<Blob | null>(null);
  const [zipSize, setZipSize] = useState(0);

  // Preview dialog
  const [previewPage, setPreviewPage] = useState<PageImage | null>(null);

  const resetState = useCallback(() => {
    setFile(null);
    setPageCount(0);
    setPdfBuffer(null);
    setPages([]);
    setError('');
    setZipBlob(null);
    setZipSize(0);
    setProgress(0);
    setStatusMessage('');
    setThumbnails([]);
  }, []);

  const handleFiles = useCallback(
    async (files: File[]) => {
      const pdf = files.find((f) => f.type === 'application/pdf');
      if (pdf) {
        try {
          const buffer = await pdf.arrayBuffer();
          const pdfjsLib = await import('pdfjs-dist');
          pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
          const pdfDoc = await pdfjsLib.getDocument({ data: buffer }).promise;
          const count = pdfDoc.numPages;

          setPageCount(count);
          setFile(pdf);
          setPdfBuffer(buffer);
          resetState();
          setPageCount(count);
          setFile(pdf);
          setPdfBuffer(buffer);

          // Generate thumbnails
          generateThumbnails(buffer, count);
        } catch (err) {
          console.error('Failed to load PDF:', err);
          setError('Failed to load the PDF file.');
          toast({
            title: 'Failed to load PDF',
            description: 'The file may be corrupted or password-protected.',
            variant: 'destructive',
          });
        }
      }
    },
    [toast, resetState],
  );

  const generateThumbnails = useCallback(async (buffer: ArrayBuffer, count: number) => {
    setThumbnailsLoading(true);
    try {
      const pdfjsLib = await import('pdfjs-dist');
      pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
      const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
      const thumbs: string[] = [];
      const maxPages = Math.min(count, 50);

      for (let i = 1; i <= maxPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 0.3 });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          await page.render({ canvasContext: ctx, viewport }).promise;
          thumbs.push(canvas.toDataURL('image/jpeg', 0.6));
        }
      }
      setThumbnails(thumbs);
    } catch (err) {
      console.error('Thumbnail generation error:', err);
    } finally {
      setThumbnailsLoading(false);
    }
  }, []);

  // Page selection
  const allSelected = pages.length > 0 && pages.every((p) => p.selected);
  const selectedCount = pages.filter((p) => p.selected).length;

  const togglePageSelection = useCallback((pageNumber: number) => {
    setPages((prev) =>
      prev.map((p) => (p.pageNumber === pageNumber ? { ...p, selected: !p.selected } : p)),
    );
  }, []);

  const toggleSelectAll = useCallback(() => {
    setPages((prev) => prev.map((p) => ({ ...p, selected: !allSelected })));
  }, [allSelected]);

  const selectByRange = useCallback(
    (rangeStr: string) => {
      const pageNumbers = parsePageRange(rangeStr, pageCount);
      const pageSet = new Set(pageNumbers);
      setPages((prev) => prev.map((p) => ({ ...p, selected: pageSet.has(p.pageNumber) })));
    },
    [pageCount],
  );

  // Convert PDF to images
  const convertToImages = useCallback(async () => {
    if (!pdfBuffer) return;
    setProcessing(true);
    setProgress(0);
    setError('');
    setPages([]);
    setZipBlob(null);
    setZipSize(0);
    setStatusMessage('Initializing PDF engine...');

    try {
      const pdfjsLib = await import('pdfjs-dist');
      pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
      const pdf = await pdfjsLib.getDocument({ data: pdfBuffer }).promise;

      // Scale factor: 72 is base DPI, so scale = targetDPI / 72
      const scale = dpi / 72;
      const resolvedBg = bgOption === 'Custom' ? customBgColor : bgColor;
      const useTransparent = bgOption === 'Transparent' && format === 'png';

      const imageResults: PageImage[] = [];

      for (let i = 1; i <= pageCount; i++) {
        setStatusMessage(`Converting page ${i} of ${pageCount}...`);
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale });

        const canvas = document.createElement('canvas');
        canvas.width = Math.round(viewport.width);
        canvas.height = Math.round(viewport.height);
        const ctx = canvas.getContext('2d');

        if (ctx) {
          // Fill background (unless transparent PNG)
          if (!useTransparent) {
            ctx.fillStyle = resolvedBg;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
          }

          await page.render({ canvasContext: ctx, viewport }).promise;
        }

        const dataUrl = canvas.toDataURL(FORMAT_MIME[format], quality / 100);
        const blob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob(
            (b) => (b ? resolve(b) : reject(new Error('Failed to create blob'))),
            FORMAT_MIME[format],
            quality / 100,
          );
        });

        imageResults.push({
          pageNumber: i,
          dataUrl,
          blob,
          width: canvas.width,
          height: canvas.height,
          size: blob.size,
          selected: true,
        });

        setProgress(Math.round((i / pageCount) * 90));
      }

      setPages(imageResults);

      // Create ZIP
      setStatusMessage('Creating ZIP archive...');
      setProgress(90);
      const zip = new JSZip();
      const baseName = file?.name.replace('.pdf', '') || 'document';

      for (const img of imageResults) {
        const ext = FORMAT_EXT[format];
        zip.file(`${baseName}-page-${img.pageNumber}.${ext}`, img.blob);
      }

      const zipContent = await zip.generateAsync({ type: 'blob' }, (meta) => {
        setProgress(Math.round(90 + (meta.percent / 100) * 10));
      });

      setZipBlob(zipContent);
      setZipSize(zipContent.size);
      setProgress(100);
      setStatusMessage('');

      const totalImgSize = imageResults.reduce((sum, p) => sum + p.size, 0);

      toast({
        title: 'Conversion complete!',
        description: `${pageCount} pages converted to ${format.toUpperCase()} · ZIP: ${formatSize(zipContent.size)}`,
      });

      addRecentFile({
        id: crypto.randomUUID(),
        name: `${baseName}-images.zip`,
        type: 'application/zip',
        tool: 'pdf-to-image',
        size: formatSize(zipContent.size),
        timestamp: Date.now(),
      });
    } catch (err) {
      console.error('Conversion error:', err);
      setError('Failed to convert PDF. The file may be corrupted or password-protected.');
      toast({
        title: 'Conversion failed',
        description: 'The file may be corrupted or password-protected.',
        variant: 'destructive',
      });
    } finally {
      setProcessing(false);
    }
  }, [pdfBuffer, pageCount, dpi, format, quality, bgColor, bgOption, customBgColor, file, addRecentFile, toast]);

  const downloadSingle = useCallback(
    (page: PageImage) => {
      const baseName = file?.name.replace('.pdf', '') || 'document';
      const ext = FORMAT_EXT[format];
      const fileName = `${baseName}-page-${page.pageNumber}.${ext}`;
      saveAs(page.blob, fileName);
      toast({ title: 'Download started', description: fileName });
    },
    [file, format, toast],
  );

  const downloadSelected = useCallback(async () => {
    const selected = pages.filter((p) => p.selected);
    if (selected.length === 0) return;

    if (selected.length === 1) {
      downloadSingle(selected[0]);
      return;
    }

    setProcessing(true);
    setStatusMessage('Creating ZIP for selected pages...');
    const zip = new JSZip();
    const baseName = file?.name.replace('.pdf', '') || 'document';

    for (const img of selected) {
      const ext = FORMAT_EXT[format];
      zip.file(`${baseName}-page-${img.pageNumber}.${ext}`, img.blob);
    }

    const zipContent = await zip.generateAsync({ type: 'blob' });
    const zipName = `${baseName}-selected-pages.zip`;
    saveAs(zipContent, zipName);
    setProcessing(false);
    setStatusMessage('');

    toast({
      title: 'ZIP download started',
      description: `${selected.length} pages · ${formatSize(zipContent.size)}`,
    });
  }, [pages, file, format, downloadSingle, toast]);

  const downloadAllAsZip = useCallback(() => {
    if (!zipBlob || !file) return;
    const zipName = file.name.replace('.pdf', '') + '-images.zip';
    saveAs(zipBlob, zipName);
    toast({
      title: 'ZIP download started',
      description: `Downloading ${zipName} (${formatSize(zipSize)})`,
    });
  }, [zipBlob, zipSize, file, toast]);

  // Helper to parse page ranges
  function parsePageRange(range: string, max: number): number[] {
    const parts = range.split(',').map((s) => s.trim());
    const result: number[] = [];

    for (const part of parts) {
      if (!part) continue;
      if (part === 'end') {
        result.push(max);
      } else if (part.includes('-')) {
        const [startStr, endStr] = part.split('-').map((s) => s.trim());
        const start = startStr === 'end' ? max : parseInt(startStr) || 1;
        const end = endStr === 'end' ? max : parseInt(endStr) || max;
        for (let i = Math.max(1, start); i <= Math.min(max, end); i++) {
          result.push(i);
        }
      } else {
        const num = parseInt(part);
        if (num >= 1 && num <= max) result.push(num);
      }
    }

    return [...new Set(result)].sort((a, b) => a - b);
  }

  const totalSize = pages.reduce((sum, p) => sum + p.size, 0);

  return (
    <ToolLayout
      title="PDF to Image"
      description="Convert PDF pages to high-quality JPG, PNG, or WebP images"
      toolId="pdf-to-image"
    >
      {!file ? (
        <FileDropzone
          onFiles={handleFiles}
          accept=".pdf,application/pdf"
          multiple={false}
          label="Drop PDF here or click to upload"
          sublabel="Convert every page of a PDF into images"
          icon="upload"
        />
      ) : (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
          {/* File Info Card */}
          <Card>
            <CardContent className="p-4 flex items-center gap-4">
              <div className="h-10 w-10 rounded-lg bg-red-100 dark:bg-red-950 flex items-center justify-center flex-shrink-0">
                <FileText className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{file.name}</p>
                <p className="text-sm text-muted-foreground">
                  {pageCount} pages &middot; {formatSize(file.size)}
                </p>
              </div>
              <Button variant="ghost" size="icon" disabled={processing} onClick={resetState}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </CardContent>
          </Card>

          {/* Settings Card */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Settings2 className="h-4 w-4" />
                Conversion Settings
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Output Format */}
                <div className="space-y-2">
                  <Label>Output Format</Label>
                  <Select value={format} onValueChange={(v) => setFormat(v as ImageFormat)}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="png">
                        <span className="flex items-center gap-2">
                          <Palette className="h-3.5 w-3.5" />
                          PNG — Lossless, supports transparency
                        </span>
                      </SelectItem>
                      <SelectItem value="jpeg">
                        <span className="flex items-center gap-2">
                          <ImageIcon className="h-3.5 w-3.5" />
                          JPEG — Small file size, universal
                        </span>
                      </SelectItem>
                      <SelectItem value="webp">
                        <span className="flex items-center gap-2">
                          <FileImage className="h-3.5 w-3.5" />
                          WebP — Modern, best compression
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* DPI */}
                <div className="space-y-2">
                  <Label>Resolution (DPI)</Label>
                  <Select value={String(dpi)} onValueChange={(v) => setDpi(Number(v))}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DPI_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={String(opt.value)}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Quality Slider (for JPEG & WebP) */}
              {format !== 'png' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Image Quality</Label>
                    <Badge variant="secondary" className="font-mono">{quality}%</Badge>
                  </div>
                  <Slider
                    value={[quality]}
                    onValueChange={(v) => setQuality(v[0])}
                    min={10}
                    max={100}
                    step={5}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Small file</span>
                    <span>Best quality</span>
                  </div>
                </div>
              )}

              {/* Background Color */}
              <div className="space-y-3">
                <Label>Background Color</Label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {BG_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all ${
                        bgOption === opt.label
                          ? 'border-primary bg-primary/5 font-medium'
                          : 'border-muted hover:border-muted-foreground/30'
                      }`}
                      onClick={() => {
                        setBgOption(opt.label);
                        if (opt.value !== 'custom') {
                          setBgColor(opt.value);
                        }
                      }}
                    >
                      {opt.value === 'transparent' ? (
                        <div className="h-4 w-4 rounded border border-muted-foreground/30 bg-[linear-gradient(45deg,transparent_40%,#ccc_40%,#ccc_60%,transparent_60%),linear-gradient(-45deg,transparent_40%,#ccc_40%,#ccc_60%,transparent_60%)] bg-[length:6px_6px]" />
                      ) : (
                        <div
                          className="h-4 w-4 rounded border border-muted-foreground/20"
                          style={{ backgroundColor: opt.value === 'custom' ? customBgColor : opt.value }}
                        />
                      )}
                      <span className="truncate">{opt.label}</span>
                    </button>
                  ))}
                </div>
                {bgOption === 'Custom' && (
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={customBgColor}
                      onChange={(e) => setCustomBgColor(e.target.value)}
                      className="h-8 w-12 rounded border cursor-pointer"
                    />
                    <span className="text-sm text-muted-foreground font-mono">{customBgColor}</span>
                  </div>
                )}
              </div>

              {/* Info Box */}
              <div className="p-3 rounded-lg bg-muted/50 border space-y-1">
                <p className="text-sm text-muted-foreground">
                  📄 <strong>{pageCount}</strong> pages will be converted to <strong>{FORMAT_EXT[format].toUpperCase()}</strong> at <strong>{dpi} DPI</strong>
                </p>
                {dpi >= 300 && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    ⚠️ High DPI may produce large files and take longer to process
                  </p>
                )}
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}

              {processing && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span>{statusMessage || 'Processing...'}</span>
                    <span className="font-medium">{progress}%</span>
                  </div>
                  <Progress value={progress} />
                </div>
              )}

              <Button
                className="w-full"
                size="lg"
                disabled={processing}
                onClick={convertToImages}
              >
                {processing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {statusMessage || 'Converting...'}
                  </>
                ) : pages.length > 0 ? (
                  <>
                    <Settings2 className="h-4 w-4 mr-2" />
                    Re-convert with New Settings
                  </>
                ) : (
                  <>
                    <FileImage className="h-4 w-4 mr-2" />
                    Convert {pageCount} Pages to {FORMAT_EXT[format].toUpperCase()}
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Results */}
          {pages.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
              {/* Summary Card */}
              <Card className="border-green-200 dark:border-green-900">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <CardTitle className="text-base text-green-700 dark:text-green-400">
                      ✅ Conversion Complete!
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="outline" onClick={downloadSelected} disabled={selectedCount === 0 || processing}>
                        <Download className="h-4 w-4 mr-1.5" />
                        {selectedCount > 0 ? `${selectedCount} Selected` : 'Download Selected'}
                      </Button>
                      <Button size="sm" onClick={downloadAllAsZip} disabled={processing}>
                        <Archive className="h-4 w-4 mr-1.5" />
                        ZIP ({formatSize(zipSize)})
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {/* Stats Row */}
                  <div className="flex flex-wrap gap-3 mb-4">
                    <Badge variant="secondary" className="text-xs">
                      📄 {pages.length} pages
                    </Badge>
                    <Badge variant="secondary" className="text-xs">
                      📐 {FORMAT_EXT[format].toUpperCase()}
                    </Badge>
                    <Badge variant="secondary" className="text-xs">
                      🔍 {dpi} DPI
                    </Badge>
                    <Badge variant="secondary" className="text-xs">
                      📦 Total: {formatSize(totalSize)}
                    </Badge>
                    <Badge variant="secondary" className="text-xs">
                      📥 ZIP: {formatSize(zipSize)}
                    </Badge>
                    {format !== 'png' && (
                      <Badge variant="secondary" className="text-xs">
                        🎯 {quality}% quality
                      </Badge>
                    )}
                  </div>

                  {/* Select All + Page Range */}
                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    <Button variant="outline" size="sm" onClick={toggleSelectAll} disabled={processing}>
                      <Check className="h-3.5 w-3.5 mr-1" />
                      {allSelected ? 'Deselect All' : 'Select All'}
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      or enter range:
                    </span>
                    <input
                      type="text"
                      className="h-8 w-32 px-2 text-xs border rounded-md bg-background"
                      placeholder="1-3, 5, 7-end"
                      onBlur={(e) => {
                        if (e.target.value.trim()) {
                          selectByRange(e.target.value.trim());
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                          selectByRange(e.currentTarget.value.trim());
                          (e.target as HTMLInputElement).value = '';
                        }
                      }}
                    />
                  </div>

                  {/* Page Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 max-h-[600px] overflow-y-auto pr-1 custom-scrollbar">
                    {pages.map((page) => (
                      <motion.div
                        key={page.pageNumber}
                        whileHover={{ scale: 1.03 }}
                        className={`relative cursor-pointer rounded-lg overflow-hidden border-2 transition-all group ${
                          page.selected
                            ? 'border-primary ring-2 ring-primary/20 shadow-md'
                            : 'border-muted hover:border-muted-foreground/30'
                        }`}
                      >
                        {/* Image Preview */}
                        <img
                          src={page.dataUrl}
                          alt={`Page ${page.pageNumber}`}
                          className="w-full h-auto"
                        />

                        {/* Page Number Overlay */}
                        <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-xs px-2 py-1 flex items-center justify-between">
                          <span>Page {page.pageNumber}</span>
                          <span className="opacity-80">{formatSize(page.size)}</span>
                        </div>

                        {/* Checkbox */}
                        <div className="absolute top-1.5 right-1.5">
                          <Checkbox
                            checked={page.selected}
                            onCheckedChange={() => togglePageSelection(page.pageNumber)}
                            className="h-4 w-4 bg-white/90 border-white/30"
                          />
                        </div>

                        {/* Hover Overlay */}
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                          <Button
                            size="icon"
                            variant="secondary"
                            className="h-8 w-8 rounded-full"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPreviewPage(page);
                            }}
                          >
                            <ZoomIn className="h-4 w-4" />
                          </Button>
                        </div>

                        {/* Dimension Badge */}
                        <div className="absolute top-1.5 left-1.5">
                          <Badge className="text-[9px] px-1.5 py-0 h-4 opacity-0 group-hover:opacity-100 transition-opacity" variant="secondary">
                            {page.width}×{page.height}
                          </Badge>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Individual page list */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <FileImage className="h-4 w-4" />
                    Page Details
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1 custom-scrollbar">
                    {pages.map((page) => (
                      <div
                        key={page.pageNumber}
                        className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors"
                      >
                        <Checkbox
                          checked={page.selected}
                          onCheckedChange={() => togglePageSelection(page.pageNumber)}
                          className="shrink-0"
                        />
                        <img
                          src={page.dataUrl}
                          alt={`Page ${page.pageNumber}`}
                          className="h-8 w-6 object-cover rounded border shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">
                            Page {page.pageNumber}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {page.width} × {page.height}px &middot; {formatSize(page.size)}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => downloadSingle(page)}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Thumbnails (when no results yet) */}
          {pages.length === 0 && thumbnailsLoading && (
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Loading page previews...</span>
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
                  {Array.from({ length: 12 }).map((_, i) => (
                    <Skeleton key={i} className="aspect-[3/4] rounded-lg" />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </motion.div>
      )}

      {/* Full-size Preview Dialog */}
      <Dialog open={!!previewPage} onOpenChange={(open) => !open && setPreviewPage(null)}>
        <DialogContent className="max-w-4xl w-[95vw] max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>
              Page {previewPage?.pageNumber} — {previewPage?.width} × {previewPage?.height}px
            </DialogTitle>
          </DialogHeader>
          {previewPage && (
            <div className="flex flex-col items-center gap-4">
              <div className="overflow-auto max-h-[70vh] w-full flex justify-center">
                <img
                  src={previewPage.dataUrl}
                  alt={`Page ${previewPage.pageNumber}`}
                  className="max-w-full h-auto"
                />
              </div>
              <div className="flex items-center gap-4">
                <Badge variant="secondary">{FORMAT_EXT[format].toUpperCase()}</Badge>
                <Badge variant="secondary">{formatSize(previewPage.size)}</Badge>
                <Badge variant="secondary">{dpi} DPI</Badge>
                <Button onClick={() => downloadSingle(previewPage)}>
                  <Download className="h-4 w-4 mr-1.5" />
                  Download This Page
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </ToolLayout>
  );
}
