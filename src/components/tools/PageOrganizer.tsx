'use client';

import { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Layers,
  Loader2,
  FileText,
  Download,
  Trash2,
  GripVertical,
  RotateCw,
  RotateCcw,
  Copy,
  ArrowUpDown,
  CheckSquare,
  Square,
  X,
  FileDown,
} from 'lucide-react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  arrayMove,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { ToolLayout } from '@/components/shared/ToolLayout';
import { FileDropzone } from '@/components/shared/FileDropzone';
import { useAppStore } from '@/store';
import { useToast } from '@/hooks/use-toast';
import { formatSize } from '@/lib/utils';
import { PDFDocument, degrees } from 'pdf-lib';
import { saveAs } from 'file-saver';

interface PageItem {
  id: string;
  originalIndex: number;
  rotation: number;
  thumbnail: string;
  selected: boolean;
}

function SortablePageThumbnail({
  item,
  index,
  onToggleSelect,
  onRotateLeft,
  onRotateRight,
  onDelete,
  processing,
}: {
  item: PageItem;
  index: number;
  onToggleSelect: (id: string) => void;
  onRotateLeft: (id: string) => void;
  onRotateRight: (id: string) => void;
  onDelete: (id: string) => void;
  processing: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.85 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.8 }}
        transition={{ duration: 0.2 }}
        className={`relative group rounded-xl overflow-hidden border-2 transition-all duration-200 ${
          item.selected
            ? 'border-primary ring-2 ring-primary/30 shadow-lg shadow-primary/10'
            : 'border-muted hover:border-muted-foreground/30'
        } ${isDragging ? 'shadow-2xl ring-2 ring-primary/40 scale-105' : ''}`}
      >
        {/* Thumbnail Image with Rotation */}
        <div
          className="relative aspect-[3/4] bg-muted/30"
          style={{
            transform: `rotate(${item.rotation}deg)`,
            transition: 'transform 0.3s ease',
          }}
        >
          <img
            src={item.thumbnail}
            alt={`Page ${item.originalIndex + 1}`}
            className="w-full h-full object-contain"
            draggable={false}
          />
        </div>

        {/* Grip Handle */}
        <button
          className="absolute top-1.5 left-1.5 bg-background/80 backdrop-blur-sm rounded-md p-1 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
          {...attributes}
          {...listeners}
          aria-label="Drag to reorder"
        >
          <GripVertical className="h-4 w-4" />
        </button>

        {/* Page Number Badge */}
        <Badge
          className="absolute bottom-1.5 right-1.5 text-[10px] px-1.5 py-0 h-5 font-mono"
          variant={item.selected ? 'default' : 'secondary'}
        >
          {item.originalIndex + 1}
        </Badge>

        {/* Selection Indicator */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect(item.id);
          }}
          className="absolute top-1.5 right-1.5 bg-background/80 backdrop-blur-sm rounded-md p-1 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          {item.selected ? (
            <CheckSquare className="h-4 w-4 text-primary" />
          ) : (
            <Square className="h-4 w-4 text-muted-foreground" />
          )}
        </button>

        {/* Action Buttons Overlay */}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent pt-8 pb-1 px-1.5 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="flex items-center gap-0.5">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRotateLeft(item.id);
              }}
              disabled={processing}
              className="bg-background/90 backdrop-blur-sm rounded-md p-1 hover:bg-background transition-colors"
              aria-label="Rotate left"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRotateRight(item.id);
              }}
              disabled={processing}
              className="bg-background/90 backdrop-blur-sm rounded-md p-1 hover:bg-background transition-colors"
              aria-label="Rotate right"
            >
              <RotateCw className="h-3.5 w-3.5" />
            </button>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(item.id);
            }}
            disabled={processing}
            className="bg-destructive/90 backdrop-blur-sm rounded-md p-1 hover:bg-destructive transition-colors"
            aria-label="Delete page"
          >
            <X className="h-3.5 w-3.5 text-white" />
          </button>
        </div>

        {/* Rotation indicator when rotated */}
        {item.rotation !== 0 && (
          <div className="absolute top-1.5 left-1/2 -translate-x-1/2">
            <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 border-primary/50">
              {item.rotation}°
            </Badge>
          </div>
        )}
      </motion.div>
    </div>
  );
}

export function PageOrganizer() {
  const { addRecentFile } = useAppStore();
  const { toast } = useToast();

  const [file, setFile] = useState<File | null>(null);
  const [pages, setPages] = useState<PageItem[]>([]);
  const [pdfBuffer, setPdfBuffer] = useState<ArrayBuffer | null>(null);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [thumbnailsLoading, setThumbnailsLoading] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
  );

  const selectedCount = pages.filter((p) => p.selected).length;
  const allSelected = pages.length > 0 && selectedCount === pages.length;

  const handleFiles = useCallback(
    async (files: File[]) => {
      const pdf = files.find((f) => f.type === 'application/pdf');
      if (!pdf) {
        toast({
          title: 'No valid PDF',
          description: 'Please select a PDF file.',
          variant: 'destructive',
        });
        return;
      }

      try {
        const buffer = await pdf.arrayBuffer();
        const pdfDoc = await PDFDocument.load(buffer);
        const pageCount = pdfDoc.getPageCount();

        if (pageCount === 0) {
          toast({
            title: 'Empty PDF',
            description: 'This PDF has no pages.',
            variant: 'destructive',
          });
          return;
        }

        setFile(pdf);
        setPdfBuffer(buffer.slice(0));
        setPages([]);
        setProcessing(false);
        setProgress(0);
        setThumbnailsLoading(true);

        // Generate thumbnails
        const pdfjsLib = await import('pdfjs-dist');
        pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
        const pdfJs = await pdfjsLib.getDocument({ data: buffer.slice(0) }).promise;
        const maxPages = Math.min(pageCount, 50);
        const newPages: PageItem[] = [];

        for (let i = 0; i < maxPages; i++) {
          const page = await pdfJs.getPage(i + 1);
          const viewport = page.getViewport({ scale: 0.4 });
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            await page.render({ canvasContext: ctx, viewport }).promise;
            newPages.push({
              id: crypto.randomUUID(),
              originalIndex: i,
              rotation: 0,
              thumbnail: canvas.toDataURL('image/jpeg', 0.6),
              selected: false,
            });
          }
        }

        setPages(newPages);
        setThumbnailsLoading(false);

        toast({
          title: 'PDF loaded',
          description: `${pageCount} page${pageCount > 1 ? 's' : ''} loaded successfully. ${pageCount > 50 ? 'Showing first 50.' : ''}`,
        });
      } catch (err) {
        console.error('Failed to load PDF:', err);
        setThumbnailsLoading(false);
        toast({
          title: 'Failed to load PDF',
          description: 'The file may be corrupted or password-protected.',
          variant: 'destructive',
        });
      }
    },
    [toast],
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setPages((prev) => {
      const oldIndex = prev.findIndex((p) => p.id === active.id);
      const newIndex = prev.findIndex((p) => p.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  }, []);

  const toggleSelect = useCallback((id: string) => {
    setPages((prev) =>
      prev.map((p) => (p.id === id ? { ...p, selected: !p.selected } : p)),
    );
  }, []);

  const toggleSelectAll = useCallback(() => {
    setPages((prev) => {
      const shouldSelect = !prev.every((p) => p.selected);
      return prev.map((p) => ({ ...p, selected: shouldSelect }));
    });
  }, []);

  const rotateRight = useCallback((id: string) => {
    setPages((prev) =>
      prev.map((p) =>
        p.id === id ? { ...p, rotation: (p.rotation + 90) % 360 } : p,
      ),
    );
  }, []);

  const rotateLeft = useCallback((id: string) => {
    setPages((prev) =>
      prev.map((p) =>
        p.id === id
          ? { ...p, rotation: (p.rotation - 90 + 360) % 360 }
          : p,
      ),
    );
  }, []);

  const deletePage = useCallback((id: string) => {
    setPages((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const deleteSelected = useCallback(() => {
    setPages((prev) => prev.filter((p) => !p.selected));
    toast({
      title: 'Pages deleted',
      description: `${selectedCount} page${selectedCount !== 1 ? 's' : ''} removed.`,
    });
  }, [selectedCount, toast]);

  const extractSelected = useCallback(async () => {
    if (!pdfBuffer || selectedCount === 0) return;
    setProcessing(true);
    setProgress(0);

    try {
      const sourcePdf = await PDFDocument.load(pdfBuffer.slice(0));
      const newPdf = await PDFDocument.create();
      const selectedPages = pages.filter((p) => p.selected);

      for (let i = 0; i < selectedPages.length; i++) {
        const [page] = await newPdf.copyPages(sourcePdf, [
          selectedPages[i].originalIndex,
        ]);
        const rotatedPage = newPdf.addPage(page);
        rotatedPage.setRotation(degrees(selectedPages[i].rotation));
        setProgress(Math.round(((i + 1) / selectedPages.length) * 100));
      }

      const pdfBytes = await newPdf.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const fileName = `extracted-${file?.name || 'pages.pdf'}`;
      saveAs(blob, fileName);

      addRecentFile({
        id: crypto.randomUUID(),
        name: fileName,
        type: 'application/pdf',
        tool: 'split-pdf',
        size: formatSize(blob.size),
        timestamp: Date.now(),
      });

      toast({
        title: 'Extract complete',
        description: `Extracted ${selectedCount} page${selectedCount !== 1 ? 's' : ''} (${formatSize(blob.size)})`,
      });
    } catch (err) {
      console.error('Extract error:', err);
      toast({
        title: 'Extract failed',
        description: 'An error occurred while extracting pages.',
        variant: 'destructive',
      });
    } finally {
      setProcessing(false);
    }
  }, [pdfBuffer, selectedCount, pages, file, addRecentFile, toast]);

  const reverseAll = useCallback(() => {
    setPages((prev) => [...prev].reverse());
    toast({
      title: 'Pages reversed',
      description: 'Page order has been reversed.',
    });
  }, [toast]);

  const removeDuplicates = useCallback(() => {
    // Remove duplicate pages based on thumbnail data URL comparison
    const seen = new Set<string>();
    setPages((prev) => {
      const filtered = prev.filter((p) => {
        if (seen.has(p.thumbnail)) return false;
        seen.add(p.thumbnail);
        return true;
      });
      const removed = prev.length - filtered.length;
      if (removed > 0) {
        toast({
          title: 'Duplicates removed',
          description: `Removed ${removed} duplicate page${removed !== 1 ? 's' : ''}.`,
        });
      } else {
        toast({
          title: 'No duplicates found',
          description: 'All pages are unique.',
        });
      }
      return filtered;
    });
  }, [toast]);

  const downloadReorganized = useCallback(async () => {
    if (!pdfBuffer || pages.length === 0) return;
    setProcessing(true);
    setProgress(0);

    try {
      const sourcePdf = await PDFDocument.load(pdfBuffer.slice(0));
      const newPdf = await PDFDocument.create();

      for (let i = 0; i < pages.length; i++) {
        const [page] = await newPdf.copyPages(sourcePdf, [
          pages[i].originalIndex,
        ]);
        const rotatedPage = newPdf.addPage(page);
        rotatedPage.setRotation(degrees(pages[i].rotation));
        setProgress(Math.round(((i + 1) / pages.length) * 100));
      }

      const pdfBytes = await newPdf.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const fileName = `reorganized-${file?.name || 'document.pdf'}`;
      saveAs(blob, fileName);

      addRecentFile({
        id: crypto.randomUUID(),
        name: fileName,
        type: 'application/pdf',
        tool: 'split-pdf',
        size: formatSize(blob.size),
        timestamp: Date.now(),
      });

      toast({
        title: 'Download complete',
        description: `Reorganized PDF with ${pages.length} page${pages.length !== 1 ? 's' : ''} (${formatSize(blob.size)})`,
      });
    } catch (err) {
      console.error('Reorganize error:', err);
      toast({
        title: 'Reorganize failed',
        description: 'An error occurred while creating the PDF.',
        variant: 'destructive',
      });
    } finally {
      setProcessing(false);
    }
  }, [pdfBuffer, pages, file, addRecentFile, toast]);

  const resetAll = useCallback(() => {
    setFile(null);
    setPages([]);
    setPdfBuffer(null);
    setProcessing(false);
    setProgress(0);
    setThumbnailsLoading(false);
  }, []);

  return (
    <ToolLayout
      title="Page Organizer"
      description="Reorder, rotate, delete, and extract pages from your PDF"
    >
      {!file ? (
        <FileDropzone
          onFiles={handleFiles}
          accept=".pdf,application/pdf"
          multiple={false}
          label="Drop PDF here or click to upload"
          sublabel="Select a PDF to organize its pages"
        />
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="space-y-4"
        >
          {/* File Info */}
          <Card>
            <CardContent className="p-4 flex items-center gap-4">
              <div className="h-10 w-10 rounded-lg bg-red-100 dark:bg-red-950 flex items-center justify-center shrink-0">
                <FileText className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{file.name}</p>
                <p className="text-sm text-muted-foreground">
                  {formatSize(file.size)} &middot; {pages.length} page
                  {pages.length !== 1 ? 's' : ''}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={resetAll}
                disabled={processing}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </CardContent>
          </Card>

          {/* Toolbar */}
          <Card>
            <CardContent className="p-3">
              <div className="flex flex-wrap items-center gap-2">
                {/* Select All */}
                <Button
                  variant={allSelected ? 'default' : 'outline'}
                  size="sm"
                  onClick={toggleSelectAll}
                  disabled={processing || pages.length === 0}
                >
                  {allSelected ? (
                    <>
                      <Square className="h-3.5 w-3.5 mr-1.5" />
                      Deselect All
                    </>
                  ) : (
                    <>
                      <CheckSquare className="h-3.5 w-3.5 mr-1.5" />
                      Select All
                    </>
                  )}
                </Button>

                <Separator orientation="vertical" className="h-6" />

                {/* Reverse All */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={reverseAll}
                  disabled={processing || pages.length <= 1}
                >
                  <ArrowUpDown className="h-3.5 w-3.5 mr-1.5" />
                  Reverse
                </Button>

                {/* Remove Duplicates */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={removeDuplicates}
                  disabled={processing || pages.length <= 1}
                >
                  <Copy className="h-3.5 w-3.5 mr-1.5" />
                  Remove Duplicates
                </Button>

                <Separator orientation="vertical" className="h-6" />

                {/* Batch Delete */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={deleteSelected}
                  disabled={processing || selectedCount === 0}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                  Delete Selected ({selectedCount})
                </Button>

                {/* Batch Extract */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={extractSelected}
                  disabled={processing || selectedCount === 0}
                >
                  <Layers className="h-3.5 w-3.5 mr-1.5" />
                  Extract Selected ({selectedCount})
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Page Thumbnails Grid */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Layers className="h-4 w-4" />
                  Pages
                  <Badge variant="secondary" className="font-mono">
                    {pages.length}
                  </Badge>
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Drag to reorder &middot; Click to select &middot; Hover for actions
                </p>
              </div>
            </CardHeader>
            <CardContent>
              {thumbnailsLoading ? (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
                  {Array.from({ length: 12 }).map((_, i) => (
                    <Skeleton key={i} className="aspect-[3/4] rounded-xl" />
                  ))}
                </div>
              ) : pages.length > 0 ? (
                <div className="max-h-[600px] overflow-y-auto pr-1">
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                  >
                    <SortableContext
                      items={pages.map((p) => p.id)}
                      strategy={rectSortingStrategy}
                    >
                      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
                        <AnimatePresence mode="popLayout">
                          {pages.map((item, index) => (
                            <SortablePageThumbnail
                              key={item.id}
                              item={item}
                              index={index}
                              onToggleSelect={toggleSelect}
                              onRotateLeft={rotateLeft}
                              onRotateRight={rotateRight}
                              onDelete={deletePage}
                              processing={processing}
                            />
                          ))}
                        </AnimatePresence>
                      </div>
                    </SortableContext>
                  </DndContext>
                </div>
              ) : (
                <div className="text-center py-12">
                  <p className="text-muted-foreground">
                    All pages have been removed.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Progress */}
          {processing && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-2"
            >
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Processing...</span>
                <span className="font-medium">{progress}%</span>
              </div>
              <Progress value={progress} />
            </motion.div>
          )}

          {/* Download Button */}
          <Button
            className="w-full"
            size="lg"
            disabled={processing || pages.length === 0}
            onClick={downloadReorganized}
          >
            {processing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <FileDown className="h-4 w-4 mr-2" />
                Download Reorganized PDF ({pages.length} page
                {pages.length !== 1 ? 's' : ''})
              </>
            )}
          </Button>

          {/* Upload Another */}
          {!processing && (
            <div className="text-center">
              <Button variant="ghost" size="sm" onClick={resetAll}>
                Upload another PDF
              </Button>
            </div>
          )}
        </motion.div>
      )}
    </ToolLayout>
  );
}
