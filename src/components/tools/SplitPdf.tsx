'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  Split,
  Loader2,
  FileText,
  Download,
  Trash2,
  Archive,
  GripVertical,
  Layers,
  Hash,
  Ruler,
  ImageIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
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
import { PDFDocument } from 'pdf-lib';
import { saveAs } from 'file-saver';
import JSZip from 'jszip';
import { formatSize, parsePageRange } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

interface ExtractedPage {
  pageNumber: number;
  blob: Blob;
  fileName: string;
}

type SplitMode = 'extract' | 'split' | 'size' | 'nth';

export function SplitPdf() {
  const { addRecentFile } = useAppStore();
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [mode, setMode] = useState<SplitMode>('extract');
  const [pageRange, setPageRange] = useState('');
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [results, setResults] = useState<ExtractedPage[]>([]);
  const [error, setError] = useState('');
  const [zipBlob, setZipBlob] = useState<Blob | null>(null);
  const [zipSize, setZipSize] = useState(0);

  // Thumbnail state
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [selectedPages, setSelectedPages] = useState<Set<number>>(new Set());
  const [thumbnailsLoading, setThumbnailsLoading] = useState(false);
  const thumbnailsRef = useRef<HTMLDivElement>(null);

  // Split by size state
  const [targetSizeMB, setTargetSizeMB] = useState(5);

  // Every Nth page state
  const [nthValue, setNthValue] = useState(2);
  const [nthOffset, setNthOffset] = useState(1);

  // Parse page range for extract mode - supports "end" keyword
  const parsedExtractPages = parsePageRange(pageRange, pageCount);

  const handleFiles = useCallback(
    async (files: File[]) => {
      const pdf = files.find((f) => f.type === 'application/pdf');
      if (pdf) {
        try {
          const buffer = await pdf.arrayBuffer();
          const pdfDoc = await PDFDocument.load(buffer);
          setPageCount(pdfDoc.getPageCount());
          setFile(pdf);
          setResults([]);
          setError('');
          setZipBlob(null);
          setZipSize(0);
          setProgress(0);
          setStatusMessage('');
          setSelectedPages(new Set());
          setThumbnails([]);

          // Generate thumbnails
          generateThumbnails(buffer, pdfDoc.getPageCount());
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
    [toast],
  );

  const generateThumbnails = useCallback(async (buffer: ArrayBuffer, count: number) => {
    setThumbnailsLoading(true);
    try {
      const pdfjsLib = await import('pdfjs-dist');
      pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
      const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
      const thumbs: string[] = [];
      const maxPages = Math.min(count, 50); // Limit for performance

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

  const togglePageSelection = useCallback(
    (pageNum: number) => {
      setSelectedPages((prev) => {
        const next = new Set(prev);
        if (next.has(pageNum)) {
          next.delete(pageNum);
        } else {
          next.add(pageNum);
        }
        return next;
      });
    },
    [],
  );

  const toggleSelectAll = useCallback(() => {
    if (selectedPages.size === pageCount) {
      setSelectedPages(new Set());
    } else {
      setSelectedPages(new Set(Array.from({ length: pageCount }, (_, i) => i + 1)));
    }
  }, [selectedPages.size, pageCount]);

  const syncRangeToSelection = useCallback(() => {
    if (pageRange.trim()) {
      const pages = parsePageRange(pageRange, pageCount);
      setSelectedPages(new Set(pages));
    }
  }, [pageRange, pageCount]);

  const syncSelectionToRange = useCallback(() => {
    if (selectedPages.size > 0) {
      const sorted = Array.from(selectedPages).sort((a, b) => a - b);
      setPageRange(sorted.join(', '));
    } else {
      setPageRange('');
    }
  }, [selectedPages]);

  // Sync selection when switching to extract mode
  useEffect(() => {
    if (mode === 'extract') {
      syncRangeToSelection();
    }
  }, [mode, syncRangeToSelection]);

  const getEstimatedFileCount = useCallback((): number | null => {
    if (!file || targetSizeMB <= 0) return null;
    const targetBytes = targetSizeMB * 1024 * 1024;
    return Math.ceil(file.size / targetBytes);
  }, [file, targetSizeMB]);

  const splitPdf = useCallback(async () => {
    if (!file) return;
    setProcessing(true);
    setProgress(0);
    setError('');
    setResults([]);
    setZipBlob(null);
    setZipSize(0);

    try {
      const buffer = await file.arrayBuffer();
      const sourcePdf = await PDFDocument.load(buffer);
      const extractedPages: ExtractedPage[] = [];

      if (mode === 'split') {
        // Split all pages into individual PDFs
        setStatusMessage('Splitting pages...');
        for (let i = 0; i < pageCount; i++) {
          const newPdf = await PDFDocument.create();
          const [page] = await newPdf.copyPages(sourcePdf, [i]);
          newPdf.addPage(page);
          const pdfBytes = await newPdf.save();
          const blob = new Blob([pdfBytes], { type: 'application/pdf' });
          extractedPages.push({
            pageNumber: i + 1,
            blob,
            fileName: `page-${i + 1}-${file.name}`,
          });
          setProgress(Math.round(((i + 1) / pageCount) * 80));
        }

        setResults(extractedPages);

        setStatusMessage('Creating ZIP archive...');
        setProgress(80);
        const zip = new JSZip();
        for (const ep of extractedPages) {
          zip.file(ep.fileName, ep.blob);
        }
        const zipContent = await zip.generateAsync({ type: 'blob' }, (meta) => {
          setProgress(Math.round(80 + (meta.percent / 100) * 20));
        });
        setZipBlob(zipContent);
        setZipSize(zipContent.size);
        setProgress(100);
        setStatusMessage('');

        toast({
          title: 'Split complete',
          description: `Created ${pageCount} individual pages. ZIP size: ${formatSize(zipContent.size)}`,
        });

        addRecentFile({
          id: crypto.randomUUID(),
          name: `${file.name.replace('.pdf', '')}-split.zip`,
          type: 'application/zip',
          tool: 'split-pdf',
          size: formatSize(zipContent.size),
          timestamp: Date.now(),
        });
      } else if (mode === 'extract') {
        // Extract specific pages using selection or range input
        const pagesToExtract = selectedPages.size > 0
          ? Array.from(selectedPages).sort((a, b) => a - b)
          : parsePageRange(pageRange, pageCount);

        if (pagesToExtract.length === 0) {
          setError('Invalid page range. Use format like: 1-3, 5, 7-9, 12-end');
          setProcessing(false);
          toast({
            title: 'Invalid page range',
            description: 'Please use the format: 1-3, 5, 7-9, 12-end',
            variant: 'destructive',
          });
          return;
        }

        setStatusMessage('Extracting pages...');
        const newPdf = await PDFDocument.create();
        for (let i = 0; i < pagesToExtract.length; i++) {
          const pageNum = pagesToExtract[i] - 1;
          const [page] = await newPdf.copyPages(sourcePdf, [pageNum]);
          newPdf.addPage(page);
          setProgress(Math.round(((i + 1) / pagesToExtract.length) * 100));
        }

        const pdfBytes = await newPdf.save();
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        extractedPages.push({
          pageNumber: -1,
          blob,
          fileName: `extracted-pages-${file.name}`,
        });

        setResults(extractedPages);
        setProgress(100);
        setStatusMessage('');

        toast({
          title: 'Extract complete',
          description: `Extracted ${pagesToExtract.length} page${pagesToExtract.length > 1 ? 's' : ''} (${formatSize(blob.size)})`,
        });

        addRecentFile({
          id: crypto.randomUUID(),
          name: extractedPages[0].fileName,
          type: 'application/pdf',
          tool: 'split-pdf',
          size: formatSize(blob.size),
          timestamp: Date.now(),
        });
      } else if (mode === 'size') {
        // Split by size
        const targetBytes = targetSizeMB * 1024 * 1024;
        setStatusMessage('Splitting by size...');
        const total = sourcePdf.getPageCount();

        // Build output files greedily
        let currentPdf = await PDFDocument.create();
        let currentSize = 0;
        const outputFiles: { pages: number[]; pdfDoc: typeof sourcePdf }[] = [];
        let currentPageIdx = 0;

        while (currentPageIdx < total) {
          const testPdf = await PDFDocument.create();
          const [copiedPage] = await testPdf.copyPages(sourcePdf, [currentPageIdx]);
          testPdf.addPage(copiedPage);
          const testBytes = await testPdf.save();
          const pageSize = testBytes.length;

          if (currentSize + pageSize > targetBytes && currentPdf.getPageCount() > 0) {
            // Save current and start new
            outputFiles.push({ pages: [], pdfDoc: currentPdf });
            currentPdf = await PDFDocument.create();
            currentSize = 0;
          }

          const [page] = await currentPdf.copyPages(sourcePdf, [currentPageIdx]);
          currentPdf.addPage(page);
          currentSize += pageSize;
          outputFiles[outputFiles.length - 1]?.pages.push(currentPageIdx + 1);
          if (outputFiles.length === 0) {
            outputFiles.push({ pages: [currentPageIdx + 1], pdfDoc: currentPdf });
          } else if (outputFiles[outputFiles.length - 1].pages[outputFiles[outputFiles.length - 1].pages.length - 1] !== currentPageIdx + 1) {
            outputFiles[outputFiles.length - 1].pages.push(currentPageIdx + 1);
          }
          currentPageIdx++;
          setProgress(Math.round((currentPageIdx / total) * 80));
        }

        // Fix: rebuild outputFiles properly
        const finalFiles: typeof outputFiles = [];
        currentPdf = await PDFDocument.create();
        currentSize = 0;
        currentPageIdx = 0;

        while (currentPageIdx < total) {
          const tempPdf = await PDFDocument.create();
          const [tempPage] = await tempPdf.copyPages(sourcePdf, [currentPageIdx]);
          tempPdf.addPage(tempPage);
          const tempBytes = await tempPdf.save();

          if (currentSize + tempBytes.length > targetBytes && currentPdf.getPageCount() > 0) {
            finalFiles.push(currentPdf);
            currentPdf = await PDFDocument.create();
            currentSize = 0;
          }

          const [page] = await currentPdf.copyPages(sourcePdf, [currentPageIdx]);
          currentPdf.addPage(page);
          currentSize += tempBytes.length;
          currentPageIdx++;
          setProgress(Math.round((currentPageIdx / total) * 80));
        }
        if (currentPdf.getPageCount() > 0) {
          finalFiles.push(currentPdf);
        }

        for (let i = 0; i < finalFiles.length; i++) {
          const pdfBytes = await finalFiles[i].save();
          const blob = new Blob([pdfBytes], { type: 'application/pdf' });
          const pageNumbers = finalFiles[i].getPages().length;
          extractedPages.push({
            pageNumber: i + 1,
            blob,
            fileName: `part-${i + 1}-(${pageNumbers}pages)-${file.name}`,
          });
        }

        setResults(extractedPages);

        setStatusMessage('Creating ZIP archive...');
        setProgress(80);
        const zip = new JSZip();
        for (const ep of extractedPages) {
          zip.file(ep.fileName, ep.blob);
        }
        const zipContent = await zip.generateAsync({ type: 'blob' }, (meta) => {
          setProgress(Math.round(80 + (meta.percent / 100) * 20));
        });
        setZipBlob(zipContent);
        setZipSize(zipContent.size);
        setProgress(100);
        setStatusMessage('');

        toast({
          title: 'Split by size complete',
          description: `Created ${extractedPages.length} files under ${targetSizeMB}MB. ZIP: ${formatSize(zipContent.size)}`,
        });

        addRecentFile({
          id: crypto.randomUUID(),
          name: `${file.name.replace('.pdf', '')}-split-by-size.zip`,
          type: 'application/zip',
          tool: 'split-pdf',
          size: formatSize(zipContent.size),
          timestamp: Date.now(),
        });
      } else if (mode === 'nth') {
        // Extract every Nth page
        const n = Math.max(1, nthValue);
        const offset = Math.max(1, Math.min(nthOffset, pageCount));
        const pagesToExtract: number[] = [];
        for (let p = offset; p <= pageCount; p += n) {
          pagesToExtract.push(p);
        }

        if (pagesToExtract.length === 0) {
          setError('No pages match the given N and offset values.');
          setProcessing(false);
          toast({
            title: 'No matching pages',
            description: 'Try adjusting N or the offset.',
            variant: 'destructive',
          });
          return;
        }

        setStatusMessage('Extracting every Nth page...');
        const newPdf = await PDFDocument.create();
        for (let i = 0; i < pagesToExtract.length; i++) {
          const pageNum = pagesToExtract[i] - 1;
          const [page] = await newPdf.copyPages(sourcePdf, [pageNum]);
          newPdf.addPage(page);
          setProgress(Math.round(((i + 1) / pagesToExtract.length) * 100));
        }

        const pdfBytes = await newPdf.save();
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        extractedPages.push({
          pageNumber: -1,
          blob,
          fileName: `every-${n}th-offset-${offset}-${file.name}`,
        });

        setResults(extractedPages);
        setProgress(100);
        setStatusMessage('');

        toast({
          title: 'Extract complete',
          description: `Extracted ${pagesToExtract.length} page${pagesToExtract.length > 1 ? 's' : ''} (every ${n}th from page ${offset}): ${formatSize(blob.size)}`,
        });

        addRecentFile({
          id: crypto.randomUUID(),
          name: extractedPages[0].fileName,
          type: 'application/pdf',
          tool: 'split-pdf',
          size: formatSize(blob.size),
          timestamp: Date.now(),
        });
      }
    } catch (err) {
      console.error('Split error:', err);
      setError('Failed to split the PDF. The file may be corrupted or password-protected.');
      toast({
        title: 'Split failed',
        description: 'The file may be corrupted or password-protected.',
        variant: 'destructive',
      });
    } finally {
      setProcessing(false);
    }
  }, [file, pageCount, mode, pageRange, selectedPages, targetSizeMB, nthValue, nthOffset, addRecentFile, toast]);

  const downloadResult = useCallback(
    (result: ExtractedPage) => {
      saveAs(result.blob, result.fileName);
      toast({
        title: 'Download started',
        description: `Downloading ${result.fileName}`,
      });
    },
    [toast],
  );

  const downloadAllAsZip = useCallback(() => {
    if (!zipBlob || !file) return;
    const zipName = file.name.replace('.pdf', '') + '-split.zip';
    saveAs(zipBlob, zipName);
    toast({
      title: 'ZIP download started',
      description: `Downloading ${zipName} (${formatSize(zipSize)})`,
    });
  }, [zipBlob, zipSize, file, toast]);

  const isExtractButtonDisabled = processing || (mode === 'extract' && selectedPages.size === 0 && pageRange.trim() === '');
  const isSizeButtonDisabled = processing || targetSizeMB <= 0;
  const isNthButtonDisabled = processing || nthValue < 1 || nthOffset < 1 || nthOffset > pageCount;
  const isButtonDisabled =
    mode === 'extract' ? isExtractButtonDisabled :
    mode === 'size' ? isSizeButtonDisabled :
    mode === 'nth' ? isNthButtonDisabled :
    processing;

  return (
    <ToolLayout
      title="Split PDF"
      description="Extract pages from a PDF or split into individual pages"
    >
      {!file ? (
        <FileDropzone
          onFiles={handleFiles}
          accept=".pdf,application/pdf"
          multiple={false}
          label="Drop PDF here or click to upload"
          sublabel="Select a PDF to split or extract pages"
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
              <Button
                variant="ghost"
                size="icon"
                disabled={processing}
                onClick={() => {
                  setFile(null);
                  setPageCount(0);
                  setResults([]);
                  setError('');
                  setZipBlob(null);
                  setZipSize(0);
                  setProgress(0);
                  setStatusMessage('');
                  setSelectedPages(new Set());
                  setThumbnails([]);
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </CardContent>
          </Card>

          {/* Visual Page Thumbnails Card */}
          {thumbnails.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <ImageIcon className="h-4 w-4" />
                    Page Thumbnails
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {selectedPages.size} of {pageCount} selected
                    </span>
                    <Button variant="outline" size="sm" onClick={toggleSelectAll} disabled={processing}>
                      {selectedPages.size === pageCount ? 'Deselect All' : 'Select All'}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div
                  ref={thumbnailsRef}
                  className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 max-h-96 overflow-y-auto pr-1"
                >
                  {thumbnails.map((thumb, idx) => {
                    const pageNum = idx + 1;
                    const isSelected = selectedPages.has(pageNum);
                    return (
                      <motion.div
                        key={idx}
                        whileHover={{ scale: 1.03 }}
                        className={`relative cursor-pointer rounded-lg overflow-hidden border-2 transition-all ${
                          isSelected
                            ? 'border-primary ring-2 ring-primary/20 shadow-md'
                            : 'border-muted hover:border-muted-foreground/30'
                        }`}
                        onClick={() => !processing && togglePageSelection(pageNum)}
                      >
                        <img
                          src={thumb}
                          alt={`Page ${pageNum}`}
                          className="w-full h-auto"
                        />
                        <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-xs px-1.5 py-0.5 flex items-center justify-between">
                          <span>{pageNum}</span>
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => togglePageSelection(pageNum)}
                            className="h-3 w-3"
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                        {isSelected && (
                          <div className="absolute top-1 right-1">
                            <Badge className="text-[10px] px-1 py-0 h-4" variant="default">
                              <GripVertical className="h-2.5 w-2.5" />
                            </Badge>
                          </div>
                        )}
                      </motion.div>
                    );
                  })}
                  {pageCount > 50 && (
                    <div className="col-span-full text-center py-3">
                      <p className="text-xs text-muted-foreground">
                        Showing first 50 of {pageCount} pages. Use page range input for all pages.
                      </p>
                    </div>
                  )}
                </div>
                {thumbnailsLoading && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                    {Array.from({ length: 12 }).map((_, i) => (
                      <Skeleton key={i} className="aspect-[3/4] rounded-lg" />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Split Options Card */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Split Options</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Mode</Label>
                <Select value={mode} onValueChange={(v) => setMode(v as SplitMode)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="extract">
                      <span className="flex items-center gap-2">
                        <Layers className="h-3.5 w-3.5" />
                        Extract specific pages
                      </span>
                    </SelectItem>
                    <SelectItem value="split">
                      <span className="flex items-center gap-2">
                        <Split className="h-3.5 w-3.5" />
                        Split into individual pages
                      </span>
                    </SelectItem>
                    <SelectItem value="size">
                      <span className="flex items-center gap-2">
                        <Ruler className="h-3.5 w-3.5" />
                        Split by size
                      </span>
                    </SelectItem>
                    <SelectItem value="nth">
                      <span className="flex items-center gap-2">
                        <Hash className="h-3.5 w-3.5" />
                        Every Nth page
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Extract mode inputs */}
              {mode === 'extract' && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="page-range">Page Range</Label>
                    <Input
                      id="page-range"
                      type="text"
                      value={pageRange}
                      onChange={(e) => setPageRange(e.target.value)}
                      onBlur={syncRangeToSelection}
                      placeholder="e.g., 1-3, 5, 7-10, 12-end"
                      disabled={processing}
                    />
                    <p className="text-xs text-muted-foreground">
                      Comma-separated ranges. Use &quot;end&quot; for last page. (1-{pageCount})
                    </p>
                    {parsedExtractPages.length > 0 && (
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="font-mono">
                          {parsedExtractPages.length}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          page{parsedExtractPages.length !== 1 ? 's' : ''} selected
                        </span>
                      </div>
                    )}
                  </div>
                  {selectedPages.size > 0 && (
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={syncSelectionToRange}
                        disabled={processing}
                      >
                        Sync thumbnails → range
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedPages(new Set());
                          setPageRange('');
                        }}
                        disabled={processing}
                      >
                        Clear selection
                      </Button>
                    </div>
                  )}
                </>
              )}

              {/* Split mode info */}
              {mode === 'split' && (
                <div className="text-sm text-muted-foreground">
                  Will create {pageCount} individual PDF files, bundled into a single ZIP download.
                </div>
              )}

              {/* Split by size inputs */}
              {mode === 'size' && (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="target-size">Target File Size (MB)</Label>
                    <Input
                      id="target-size"
                      type="number"
                      min={0.1}
                      step={0.5}
                      value={targetSizeMB}
                      onChange={(e) => setTargetSizeMB(parseFloat(e.target.value) || 0)}
                      disabled={processing}
                    />
                  </div>
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 border">
                    <Ruler className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">
                      Each output PDF will be under {targetSizeMB}MB
                    </span>
                  </div>
                  {getEstimatedFileCount() !== null && (
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="font-mono">
                        ~{getEstimatedFileCount()}
                      </Badge>
                      <span className="text-xs text-muted-foreground">estimated output files</span>
                    </div>
                  )}
                </div>
              )}

              {/* Every Nth page inputs */}
              {mode === 'nth' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="nth-value">Extract every Nth</Label>
                      <Input
                        id="nth-value"
                        type="number"
                        min={1}
                        value={nthValue}
                        onChange={(e) => setNthValue(parseInt(e.target.value) || 1)}
                        disabled={processing}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="nth-offset">Offset (start page)</Label>
                      <Input
                        id="nth-offset"
                        type="number"
                        min={1}
                        max={pageCount}
                        value={nthOffset}
                        onChange={(e) => setNthOffset(parseInt(e.target.value) || 1)}
                        disabled={processing}
                      />
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50 border">
                    <p className="text-sm text-muted-foreground">
                      Will extract pages:{' '}
                      <span className="font-mono font-medium text-foreground">
                        {Array.from(
                          { length: Math.min(8, Math.ceil((pageCount - nthOffset + 1) / Math.max(1, nthValue))) },
                          (_, i) => nthOffset + i * nthValue,
                        )
                          .filter((p) => p <= pageCount)
                          .join(', ')}
                        {Math.ceil((pageCount - nthOffset + 1) / Math.max(1, nthValue)) > 8 && ', ...'}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {Math.max(
                        0,
                        Math.ceil((pageCount - Math.max(1, nthOffset) + 1) / Math.max(1, nthValue)) +
                          (nthOffset <= pageCount ? 1 : 0),
                      ) > 8
                        ? `Total: ${(() => {
                            const n = Math.max(1, nthValue);
                            const off = Math.max(1, Math.min(nthOffset, pageCount));
                            let count = 0;
                            for (let p = off; p <= pageCount; p += n) count++;
                            return count;
                          })()} pages`
                        : ''}
                    </p>
                  </div>
                </div>
              )}

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

              <Button className="w-full" size="lg" disabled={isButtonDisabled} onClick={splitPdf}>
                {processing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {statusMessage || 'Processing...'}
                  </>
                ) : (
                  <>
                    <Split className="h-4 w-4 mr-2" />
                    {mode === 'split'
                      ? `Split into ${pageCount} Pages`
                      : mode === 'extract'
                        ? 'Extract Pages'
                        : mode === 'size'
                          ? `Split by ${targetSizeMB}MB`
                          : `Extract Every ${nthValue}${nthValue === 1 ? 'st' : nthValue === 2 ? 'nd' : nthValue === 3 ? 'rd' : 'th'} Page`}
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Results Card */}
          {results.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <Card className="border-green-200 dark:border-green-900">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base text-green-700 dark:text-green-400">
                      Split Complete!
                    </CardTitle>
                    {results.length > 1 && zipBlob && (
                      <Button size="sm" onClick={downloadAllAsZip}>
                        <Archive className="h-4 w-4 mr-2" />
                        Download ZIP ({formatSize(zipSize)})
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {results.length > 1 && zipBlob && (
                    <div className="mb-4 p-3 rounded-lg bg-muted/80 border">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-lg bg-amber-100 dark:bg-amber-950 flex items-center justify-center flex-shrink-0">
                          <Archive className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">
                            {file?.name.replace('.pdf', '')}-split.zip
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {results.length} files &middot; {formatSize(zipSize)} total
                          </p>
                        </div>
                        <Badge
                          variant="secondary"
                          className="text-xs bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400"
                        >
                          ZIP
                        </Badge>
                      </div>
                    </div>
                  )}

                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {results.map((r, idx) => (
                      <div
                        key={idx}
                        className="flex items-center gap-3 p-2 rounded-lg bg-muted/50"
                      >
                        <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{r.fileName}</p>
                          <p className="text-xs text-muted-foreground">{formatSize(r.blob.size)}</p>
                        </div>
                        <Badge variant="secondary" className="text-xs flex-shrink-0">
                          {r.pageNumber > 0 ? `Part ${r.pageNumber}` : `${results.length} pages`}
                        </Badge>
                        <Button size="sm" variant="ghost" onClick={() => downloadResult(r)}>
                          <Download className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </motion.div>
      )}
    </ToolLayout>
  );
}
