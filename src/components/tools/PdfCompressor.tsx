'use client';

import { useState, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  FileDown,
  Loader2,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Archive,
  Eye,
  X,
  Zap,
  ShieldCheck,
  Gauge,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import {
  RadioGroup,
  RadioGroupItem,
} from '@/components/ui/radio-group';
import { ToolLayout } from '@/components/shared/ToolLayout';
import { FileDropzone } from '@/components/shared/FileDropzone';
import { useAppStore } from '@/store';
import { formatSize } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useWorkerTask } from '@/hooks/useWorkerTask';
import { createPdfWorker } from '@/lib/worker-factories';
import { WorkerBadge } from '@/components/shared/WorkerBadge';
import { PDFDocument } from 'pdf-lib';
import { saveAs } from 'file-saver';
import JSZip from 'jszip';

type Strategy = 'auto' | 'quality' | 'compression';

async function tryLosslessCompression(sourceArrayBuffer: ArrayBuffer): Promise<ArrayBuffer> {
  const pdfDoc = await PDFDocument.load(sourceArrayBuffer, { ignoreEncryption: true });
  pdfDoc.setTitle(''); pdfDoc.setAuthor(''); pdfDoc.setSubject('');
  pdfDoc.setKeywords([]); pdfDoc.setProducer(''); pdfDoc.setCreator('');
  return pdfDoc.save({ useObjectStreams: true, addDefaultPage: false });
}

async function renderPagesToJpeg(
  sourceArrayBuffer: ArrayBuffer, scale: number, quality: number,
  onProgress: (done: number, total: number) => void
): Promise<{ dataUrl: string; width: number; height: number }[]> {
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
  const pdfDoc = await pdfjsLib.getDocument({ data: new Uint8Array(sourceArrayBuffer), useSystemFonts: true }).promise;
  const pages: { dataUrl: string; width: number; height: number }[] = [];
  for (let i = 1; i <= pdfDoc.numPages; i++) {
    const page = await pdfDoc.getPage(i);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width); canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext('2d')!; if (!ctx) throw new Error(`Canvas context failed for page ${i}`);
    await page.render({ canvasContext: ctx, viewport }).promise;
    pages.push({ dataUrl: canvas.toDataURL('image/jpeg', quality), width: canvas.width, height: canvas.height });
    canvas.width = 0; canvas.height = 0;
    onProgress(i, pdfDoc.numPages);
  }
  return pages;
}

async function rebuildPdfFromImages(pages: { dataUrl: string; width: number; height: number }[]): Promise<ArrayBuffer> {
  const { jsPDF } = await import('jspdf');
  const firstPage = pages[0];
  const pxToMm = 25.4 / 72;
  const pageWidthMm = (firstPage.width / 1.5) * pxToMm;
  const pageHeightMm = (firstPage.height / 1.5) * pxToMm;
  const doc = new jsPDF({ orientation: pageWidthMm > pageHeightMm ? 'landscape' : 'portrait', unit: 'mm', format: [pageWidthMm, pageHeightMm] });
  for (let i = 0; i < pages.length; i++) {
    if (i > 0) doc.addPage([pageWidthMm, pageHeightMm]);
    doc.addImage(pages[i].dataUrl, 'JPEG', 0, 0, pageWidthMm, pageHeightMm);
  }
  return doc.output('arraybuffer');
}

async function compressToTarget(
  file: File, targetBytes: number, strategy: Strategy,
  onProgress: (pct: number, message: string) => void
): Promise<Blob> {
  const sourceBuffer = await file.arrayBuffer();
  onProgress(5, 'Optimizing PDF structure...');
  const losslessBuffer = await tryLosslessCompression(sourceBuffer);
  if (losslessBuffer.byteLength <= targetBytes) { onProgress(100, 'Done'); return new Blob([losslessBuffer], { type: 'application/pdf' }); }

  const pageCount = await PDFDocument.load(sourceBuffer, { ignoreEncryption: true }).then(d => d.getPageCount());
  const originalPerPageSize = sourceBuffer.byteLength / pageCount;
  let baseScale = 1.5;
  if (strategy === 'quality') baseScale = 2.0;
  if (strategy === 'compression') baseScale = 0.8;
  const scaleFactor = Math.max(0.5, Math.min(baseScale, Math.sqrt(targetBytes / (originalPerPageSize * 2))));

  let lo = strategy === 'compression' ? 0.03 : 0.05;
  let hi = strategy === 'quality' ? 0.98 : 0.95;
  let bestBlob: Blob | null = null;
  let iterations = 0;
  const maxIterations = strategy === 'quality' ? 12 : 8;

  while (lo <= hi && iterations < maxIterations) {
    iterations++;
    const mid = Math.round((lo + hi) * 100) / 100;
    onProgress(Math.min(90, 10 + iterations * 10), `Quality ${Math.round(mid * 100)}% (${iterations}/${maxIterations})...`);
    try {
      const pages = await renderPagesToJpeg(sourceBuffer, scaleFactor, mid, () => {});
      const rebuilt = await rebuildPdfFromImages(pages);
      const blob = new Blob([rebuilt], { type: 'application/pdf' });
      if (blob.size <= targetBytes) { bestBlob = blob; lo = mid + 0.03; } else { hi = mid - 0.03; }
    } catch { hi = mid - 0.03; }
  }

  if (!bestBlob) {
    onProgress(90, 'Maximum compression...');
    try {
      const pages = await renderPagesToJpeg(sourceBuffer, scaleFactor, 0.03, () => {});
      const rebuilt = await rebuildPdfFromImages(pages);
      bestBlob = new Blob([rebuilt], { type: 'application/pdf' });
    } catch { bestBlob = new Blob([losslessBuffer], { type: 'application/pdf' }); }
  }
  onProgress(100, 'Done');
  return bestBlob;
}

const TARGET_OPTIONS = [
  { label: '100 KB', value: 100 }, { label: '200 KB', value: 200 },
  { label: '500 KB', value: 500 }, { label: '1 MB', value: 1024 }, { label: 'Custom', value: 0 },
];

interface BatchItem {
  file: File;
  pageCount: number;
  result: Blob | null;
  resultSize: number;
  status: 'idle' | 'processing' | 'done' | 'error';
  targetNotMet: boolean;
  previewUrl: string | null;
}

/* ─── Worker interface types (mirrors worker message protocol) ─── */
interface PdfWorkerPayload {
  fileData: ArrayBuffer;
  targetKB: number;
  strategy: 'auto' | 'quality' | 'compression';
}
interface PdfWorkerResult {
  blob: ArrayBuffer;
  finalSize: number;
  targetNotMet?: boolean;
}

export function PdfCompressor() {
  const { addRecentFile } = useAppStore();
  const { toast } = useToast();

  // ─── Web Worker for PDF compression ───
  const pdfWorkerFallback = useCallback(async (
    payload: PdfWorkerPayload,
    _taskType: string | undefined,
    reportProgress: (percent: number, message: string) => void
  ) => {
    const blob = new Blob([payload.fileData], { type: 'application/pdf' });
    const fakeFile = new File([blob], 'document.pdf', { type: 'application/pdf' });
    const targetBytes = payload.targetKB * 1024;
    return compressToTarget(fakeFile, targetBytes, payload.strategy as Strategy, reportProgress);
  }, []);

  const {
    execute: executePdfTask,
    progress: workerProgress,
    isWorkerActive,
  } = useWorkerTask<PdfWorkerPayload, PdfWorkerResult>(
    createPdfWorker,
    pdfWorkerFallback,
    { timeoutMs: 10 * 60 * 1000 },
  );

  // Sync worker progress to local state
  useEffect(() => {
    if (workerProgress.percent > 0 && workerProgress.message) {
      setProgress(workerProgress.percent);
      setStatusMessage(workerProgress.message);
    }
  }, [workerProgress]);

  const [batchMode, setBatchMode] = useState(false);
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [targetPreset, setTargetPreset] = useState<string>('500');
  const [customTargetKB, setCustomTargetKB] = useState<number>(500);
  const [strategy, setStrategy] = useState<Strategy>('auto');
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [result, setResult] = useState<Blob | null>(null);
  const [targetNotMet, setTargetNotMet] = useState(false);
  const [batchProgress, setBatchProgress] = useState(0);
  const [previewItem, setPreviewItem] = useState<BatchItem | null>(null);

  const targetKB = targetPreset === '0' ? customTargetKB : parseInt(targetPreset);

  const handleFiles = useCallback(async (files: File[]) => {
    const pdfs = files.filter(f => f.type === 'application/pdf');
    if (batchMode) {
      const newItems: BatchItem[] = [];
      for (const pdf of pdfs) {
        try {
          const buf = await pdf.arrayBuffer();
          const doc = await PDFDocument.load(buf, { ignoreEncryption: true });
          newItems.push({ file: pdf, pageCount: doc.getPageCount(), result: null, resultSize: 0, status: 'idle', targetNotMet: false, previewUrl: null });
        } catch {
          newItems.push({ file: pdf, pageCount: 0, result: null, resultSize: 0, status: 'error', targetNotMet: false, previewUrl: null });
        }
      }
      setBatchItems(prev => [...prev, ...newItems]);
    } else if (pdfs[0]) {
      setFile(pdfs[0]); setResult(null); setTargetNotMet(false);
      try {
        const buf = await pdfs[0].arrayBuffer();
        const doc = await PDFDocument.load(buf, { ignoreEncryption: true });
        setPageCount(doc.getPageCount());
      } catch { setPageCount(0); }
    }
  }, [batchMode]);

  const compressPdf = useCallback(async () => {
    if (!file) return;
    setProcessing(true); setProgress(0); setStatusMessage('Starting compression...'); setResult(null); setTargetNotMet(false);
    try {
      const targetBytes = targetKB * 1024;
      if (file.size <= targetBytes) { toast({ title: 'No compression needed', description: `Already smaller than ${formatSize(targetBytes)}.` }); setProcessing(false); return; }
      // Use Web Worker for compression
      const fileData = await file.arrayBuffer();
      const workerResult = await executePdfTask(
        { fileData, targetKB, strategy },
        'compress-pdf',
      );
      const compressedBlob = new Blob([workerResult.blob], { type: 'application/pdf' });
      if (workerResult.targetNotMet) {
        setTargetNotMet(true);
        toast({ title: 'Could not reach target', description: `Best: ${formatSize(compressedBlob.size)}, Target: ${formatSize(targetBytes)}`, variant: 'destructive' });
      } else { toast({ title: 'Compression complete', description: `${formatSize(file.size)} → ${formatSize(compressedBlob.size)}` }); }
      setResult(compressedBlob); setProgress(100); setStatusMessage('Done');
    } catch (err) {
      toast({ title: 'Compression failed', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
      setProgress(0); setStatusMessage('');
    } finally { setProcessing(false); }
  }, [file, targetKB, strategy, toast, executePdfTask]);

  const compressAllBatch = useCallback(async () => {
    if (batchItems.length === 0) return;
    setProcessing(true); setBatchProgress(0);
    const updated = [...batchItems];
    for (let i = 0; i < updated.length; i++) {
      if (updated[i].pageCount === 0) { updated[i] = { ...updated[i], status: 'error' }; setBatchItems([...updated]); continue; }
      updated[i] = { ...updated[i], status: 'processing' }; setBatchItems([...updated]);
      setBatchProgress(Math.round((i / updated.length) * 100));
      try {
        const targetBytes = targetKB * 1024;
        // Use Web Worker for batch compression
        const fileData = await updated[i].file.arrayBuffer();
        const workerResult = await executePdfTask(
          { fileData, targetKB, strategy },
          'compress-pdf',
        );
        const blob = new Blob([workerResult.blob], { type: 'application/pdf' });
        const met = blob.size <= targetBytes;
        // Generate preview of first page
        let previewUrl: string | null = null;
        try {
          const pages = await renderPagesToJpeg(await updated[i].file.arrayBuffer(), 0.5, 0.6, () => {});
          if (pages[0]) previewUrl = pages[0].dataUrl;
        } catch { /* no preview */ }
        updated[i] = { ...updated[i], result: blob, resultSize: workerResult.finalSize, status: 'done', targetNotMet: !met, previewUrl };
      } catch { updated[i] = { ...updated[i], status: 'error' }; }
      setBatchItems([...updated]); setBatchProgress(Math.round(((i + 1) / updated.length) * 100));
    }
    setProcessing(false);
    toast({ title: 'Batch Complete', description: `${updated.filter(i => i.status === 'done').length}/${updated.length} compressed` });
  }, [batchItems, targetKB, strategy, toast, executePdfTask]);

  const downloadAllBatch = useCallback(async () => {
    const doneItems = batchItems.filter(i => i.status === 'done' && i.result);
    if (!doneItems.length) return;
    const zip = new JSZip();
    for (const item of doneItems) zip.add(`compressed-${item.file.name}`, item.result!);
    const content = await zip.generateAsync({ type: 'blob' });
    saveAs(content, `compressed-pdfs-${Date.now()}.zip`);
    addRecentFile({ id: crypto.randomUUID(), name: `${doneItems.length}-pdfs-compressed.zip`, type: 'application/zip', tool: 'compress-pdf', size: formatSize(content.size), timestamp: Date.now() });
  }, [batchItems, addRecentFile]);

  const handleDownload = useCallback(() => {
    if (!result) return;
    const fileName = `compressed-${file?.name || 'document.pdf'}`;
    saveAs(result, fileName);
    addRecentFile({ id: crypto.randomUUID(), name: fileName, type: 'application/pdf', tool: 'compress-pdf', size: formatSize(result.size), timestamp: Date.now() });
  }, [result, file, addRecentFile]);

  return (
    <ToolLayout title="Compress PDF" description="Reduce PDF file size to your target size">
      {/* Batch Toggle */}
      <Card>
        <CardContent className="p-4 flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="text-sm font-medium flex items-center gap-2"><Archive className="h-4 w-4" />Batch Mode</Label>
            <p className="text-xs text-muted-foreground">Compress multiple PDFs at once</p>
          </div>
          <Switch checked={batchMode} onCheckedChange={(v) => { setBatchMode(v); setBatchItems([]); setFile(null); setResult(null); }} />
        </CardContent>
      </Card>

      {batchMode ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
          {batchItems.length === 0 ? (
            <FileDropzone onFiles={handleFiles} accept=".pdf,application/pdf" multiple={true} label="Drop multiple PDFs here" sublabel="All PDFs will be compressed with the same settings" />
          ) : (
            <>
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">PDFs ({batchItems.length})</CardTitle>
                    <Button size="sm" variant="outline" onClick={() => setBatchItems([])}><Trash2 className="h-3.5 w-3.5 mr-1" />Clear</Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
                    {batchItems.map((item, idx) => (
                      <div key={idx} className="flex items-center gap-3 p-2 rounded-lg border bg-muted/30">
                        <div className="h-10 w-10 rounded-lg bg-red-100 dark:bg-red-950 flex items-center justify-center flex-shrink-0">
                          <FileDown className="h-5 w-5 text-red-600 dark:text-red-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{item.file.name}</p>
                          <p className="text-xs text-muted-foreground">{formatSize(item.file.size)} · {item.pageCount} pages</p>
                        </div>
                        {item.status === 'idle' && <Badge variant="secondary" className="text-xs">Pending</Badge>}
                        {item.status === 'processing' && <Badge className="bg-amber-500 text-xs"><Loader2 className="h-3 w-3 mr-1 animate-spin" /></Badge>}
                        {item.status === 'done' && <Badge className={item.targetNotMet ? 'bg-amber-500' : 'bg-green-600'}>{formatSize(item.resultSize)}</Badge>}
                        {item.status === 'error' && <Badge variant="destructive" className="text-xs">Error</Badge>}
                        {item.status === 'done' && item.previewUrl && (
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setPreviewItem(item)}><Eye className="h-3.5 w-3.5" /></Button>
                        )}
                        {item.status !== 'processing' && (
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setBatchItems(prev => prev.filter((_, i) => i !== idx))}><Trash2 className="h-3.5 w-3.5" /></Button>
                        )}
                      </div>
                    ))}
                  </div>
                  {batchItems.length < 20 && (
                    <FileDropzone onFiles={handleFiles} accept=".pdf,application/pdf" multiple={true} label="Add more PDFs" variant="compact" icon="plus" />
                  )}
                </CardContent>
              </Card>

              {processing && (
                <Card><CardContent className="p-4 space-y-2">
                  <div className="flex justify-between text-sm"><span>Compressing batch...</span><span>{batchProgress}%</span></div>
                  <Progress value={batchProgress} />
                </CardContent></Card>
              )}

              {batchItems.some(i => i.status === 'done') && !processing && (
                <Card className="border-green-200 dark:border-green-900">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-green-700 dark:text-green-400">
                        {batchItems.filter(i => i.status === 'done').length}/{batchItems.length} compressed
                      </h3>
                      <span className="text-xs text-muted-foreground">
                        Saved {formatSize(batchItems.filter(i => i.status === 'done').reduce((a, i) => a + i.file.size, 0) - batchItems.filter(i => i.status === 'done').reduce((a, i) => a + i.resultSize, 0))}
                      </span>
                    </div>
                    <Button className="w-full" onClick={downloadAllBatch}><Archive className="h-4 w-4 mr-2" />Download All as ZIP</Button>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </motion.div>
      ) : (
        !file ? (
          <FileDropzone onFiles={handleFiles} accept=".pdf,application/pdf" multiple={false} label="Drop PDF here or click to upload" sublabel="Supports PDF files up to 50 MB" />
        ) : (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
            <Card>
              <CardContent className="p-4 flex items-center gap-4">
                <div className="h-10 w-10 rounded-lg bg-red-100 dark:bg-red-950 flex items-center justify-center flex-shrink-0">
                  <FileDown className="h-5 w-5 text-red-600 dark:text-red-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{file.name}</p>
                  <p className="text-sm text-muted-foreground">Original: {formatSize(file.size)} · {pageCount} pages</p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => { setFile(null); setResult(null); setTargetNotMet(false); }} disabled={processing}><Trash2 className="h-4 w-4" /></Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3"><div className="flex items-center gap-2"><CardTitle className="text-base">Compression Settings</CardTitle><WorkerBadge active={isWorkerActive} /></div></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Target Size</Label>
                  <Select value={targetPreset} onValueChange={setTargetPreset} disabled={processing}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TARGET_OPTIONS.map(o => <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {targetPreset === '0' && (
                    <Input type="number" min={10} max={10240} value={customTargetKB} onChange={(e) => setCustomTargetKB(Number(e.target.value))} placeholder="Target KB" disabled={processing} />
                  )}
                  <p className="text-sm text-muted-foreground">Target: {formatSize(targetKB * 1024)}</p>
                </div>

                {/* Strategy */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5"><Zap className="h-3.5 w-3.5" />Compression Strategy</Label>
                  <RadioGroup value={strategy} onValueChange={(v) => setStrategy(v as Strategy)} className="space-y-2">
                    <div className="flex items-center space-x-2 p-2 rounded-lg border">
                      <RadioGroupItem value="auto" id="strat-auto" />
                      <Label htmlFor="strat-auto" className="flex-1 cursor-pointer"><span className="font-medium">Auto</span><p className="text-xs text-muted-foreground">Balanced quality and size</p></Label>
                    </div>
                    <div className="flex items-center space-x-2 p-2 rounded-lg border">
                      <RadioGroupItem value="quality" id="strat-quality" />
                      <Label htmlFor="strat-quality" className="flex-1 cursor-pointer"><span className="font-medium flex items-center gap-1"><ShieldCheck className="h-3 w-3" />Maximum Quality</span><p className="text-xs text-muted-foreground">Higher resolution, may not hit target</p></Label>
                    </div>
                    <div className="flex items-center space-x-2 p-2 rounded-lg border">
                      <RadioGroupItem value="compression" id="strat-comp" />
                      <Label htmlFor="strat-comp" className="flex-1 cursor-pointer"><span className="font-medium flex items-center gap-1"><Gauge className="h-3 w-3" />Maximum Compression</span><p className="text-xs text-muted-foreground">Aggressive, smaller output</p></Label>
                    </div>
                  </RadioGroup>
                </div>

                {processing && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm"><span>{statusMessage}</span><span>{progress}%</span></div>
                    <Progress value={progress} />
                  </div>
                )}

                <Button className="w-full" size="lg" disabled={processing} onClick={compressPdf}>
                  {processing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Compressing...</> : <><FileDown className="h-4 w-4 mr-2" />Compress PDF</>}
                </Button>
              </CardContent>
            </Card>

            {result && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                <Card className={targetNotMet ? 'border-amber-200 dark:border-amber-900' : 'border-green-200 dark:border-green-900'}>
                  <CardContent className="p-6 space-y-4">
                    <div className="flex items-center gap-2">
                      {targetNotMet ? <AlertCircle className="h-5 w-5 text-amber-600" /> : <CheckCircle2 className="h-5 w-5 text-green-600" />}
                      <h3 className={`font-semibold ${targetNotMet ? 'text-amber-700 dark:text-amber-400' : 'text-green-700 dark:text-green-400'}`}>
                        {targetNotMet ? 'Best Compression Achieved' : 'Compression Complete!'}
                      </h3>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="text-center p-3 rounded-lg bg-muted"><p className="text-sm text-muted-foreground">Original</p><p className="text-lg font-bold">{formatSize(file.size)}</p></div>
                      <div className={`text-center p-3 rounded-lg ${targetNotMet ? 'bg-amber-50 dark:bg-amber-950' : 'bg-green-50 dark:bg-green-950'}`}>
                        <p className={`text-sm ${targetNotMet ? 'text-amber-600' : 'text-green-600'}`}>Compressed</p>
                        <p className={`text-lg font-bold ${targetNotMet ? 'text-amber-700' : 'text-green-700'}`}>{formatSize(result.size)}</p>
                      </div>
                    </div>
                    <div className="text-center"><p className="text-sm text-muted-foreground">Reduced by <span className={`font-bold ${targetNotMet ? 'text-amber-600' : 'text-green-600'}`}>{Math.max(0, 100 - Math.round((result.size / file.size) * 100))}%</span></p></div>
                    <Button className="w-full" onClick={handleDownload}>Download Compressed PDF</Button>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </motion.div>
        )
      )}

      {/* Batch settings card */}
      {batchMode && batchItems.length > 0 && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Compression Settings</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Target Size</Label>
                <Select value={targetPreset} onValueChange={setTargetPreset}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TARGET_OPTIONS.map(o => <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Strategy</Label>
                <Select value={strategy} onValueChange={(v) => setStrategy(v as Strategy)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Auto (Balanced)</SelectItem>
                    <SelectItem value="quality">Max Quality</SelectItem>
                    <SelectItem value="compression">Max Compression</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">Target: {formatSize(targetKB * 1024)}</p>
            <Button className="w-full" size="lg" disabled={processing} onClick={compressAllBatch}>
              {processing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Compressing {batchItems.length} PDFs...</> : <><FileDown className="h-4 w-4 mr-2" />Compress All ({batchItems.length})</>}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Preview Modal */}
      {previewItem && previewItem.previewUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setPreviewItem(null)}>
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-background rounded-xl p-4 max-w-lg w-full mx-4 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Preview: {previewItem.file.name}</h3>
              <Button variant="ghost" size="icon" onClick={() => setPreviewItem(null)}><X className="h-4 w-4" /></Button>
            </div>
            <div className="rounded-lg overflow-hidden border">
              <img src={previewItem.previewUrl} alt="Preview" className="w-full" />
            </div>
            <p className="text-sm text-muted-foreground text-center">
              {formatSize(previewItem.file.size)} → {formatSize(previewItem.resultSize)}
              {previewItem.targetNotMet && <span className="text-amber-500 ml-1">(Target not met)</span>}
            </p>
          </motion.div>
        </div>
      )}
    </ToolLayout>
  );
}
