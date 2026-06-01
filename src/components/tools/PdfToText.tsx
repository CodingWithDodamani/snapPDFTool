'use client';

import { useState, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  FileText,
  Download,
  Copy,
  Check,
  Search,
  FileUp,
  Trash2,
  Type,
  Loader2,
  Eye,
  ChevronDown,
  AlignLeft,
  Hash,
  LetterText,
  ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { ToolLayout } from '@/components/shared/ToolLayout';
import { FileDropzone } from '@/components/shared/FileDropzone';
import { useAppStore } from '@/store';
import { PDFDocument } from 'pdf-lib';
import { useToast } from '@/hooks/use-toast';
import { formatSize, parsePageRange } from '@/lib/utils';

interface PageText {
  pageNumber: number;
  text: string;
}

const statVariants = [
  {
    gradient: 'from-violet-500/10 to-purple-500/10 dark:from-violet-500/5 dark:to-purple-500/5',
    border: 'border-violet-200 dark:border-violet-800/50',
    icon: 'text-violet-600 dark:text-violet-400',
    iconBg: 'bg-violet-100 dark:bg-violet-950',
  },
  {
    gradient: 'from-rose-500/10 to-pink-500/10 dark:from-rose-500/5 dark:to-pink-500/5',
    border: 'border-rose-200 dark:border-rose-800/50',
    icon: 'text-rose-600 dark:text-rose-400',
    iconBg: 'bg-rose-100 dark:bg-rose-950',
  },
  {
    gradient: 'from-amber-500/10 to-orange-500/10 dark:from-amber-500/5 dark:to-orange-500/5',
    border: 'border-amber-200 dark:border-amber-800/50',
    icon: 'text-amber-600 dark:text-amber-400',
    iconBg: 'bg-amber-100 dark:bg-amber-950',
  },
  {
    gradient: 'from-emerald-500/10 to-teal-500/10 dark:from-emerald-500/5 dark:to-teal-500/5',
    border: 'border-emerald-200 dark:border-emerald-800/50',
    icon: 'text-emerald-600 dark:text-emerald-400',
    iconBg: 'bg-emerald-100 dark:bg-emerald-950',
  },
];

export function PdfToText() {
  const { addRecentFile } = useAppStore();
  const { toast } = useToast();

  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [pdfBuffer, setPdfBuffer] = useState<ArrayBuffer | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [pageTexts, setPageTexts] = useState<PageText[]>([]);
  const [pageRange, setPageRange] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('pages');
  const [copied, setCopied] = useState(false);
  const [expandedPages, setExpandedPages] = useState<Set<number>>(new Set());

  const resetState = useCallback(() => {
    setFile(null);
    setPageCount(0);
    setPdfBuffer(null);
    setPageTexts([]);
    setError('');
    setProgress(0);
    setPageRange('');
    setSearchTerm('');
    setActiveTab('pages');
    setCopied(false);
    setExpandedPages(new Set());
  }, []);

  const handleFiles = useCallback(
    async (files: File[]) => {
      const pdf = files.find((f) => f.type === 'application/pdf');
      if (pdf) {
        try {
          const buffer = await pdf.arrayBuffer();
          const pdfDoc = await PDFDocument.load(buffer);
          const count = pdfDoc.getPageCount();

          setPageCount(count);
          setFile(pdf);
          setPdfBuffer(buffer);
          setPageTexts([]);
          setError('');
          setProgress(0);
          setPageRange('');
          setSearchTerm('');
          setCopied(false);
          setExpandedPages(new Set());
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

  const extractText = useCallback(async () => {
    if (!pdfBuffer) return;
    setExtracting(true);
    setProgress(0);
    setError('');
    setPageTexts([]);
    setCopied(false);

    try {
      const pdfjsLib = await import('pdfjs-dist');
      pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
      const pdf = await pdfjsLib.getDocument({ data: pdfBuffer }).promise;

      const pagesToExtract =
        pageRange.trim()
          ? parsePageRange(pageRange, pageCount)
          : Array.from({ length: pdf.numPages }, (_, i) => i + 1);

      if (pagesToExtract.length === 0) {
        setError('Invalid page range. Use format like: 1-3, 5, 7-end');
        setExtracting(false);
        toast({
          title: 'Invalid page range',
          description: 'Please use the format: 1-3, 5, 7-end',
          variant: 'destructive',
        });
        return;
      }

      const results: PageText[] = [];

      for (let idx = 0; idx < pagesToExtract.length; idx++) {
        const pageNum = pagesToExtract[idx];
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();
        const text = textContent.items
          .map((item) => ('str' in item ? item.str : ''))
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();

        results.push({ pageNumber: pageNum, text });
        setProgress(Math.round(((idx + 1) / pagesToExtract.length) * 100));
      }

      setPageTexts(results);
      setProgress(100);

      toast({
        title: 'Text extraction complete!',
        description: `Extracted text from ${results.length} page${results.length > 1 ? 's' : ''}.`,
      });

      addRecentFile({
        id: crypto.randomUUID(),
        name: file?.name || 'document.pdf',
        type: 'application/pdf',
        tool: 'split-pdf',
        size: formatSize(file?.size || 0),
        timestamp: Date.now(),
      });
    } catch (err) {
      console.error('Extraction error:', err);
      setError('Failed to extract text. The file may be corrupted or password-protected.');
      toast({
        title: 'Extraction failed',
        description: 'The file may be corrupted or password-protected.',
        variant: 'destructive',
      });
    } finally {
      setExtracting(false);
    }
  }, [pdfBuffer, pageCount, pageRange, file, addRecentFile, toast]);

  const fullText = useMemo(() => {
    return pageTexts
      .sort((a, b) => a.pageNumber - b.pageNumber)
      .map((p) => p.text)
      .join('\n\n');
  }, [pageTexts]);

  const stats = useMemo(() => {
    const text = fullText;
    const chars = text.length;
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    const lines = text.trim() ? text.split('\n').filter((l) => l.trim()).length : 0;
    return { chars, words, lines, pages: pageTexts.length };
  }, [fullText, pageTexts.length]);

  const filteredPageTexts = useMemo(() => {
    if (!searchTerm.trim()) return pageTexts.sort((a, b) => a.pageNumber - b.pageNumber);
    const term = searchTerm.toLowerCase();
    return pageTexts
      .filter((p) => p.text.toLowerCase().includes(term))
      .sort((a, b) => a.pageNumber - b.pageNumber);
  }, [pageTexts, searchTerm]);

  const highlightedFullText = useMemo(() => {
    if (!searchTerm.trim()) return fullText;
    const regex = new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return fullText.replace(
      regex,
      '<mark class="bg-yellow-200 dark:bg-yellow-800/60 rounded px-0.5">$1</mark>',
    );
  }, [fullText, searchTerm]);

  const handleCopyAll = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(fullText);
      setCopied(true);
      toast({
        title: 'Copied to clipboard',
        description: `${stats.chars.toLocaleString()} characters copied.`,
      });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({
        title: 'Copy failed',
        description: 'Unable to copy text to clipboard.',
        variant: 'destructive',
      });
    }
  }, [fullText, stats.chars, toast]);

  const handleDownloadTxt = useCallback(() => {
    const blob = new Blob([fullText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (file?.name.replace('.pdf', '') || 'document') + '.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast({
      title: 'Download started',
      description: a.download,
    });
  }, [fullText, file, toast]);

  const togglePageExpand = useCallback((pageNum: number) => {
    setExpandedPages((prev) => {
      const next = new Set(prev);
      if (next.has(pageNum)) {
        next.delete(pageNum);
      } else {
        next.add(pageNum);
      }
      return next;
    });
  }, []);

  const parsedRange = useMemo(
    () => (pageRange.trim() ? parsePageRange(pageRange, pageCount) : []),
    [pageRange, pageCount],
  );

  const totalPagesToExtract = pageRange.trim() ? parsedRange.length : pageCount;

  return (
    <ToolLayout
      title="PDF to Text"
      description="Extract text content from PDF files with page-by-page breakdown"
    >
      {!file ? (
        <FileDropzone
          onFiles={handleFiles}
          accept=".pdf,application/pdf"
          multiple={false}
          label="Drop PDF here or click to upload"
          sublabel="Extract text from any PDF document"
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
              <Button variant="ghost" size="icon" disabled={extracting} onClick={resetState}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </CardContent>
          </Card>

          {/* Extraction Options Card */}
          {pageTexts.length === 0 && !extracting && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Type className="h-4 w-4" />
                  Extraction Options
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="page-range-input">Page Range (optional)</Label>
                  <Input
                    id="page-range-input"
                    type="text"
                    value={pageRange}
                    onChange={(e) => setPageRange(e.target.value)}
                    placeholder="e.g., 1-3, 5, 7-end (leave empty for all)"
                    disabled={extracting}
                  />
                  <p className="text-xs text-muted-foreground">
                    Extract specific pages. Leave empty to extract all {pageCount} pages.
                  </p>
                  {parsedRange.length > 0 && (
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="font-mono">
                        {parsedRange.length}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        page{parsedRange.length !== 1 ? 's' : ''} selected
                      </span>
                    </div>
                  )}
                </div>

                {error && <p className="text-sm text-destructive">{error}</p>}

                <Button
                  className="w-full"
                  size="lg"
                  disabled={extracting}
                  onClick={extractText}
                >
                  <FileUp className="h-4 w-4 mr-2" />
                  Extract Text from {totalPagesToExtract} Page{totalPagesToExtract !== 1 ? 's' : ''}
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Loading Skeleton */}
          {extracting && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Extracting text...
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      Processing page {Math.min(Math.ceil((progress / 100) * totalPagesToExtract), totalPagesToExtract)} of {totalPagesToExtract}...
                    </span>
                    <span className="font-medium">{progress}%</span>
                  </div>
                  <Progress value={progress} />
                  <div className="space-y-3 pt-2">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-[90%]" />
                    <Skeleton className="h-4 w-[95%]" />
                    <Skeleton className="h-4 w-[80%]" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-[70%]" />
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Results Section */}
          {pageTexts.length > 0 && !extracting && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              {/* Stats Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: 'Characters', value: stats.chars, icon: LetterText, idx: 0 },
                  { label: 'Words', value: stats.words, icon: AlignLeft, idx: 1 },
                  { label: 'Lines', value: stats.lines, icon: Type, idx: 2 },
                  { label: 'Pages', value: stats.pages, icon: Hash, idx: 3 },
                ].map((stat) => (
                  <motion.div
                    key={stat.label}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: stat.idx * 0.05 }}
                  >
                    <Card className={`bg-gradient-to-br ${statVariants[stat.idx].gradient} ${statVariants[stat.idx].border}`}>
                      <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                          <div className={`h-9 w-9 rounded-lg ${statVariants[stat.idx].iconBg} flex items-center justify-center flex-shrink-0`}>
                            <stat.icon className={`h-4 w-4 ${statVariants[stat.idx].icon}`} />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs text-muted-foreground">{stat.label}</p>
                            <p className="text-xl font-bold tabular-nums">
                              {stat.value.toLocaleString()}
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>

              {/* Action Buttons Card */}
              <Card className="border-green-200 dark:border-green-900">
                <CardContent className="p-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2 mr-auto">
                      <div className="h-8 w-8 rounded-lg bg-green-100 dark:bg-green-950 flex items-center justify-center flex-shrink-0">
                        <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-green-700 dark:text-green-400">
                          Extraction Complete
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {stats.pages} pages &middot; {stats.chars.toLocaleString()} characters
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCopyAll}
                      className="min-w-[110px]"
                    >
                      <motion.div
                        key={copied ? 'copied' : 'copy'}
                        initial={{ scale: 0.8 }}
                        animate={{ scale: 1 }}
                        className="flex items-center gap-1.5"
                      >
                        {copied ? (
                          <>
                            <Check className="h-3.5 w-3.5 text-green-600" />
                            <span>Copied!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5" />
                            <span>Copy All</span>
                          </>
                        )}
                      </motion.div>
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleDownloadTxt}>
                      <Download className="h-3.5 w-3.5 mr-1.5" />
                      Download TXT
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={resetState}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                      New File
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Search & Tabs Card */}
              <Card>
                <CardContent className="p-4 space-y-4">
                  {/* Search Bar */}
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="text"
                      placeholder="Search within extracted text..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-9"
                    />
                    {searchTerm.trim() && (
                      <Badge variant="secondary" className="absolute right-3 top-1/2 -translate-y-1/2 text-xs">
                        {filteredPageTexts.length} / {pageTexts.length} pages
                      </Badge>
                    )}
                  </div>

                  {/* Tabs */}
                  <Tabs value={activeTab} onValueChange={setActiveTab}>
                    <TabsList className="w-full">
                      <TabsTrigger value="pages" className="flex-1 gap-1.5">
                        <Eye className="h-3.5 w-3.5" />
                        Page by Page
                      </TabsTrigger>
                      <TabsTrigger value="all" className="flex-1 gap-1.5">
                        <AlignLeft className="h-3.5 w-3.5" />
                        All Text
                      </TabsTrigger>
                    </TabsList>

                    {/* All Text Tab */}
                    <TabsContent value="all" className="mt-4">
                      <div className="rounded-lg border bg-muted/30 overflow-hidden">
                        <div className="p-3 border-b flex items-center justify-between">
                          <Badge variant="secondary" className="text-xs">
                            Full Document Text
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {stats.chars.toLocaleString()} chars
                          </span>
                        </div>
                        <div className="p-4 max-h-[500px] overflow-y-auto">
                          {fullText.trim() ? (
                            <pre
                              className="whitespace-pre-wrap break-words text-sm font-mono leading-relaxed text-foreground"
                              dangerouslySetInnerHTML={{ __html: highlightedFullText }}
                            />
                          ) : (
                            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                              <FileText className="h-10 w-10 mb-3 opacity-40" />
                              <p className="text-sm">No text content found in this PDF</p>
                              <p className="text-xs mt-1">
                                The PDF may contain only images or scanned content.
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    </TabsContent>

                    {/* Page by Page Tab */}
                    <TabsContent value="pages" className="mt-4">
                      <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
                        {filteredPageTexts.length === 0 ? (
                          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                            <Search className="h-10 w-10 mb-3 opacity-40" />
                            <p className="text-sm">No pages match your search</p>
                            {searchTerm.trim() && (
                              <p className="text-xs mt-1">
                                Try a different search term
                              </p>
                            )}
                          </div>
                        ) : (
                          filteredPageTexts.map((page) => {
                            const isExpanded = expandedPages.has(page.pageNumber);
                            const isFiltered = searchTerm.trim();
                            const displayText = isFiltered
                              ? (() => {
                                  const term = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                                  const regex = new RegExp(`(${term})`, 'gi');
                                  return page.text.replace(
                                    regex,
                                    '<mark class="bg-yellow-200 dark:bg-yellow-800/60 rounded px-0.5">$1</mark>',
                                  );
                                })()
                              : page.text;

                            return (
                              <motion.div
                                key={page.pageNumber}
                                initial={{ opacity: 0, y: 5 }}
                                animate={{ opacity: 1, y: 0 }}
                              >
                                <div className="rounded-lg border overflow-hidden bg-card">
                                  <button
                                    className="w-full p-3 flex items-center gap-3 hover:bg-muted/50 transition-colors text-left"
                                    onClick={() => togglePageExpand(page.pageNumber)}
                                  >
                                    <div className="h-7 w-7 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                                      <span className="text-xs font-bold text-primary">
                                        {page.pageNumber}
                                      </span>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-medium">Page {page.pageNumber}</p>
                                      <p className="text-xs text-muted-foreground truncate">
                                        {page.text.trim()
                                          ? page.text.trim().substring(0, 80) + (page.text.trim().length > 80 ? '...' : '')
                                          : 'No text content'}
                                      </p>
                                    </div>
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                      <Badge variant="secondary" className="text-xs font-mono">
                                        {page.text.length.toLocaleString()}
                                      </Badge>
                                      <ChevronDown
                                        className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${
                                          isExpanded ? 'rotate-180' : ''
                                        }`}
                                      />
                                    </div>
                                  </button>

                                  {(isExpanded || isFiltered) && (
                                    <motion.div
                                      initial={{ height: 0, opacity: 0 }}
                                      animate={{ height: 'auto', opacity: 1 }}
                                      transition={{ duration: 0.15 }}
                                    >
                                      <div className="border-t bg-muted/20">
                                        {page.text.trim() ? (
                                          <pre
                                            className="p-4 text-sm font-mono leading-relaxed whitespace-pre-wrap break-words text-foreground max-h-64 overflow-y-auto"
                                            dangerouslySetInnerHTML={{ __html: displayText }}
                                          />
                                        ) : (
                                          <div className="p-4 text-center text-sm text-muted-foreground italic">
                                            This page has no extractable text content.
                                          </div>
                                        )}
                                        <div className="px-4 pb-2 flex items-center gap-3 text-xs text-muted-foreground">
                                          <span>{page.text.length} chars</span>
                                          <span>&middot;</span>
                                          <span>{page.text.trim() ? page.text.trim().split(/\s+/).length : 0} words</span>
                                          <span>&middot;</span>
                                          <span>{page.text.split('\n').filter((l) => l.trim()).length} lines</span>
                                          <div className="ml-auto">
                                            <button
                                              className="hover:text-foreground transition-colors flex items-center gap-1"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                navigator.clipboard.writeText(page.text);
                                                toast({
                                                  title: 'Page text copied',
                                                  description: `Page ${page.pageNumber} text copied to clipboard.`,
                                                });
                                              }}
                                            >
                                              <Copy className="h-3 w-3" />
                                              Copy page
                                            </button>
                                          </div>
                                        </div>
                                      </div>
                                    </motion.div>
                                  )}
                                </div>
                              </motion.div>
                            );
                          })
                        )}
                      </div>

                      {filteredPageTexts.length > 0 && !searchTerm.trim() && (
                        <div className="flex justify-center pt-3">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              if (expandedPages.size === pageTexts.length) {
                                setExpandedPages(new Set());
                              } else {
                                setExpandedPages(new Set(pageTexts.map((p) => p.pageNumber)));
                              }
                            }}
                          >
                            {expandedPages.size === pageTexts.length ? (
                              <>
                                <Eye className="h-3.5 w-3.5 mr-1.5" />
                                Collapse All
                              </>
                            ) : (
                              <>
                                <ArrowRight className="h-3.5 w-3.5 mr-1.5" />
                                Expand All
                              </>
                            )}
                          </Button>
                        </div>
                      )}
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </motion.div>
      )}
    </ToolLayout>
  );
}
