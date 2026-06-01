'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Trash2,
  Merge,
  Loader2,
  FileText,
  GripVertical,
  FilePlus2,
  ChevronDown,
  ChevronUp,
  Hash,
  HardDrive,
  FilePlus,
  Tag,
} from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Separator } from '@/components/ui/separator';
import { ToolLayout } from '@/components/shared/ToolLayout';
import { FileDropzone } from '@/components/shared/FileDropzone';
import { useAppStore } from '@/store';
import { useToast } from '@/hooks/use-toast';
import { formatSize, parsePageRange } from '@/lib/utils';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { saveAs } from 'file-saver';

interface PdfItem {
  file: File;
  id: string;
  pageCount: number;
  name: string;
  size: number;
  pageRange: string;
}

interface PdfMetadata {
  title: string;
  author: string;
  subject: string;
  keywords: string;
}

type PageNumberPosition =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';

const PAGE_NUMBER_OPTIONS: { value: PageNumberPosition; label: string }[] = [
  { value: 'top-left', label: 'Top-Left' },
  { value: 'top-center', label: 'Top-Center' },
  { value: 'top-right', label: 'Top-Right' },
  { value: 'bottom-left', label: 'Bottom-Left' },
  { value: 'bottom-center', label: 'Bottom-Center' },
  { value: 'bottom-right', label: 'Bottom-Right' },
];

function getSelectedPageCount(pdf: PdfItem): number {
  if (!pdf.pageRange.trim() || pdf.pageRange.trim().toLowerCase() === 'all') {
    return pdf.pageCount;
  }
  return parsePageRange(pdf.pageRange, pdf.pageCount).length;
}

function SortablePdfItem({
  pdf,
  index,
  onRemove,
  onPageRangeChange,
  processing,
}: {
  pdf: PdfItem;
  index: number;
  onRemove: (id: string) => void;
  onPageRangeChange: (id: string, value: string) => void;
  processing: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: pdf.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.85 : 1,
  };

  const selectedPages = getSelectedPageCount(pdf);
  const isCustomRange =
    pdf.pageRange.trim() && pdf.pageRange.trim().toLowerCase() !== 'all';

  return (
    <div ref={setNodeRef} style={style}>
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 20 }}
      >
        <Card className={isDragging ? 'shadow-lg ring-2 ring-primary/30' : ''}>
          <CardContent className="flex items-start gap-3 p-3">
            {/* Drag Handle */}
            <button
              className="mt-1.5 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground transition-colors shrink-0 touch-none"
              {...attributes}
              {...listeners}
              aria-label={`Drag to reorder ${pdf.name}`}
            >
              <GripVertical className="h-5 w-5" />
            </button>

            {/* Index Number */}
            <span className="text-muted-foreground text-sm font-mono w-5 text-center mt-2.5 shrink-0">
              {index + 1}
            </span>

            {/* PDF Icon */}
            <div className="h-10 w-10 rounded-lg bg-red-100 dark:bg-red-950 flex items-center justify-center shrink-0 mt-0.5">
              <FileText className="h-5 w-5 text-red-600 dark:text-red-400" />
            </div>

            {/* Info + Page Range */}
            <div className="flex-1 min-w-0 space-y-1.5">
              <div>
                <p className="text-sm font-medium truncate">{pdf.name}</p>
                <p className="text-xs text-muted-foreground">
                  {pdf.pageCount} page{pdf.pageCount > 1 ? 's' : ''} · {formatSize(pdf.size)}
                  {isCustomRange && (
                    <span className="text-primary font-medium">
                      {' '}
                      → {selectedPages} selected
                    </span>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-muted-foreground whitespace-nowrap">
                  Pages:
                </label>
                <Input
                  type="text"
                  placeholder="e.g. 1-3, 5, 7-9"
                  value={pdf.pageRange}
                  onChange={(e) => onPageRangeChange(pdf.id, e.target.value)}
                  className="h-7 text-xs font-mono"
                  disabled={processing}
                />
              </div>
            </div>

            {/* Delete Button */}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive shrink-0 mt-0.5"
              onClick={() => onRemove(pdf.id)}
              disabled={processing}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

export function MergePdf() {
  const { addRecentFile } = useAppStore();
  const { toast } = useToast();
  const [pdfs, setPdfs] = useState<PdfItem[]>([]);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);

  // Feature 1: PDF Metadata
  const [metadataOpen, setMetadataOpen] = useState(false);
  const [metadata, setMetadata] = useState<PdfMetadata>({
    title: '',
    author: '',
    subject: '',
    keywords: '',
  });

  // Feature 2: Page Numbering
  const [pageNumbersEnabled, setPageNumbersEnabled] = useState(false);
  const [pageNumberPosition, setPageNumberPosition] =
    useState<PageNumberPosition>('bottom-center');

  // Feature 3: Blank Page Insert
  const [insertBlankPages, setInsertBlankPages] = useState(false);

  // Feature 4: File Size Summary
  const [outputSize, setOutputSize] = useState<number | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 5 },
    }),
    useSensor(KeyboardSensor)
  );

  const totalInputSize = pdfs.reduce((sum, p) => sum + p.size, 0);
  const blankPageCount = insertBlankPages && pdfs.length > 1 ? pdfs.length - 1 : 0;

  const handleFiles = useCallback(async (files: File[]) => {
    const pdfFiles = files.filter((f) => f.type === 'application/pdf');
    if (pdfFiles.length === 0) {
      toast({
        title: 'No valid PDFs',
        description: 'Please select one or more PDF files.',
        variant: 'destructive',
      });
      return;
    }

    const newItems: PdfItem[] = [];
    let failedCount = 0;

    for (const file of pdfFiles) {
      try {
        const buffer = await file.arrayBuffer();
        const pdfDoc = await PDFDocument.load(buffer);
        newItems.push({
          file,
          id: crypto.randomUUID(),
          pageCount: pdfDoc.getPageCount(),
          name: file.name,
          size: file.size,
          pageRange: '',
        });
      } catch (err) {
        console.error('Failed to load PDF:', file.name, err);
        failedCount++;
      }
    }

    if (failedCount > 0) {
      toast({
        title: 'Some files failed to load',
        description: `${failedCount} file${failedCount > 1 ? 's' : ''} could not be read as valid PDFs and were skipped.`,
        variant: 'destructive',
      });
    }

    if (newItems.length > 0) {
      setPdfs((prev) => [...prev, ...newItems]);
      setOutputSize(null);
      toast({
        title: 'PDFs added',
        description: `${newItems.length} PDF${newItems.length > 1 ? 's' : ''} added successfully.`,
      });
    }
  }, [toast]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setPdfs((prev) => {
      const oldIndex = prev.findIndex((p) => p.id === active.id);
      const newIndex = prev.findIndex((p) => p.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  }, []);

  const removePdf = useCallback((id: string) => {
    setPdfs((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const handlePageRangeChange = useCallback((id: string, value: string) => {
    setPdfs((prev) =>
      prev.map((p) => (p.id === id ? { ...p, pageRange: value } : p))
    );
  }, []);

  const mergePdfs = useCallback(async () => {
    if (pdfs.length < 2) return;
    setProcessing(true);
    setProgress(0);
    setOutputSize(null);

    try {
      const mergedPdf = await PDFDocument.create();
      let totalCopied = 0;

      for (let i = 0; i < pdfs.length; i++) {
        const pdf = pdfs[i];
        const buffer = await pdf.file.arrayBuffer();
        const sourcePdf = await PDFDocument.load(buffer);

        let indices: number[];
        const rangeStr = pdf.pageRange.trim().toLowerCase();
        if (!rangeStr || rangeStr === 'all') {
          indices = sourcePdf.getPageIndices();
        } else {
          const parsed = parsePageRange(pdf.pageRange, pdf.pageCount);
          if (parsed.length === 0) {
            toast({
              title: `Invalid page range: ${pdf.name}`,
              description: `"${pdf.pageRange}" did not match any pages in this ${pdf.pageCount}-page PDF. Skipping.`,
              variant: 'destructive',
            });
            continue;
          }
          // Convert 1-based page numbers to 0-based indices
          indices = parsed.map((p) => p - 1);
        }

        const pages = await mergedPdf.copyPages(sourcePdf, indices);
        pages.forEach((page) => mergedPdf.addPage(page));
        totalCopied += pages.length;

        // Feature 3: Insert blank A4 page between documents
        if (insertBlankPages && i < pdfs.length - 1) {
          const blankPage = mergedPdf.addPage([595.28, 841.89]); // A4 size in points
          totalCopied += 1;
        }

        setProgress(Math.round(((i + 1) / pdfs.length) * 100));
      }

      if (totalCopied === 0) {
        toast({
          title: 'No pages to merge',
          description: 'The selected page ranges did not match any pages.',
          variant: 'destructive',
        });
        return;
      }

      // Feature 1: Apply metadata
      if (
        metadata.title ||
        metadata.author ||
        metadata.subject ||
        metadata.keywords
      ) {
        if (metadata.title) mergedPdf.setTitle(metadata.title);
        if (metadata.author) mergedPdf.setAuthor(metadata.author);
        if (metadata.subject) mergedPdf.setSubject(metadata.subject);
        if (metadata.keywords) mergedPdf.setKeywords(metadata.keywords);
      }
      mergedPdf.setProducer('SnapPDF');
      mergedPdf.setCreator('SnapPDF');

      // Feature 2: Page Numbering
      if (pageNumbersEnabled) {
        const helveticaFont = await mergedPdf.embedFont(StandardFonts.Helvetica);
        const totalPages = mergedPdf.getPageCount();
        const fontSize = 10;
        const margin = 40;

        for (let p = 0; p < totalPages; p++) {
          const page = mergedPdf.getPage(p);
          const { width, height } = page.getSize();
          const text = `Page ${p + 1} of ${totalPages}`;
          const textWidth = helveticaFont.widthOfTextAtSize(text, fontSize);

          let x: number;
          let y: number;

          // Horizontal position
          if (pageNumberPosition.includes('left')) {
            x = margin;
          } else if (pageNumberPosition.includes('center')) {
            x = (width - textWidth) / 2;
          } else {
            x = width - textWidth - margin;
          }

          // Vertical position
          if (pageNumberPosition.includes('top')) {
            y = height - margin;
          } else {
            y = margin - fontSize + 4;
          }

          page.drawText(text, {
            x,
            y,
            size: fontSize,
            font: helveticaFont,
            color: rgb(0.3, 0.3, 0.3),
          });
        }
      }

      const mergedBytes = await mergedPdf.save();
      const blob = new Blob([mergedBytes], { type: 'application/pdf' });
      const outputBytes = blob.size;
      setOutputSize(outputBytes);
      const fileName = `merged-${Date.now()}.pdf`;
      saveAs(blob, fileName);

      addRecentFile({
        id: crypto.randomUUID(),
        name: fileName,
        type: 'application/pdf',
        tool: 'merge-pdf',
        size: formatSize(blob.size),
        timestamp: Date.now(),
      });

      // Build toast description with size info
      const ratio = totalInputSize > 0
        ? ((outputBytes / totalInputSize) * 100).toFixed(1)
        : '100.0';
      const sizeDescription = `${totalInputSize > 0 ? `${formatSize(totalInputSize)} → ${formatSize(outputBytes)} (${ratio}% size)` : `${formatSize(outputBytes)}`}`;

      toast({
        title: 'Merge complete!',
        description: `${pdfs.length} PDFs merged into ${totalCopied} pages. ${sizeDescription}`,
      });
    } catch (err) {
      console.error('Merge error:', err);
      toast({
        title: 'Merge failed',
        description: 'An unexpected error occurred while merging your PDFs. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setProcessing(false);
    }
  }, [pdfs, insertBlankPages, metadata, pageNumbersEnabled, pageNumberPosition, totalInputSize, addRecentFile, toast]);

  const estimatedTotalPages = pdfs.reduce(
    (sum, p) => sum + getSelectedPageCount(p),
    0
  ) + blankPageCount;
  const hasCustomRanges = pdfs.some(
    (p) => p.pageRange.trim() && p.pageRange.trim().toLowerCase() !== 'all'
  );
  const allPagesTotal = pdfs.reduce((sum, p) => sum + p.pageCount, 0);

  return (
    <ToolLayout
      title="Merge PDFs"
      description="Combine multiple PDF files into a single document"
    >
      <FileDropzone
        onFiles={handleFiles}
        accept=".pdf,application/pdf"
        multiple
        label="Drop PDF files here or click to upload"
        sublabel="Add 2 or more PDF files to merge"
      />

      {pdfs.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="space-y-4"
        >
          {/* Header */}
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-lg">
              {pdfs.length} PDF{pdfs.length > 1 ? 's' : ''} ·{' '}
              <span className="text-primary">
                ~{estimatedTotalPages} page{estimatedTotalPages !== 1 ? 's' : ''}
              </span>
              {hasCustomRanges && (
                <span className="text-muted-foreground font-normal">
                  {' '}
                  (of {allPagesTotal} total)
                </span>
              )}
            </h3>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                setPdfs([]);
                setOutputSize(null);
              }}
              disabled={processing}
            >
              Clear All
            </Button>
          </div>

          {/* Feature 4: File Size Summary Bar (before merge) */}
          <Card className="p-3">
            <div className="flex items-center gap-2 text-sm">
              <HardDrive className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">Total input:</span>
              <span className="font-medium">{formatSize(totalInputSize)}</span>
              <span className="text-muted-foreground">across {pdfs.length} files</span>
              {outputSize !== null && (
                <>
                  <Separator orientation="vertical" className="h-4 mx-1" />
                  <span className="text-muted-foreground">Output:</span>
                  <span className="font-medium text-primary">
                    {formatSize(outputSize)}
                  </span>
                  {totalInputSize > 0 && (
                    <span className="text-xs text-muted-foreground">
                      ({((outputSize / totalInputSize) * 100).toFixed(1)}% of input)
                    </span>
                  )}
                </>
              )}
            </div>
          </Card>

          {/* Page Range Help */}
          <p className="text-xs text-muted-foreground">
            Use the page range input to select specific pages. Use &quot;all&quot; for every page,
            or enter ranges like &quot;1-3, 5, 7-9&quot;. Drag items to reorder.
          </p>

          {/* Sortable PDF List */}
          <div className="space-y-2 max-h-[28rem] overflow-y-auto pr-1">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={pdfs.map((p) => p.id)}
                strategy={verticalListSortingStrategy}
              >
                <AnimatePresence>
                  {pdfs.map((pdf, index) => (
                    <SortablePdfItem
                      key={pdf.id}
                      pdf={pdf}
                      index={index}
                      onRemove={removePdf}
                      onPageRangeChange={handlePageRangeChange}
                      processing={processing}
                    />
                  ))}
                </AnimatePresence>
              </SortableContext>
            </DndContext>
          </div>

          {/* Feature 1: PDF Metadata Editor */}
          <Collapsible open={metadataOpen} onOpenChange={setMetadataOpen}>
            <CollapsibleTrigger asChild>
              <Button
                variant="outline"
                className="w-full justify-between"
                disabled={processing}
              >
                <span className="flex items-center gap-2">
                  <Tag className="h-4 w-4" />
                  PDF Metadata
                </span>
                {metadataOpen ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-2 space-y-3"
              >
                <Card className="p-4 space-y-3">
                  <p className="text-xs text-muted-foreground">
                    Set metadata for the merged PDF. Leave fields blank to skip.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="meta-title" className="text-xs">
                        Title
                      </Label>
                      <Input
                        id="meta-title"
                        placeholder="Document title"
                        value={metadata.title}
                        onChange={(e) =>
                          setMetadata((m) => ({ ...m, title: e.target.value }))
                        }
                        disabled={processing}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="meta-author" className="text-xs">
                        Author
                      </Label>
                      <Input
                        id="meta-author"
                        placeholder="Author name"
                        value={metadata.author}
                        onChange={(e) =>
                          setMetadata((m) => ({ ...m, author: e.target.value }))
                        }
                        disabled={processing}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="meta-subject" className="text-xs">
                        Subject
                      </Label>
                      <Input
                        id="meta-subject"
                        placeholder="Subject or topic"
                        value={metadata.subject}
                        onChange={(e) =>
                          setMetadata((m) => ({ ...m, subject: e.target.value }))
                        }
                        disabled={processing}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="meta-keywords" className="text-xs">
                        Keywords
                      </Label>
                      <Input
                        id="meta-keywords"
                        placeholder="tag1, tag2, tag3"
                        value={metadata.keywords}
                        onChange={(e) =>
                          setMetadata((m) => ({ ...m, keywords: e.target.value }))
                        }
                        disabled={processing}
                      />
                      <p className="text-xs text-muted-foreground">
                        Comma separated
                      </p>
                    </div>
                  </div>
                </Card>
              </motion.div>
            </CollapsibleContent>
          </Collapsible>

          {/* Feature 2: Page Numbering */}
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Hash className="h-4 w-4 text-muted-foreground" />
                <Label htmlFor="page-numbers-switch" className="text-sm font-medium cursor-pointer">
                  Page Numbers
                </Label>
              </div>
              <Switch
                id="page-numbers-switch"
                checked={pageNumbersEnabled}
                onCheckedChange={setPageNumbersEnabled}
                disabled={processing}
              />
            </div>
            <AnimatePresence>
              {pageNumbersEnabled && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-3"
                >
                  <div className="flex items-center gap-3">
                    <Label className="text-xs text-muted-foreground whitespace-nowrap">
                      Position:
                    </Label>
                    <Select
                      value={pageNumberPosition}
                      onValueChange={(v) =>
                        setPageNumberPosition(v as PageNumberPosition)
                      }
                      disabled={processing}
                    >
                      <SelectTrigger className="h-8 text-xs w-[160px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PAGE_NUMBER_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Format: &quot;Page X of Y&quot; — drawn using Helvetica font
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </Card>

          {/* Feature 3: Blank Page Insert */}
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FilePlus className="h-4 w-4 text-muted-foreground" />
                <Label htmlFor="blank-pages-switch" className="text-sm font-medium cursor-pointer">
                  Insert Blank Pages Between Documents
                </Label>
              </div>
              <Switch
                id="blank-pages-switch"
                checked={insertBlankPages}
                onCheckedChange={setInsertBlankPages}
                disabled={processing}
              />
            </div>
            <AnimatePresence>
              {insertBlankPages && blankPageCount > 0 && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-2"
                >
                  <p className="text-xs text-primary font-medium">
                    Will insert {blankPageCount} blank page{blankPageCount !== 1 ? 's' : ''} (A4 size)
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </Card>

          {/* Progress Bar */}
          {processing && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-2"
            >
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Merging PDFs...</span>
                <span className="font-medium">{progress}%</span>
              </div>
              <Progress value={progress} />
            </motion.div>
          )}

          {/* Merge Button with size info */}
          <Button
            className="w-full"
            size="lg"
            disabled={pdfs.length < 2 || processing}
            onClick={mergePdfs}
          >
            {processing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Merging...
              </>
            ) : (
              <>
                <Merge className="h-4 w-4 mr-2" />
                Merge {pdfs.length} PDFs
                {hasCustomRanges && (
                  <span className="ml-2 text-sm opacity-80">
                    (~{estimatedTotalPages} pages)
                  </span>
                )}
                <span className="ml-2 text-sm opacity-60">
                  ({formatSize(totalInputSize)} total)
                </span>
              </>
            )}
          </Button>

          {/* Add More Files */}
          {!processing && (
            <FileDropzone
              onFiles={handleFiles}
              accept=".pdf,application/pdf"
              multiple
              compact
              label=""
              sublabel=""
              icon="plus"
            >
              <div className="flex items-center justify-center gap-2 py-2 text-sm text-muted-foreground">
                <FilePlus2 className="h-4 w-4" />
                Add more PDFs
              </div>
            </FileDropzone>
          )}
        </motion.div>
      )}
    </ToolLayout>
  );
}
