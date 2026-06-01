'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText,
  Loader2,
  Download,
  Upload,
  Type,
  AlignLeft,
  Settings,
  Hash,
  FileDown,
  RotateCcw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ToolLayout } from '@/components/shared/ToolLayout';
import { useAppStore } from '@/store';
import { useToast } from '@/hooks/use-toast';
import { formatSize } from '@/lib/utils';
import { useWorkerTask } from '@/hooks/useWorkerTask';
import { createPdfWorker } from '@/lib/worker-factories';
import { WorkerBadge } from '@/components/shared/WorkerBadge';
import { saveAs } from 'file-saver';

type PageSize = 'A4' | 'Letter' | 'Legal';

interface MdSettings {
  pageSize: PageSize;
  fontSize: number;
  marginTop: number;
  marginBottom: number;
  marginLeft: number;
  marginRight: number;
  title: string;
  pageNumbers: boolean;
}

interface ParsedBlock {
  type: 'heading1' | 'heading2' | 'heading3' | 'paragraph' | 'bullet' | 'code' | 'hr' | 'blockquote';
  content: string;
}

function parseMarkdown(text: string): ParsedBlock[] {
  const lines = text.split('\n');
  const blocks: ParsedBlock[] = [];
  let inCodeBlock = false;
  let codeContent = '';

  for (const line of lines) {
    // Code block toggle
    if (line.trim().startsWith('```')) {
      if (inCodeBlock) {
        blocks.push({ type: 'code', content: codeContent.trimEnd() });
        codeContent = '';
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeContent += (codeContent ? '\n' : '') + line;
      continue;
    }

    const trimmed = line.trim();

    // Skip empty lines (they act as paragraph separators)
    if (trimmed === '') continue;

    // Heading 1
    if (trimmed.startsWith('# ') && !trimmed.startsWith('## ')) {
      blocks.push({ type: 'heading1', content: trimmed.slice(2) });
      continue;
    }

    // Heading 2
    if (trimmed.startsWith('## ') && !trimmed.startsWith('### ')) {
      blocks.push({ type: 'heading2', content: trimmed.slice(3) });
      continue;
    }

    // Heading 3
    if (trimmed.startsWith('### ')) {
      blocks.push({ type: 'heading3', content: trimmed.slice(4) });
      continue;
    }

    // Horizontal rule
    if (/^---+$/.test(trimmed) || /^\*{3,}$/.test(trimmed)) {
      blocks.push({ type: 'hr', content: '' });
      continue;
    }

    // Blockquote
    if (trimmed.startsWith('> ')) {
      blocks.push({ type: 'blockquote', content: trimmed.slice(2) });
      continue;
    }

    // Bullet point
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      blocks.push({ type: 'bullet', content: trimmed.slice(2) });
      continue;
    }

    // Numbered list (treat as bullet for simplicity)
    if (/^\d+\.\s/.test(trimmed)) {
      blocks.push({ type: 'bullet', content: trimmed.replace(/^\d+\.\s/, '') });
      continue;
    }

    // Regular paragraph
    blocks.push({ type: 'paragraph', content: trimmed });
  }

  // Close any unclosed code block
  if (inCodeBlock && codeContent) {
    blocks.push({ type: 'code', content: codeContent.trimEnd() });
  }

  return blocks;
}

// Word wrap text to fit within a given width
function wrapText(text: string, font: any, fontSize: number, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    if (word === '') continue;
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const testWidth = font.widthOfTextAtSize(testLine, fontSize);

    if (testWidth > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.length > 0 ? lines : [''];
}

const PAGE_SIZES: { value: PageSize; label: string }[] = [
  { value: 'A4', label: 'A4 (210 × 297mm)' },
  { value: 'Letter', label: 'US Letter (8.5 × 11in)' },
  { value: 'Legal', label: 'US Legal (8.5 × 14in)' },
];

const SAMPLE_MARKDOWN = `# Welcome to Markdown to PDF

This is a **simple markdown** converter that creates styled PDFs from your text.

## Features

- Bold text with **double asterisks**
- Bullet points and lists
- Code blocks with syntax
- Blockquotes
- Page numbers and titles

### Getting Started

Just type or paste your markdown text in the editor and click Convert.

> This is a blockquote. It can contain **bold text** too.

\`\`\`
function hello() {
  return "World";
}
\`\`\`

---

Thank you for using this tool!`;

export function MarkdownToPdf() {
  const { addRecentFile } = useAppStore();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── Web Worker for PDF generation ───
  interface MdWorkerPayload {
    markdown: string;
    settings: MdSettings;
  }
  interface MdWorkerResult {
    blob: ArrayBuffer;
    pageCount: number;
  }

  const { execute: executeMdTask, progress: workerProgress, isWorkerActive } = useWorkerTask<MdWorkerPayload, MdWorkerResult>(
    createPdfWorker,
    async (payload: MdWorkerPayload, _taskType: string | undefined, reportProgress: (percent: number, message: string) => void) => {
      // Main-thread fallback: delegate to pdf-lib directly
      // This is a simplified fallback; the worker handles the full logic
      const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib') as any;
      const pdfDoc = await PDFDocument.create();
      const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      const courier = await pdfDoc.embedFont(StandardFonts.Courier);
      const sizes: Record<string, [number, number]> = { A4: [595.28, 841.89], Letter: [612, 792], Legal: [612, 1008] };
      const [pw, ph] = sizes[payload.settings.pageSize] || sizes.A4;
      let page = pdfDoc.addPage([pw, ph]);
      let { width, height } = page.getSize();
      const cw = width - payload.settings.marginLeft - payload.settings.marginRight;
      let y = height - payload.settings.marginTop;
      const blocks = parseMarkdown(payload.markdown);
      for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i];
        reportProgress(Math.round(((i + 1) / blocks.length) * 90), `Rendering block ${i + 1}/${blocks.length}...`);
        if (y - 30 < payload.settings.marginBottom) { page = pdfDoc.addPage([pw, ph]); ({ width, height } = page.getSize()); y = height - payload.settings.marginTop; }
        switch (block.type) {
          case 'heading1': { const lines = wrapText(block.content.replace(/\*\*/g, ''), helveticaBold, 22, cw); y -= 8; for (const l of lines) { page.drawText(l, { x: payload.settings.marginLeft, y, size: 22, font: helveticaBold, color: rgb(0.1, 0.1, 0.1) }); y -= 26; } y -= 6; break; }
          case 'paragraph': { page.drawText(block.content.slice(0, 80), { x: payload.settings.marginLeft, y, size: payload.settings.fontSize, font: helvetica, color: rgb(0.15, 0.15, 0.15) }); y -= payload.settings.fontSize + 4; break; }
          default: y -= 10;
        }
      }
      const pdfBytes = await pdfDoc.save();
      return { blob: pdfBytes, pageCount: pdfDoc.getPageCount() };
    },
    { timeoutMs: 5 * 60 * 1000 },
  );

  // Sync worker progress to local state
  useEffect(() => {
    if (workerProgress.percent > 0) {
      setProgress(workerProgress.percent);
    }
  }, [workerProgress]);

  const [markdown, setMarkdown] = useState(SAMPLE_MARKDOWN);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);

  const [settings, setSettings] = useState<MdSettings>({
    pageSize: 'A4',
    fontSize: 11,
    marginTop: 50,
    marginBottom: 50,
    marginLeft: 50,
    marginRight: 50,
    title: '',
    pageNumbers: true,
  });

  // Word count
  const wordCount = markdown
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0).length;
  const charCount = markdown.length;
  const lineCount = markdown.split('\n').length;

  const handleUploadMd = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (!file.name.endsWith('.md') && !file.name.endsWith('.txt') && !file.name.endsWith('.markdown')) {
        toast({
          title: 'Invalid file type',
          description: 'Please upload a .md, .txt, or .markdown file.',
          variant: 'destructive',
        });
        return;
      }

      const reader = new FileReader();
      reader.onload = (evt) => {
        const text = evt.target?.result as string;
        setMarkdown(text);
        toast({
          title: 'File loaded',
          description: `${file.name} (${formatSize(file.size)})`,
        });
      };
      reader.readAsText(file);

      // Reset the input so the same file can be uploaded again
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    [toast],
  );

  const convertToPdf = useCallback(async () => {
    if (!markdown.trim()) {
      toast({
        title: 'No content',
        description: 'Please enter some markdown text to convert.',
        variant: 'destructive',
      });
      return;
    }

    setProcessing(true);
    setProgress(0);

    try {
      // Use Web Worker for off-thread PDF generation
      const workerResult = await executeMdTask(
        { markdown, settings },
        'md-to-pdf',
      );

      const blob = new Blob([workerResult.blob], { type: 'application/pdf' });
      const fileName = settings.title
        ? `${settings.title.replace(/\s+/g, '-').toLowerCase()}.pdf`
        : `markdown-${Date.now()}.pdf`;

      saveAs(blob, fileName);

      addRecentFile({
        id: crypto.randomUUID(),
        name: fileName,
        type: 'application/pdf',
        tool: 'markdown-to-pdf',
        size: formatSize(blob.size),
        timestamp: Date.now(),
      });

      setProgress(100);
      toast({
        title: 'PDF created',
        description: `${fileName} (${workerResult.pageCount} page${workerResult.pageCount !== 1 ? 's' : ''}, ${formatSize(blob.size)})`,
      });
    } catch (err) {
      console.error('PDF conversion error:', err);
      toast({
        title: 'Conversion failed',
        description: 'An unexpected error occurred. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setProcessing(false);
    }
  }, [markdown, settings, addRecentFile, toast, executeMdTask]);

  return (
    <ToolLayout
      title="Markdown to PDF"
      description="Convert markdown text into a styled PDF document"
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Editor Panel */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="lg:col-span-2 space-y-4"
        >
          {/* Toolbar */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="font-mono text-xs">
                {lineCount} lines
              </Badge>
              <Badge variant="secondary" className="font-mono text-xs">
                {wordCount} words
              </Badge>
              <Badge variant="secondary" className="font-mono text-xs">
                {charCount} chars
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setMarkdown('')}
                disabled={processing || !markdown.trim()}
              >
                <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                Clear
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={processing}
              >
                <Upload className="h-3.5 w-3.5 mr-1.5" />
                Upload .md
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".md,.txt,.markdown"
                className="hidden"
                onChange={handleUploadMd}
              />
            </div>
          </div>

          {/* Textarea */}
          <Card>
            <CardContent className="p-0">
              <Textarea
                value={markdown}
                onChange={(e) => setMarkdown(e.target.value)}
                className="min-h-[500px] lg:min-h-[600px] resize-y rounded-none border-0 font-mono text-sm leading-relaxed focus-visible:ring-0 focus-visible:ring-offset-0 bg-transparent p-4"
                placeholder="Type or paste your markdown here..."
                disabled={processing}
              />
            </CardContent>
          </Card>
        </motion.div>

        {/* Settings Panel */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="space-y-4"
        >
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Settings className="h-4 w-4" />
                Settings
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Page Size */}
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5" />
                  Page Size
                </Label>
                <Select
                  value={settings.pageSize}
                  onValueChange={(v) =>
                    setSettings((s) => ({ ...s, pageSize: v as PageSize }))
                  }
                  disabled={processing}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAGE_SIZES.map((ps) => (
                      <SelectItem key={ps.value} value={ps.value}>
                        {ps.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Font Size */}
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1.5">
                  <Type className="h-3.5 w-3.5" />
                  Font Size
                </Label>
                <div className="flex items-center gap-3">
                  <Input
                    type="number"
                    min={6}
                    max={24}
                    value={settings.fontSize}
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s,
                        fontSize: Math.max(6, Math.min(24, parseInt(e.target.value) || 11)),
                      }))
                    }
                    disabled={processing}
                    className="h-9 w-20"
                  />
                  <span className="text-sm text-muted-foreground">px</span>
                </div>
              </div>

              <Separator />

              {/* Margins */}
              <div className="space-y-2">
                <Label className="text-xs flex items-center gap-1.5">
                  <AlignLeft className="h-3.5 w-3.5" />
                  Margins (pt)
                </Label>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Top</Label>
                    <Input
                      type="number"
                      min={10}
                      max={100}
                      value={settings.marginTop}
                      onChange={(e) =>
                        setSettings((s) => ({
                          ...s,
                          marginTop: Math.max(10, Math.min(100, parseInt(e.target.value) || 50)),
                        }))
                      }
                      disabled={processing}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Bottom</Label>
                    <Input
                      type="number"
                      min={10}
                      max={100}
                      value={settings.marginBottom}
                      onChange={(e) =>
                        setSettings((s) => ({
                          ...s,
                          marginBottom: Math.max(10, Math.min(100, parseInt(e.target.value) || 50)),
                        }))
                      }
                      disabled={processing}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Left</Label>
                    <Input
                      type="number"
                      min={10}
                      max={100}
                      value={settings.marginLeft}
                      onChange={(e) =>
                        setSettings((s) => ({
                          ...s,
                          marginLeft: Math.max(10, Math.min(100, parseInt(e.target.value) || 50)),
                        }))
                      }
                      disabled={processing}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Right</Label>
                    <Input
                      type="number"
                      min={10}
                      max={100}
                      value={settings.marginRight}
                      onChange={(e) =>
                        setSettings((s) => ({
                          ...s,
                          marginRight: Math.max(10, Math.min(100, parseInt(e.target.value) || 50)),
                        }))
                      }
                      disabled={processing}
                      className="h-8 text-sm"
                    />
                  </div>
                </div>
              </div>

              <Separator />

              {/* Title */}
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1.5">
                  <Type className="h-3.5 w-3.5" />
                  Document Title
                </Label>
                <Input
                  placeholder="Optional title for the PDF"
                  value={settings.title}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, title: e.target.value }))
                  }
                  disabled={processing}
                  className="h-9"
                />
                <p className="text-[10px] text-muted-foreground">
                  Printed at the top of the first page with a separator line
                </p>
              </div>

              {/* Page Numbers */}
              <div className="flex items-center justify-between">
                <Label className="text-xs flex items-center gap-1.5" htmlFor="page-numbers">
                  <Hash className="h-3.5 w-3.5" />
                  Page Numbers
                </Label>
                <Switch
                  id="page-numbers"
                  checked={settings.pageNumbers}
                  onCheckedChange={(checked) =>
                    setSettings((s) => ({ ...s, pageNumbers: checked }))
                  }
                  disabled={processing}
                />
              </div>
            </CardContent>
          </Card>

          {/* Supported Syntax */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-muted-foreground">
                Supported Syntax
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <code className="bg-muted px-1.5 py-0.5 rounded font-mono text-[11px]">
                  # Heading
                </code>
                <span>— H1, H2, H3</span>
              </div>
              <div className="flex items-center gap-2">
                <code className="bg-muted px-1.5 py-0.5 rounded font-mono text-[11px]">
                  **bold**
                </code>
                <span>— Bold text</span>
              </div>
              <div className="flex items-center gap-2">
                <code className="bg-muted px-1.5 py-0.5 rounded font-mono text-[11px]">
                  - item
                </code>
                <span>— Bullet list</span>
              </div>
              <div className="flex items-center gap-2">
                <code className="bg-muted px-1.5 py-0.5 rounded font-mono text-[11px]">
                  {'```code```'}
                </code>
                <span>— Code block</span>
              </div>
              <div className="flex items-center gap-2">
                <code className="bg-muted px-1.5 py-0.5 rounded font-mono text-[11px]">
                  {'---'}
                </code>
                <span>— Horizontal rule</span>
              </div>
              <div className="flex items-center gap-2">
                <code className="bg-muted px-1.5 py-0.5 rounded font-mono text-[11px]">
                  {'> quote'}
                </code>
                <span>— Blockquote</span>
              </div>
            </CardContent>
          </Card>

          {/* Progress */}
          <AnimatePresence>
            {processing && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-2"
              >
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Converting...</span>
                    <WorkerBadge active={isWorkerActive} />
                  </div>
                  <span className="font-medium">{progress}%</span>
                </div>
                <Progress value={progress} />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Convert Button */}
          <Button
            className="w-full"
            size="lg"
            disabled={processing || !markdown.trim()}
            onClick={convertToPdf}
          >
            {processing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Converting...
              </>
            ) : (
              <>
                <FileDown className="h-4 w-4 mr-2" />
                Convert to PDF
              </>
            )}
          </Button>
        </motion.div>
      </div>
    </ToolLayout>
  );
}
