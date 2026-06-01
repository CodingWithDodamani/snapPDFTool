'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Trash2,
  Download,
  Loader2,
  ImagePlus,
  GripVertical,
  FileImage,
  LayoutGrid,
  Hash,
  Square,
  Lock,
  Maximize2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Separator } from '@/components/ui/separator';
import { ToolLayout } from '@/components/shared/ToolLayout';
import { FileDropzone } from '@/components/shared/FileDropzone';
import { useAppStore } from '@/store';
import { jsPDF } from 'jspdf';
import { saveAs } from 'file-saver';
import { cn, formatSize, loadImage } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
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
import { ChevronDown } from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Types & Constants                                                  */
/* ------------------------------------------------------------------ */

interface ImageItem {
  file: File;
  preview: string;
  id: string;
}

type PageSize = 'a3' | 'a4' | 'a5' | 'letter' | 'legal';
type MarginOption = 'none' | 'small' | 'medium' | 'large';
type LayoutGrid = 1 | 2 | 4;
type FitMode = 'fit' | 'fill' | 'actual';
type PageNumberPosition =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';

/** Human-readable labels keyed by page size identifier */
const PAGE_SIZE_LABELS: Record<PageSize, string> = {
  a4: 'A4 (210 × 297 mm)',
  letter: 'Letter (8.5 × 11 in)',
  legal: 'Legal (8.5 × 14 in)',
  a3: 'A3 (297 × 420 mm)',
  a5: 'A5 (148 × 210 mm)',
};

/** Margin values in mm */
const MARGIN_VALUES: Record<MarginOption, number> = {
  none: 0,
  small: 5,
  medium: 10,
  large: 20,
};

/** Human-readable labels keyed by margin option */
const MARGIN_LABELS: Record<MarginOption, string> = {
  none: 'None (0 mm)',
  small: 'Small (5 mm)',
  medium: 'Medium (10 mm)',
  large: 'Large (20 mm)',
};

/** Layout grid labels */
const LAYOUT_GRID_LABELS: Record<LayoutGrid, string> = {
  1: '1 image per page',
  2: '2 images per page',
  4: '4 images per page (2×2)',
};

/** Fit mode labels */
const FIT_MODE_LABELS: Record<FitMode, string> = {
  fit: 'Fit to page',
  fill: 'Fill page (crop)',
  actual: 'Actual size (no scale)',
};

/** Page number position labels */
const PAGE_NUMBER_POSITION_LABELS: Record<PageNumberPosition, string> = {
  'top-left': 'Top Left',
  'top-center': 'Top Center',
  'top-right': 'Top Right',
  'bottom-left': 'Bottom Left',
  'bottom-center': 'Bottom Center',
  'bottom-right': 'Bottom Right',
};

/** Accepted image MIME types – includes WebP */
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'];
const ACCEPT_STRING = 'image/jpeg,image/png,image/jpg,image/webp';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Pixels-per-mm for "actual size" mode (approximate 96 DPI screen). */
const PX_PER_MM = 96 / 25.4;

/**
 * Compute drawing dimensions for an image given the fit mode.
 * Returns { w, h, x, y } in mm within the available area.
 */
function computeImagePlacement(
  imgPxW: number,
  imgPxH: number,
  areaW: number,
  areaH: number,
  mode: FitMode,
): { w: number; h: number; x: number; y: number } {
  const imgRatio = imgPxW / imgPxH;
  const areaRatio = areaW / areaH;

  if (mode === 'actual') {
    /* 1:1 pixel-to-mm – may overflow; center anyway */
    const w = imgPxW / PX_PER_MM;
    const h = imgPxH / PX_PER_MM;
    return {
      w,
      h,
      x: (areaW - w) / 2,
      y: (areaH - h) / 2,
    };
  }

  if (mode === 'fill') {
    /* Cover the entire area – crop overflow */
    let w: number;
    let h: number;
    if (imgRatio > areaRatio) {
      h = areaH;
      w = areaH * imgRatio;
    } else {
      w = areaW;
      h = areaW / imgRatio;
    }
    return {
      w,
      h,
      x: (areaW - w) / 2,
      y: (areaH - h) / 2,
    };
  }

  /* mode === 'fit' – fit within area maintaining aspect ratio */
  let w: number;
  let h: number;
  if (imgRatio > areaRatio) {
    w = areaW;
    h = areaW / imgRatio;
  } else {
    h = areaH;
    w = areaH * imgRatio;
  }
  return {
    w,
    h,
    x: (areaW - w) / 2,
    y: (areaH - h) / 2,
  };
}

/**
 * Compute cell positions for the layout grid within a usable area.
 * Returns an array of { x, y, w, h } for each cell (in mm, relative to the usable area origin).
 */
function computeGridCells(
  grid: LayoutGrid,
  usableW: number,
  usableH: number,
  gapMM: number,
): Array<{ x: number; y: number; w: number; h: number }> {
  if (grid === 1) {
    return [{ x: 0, y: 0, w: usableW, h: usableH }];
  }

  if (grid === 2) {
    /* Two images side-by-side when landscape-ish, stacked when portrait-ish */
    const isLandscape = usableW >= usableH;
    if (isLandscape) {
      const cellW = (usableW - gapMM) / 2;
      const cellH = usableH;
      return [
        { x: 0, y: 0, w: cellW, h: cellH },
        { x: cellW + gapMM, y: 0, w: cellW, h: cellH },
      ];
    } else {
      const cellW = usableW;
      const cellH = (usableH - gapMM) / 2;
      return [
        { x: 0, y: 0, w: cellW, h: cellH },
        { x: 0, y: cellH + gapMM, w: cellW, h: cellH },
      ];
    }
  }

  /* grid === 4: 2×2 */
  const cellW = (usableW - gapMM) / 2;
  const cellH = (usableH - gapMM) / 2;
  return [
    { x: 0, y: 0, w: cellW, h: cellH },
    { x: cellW + gapMM, y: 0, w: cellW, h: cellH },
    { x: 0, y: cellH + gapMM, w: cellW, h: cellH },
    { x: cellW + gapMM, y: cellH + gapMM, w: cellW, h: cellH },
  ];
}

/**
 * Draw "Page X of Y" text at the specified position.
 */
function drawPageNumber(
  pdf: jsPDF,
  page: number,
  total: number,
  position: PageNumberPosition,
  marginMM: number,
) {
  const text = `Page ${page} of ${total}`;
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  pdf.setTextColor(128, 128, 128); // gray

  const textW = pdf.getTextWidth(text);
  const offsetFromEdge = marginMM + 5; // 5mm from margin
  const yTop = marginMM + 4;
  const yBottom = pageH - marginMM - 4;

  let x: number;
  let y: number;
  let align: 'left' | 'center' | 'right';

  switch (position) {
    case 'top-left':
      x = offsetFromEdge;
      y = yTop;
      align = 'left';
      break;
    case 'top-center':
      x = pageW / 2;
      y = yTop;
      align = 'center';
      break;
    case 'top-right':
      x = pageW - offsetFromEdge;
      y = yTop;
      align = 'right';
      break;
    case 'bottom-left':
      x = offsetFromEdge;
      y = yBottom;
      align = 'left';
      break;
    case 'bottom-center':
      x = pageW / 2;
      y = yBottom;
      align = 'center';
      break;
    case 'bottom-right':
      x = pageW - offsetFromEdge;
      y = yBottom;
      align = 'right';
      break;
  }

  pdf.text(text, x, y, { align });
}

/* ------------------------------------------------------------------ */
/*  Sortable Image Row                                                 */
/* ------------------------------------------------------------------ */

interface SortableImageRowProps {
  img: ImageItem;
  index: number;
  total: number;
  onRemove: (id: string) => void;
  disabled: boolean;
}

function SortableImageRow({
  img,
  index,
  total,
  onRemove,
  disabled,
}: SortableImageRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: img.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    position: isDragging ? ('relative' as const) : undefined,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 10 }}
        layout
      >
        <Card className={cn(isDragging && 'shadow-lg ring-2 ring-primary/30')}>
          <CardContent className="flex items-center gap-3 p-3">
            {/* Drag handle */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="flex-shrink-0 cursor-grab active:cursor-grabbing rounded p-1 hover:bg-muted transition-colors touch-none"
                    {...attributes}
                    {...listeners}
                    aria-label={`Drag to reorder image ${index + 1}`}
                  >
                    <GripVertical className="h-4 w-4 text-muted-foreground" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">Drag to reorder</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {/* Order number */}
            <span className="text-muted-foreground text-sm font-mono w-6 text-center flex-shrink-0">
              {index + 1}
            </span>

            {/* Thumbnail */}
            <div className="h-12 w-12 rounded-md overflow-hidden bg-muted flex-shrink-0">
              <img
                src={img.preview}
                alt={img.file.name}
                className="h-full w-full object-cover"
              />
            </div>

            {/* File info */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{img.file.name}</p>
              <p className="text-xs text-muted-foreground">
                {formatSize(img.file.size)}
              </p>
            </div>

            {/* Remove button */}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive flex-shrink-0"
              onClick={() => onRemove(img.id)}
              disabled={disabled}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                      */
/* ------------------------------------------------------------------ */

export function ImageToPdf() {
  const { addRecentFile } = useAppStore();
  const { toast } = useToast();

  /* ---- Core state ---- */
  const [images, setImages] = useState<ImageItem[]>([]);
  const [quality, setQuality] = useState<[number]>([80]);
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>(
    'portrait',
  );
  const [pageSize, setPageSize] = useState<PageSize>('a4');
  const [margin, setMargin] = useState<MarginOption>('medium');
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);

  /* ---- P2 state ---- */
  const [layoutGrid, setLayoutGrid] = useState<LayoutGrid>(1);
  const [gapMM, setGapMM] = useState<[number]>([4]);
  const [fitMode, setFitMode] = useState<FitMode>('fit');
  const [showPageNumbers, setShowPageNumbers] = useState(false);
  const [pageNumberPosition, setPageNumberPosition] =
    useState<PageNumberPosition>('bottom-center');
  const [showBorders, setShowBorders] = useState(false);
  const [enablePassword, setEnablePassword] = useState(false);
  const [password, setPassword] = useState('');
  const [advancedOpen, setAdvancedOpen] = useState(false);

  /* ---- DnD sensors ---- */

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor),
  );

  /* ---- File handling ---- */

  const handleFiles = useCallback((files: File[]) => {
    const imageFiles = files.filter((f) => ACCEPTED_TYPES.includes(f.type));
    if (imageFiles.length === 0) return;

    const newImages: ImageItem[] = imageFiles.map((file) => ({
      file,
      preview: URL.createObjectURL(file),
      id: crypto.randomUUID(),
    }));
    setImages((prev) => [...prev, ...newImages]);
  }, []);

  /* ---- DnD reordering ---- */

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setImages((prev) => {
      const oldIndex = prev.findIndex((i) => i.id === active.id);
      const newIndex = prev.findIndex((i) => i.id === over.id);
      return arrayMove(prev, oldIndex, newIndex);
    });
  }, []);

  /* ---- Remove / Clear ---- */

  const removeImage = useCallback((id: string) => {
    setImages((prev) => {
      const img = prev.find((i) => i.id === id);
      if (img) URL.revokeObjectURL(img.preview);
      return prev.filter((i) => i.id !== id);
    });
  }, []);

  const clearAll = useCallback(() => {
    images.forEach((i) => URL.revokeObjectURL(i.preview));
    setImages([]);
  }, [images]);

  /* ---- PDF Conversion ---- */

  const convertToPdf = useCallback(async () => {
    if (images.length === 0) return;

    /* Password protection placeholder check */
    if (enablePassword) {
      toast({
        title: 'Password protection',
        description:
          'Password protection requires server-side encryption (coming soon)',
      });
      return;
    }

    setProcessing(true);
    setProgress(0);

    try {
      const pdf = new jsPDF({
        orientation,
        unit: 'mm',
        format: pageSize,
      });

      const marginMM = MARGIN_VALUES[margin];
      const qualityValue = quality[0] / 100;
      const gap = gapMM[0];

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const usableW = pageWidth - marginMM * 2;
      const usableH = pageHeight - marginMM * 2;

      if (usableW <= 0 || usableH <= 0) {
        throw new Error(
          'Margin is too large for the selected page size. Please reduce the margin.',
        );
      }

      /* Pre-compute grid cells */
      const cells = computeGridCells(layoutGrid, usableW, usableH, gap);
      const imagesPerSet = cells.length;

      /* Calculate total pages */
      const totalPages = Math.ceil(images.length / imagesPerSet);

      /* Load all images first */
      const loadedImages: Array<{
        dataUrl: string;
        pxW: number;
        pxH: number;
      }> = [];

      for (let i = 0; i < images.length; i++) {
        const img = images[i];
        const imgElement = await loadImage(img.preview);

        const canvas = document.createElement('canvas');
        const maxDim =
          qualityValue >= 0.8
            ? 2400
            : qualityValue >= 0.5
              ? 1600
              : 1000;

        let w = imgElement.width;
        let h = imgElement.height;
        if (w > maxDim || h > maxDim) {
          const ratio = Math.min(maxDim / w, maxDim / h);
          w = Math.round(w * ratio);
          h = Math.round(h * ratio);
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(imgElement, 0, 0, w, h);

        const outputMime =
          img.file.type === 'image/webp'
            ? 'image/jpeg'
            : img.file.type === 'image/png'
              ? 'image/png'
              : 'image/jpeg';
        const jpgQuality =
          outputMime === 'image/png' ? undefined : qualityValue;

        const dataUrl = canvas.toDataURL(outputMime, jpgQuality);
        loadedImages.push({ dataUrl, pxW: w, pxH: h });
        setProgress(Math.round(((i + 1) / images.length) * 50));
      }

      /* Render images onto PDF pages */
      for (let setIndex = 0; setIndex < totalPages; setIndex++) {
        const pageIndex = setIndex + 1;

        if (setIndex > 0) pdf.addPage();

        for (let cellIndex = 0; cellIndex < imagesPerSet; cellIndex++) {
          const globalImgIndex = setIndex * imagesPerSet + cellIndex;
          if (globalImgIndex >= images.length) break;

          const cell = cells[cellIndex];
          const loaded = loadedImages[globalImgIndex];
          const placement = computeImagePlacement(
            loaded.pxW,
            loaded.pxH,
            cell.w,
            cell.h,
            fitMode,
          );

          const absX = marginMM + cell.x + placement.x;
          const absY = marginMM + cell.y + placement.y;

          /* Draw image */
          pdf.addImage(
            loaded.dataUrl,
            'JPEG',
            absX,
            absY,
            placement.w,
            placement.h,
          );

          /* Draw border if enabled */
          if (showBorders) {
            pdf.setDrawColor(0, 0, 0);
            pdf.setLineWidth(0.5);
            pdf.rect(absX, absY, placement.w, placement.h);
          }
        }

        /* Draw page number if enabled */
        if (showPageNumbers) {
          drawPageNumber(pdf, pageIndex, totalPages, pageNumberPosition, marginMM);
        }

        setProgress(
          50 + Math.round(((setIndex + 1) / totalPages) * 50),
        );
      }

      const pdfBlob = pdf.output('blob');
      const fileName = `images-to-pdf-${Date.now()}.pdf`;
      saveAs(pdfBlob, fileName);

      addRecentFile({
        id: crypto.randomUUID(),
        name: fileName,
        type: 'application/pdf',
        tool: 'image-to-pdf',
        size: formatSize(pdfBlob.size),
        timestamp: Date.now(),
      });

      toast({
        title: 'PDF created successfully',
        description: `${fileName} (${formatSize(pdfBlob.size)}) — ${totalPages} page${totalPages > 1 ? 's' : ''}`,
      });
    } catch (err) {
      console.error('PDF conversion error:', err);
      toast({
        title: 'Conversion failed',
        description:
          err instanceof Error
            ? err.message
            : 'An unexpected error occurred. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setProcessing(false);
    }
  }, [
    images,
    quality,
    orientation,
    pageSize,
    margin,
    layoutGrid,
    gapMM,
    fitMode,
    showPageNumbers,
    pageNumberPosition,
    showBorders,
    enablePassword,
    addRecentFile,
    toast,
  ]);

  /* ---------------------------------------------------------------- */
  /*  Render                                                            */
  /* ---------------------------------------------------------------- */

  return (
    <ToolLayout
      title="Image to PDF"
      description="Convert JPG, PNG, and WebP images to a single PDF document"
    >
      {/* ---- Upload zone ---- */}
      <FileDropzone
        onFiles={handleFiles}
        accept={ACCEPT_STRING}
        multiple
        label="Drop images here or click to upload"
        sublabel="Supports JPG, PNG, and WebP files"
      />

      {/* ---- Image list with drag-and-drop reordering ---- */}
      {images.length > 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-lg">
              {images.length} image{images.length > 1 ? 's' : ''} added
            </h3>
            <Button
              variant="destructive"
              size="sm"
              onClick={clearAll}
              disabled={processing}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Clear All
            </Button>
          </div>

          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={images.map((i) => i.id)}
                strategy={verticalListSortingStrategy}
              >
                <AnimatePresence>
                  {images.map((img, index) => (
                    <SortableImageRow
                      key={img.id}
                      img={img}
                      index={index}
                      total={images.length}
                      onRemove={removeImage}
                      disabled={processing}
                    />
                  ))}
                </AnimatePresence>
              </SortableContext>
            </DndContext>
          </div>
        </motion.div>
      )}

      {/* ---- Settings & conversion card ---- */}
      <Card>
        <CardContent className="p-6 space-y-6">
          {/* Page Size */}
          <div className="space-y-3">
            <Label className="flex items-center gap-2">
              <FileImage className="h-4 w-4" />
              Page Size
            </Label>
            <Select
              value={pageSize}
              onValueChange={(v) => setPageSize(v as PageSize)}
              disabled={processing}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(PAGE_SIZE_LABELS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Page Orientation */}
          <div className="space-y-3">
            <Label>Page Orientation</Label>
            <Select
              value={orientation}
              onValueChange={(v) =>
                setOrientation(v as 'portrait' | 'landscape')
              }
              disabled={processing}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="portrait">Portrait</SelectItem>
                <SelectItem value="landscape">Landscape</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Margins */}
          <div className="space-y-3">
            <Label>Margins</Label>
            <Select
              value={margin}
              onValueChange={(v) => setMargin(v as MarginOption)}
              disabled={processing}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(MARGIN_LABELS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Image Quality */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Image Quality</Label>
              <span className="text-sm text-muted-foreground">
                {quality[0] < 40
                  ? 'Low'
                  : quality[0] < 70
                    ? 'Medium'
                    : 'High'}
              </span>
            </div>
            <Slider
              value={quality}
              onValueChange={setQuality}
              min={10}
              max={100}
              step={5}
              disabled={processing}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Low (small file)</span>
              <span>High (large file)</span>
            </div>
          </div>

          <Separator />

          {/* ---- Advanced Settings (collapsible) ---- */}
          <Collapsible
            open={advancedOpen}
            onOpenChange={setAdvancedOpen}
            className="space-y-4"
          >
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                className="w-full justify-between p-0 h-auto font-semibold text-sm hover:bg-transparent"
                disabled={processing}
              >
                <span>Advanced Settings</span>
                <ChevronDown
                  className={cn(
                    'h-4 w-4 text-muted-foreground transition-transform duration-200',
                    advancedOpen && 'rotate-180',
                  )}
                />
              </Button>
            </CollapsibleTrigger>

            <CollapsibleContent className="space-y-5 pt-2">
              {/* ---- Page Layout Grid ---- */}
              <div className="space-y-3">
                <Label className="flex items-center gap-2">
                  <LayoutGrid className="h-4 w-4" />
                  Page Layout
                </Label>
                <Select
                  value={String(layoutGrid)}
                  onValueChange={(v) => setLayoutGrid(Number(v) as LayoutGrid)}
                  disabled={processing}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(
                      Object.entries(LAYOUT_GRID_LABELS) as [
                        string,
                        string,
                      ][]
                    ).map(([key, label]) => (
                      <SelectItem key={key} value={key}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Gap slider – only when grid > 1 */}
                {layoutGrid > 1 && (
                  <div className="space-y-2 pt-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">
                        Gap between images
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {gapMM[0]} mm
                      </span>
                    </div>
                    <Slider
                      value={gapMM}
                      onValueChange={setGapMM}
                      min={2}
                      max={10}
                      step={1}
                      disabled={processing}
                    />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>2 mm</span>
                      <span>10 mm</span>
                    </div>
                  </div>
                )}
              </div>

              {/* ---- Fit Mode ---- */}
              <div className="space-y-3">
                <Label className="flex items-center gap-2">
                  <Maximize2 className="h-4 w-4" />
                  Fit Mode
                </Label>
                <Select
                  value={fitMode}
                  onValueChange={(v) => setFitMode(v as FitMode)}
                  disabled={processing}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(
                      Object.entries(FIT_MODE_LABELS) as [string, string][]
                    ).map(([key, label]) => (
                      <SelectItem key={key} value={key}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {fitMode === 'fit' &&
                    'Images are scaled to fit entirely within the page.'}
                  {fitMode === 'fill' &&
                    'Images cover the entire page area; excess is cropped.'}
                  {fitMode === 'actual' &&
                    'Images are placed at 1:1 pixel-to-mm scale and may extend beyond the page.'}
                </p>
              </div>

              {/* ---- Image Borders ---- */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="flex items-center gap-2">
                    <Square className="h-4 w-4" />
                    Image Borders
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Add a 0.5 pt border around each image
                  </p>
                </div>
                <Switch
                  checked={showBorders}
                  onCheckedChange={setShowBorders}
                  disabled={processing}
                />
              </div>

              {/* ---- Page Numbers ---- */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-2">
                    <Hash className="h-4 w-4" />
                    Page Numbers
                  </Label>
                  <Switch
                    checked={showPageNumbers}
                    onCheckedChange={setShowPageNumbers}
                    disabled={processing}
                  />
                </div>

                {showPageNumbers && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="space-y-2"
                  >
                    <Select
                      value={pageNumberPosition}
                      onValueChange={(v) =>
                        setPageNumberPosition(v as PageNumberPosition)
                      }
                      disabled={processing}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(
                          Object.entries(PAGE_NUMBER_POSITION_LABELS) as [
                            string,
                            string,
                          ][]
                        ).map(([key, label]) => (
                          <SelectItem key={key} value={key}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Page numbers are drawn in Helvetica 10px, gray.
                    </p>
                  </motion.div>
                )}
              </div>

              {/* ---- Password Protection ---- */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="flex items-center gap-2">
                      <Lock className="h-4 w-4" />
                      Password Protection
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Encrypt the output PDF file
                    </p>
                  </div>
                  <Switch
                    checked={enablePassword}
                    onCheckedChange={setEnablePassword}
                    disabled={processing}
                  />
                </div>

                {enablePassword && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="space-y-2"
                  >
                    <Input
                      type="password"
                      placeholder="Enter password for PDF"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={processing}
                    />
                    <p className="text-xs text-amber-600 dark:text-amber-400">
                      ⚠ Server-side encryption is required. A future update will
                      enable full password protection.
                    </p>
                  </motion.div>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>

          <Separator />

          {/* Progress bar */}
          {processing && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-2"
            >
              <div className="flex items-center justify-between text-sm">
                <span>Converting...</span>
                <span>{progress}%</span>
              </div>
              <Progress value={progress} />
            </motion.div>
          )}

          {/* Convert Button */}
          <Button
            className="w-full"
            size="lg"
            disabled={images.length === 0 || processing}
            onClick={convertToPdf}
          >
            {processing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Converting...
              </>
            ) : (
              <>
                <ImagePlus className="h-4 w-4 mr-2" />
                Convert to PDF
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </ToolLayout>
  );
}
