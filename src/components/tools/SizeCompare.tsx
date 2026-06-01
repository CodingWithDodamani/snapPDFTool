'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BarChart3,
  Trash2,
  Plus,
  ArrowDownUp,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Info,
  FileText,
  ImageIcon,
  ArrowRight,
  ArrowDown,
  ArrowUp,
  Download,
  Zap,
  Target,
  Ruler,
  Lightbulb,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { ToolLayout } from '@/components/shared/ToolLayout';
import { FileDropzone } from '@/components/shared/FileDropzone';
import { useAppStore } from '@/store';
import { formatSize, cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

// ─── Types ─────────────────────────────────────────────────────────
type SortField = 'name' | 'size' | 'type' | 'added';
type SortDir = 'asc' | 'desc';

interface FileEntry {
  id: string;
  file: File;
  size: number;
  type: string;
  ext: string;
  dims: { w: number; h: number };
  preview: string | null;
  isImage: boolean;
}

// ─── Constants ─────────────────────────────────────────────────────
const INDIA_SIZE_LIMITS = [
  { label: '20 KB', value: 20 * 1024, use: 'UPSC, SSC, State PSC forms' },
  { label: '50 KB', value: 50 * 1024, use: 'Aadhaar, Passport photo' },
  { label: '100 KB', value: 100 * 1024, use: 'Income Tax, DigiLocker' },
  { label: '200 KB', value: 200 * 1024, use: 'Most govt portals' },
  { label: '500 KB', value: 500 * 1024, use: 'Document uploads' },
  { label: '1 MB', value: 1024 * 1024, use: 'General uploads' },
  { label: '2 MB', value: 2 * 1024 * 1024, use: 'Large document uploads' },
  { label: '5 MB', value: 5 * 1024 * 1024, use: 'Email attachments' },
];

function getFileTypeCategory(file: File): string {
  const t = file.type.toLowerCase();
  if (t.startsWith('image/')) return 'image';
  if (t === 'application/pdf') return 'pdf';
  if (t.includes('zip') || t.includes('rar') || t.includes('archive')) return 'archive';
  if (t.includes('word') || t.includes('document')) return 'document';
  if (t.includes('sheet') || t.includes('excel')) return 'spreadsheet';
  return 'other';
}

function getFileExt(file: File): string {
  const name = file.name;
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot).toUpperCase() : '?';
}

function getTypeIcon(type: string) {
  switch (type) {
    case 'image':
      return ImageIcon;
    case 'pdf':
      return FileText;
    default:
      return FileText;
  }
}

function getTypeColor(type: string): string {
  switch (type) {
    case 'image':
      return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400';
    case 'pdf':
      return 'bg-blue-500/10 text-blue-600 dark:text-blue-400';
    case 'archive':
      return 'bg-violet-500/10 text-violet-600 dark:text-violet-400';
    default:
      return 'bg-muted text-muted-foreground';
  }
}

// ─── Main Component ────────────────────────────────────────────────
export function SizeCompare() {
  const { toast } = useToast();
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [sortField, setSortField] = useState<SortField>('added');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [targetSize, setTargetSize] = useState<number>(200 * 1024);
  const [customTargetKB, setCustomTargetKB] = useState<number>(200);

  // Cleanup object URLs
  useEffect(() => {
    return () => {
      files.forEach((f) => {
        if (f.preview) URL.revokeObjectURL(f.preview);
      });
    };
  }, []);

  // ─── Add Files ──────────────────────────────────────────────────
  const addFiles = useCallback(
    (newFiles: File[]) => {
      if (newFiles.length === 0) return;

      const entries: FileEntry[] = newFiles.map((file) => ({
        id: crypto.randomUUID(),
        file,
        size: file.size,
        type: getFileTypeCategory(file),
        ext: getFileExt(file),
        dims: { w: 0, h: 0 },
        preview: null,
        isImage: file.type.startsWith('image/'),
      }));

      setFiles((prev) => [...prev, ...entries]);

      // Load previews & dimensions for images
      entries.forEach((entry) => {
        if (entry.isImage) {
          const url = URL.createObjectURL(entry.file);
          const img = new Image();
          img.onload = () => {
            setFiles((prev) =>
              prev.map((e) =>
                e.id === entry.id
                  ? { ...e, preview: url, dims: { w: img.width, h: img.height } }
                  : e,
              ),
            );
          };
          img.onerror = () => {
            URL.revokeObjectURL(url);
          };
          img.src = url;
        }
      });

      toast({
        title: `${newFiles.length} file${newFiles.length > 1 ? 's' : ''} added`,
        description: `Total: ${formatSize(newFiles.reduce((s, f) => s + f.size, 0))}`,
      });
    },
    [toast],
  );

  // ─── Remove File ───────────────────────────────────────────────
  const removeFile = useCallback((id: string) => {
    setFiles((prev) => {
      const entry = prev.find((f) => f.id === id);
      if (entry?.preview) URL.revokeObjectURL(entry.preview);
      return prev.filter((f) => f.id !== id);
    });
  }, []);

  // ─── Clear All ─────────────────────────────────────────────────
  const clearAll = useCallback(() => {
    files.forEach((f) => {
      if (f.preview) URL.revokeObjectURL(f.preview);
    });
    setFiles([]);
  }, [files]);

  // ─── Sort ───────────────────────────────────────────────────────
  const toggleSort = useCallback((field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir(field === 'size' ? 'asc' : 'asc');
    }
  }, [sortField]);

  const sortedFiles = useMemo(() => {
    return [...files].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'name':
          cmp = a.file.name.localeCompare(b.file.name);
          break;
        case 'size':
          cmp = a.size - b.size;
          break;
        case 'type':
          cmp = a.ext.localeCompare(b.ext);
          break;
        case 'added':
          cmp = 0; // preserve order
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [files, sortField, sortDir]);

  // ─── Stats ──────────────────────────────────────────────────────
  const maxSize = Math.max(...files.map((f) => f.size), 1);
  const minSize = Math.min(...files.map((f) => f.size));
  const totalSize = files.reduce((s, f) => s + f.size, 0);
  const avgSize = files.length > 0 ? totalSize / files.length : 0;

  const largest = files.find((f) => f.size === maxSize);
  const smallest = files.find((f) => f.size === minSize && files.length > 1);

  const filesUnderTarget = files.filter((f) => f.size <= targetSize).length;
  const filesOverTarget = files.filter((f) => f.size > targetSize).length;

  // Group by type
  const groupedByType = useMemo(() => {
    const groups: Record<string, FileEntry[]> = {};
    files.forEach((f) => {
      if (!groups[f.type]) groups[f.type] = [];
      groups[f.type].push(f);
    });
    return groups;
  }, [files]);

  // ─── Handle Target Size Change ──────────────────────────────────
  const handleTargetChange = (val: string) => {
    const limit = INDIA_SIZE_LIMITS.find((l) => l.label === val);
    if (limit) {
      setTargetSize(limit.value);
      setCustomTargetKB(Math.round(limit.value / 1024));
    }
  };

  const handleCustomTarget = (vals: number[]) => {
    const kb = vals[0];
    setCustomTargetKB(kb);
    setTargetSize(kb * 1024);
  };

  // ─── Export Comparison Report ────────────────────────────────────
  const exportReport = useCallback(() => {
    const lines: string[] = [
      '═══════════════════════════════════════',
      '       SnapPDF — File Size Report',
      '═══════════════════════════════════════',
      '',
      `Date: ${new Date().toLocaleDateString('en-IN')} ${new Date().toLocaleTimeString('en-IN')}`,
      `Target Limit: ${formatSize(targetSize)}`,
      '',
      '─── Summary ───',
      `Total Files: ${files.length}`,
      `Total Size: ${formatSize(totalSize)}`,
      `Average Size: ${formatSize(avgSize)}`,
      `Largest: ${largest?.file.name} (${formatSize(largest.size)})`,
      `Smallest: ${smallest?.file.name} (${formatSize(smallest.size)})`,
      `Under Limit: ${filesUnderTarget}/${files.length}`,
      `Over Limit: ${filesOverTarget}/${files.length}`,
      '',
      '─── File Details ───',
    ];

    sortedFiles.forEach((f, i) => {
      const pct = ((f.size / maxSize) * 100).toFixed(1);
      const status = f.size <= targetSize ? '✅ PASS' : '❌ OVER';
      lines.push(
        `${i + 1}. ${f.file.name}`,
        `   Size: ${formatSize(f.size)} (${pct}% of largest)`,
        `   Type: ${f.ext} | ${status}`,
        f.isImage && f.dims.w > 0 ? `   Dims: ${f.dims.w}×${f.dims.h}px` : '',
        '',
      );
    });

    const text = lines.filter(Boolean).join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `size-comparison-report-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);

    toast({
      title: 'Report exported',
      description: 'Size comparison report downloaded as text file.',
    });
  }, [files, sortedFiles, targetSize, maxSize, largest, smallest, filesUnderTarget, filesOverTarget, totalSize, avgSize, toast]);

  return (
    <ToolLayout
      title="Size Compare"
      description="Compare file sizes visually with animated bars"
      toolId="size-compare"
    >
      {!files.length ? (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <FileDropzone
            onFiles={addFiles}
            accept="*"
            multiple={true}
            maxSizeMB={50}
            label="Drop files here to compare sizes"
            sublabel="Supports PDF, images, documents — any file type"
            icon="plus"
          />

          {/* Quick Tips */}
          <Card className="mt-6">
            <CardContent className="p-5">
              <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                <Lightbulb className="h-4 w-4 text-amber-500" />
                Use Cases
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  {
                    icon: '📄',
                    title: 'Before & After',
                    desc: 'Upload original + compressed files to see savings %',
                  },
                  {
                    icon: '🎯',
                    title: 'Portal Check',
                    desc: 'Check if files meet 100KB, 200KB portal limits',
                  },
                  {
                    icon: '📊',
                    title: 'Format Compare',
                    desc: 'Compare JPG vs PNG vs WebP for the same image',
                  },
                ].map((tip) => (
                  <div
                    key={tip.title}
                    className="flex items-start gap-2.5 p-3 rounded-lg border bg-card"
                  >
                    <span className="text-lg">{tip.icon}</span>
                    <div>
                      <p className="text-xs font-medium">{tip.title}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {tip.desc}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="space-y-5"
        >
          {/* ─── Target Size Selector ─── */}
          <Card>
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium flex items-center gap-2">
                  <Target className="h-4 w-4 text-primary" />
                  Size Limit Check
                </h3>
                {files.length > 0 && (
                  <Badge
                    variant={filesOverTarget === 0 ? 'default' : 'destructive'}
                    className="text-[10px]"
                  >
                    {filesOverTarget === 0
                      ? `✅ All ${files.length} files under limit`
                      : `${filesOverTarget} of ${files.length} over limit`}
                  </Badge>
                )}
              </div>

              {/* Preset buttons */}
              <div className="flex flex-wrap gap-2">
                {INDIA_SIZE_LIMITS.map((limit) => {
                  const isActive = targetSize === limit.value;
                  return (
                    <Tooltip key={limit.label}>
                      <TooltipTrigger asChild>
                        <button
                          className={cn(
                            'px-3 py-1.5 rounded-lg border text-xs font-medium transition-all cursor-pointer',
                            isActive
                              ? 'border-primary bg-primary/10 text-primary shadow-sm'
                              : 'border-muted hover:border-muted-foreground/30 text-muted-foreground',
                          )}
                          onClick={() => handleTargetChange(limit.label)}
                        >
                          {limit.label}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="font-medium">{limit.label}</p>
                        <p className="text-[10px]">{limit.use}</p>
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>

              {/* Custom size slider */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Custom Target Size</Label>
                  <Badge variant="secondary" className="font-mono text-[10px]">
                    {formatSize(targetSize)}
                  </Badge>
                </div>
                <Slider
                  value={[customTargetKB]}
                  onValueChange={handleCustomTarget}
                  min={10}
                  max={10240}
                  step={10}
                />
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>10 KB</span>
                  <span>10 MB</span>
                </div>
              </div>

              {/* Target line info */}
              <div className="flex items-center gap-2 text-xs text-muted-foreground p-2.5 rounded-lg bg-muted/50 border">
                <Ruler className="h-3.5 w-3.5 shrink-0" />
                <span>
                  <strong className="text-foreground">
                    {formatSize(targetSize)}
                  </strong>{' '}
                  limit line — files below this line pass the check
                </span>
              </div>
            </CardContent>
          </Card>

          {/* ─── Stats Summary ─── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-[11px] text-muted-foreground">Total Size</p>
                <p className="text-lg font-bold mt-1">{formatSize(totalSize)}</p>
                <p className="text-[10px] text-muted-foreground">{files.length} files</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-[11px] text-muted-foreground">Largest</p>
                <p className="text-lg font-bold mt-1 text-red-600 dark:text-red-400">
                  {formatSize(maxSize)}
                </p>
                <p className="text-[10px] text-muted-foreground truncate">
                  {largest?.file.name}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-[11px] text-muted-foreground">Smallest</p>
                <p className="text-lg font-bold mt-1 text-green-600 dark:text-green-400">
                  {formatSize(minSize)}
                </p>
                <p className="text-[10px] text-muted-foreground truncate">
                  {smallest?.file.name}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-[11px] text-muted-foreground">Average</p>
                <p className="text-lg font-bold mt-1">{formatSize(avgSize)}</p>
                <p className="text-[10px] text-muted-foreground">per file</p>
              </CardContent>
            </Card>
          </div>

          {/* ─── Size Comparison Bars ─── */}
          <Card>
            <CardHeader className="p-4 pb-0">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />
                  Visual Comparison
                </h3>
                <Badge variant="secondary" className="text-[10px]">
                  Sorted by {sortField}
                  {sortDir === 'asc' ? ' ↑' : ' ↓'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-4 space-y-2">
              <div className="space-y-2.5">
                <AnimatePresence>
                  {sortedFiles.map((entry, index) => {
                    const pct = Math.max((entry.size / maxSize) * 100, 2);
                    const isOverTarget = entry.size > targetSize;
                    const isLargest = entry.size === maxSize && files.length > 1;
                    const isSmallest =
                      entry.size === minSize && files.length > 1;

                    return (
                      <motion.div
                        key={entry.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                        transition={{ delay: index * 0.03 }}
                        className="group"
                      >
                        {/* Bar */}
                        <div className="relative h-9 rounded-lg overflow-hidden bg-muted/40 border">
                          {/* Size bar */}
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${pct}%` }}
                            transition={{
                              duration: 0.6,
                              delay: index * 0.05,
                              ease: 'easeOut',
                            }}
                            className={cn(
                              'absolute inset-y-0 left-0 flex items-center gap-2 px-3 transition-colors',
                              isOverTarget
                                ? 'bg-red-500/20 group-hover:bg-red-500/30'
                                : 'bg-emerald-500/20 group-hover:bg-emerald-500/30',
                              isLargest && 'bg-red-500/25',
                              isSmallest && 'bg-green-500/25',
                            )}
                          >
                            {/* Preview thumbnail for images */}
                            {entry.isImage && entry.preview && (
                              <div className="w-5 h-5 rounded border bg-background overflow-hidden shrink-0">
                                <img
                                  src={entry.preview}
                                  alt=""
                                  className="w-full h-full object-cover"
                                />
                              </div>
                            )}

                            {/* File info */}
                            <span className="text-xs font-medium truncate flex-1">
                              {entry.file.name}
                            </span>
                            <span
                              className={cn(
                                'text-[11px] font-semibold shrink-0',
                                isOverTarget
                                  ? 'text-red-600 dark:text-red-400'
                                  : 'text-emerald-700 dark:text-emerald-400',
                              )}
                            >
                              {formatSize(entry.size)}
                            </span>

                            {/* Status indicator */}
                            {isOverTarget ? (
                              <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                            ) : (
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                            )}
                          </motion.div>

                          {/* Target line overlay */}
                          {maxSize > targetSize && (
                            <div
                              className="absolute top-0 bottom-0 w-0.5 bg-primary z-10 opacity-70"
                              style={{
                                left: `${Math.min((targetSize / maxSize) * 100, 100)}%`,
                              }}
                            />
                          )}

                          {/* Percentage of target */}
                          <div className="absolute right-2 top-1/2 -translate-y-1/2 z-[5]">
                            <span
                              className={cn(
                                'text-[10px] font-mono',
                                isOverTarget
                                  ? 'text-red-500'
                                  : 'text-emerald-600 dark:text-emerald-400',
                              )}
                            >
                              {Math.round((entry.size / targetSize) * 100)}%
                            </span>
                          </div>
                        </div>

                        {/* Metadata row */}
                        <div className="flex items-center gap-2 mt-1 px-1">
                          <span
                            className={cn(
                              'text-[10px] font-medium px-1.5 py-0.5 rounded',
                              getTypeColor(entry.type),
                            )}
                          >
                            {entry.ext}
                          </span>
                          {entry.isImage && entry.dims.w > 0 && (
                            <span className="text-[10px] text-muted-foreground">
                              {entry.dims.w}×{entry.dims.h}
                            </span>
                          )}
                          {!entry.isImage && (
                            <span className="text-[10px] text-muted-foreground">
                              {entry.type}
                            </span>
                          )}
                          {isLargest && (
                            <Badge
                              variant="secondary"
                              className="text-[8px] px-1 py-0 h-3 bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400"
                            >
                              <ArrowUp className="h-2 w-2 mr-0.5" />
                              Largest
                            </Badge>
                          )}
                          {isSmallest && (
                            <Badge
                              variant="secondary"
                              className="text-[8px] px-1 py-0 h-3 bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400"
                            >
                              <ArrowDown className="h-2 w-2 mr-0.5" />
                              Smallest
                            </Badge>
                          )}
                          {isOverTarget && (
                            <Badge
                              variant="secondary"
                              className="text-[8px] px-1 py-0 h-3 bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400"
                            >
                              Over by {formatSize(entry.size - targetSize)}
                            </Badge>
                          )}
                          {!isOverTarget && (
                            <span className="text-[10px] text-emerald-600 dark:text-emerald-400">
                              Under by {formatSize(targetSize - entry.size)}
                            </span>
                          )}

                          {/* Remove button */}
                          <button
                            onClick={() => removeFile(entry.id)}
                            className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                          </button>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            </CardContent>
          </Card>

          {/* ─── Group Breakdown ─── */}
          {Object.keys(groupedByType).length > 1 && (
            <Card>
              <CardContent className="p-5 space-y-3">
                <h3 className="text-sm font-medium flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Breakdown by Type
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {Object.entries(groupedByType).map(([type, items]) => {
                    const typeTotal = items.reduce((s, f) => s + f.size, 0);
                    const typePct = totalSize > 0 ? (typeTotal / totalSize) * 100 : 0;
                    const TypeIcon = getTypeIcon(type);
                    return (
                      <div
                        key={type}
                        className="p-3 rounded-lg border space-y-2"
                      >
                        <div className="flex items-center gap-2">
                          <div
                            className={cn(
                              'w-7 h-7 rounded-lg flex items-center justify-center',
                              getTypeColor(type).split(' ')[0],
                            )}
                          >
                            <TypeIcon
                              className={cn(
                                'h-3.5 w-3.5',
                                getTypeColor(type).split(' ')[1],
                              )}
                            />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium capitalize">
                              {type}
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              {items.length} file{items.length > 1 ? 's' : ''}
                            </p>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <div className="flex justify-between text-[11px]">
                            <span className="text-muted-foreground">
                              {formatSize(typeTotal)}
                            </span>
                            <span className="font-medium">{typePct.toFixed(1)}%</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${typePct}%` }}
                              transition={{ duration: 0.5 }}
                              className="h-full bg-primary rounded-full"
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* ─── Detailed File Table ─── */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h3 className="text-sm font-medium flex items-center gap-2">
                  <Info className="h-4 w-4" />
                  File Details ({files.length})
                </h3>
                <div className="flex items-center gap-2">
                  <Select
                    value={sortField}
                    onValueChange={(v) => setSortField(v as SortField)}
                  >
                    <SelectTrigger className="h-7 text-[11px] w-[110px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="name">Name</SelectItem>
                      <SelectItem value="size">Size</SelectItem>
                      <SelectItem value="type">Type</SelectItem>
                      <SelectItem value="added">Added</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
                  >
                    <ArrowDownUp className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th
                        className="pb-2 font-medium cursor-pointer hover:text-foreground transition-colors"
                        onClick={() => toggleSort('name')}
                      >
                        File Name
                      </th>
                      <th
                        className="pb-2 font-medium cursor-pointer hover:text-foreground transition-colors"
                        onClick={() => toggleSort('type')}
                      >
                        Type
                      </th>
                      <th
                        className="pb-2 font-medium cursor-pointer hover:text-foreground transition-colors text-right"
                        onClick={() => toggleSort('size')}
                      >
                        Size
                      </th>
                      <th className="pb-2 font-medium text-right">
                        % of Target
                      </th>
                      <th className="pb-2 font-medium text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {sortedFiles.map((entry) => {
                      const pctOfTarget = (entry.size / targetSize) * 100;
                      const isOver = entry.size > targetSize;
                      return (
                        <tr key={entry.id} className="hover:bg-muted/30">
                          <td className="py-2 pr-3">
                            <div className="flex items-center gap-2">
                              {entry.isImage && entry.preview && (
                                <div className="w-8 h-8 rounded border bg-muted overflow-hidden shrink-0">
                                  <img
                                    src={entry.preview}
                                    alt=""
                                    className="w-full h-full object-cover"
                                  />
                                </div>
                              )}
                              <span className="truncate font-medium max-w-[200px] block">
                                {entry.file.name}
                              </span>
                            </div>
                          </td>
                          <td className="py-2 pr-3">
                            <span
                              className={cn(
                                'text-[10px] font-medium px-1.5 py-0.5 rounded',
                                getTypeColor(entry.type),
                              )}
                            >
                              {entry.ext}
                            </span>
                          </td>
                          <td className="py-2 pr-3 text-right font-mono">
                            {formatSize(entry.size)}
                          </td>
                          <td className="py-2 pr-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <div className="w-12 h-1.5 rounded-full bg-muted overflow-hidden">
                                <div
                                  className={cn(
                                    'h-full rounded-full',
                                    isOver
                                      ? 'bg-red-500'
                                      : 'bg-emerald-500',
                                  )}
                                  style={{
                                    width: `${Math.min(pctOfTarget, 100)}%`,
                                  }}
                                />
                              </div>
                              <span
                                className={cn(
                                  'text-[10px] font-medium w-10 text-right',
                                  isOver
                                    ? 'text-red-600 dark:text-red-400'
                                    : 'text-emerald-600 dark:text-emerald-400',
                                )}
                              >
                                {Math.round(pctOfTarget)}%
                              </span>
                            </div>
                          </td>
                          <td className="py-2 text-right">
                            {isOver ? (
                              <Badge
                                variant="secondary"
                                className="text-[9px] px-1.5 py-0 h-4 bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400"
                              >
                                <XCircle className="h-2.5 w-2.5 mr-0.5" />
                                Over
                              </Badge>
                            ) : (
                              <Badge
                                variant="secondary"
                                className="text-[9px] px-1.5 py-0 h-4 bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
                              >
                                <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />
                                Pass
                              </Badge>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* ─── Savings Calculator ─── */}
          {files.length >= 2 && (
            <Card>
              <CardContent className="p-5 space-y-3">
                <h3 className="text-sm font-medium flex items-center gap-2">
                  <Zap className="h-4 w-4 text-amber-500" />
                  Size Range
                </h3>
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center p-3 rounded-lg border">
                    <p className="text-[11px] text-muted-foreground">
                      Difference
                    </p>
                    <p className="text-base font-bold mt-1">
                      {formatSize(maxSize - minSize)}
                    </p>
                  </div>
                  <div className="text-center p-3 rounded-lg border">
                    <p className="text-[11px] text-muted-foreground">
                      Ratio
                    </p>
                    <p className="text-base font-bold mt-1">
                      {minSize > 0
                        ? (maxSize / minSize).toFixed(1)
                        : '∞'}{' '}
                      <span className="text-xs font-normal text-muted-foreground">
                        ×
                      </span>
                    </p>
                  </div>
                  <div className="text-center p-3 rounded-lg border">
                    <p className="text-[11px] text-muted-foreground">
                      Size Spread
                    </p>
                    <p className="text-base font-bold mt-1">
                      {totalSize > 0
                        ? (
                            ((maxSize - minSize) / totalSize) *
                            100
                          ).toFixed(1)
                        : 0}
                      %
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ─── Action Bar ─── */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const input = document.createElement('input');
                      input.type = 'file';
                      input.multiple = true;
                      input.onchange = (e) => {
                        const newFiles = Array.from(
                          (e.target as HTMLInputElement).files || [],
                        );
                        if (newFiles.length > 0) addFiles(newFiles);
                      };
                      input.click();
                    }}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1.5" />
                    Add More
                  </Button>
                  <Button variant="outline" size="sm" onClick={clearAll}>
                    <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                    Clear All
                  </Button>
                </div>
                <Button variant="outline" size="sm" onClick={exportReport}>
                  <Download className="h-3.5 w-3.5 mr-1.5" />
                  Export Report
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </ToolLayout>
  );
}
