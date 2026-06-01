'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Wand2,
  FileUp,
  ArrowRight,
  X,
  FileText,
  ImageIcon,
  QrCode,
  BarChart3,
  Sparkles,
  Info,
  Loader2,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAppStore, TOOLS, type ToolId } from '@/store';
import { formatSize } from '@/lib/utils';
import { cn } from '@/lib/utils';

// ─── Types ─────────────────────────────────────────────────────────
interface AnalyzedFile {
  file: File;
  type: 'pdf' | 'image' | 'qr' | 'unknown';
  ext: string;
  size: number;
  dims?: { w: number; h: number };
  hasTransparency?: boolean;
  pageCount?: number;
}

interface ToolSuggestion {
  toolId: ToolId;
  name: string;
  icon: string;
  accent: string;
  reason: string;
  priority: number; // 1 = best, higher = less relevant
  isIndia?: boolean;
}

interface SmartFileRouterProps {
  children: React.ReactNode;
}

// ─── File Analysis ─────────────────────────────────────────────────
function analyzeFile(file: File): Promise<AnalyzedFile> {
  return new Promise((resolve) => {
    const type = file.type.toLowerCase();
    const ext = file.name.split('.').pop()?.toUpperCase() || '?';
    const base: AnalyzedFile = {
      file,
      type: 'unknown',
      ext,
      size: file.size,
    };

    if (type === 'application/pdf') {
      base.type = 'pdf';
      // Try to detect page count from PDF
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const text = new TextDecoder().decode(e.target?.result as ArrayBuffer);
          const matches = text.match(/\/Type\s*\/Page[^s]/g);
          base.pageCount = matches ? matches.length : undefined;
        } catch {
          // ignore parse errors
        }
        resolve(base);
      };
      reader.onerror = () => resolve(base);
      reader.readAsArrayBuffer(file.slice(0, 10000));
      return;
    }

    if (type.startsWith('image/')) {
      base.type = 'image';
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        base.dims = { w: img.width, h: img.height };
        // Check transparency for PNG/WebP
        if (type === 'image/png' || type === 'image/webp') {
          try {
            const canvas = document.createElement('canvas');
            canvas.width = Math.min(img.width, 100);
            canvas.height = Math.min(img.height, 100);
            const ctx = canvas.getContext('2d')!;
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            const data = ctx.getImageData(0, 0, 1, 1).data;
            base.hasTransparency = data[3] < 255;
          } catch {
            base.hasTransparency = false;
          }
        }
        URL.revokeObjectURL(url);
        resolve(base);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(base);
      };
      img.src = url;
      return;
    }

    resolve(base);
  });
}

// ─── Tool Suggestion Engine ─────────────────────────────────────────
function suggestTools(
  files: AnalyzedFile[],
): { top: ToolSuggestion[]; all: ToolSuggestion[] } {
  const suggestions: ToolSuggestion[] = [];

  const hasPdfs = files.some((f) => f.type === 'pdf');
  const hasImages = files.some((f) => f.type === 'image');
  const multiplePdfs = files.filter((f) => f.type === 'pdf').length > 1;
  const multipleImages = files.filter((f) => f.type === 'image').length > 1;
  const anyLargePdf = files.some((f) => f.type === 'pdf' && f.size > 500 * 1024);
  const anyLargeImage = files.some(
    (f) => f.type === 'image' && f.size > 500 * 1024,
  );
  const anySmallImage = files.some(
    (f) =>
      f.type === 'image' &&
      f.size > 0 &&
      f.size < 200 * 1024,
  );
  const hasTransparency = files.some((f) => f.hasTransparency);
  const multiPagePdf = files.some((f) => f.type === 'pdf' && (f.pageCount || 0) > 1);
  const singlePdf = files.some((f) => f.type === 'pdf' && (f.pageCount || 1) === 1);

  // ── PDF Tools ──
  if (hasPdfs && anyLargePdf) {
    suggestions.push({
      toolId: 'compress-pdf',
      name: 'Compress PDF',
      icon: 'FileDown',
      accent: 'blue',
      reason: `Large PDF detected (${formatSize(files.find((f) => f.type === 'pdf' && f.size > 500 * 1024)?.size || 0)}) — compress for portals`,
      priority: 1,
    });
  }
  if (multiplePdfs) {
    suggestions.push({
      toolId: 'merge-pdf',
      name: 'Merge PDFs',
      icon: 'Merge',
      accent: 'emerald',
      reason: `${files.filter((f) => f.type === 'pdf').length} PDFs detected — combine into one`,
      priority: 2,
    });
  }
  if (hasPdfs && multiPagePdf) {
    suggestions.push({
      toolId: 'pdf-to-image',
      name: 'PDF to Image',
      icon: 'FileImage',
      accent: 'teal',
      reason: 'Multi-page PDF — extract pages as images',
      priority: 3,
    });
    suggestions.push({
      toolId: 'split-pdf',
      name: 'Split PDF',
      icon: 'Split',
      accent: 'amber',
      reason: 'Multi-page PDF — extract specific pages',
      priority: 4,
    });
  }
  if (hasPdfs) {
    suggestions.push({
      toolId: 'watermark-pdf',
      name: 'Watermark PDF',
      icon: 'Stamp',
      accent: 'rose',
      reason: 'PDF file — add text or image watermark',
      priority: 7,
    });
    if (singlePdf) {
      suggestions.push({
        toolId: 'rotate-pdf',
        name: 'Rotate PDF',
        icon: 'RotateCw',
        accent: 'violet',
        reason: 'PDF file — fix page orientation',
        priority: 8,
      });
    }
  }

  // ── Image Tools ──
  if (hasImages && anyLargeImage) {
    suggestions.push({
      toolId: 'image-compress',
      name: 'Compress Image',
      icon: 'ImageMinus',
      accent: 'emerald',
      reason: `Large image (${formatSize(files.find((f) => f.type === 'image' && f.size > 500 * 1024)?.size || 0)}) — reduce file size`,
      priority: anyLargePdf ? 3 : 1,
    });
  }
  if (hasImages && anySmallImage) {
    suggestions.push({
      toolId: 'image-resize',
      name: 'Resize Image',
      icon: 'Scaling',
      accent: 'amber',
      reason: 'Small image — resize to form photo sizes (20KB, 50KB, 100KB)',
      priority: 2,
      isIndia: true,
    });
  }
  if (multipleImages) {
    suggestions.push({
      toolId: 'image-to-pdf',
      name: 'Image to PDF',
      icon: 'ImagePlus',
      accent: 'blue',
      reason: `${files.filter((f) => f.type === 'image').length} images — combine into PDF`,
      priority: 5,
    });
  }
  if (hasImages && hasTransparency) {
    suggestions.push({
      toolId: 'image-format-convert',
      name: 'Format Convert',
      icon: 'RefreshCw',
      accent: 'violet',
      reason: 'Image with transparency — convert to best format (PNG/WebP)',
      priority: 4,
    });
  }
  if (hasImages) {
    suggestions.push({
      toolId: 'image-crop-rotate',
      name: 'Crop & Rotate',
      icon: 'Crop',
      accent: 'teal',
      reason: 'Image detected — crop, rotate, straighten, or apply filters',
      priority: 8,
    });
    // Passport photo check: roughly square-ish images
    const squareishImage = files.find(
      (f) =>
        f.type === 'image' &&
        f.dims &&
        Math.abs(f.dims.w - f.dims.h) < Math.max(f.dims.w, f.dims.h) * 0.3,
    );
    if (squareishImage && squareishImage.dims) {
      suggestions.push({
        toolId: 'passport-photo',
        name: 'Passport Photo Maker',
        icon: 'User',
        accent: 'rose',
        reason: `Square-ish image (${squareishImage.dims.w}×${squareishImage.dims.h}) — may be a photo for ID`,
        priority: 3,
        isIndia: true,
      });
    }
  }

  // ── QR Tools ──
  if (hasImages && files.some((f) => f.type === 'image')) {
    suggestions.push({
      toolId: 'qr-scanner',
      name: 'QR Scanner',
      icon: 'Scan',
      accent: 'teal',
      reason: 'Image detected — scan for QR codes',
      priority: 9,
    });
  }

  // ── Size Compare (always useful for multiple files) ──
  if (files.length >= 2) {
    suggestions.push({
      toolId: 'size-compare',
      name: 'Size Compare',
      icon: 'BarChart3',
      accent: 'amber',
      reason: `${files.length} files — compare sizes visually`,
      priority: 10,
    });
  }

  // Sort by priority
  suggestions.sort((a, b) => a.priority - b.priority);

  return {
    top: suggestions.slice(0, 3),
    all: suggestions,
  };
}

// ─── Icon Component ─────────────────────────────────────────────────
const ROUTER_ICON_MAP: Record<string, LucideIcon> = {
  FileDown: FileText,
  Merge: FileText,
  FileImage: ImageIcon,
  Split: FileText,
  Stamp: FileText,
  RotateCw: FileText,
  ImageMinus: ImageIcon,
  Scaling: ImageIcon,
  ImagePlus: ImageIcon,
  RefreshCw: ImageIcon,
  Crop: ImageIcon,
  User: ImageIcon,
  Scan: QrCode,
  BarChart3: BarChart3,
  QrCode: QrCode,
};

// ─── Global Drag Overlay ──────────────────────────────────────────
function DragOverlay({ isDragging }: { isDragging: boolean }) {
  return (
    <AnimatePresence>
      {isDragging && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[100] pointer-events-none"
        >
          <div className="absolute inset-0 bg-primary/5 backdrop-blur-[2px]" />
          <div className="absolute inset-4 sm:inset-8 rounded-3xl border-2 border-dashed border-primary/40 bg-primary/10 flex items-center justify-center">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="text-center"
            >
              <motion.div
                animate={{ y: [0, -8, 0] }}
                transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
              >
                <div className="w-20 h-20 rounded-2xl bg-primary/20 flex items-center justify-center mx-auto mb-4">
                  <FileUp className="h-10 w-10 text-primary" />
                </div>
              </motion.div>
              <p className="text-xl font-bold text-primary">Drop files to analyze</p>
              <p className="text-sm text-muted-foreground mt-1">
                Smart Router will suggest the best tool
              </p>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── Suggestion Panel ──────────────────────────────────────────────
function SuggestionPanel({
  files,
  suggestions,
  onClose,
  onNavigate,
  isAnalyzing,
}: {
  files: AnalyzedFile[];
  suggestions: { top: ToolSuggestion[]; all: ToolSuggestion[] };
  onClose: () => void;
  onNavigate: (toolId: ToolId) => void;
  isAnalyzing: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[101] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <motion.div
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="relative w-full max-w-lg bg-background rounded-2xl border shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 pb-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Wand2 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-bold">Smart File Router</h2>
                <p className="text-xs text-muted-foreground">
                  AI-detected the best tools for your files
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full h-8 w-8"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* File Summary */}
        <div className="px-5 pt-4">
          <div className="flex flex-wrap gap-2">
            {files.map((f, i) => (
              <div
                key={i}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg border bg-muted/30 text-xs"
              >
                {f.type === 'pdf' ? (
                  <FileText className="h-3.5 w-3.5 text-blue-500" />
                ) : f.type === 'image' ? (
                  <ImageIcon className="h-3.5 w-3.5 text-emerald-500" />
                ) : (
                  <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                )}
                <span className="font-medium truncate max-w-[140px]">
                  {f.file.name}
                </span>
                <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4">
                  {formatSize(f.size)}
                </Badge>
                {f.dims && (
                  <span className="text-[10px] text-muted-foreground">
                    {f.dims.w}×{f.dims.h}
                  </span>
                )}
                {f.pageCount && (
                  <span className="text-[10px] text-muted-foreground">
                    {f.pageCount}pg
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Loading State */}
        {isAnalyzing && (
          <div className="p-8 text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary mb-3" />
            <p className="text-sm font-medium">Analyzing files...</p>
            <p className="text-xs text-muted-foreground mt-1">
              Detecting types, dimensions, and suggesting tools
            </p>
          </div>
        )}

        {/* Suggestions */}
        {!isAnalyzing && (
          <div className="p-5 space-y-3">
            {suggestions.top.length > 0 ? (
              <>
                {/* Top Suggestion - Highlighted */}
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                    <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                      Best Match
                    </span>
                  </div>
                  {suggestions.top.slice(0, 1).map((sug, i) => (
                    <SuggestionCard
                      key={sug.toolId}
                      suggestion={sug}
                      isTop
                      onNavigate={onNavigate}
                      delay={i * 0.05}
                    />
                  ))}
                </div>

                {/* Other Suggestions */}
                {suggestions.top.length > 1 && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <Info className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-xs font-medium text-muted-foreground">
                        Other Suggestions
                      </span>
                    </div>
                    <div className="space-y-2">
                      {suggestions.top.slice(1).map((sug, i) => (
                        <SuggestionCard
                          key={sug.toolId}
                          suggestion={sug}
                          onNavigate={onNavigate}
                          delay={i * 0.05}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* All tools link */}
                {suggestions.all.length > 3 && (
                  <button
                    onClick={onClose}
                    className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors py-2 cursor-pointer"
                  >
                    + {suggestions.all.length - 3} more suggestions ·{' '}
                    <span className="underline">browse all tools</span>
                  </button>
                )}
              </>
            ) : (
              <div className="text-center py-6">
                <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
                  <FileText className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium">No specific tool suggested</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Browse all {TOOLS.length} tools to find what you need
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={onClose}
                >
                  Browse All Tools
                </Button>
              </div>
            )}

            {/* Quick Tip */}
            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-muted/50 border">
              <Sparkles className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
              <p className="text-[11px] text-muted-foreground">
                <strong className="text-foreground">Pro tip:</strong> You can
                drop files on any page — Smart Router works everywhere!
              </p>
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

// ─── Individual Suggestion Card ────────────────────────────────────
function SuggestionCard({
  suggestion,
  isTop,
  onNavigate,
  delay,
}: {
  suggestion: ToolSuggestion;
  isTop?: boolean;
  onNavigate: (toolId: ToolId) => void;
  delay: number;
}) {
  const tool = TOOLS.find((t) => t.id === suggestion.toolId);
  const IconComp = ROUTER_ICON_MAP[suggestion.icon] || FileText;

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay }}
    >
      <button
        onClick={() => onNavigate(suggestion.toolId)}
        className={cn(
          'w-full text-left rounded-xl border p-3 transition-all cursor-pointer group hover:shadow-md',
          isTop
            ? 'border-primary/30 bg-primary/[0.03] hover:bg-primary/[0.06]'
            : 'border-muted hover:border-muted-foreground/30 hover:bg-muted/30',
        )}
      >
        <div className="flex items-center gap-3">
          {/* Icon */}
          <div
            className={cn(
              'w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
              isTop ? 'bg-primary/10' : 'bg-muted',
            )}
          >
            <IconComp
              className={cn(
                'h-5 w-5',
                isTop ? 'text-primary' : 'text-muted-foreground',
              )}
            />
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  'text-sm font-semibold truncate',
                  isTop && 'text-primary',
                )}
              >
                {suggestion.name}
              </span>
              {suggestion.isIndia && (
                <Badge
                  variant="secondary"
                  className="text-[8px] px-1 py-0 h-3 bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400"
                >
                  India
                </Badge>
              )}
              {tool?.badge && tool.badge === 'Popular' && (
                <Badge
                  variant="secondary"
                  className="text-[8px] px-1 py-0 h-3 bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400"
                >
                  Popular
                </Badge>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
              {suggestion.reason}
            </p>
          </div>

          {/* Arrow */}
          <div
            className={cn(
              'w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors',
              isTop
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted group-hover:bg-muted-foreground/10',
            )}
          >
            <ArrowRight className="h-4 w-4" />
          </div>
        </div>
      </button>
    </motion.div>
  );
}

// ─── Main Component ────────────────────────────────────────────────
export function SmartFileRouter({ children }: SmartFileRouterProps) {
  const { setActiveTool, trackRecentTool } = useAppStore();
  const [isDragging, setIsDragging] = useState(false);
  const [showPanel, setShowPanel] = useState(false);
  const [analyzedFiles, setAnalyzedFiles] = useState<AnalyzedFile[]>([]);
  const [suggestions, setSuggestions] = useState<{
    top: ToolSuggestion[];
    all: ToolSuggestion[];
  }>({ top: [], all: [] });
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const dragCounter = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── Process Files ─────────────────────────────────────────────
  const processFiles = useCallback(async (files: File[]) => {
    setIsAnalyzing(true);
    setShowPanel(true);

    const analyzed = await Promise.all(files.map(analyzeFile));
    setAnalyzedFiles(analyzed);

    const result = suggestTools(analyzed);
    setSuggestions(result);
    setIsAnalyzing(false);
  }, []);

  // ─── Global Drag Handlers ──────────────────────────────────────
  useEffect(() => {
    const handleDragEnter = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current += 1;
      if (dragCounter.current === 1) {
        setIsDragging(true);
      }
    };

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current -= 1;
      if (dragCounter.current === 0) {
        setIsDragging(false);
      }
    };

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };

    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current = 0;
      setIsDragging(false);

      const droppedFiles = Array.from(e.dataTransfer?.files || []);
      if (droppedFiles.length > 0) {
        processFiles(droppedFiles);
      }
    };

    document.addEventListener('dragenter', handleDragEnter);
    document.addEventListener('dragleave', handleDragLeave);
    document.addEventListener('dragover', handleDragOver);
    document.addEventListener('drop', handleDrop);

    return () => {
      document.removeEventListener('dragenter', handleDragEnter);
      document.removeEventListener('dragleave', handleDragLeave);
      document.removeEventListener('dragover', handleDragOver);
      document.removeEventListener('drop', handleDrop);
    };
  }, [processFiles]);

  // ─── Handle Navigate ───────────────────────────────────────────
  const handleNavigate = useCallback(
    (toolId: ToolId) => {
      setActiveTool(toolId);
      trackRecentTool(toolId);
      setShowPanel(false);
      setAnalyzedFiles([]);
      setSuggestions({ top: [], all: [] });
    },
    [setActiveTool, trackRecentTool],
  );

  // ─── Handle Close ────────────────────────────────────────────────
  const handleClose = useCallback(() => {
    setShowPanel(false);
    setAnalyzedFiles([]);
    setSuggestions({ top: [], all: [] });
  }, []);

  return (
    <>
      {children}
      <DragOverlay isDragging={isDragging} />
      <AnimatePresence>
        {showPanel && (
          <SuggestionPanel
            files={analyzedFiles}
            suggestions={suggestions}
            onClose={handleClose}
            onNavigate={handleNavigate}
            isAnalyzing={isAnalyzing}
          />
        )}
      </AnimatePresence>
    </>
  );
}
