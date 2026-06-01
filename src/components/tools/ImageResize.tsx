'use client';

import { useState, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Scaling,
  Download,
  Loader2,
  Lock,
  Unlock,
  Trash2,
  ImageIcon,
  Archive,
  Save,
  Star,
  X,
  Share2,
  Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
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
import { formatSize } from '@/lib/utils';
import { saveAs } from 'file-saver';
import { useToast } from '@/hooks/use-toast';
import { useWorkerTask } from '@/hooks/useWorkerTask';
import { createImageWorker } from '@/lib/worker-factories';
import { WorkerBadge } from '@/components/shared/WorkerBadge';
import JSZip from 'jszip';

type OutputFormat = 'jpeg' | 'png' | 'webp';

const PRESET_SIZES = [
  { label: '20KB (Govt Form)', value: 20 },
  { label: '50KB (Passport)', value: 50 },
  { label: '100KB (Signature)', value: 100 },
  { label: '200KB', value: 200 },
  { label: '500KB', value: 500 },
];

const PERCENT_PRESETS = [25, 50, 75, 100, 150, 200] as const;

const SOCIAL_PRESETS = [
  { name: 'Instagram Post', w: 1080, h: 1080, desc: '1:1 Square' },
  { name: 'Instagram Story', w: 1080, h: 1920, desc: '9:16 Portrait' },
  { name: 'Facebook Cover', w: 820, h: 312, desc: 'Landscape' },
  { name: 'Facebook Post', w: 1200, h: 630, desc: 'Landscape' },
  { name: 'Twitter Header', w: 1500, h: 500, desc: 'Wide' },
  { name: 'Twitter Post', w: 1200, h: 675, desc: '16:9' },
  { name: 'LinkedIn Banner', w: 1584, h: 396, desc: 'Wide' },
  { name: 'LinkedIn Post', w: 1200, h: 627, desc: 'Landscape' },
  { name: 'YouTube Thumb', w: 1280, h: 720, desc: '16:9' },
  { name: 'Pinterest Pin', w: 1000, h: 1500, desc: '2:3 Portrait' },
];

const OUTPUT_FORMATS: { label: string; value: OutputFormat }[] = [
  { label: 'JPEG', value: 'jpeg' },
  { label: 'PNG', value: 'png' },
  { label: 'WebP', value: 'webp' },
];

const FORMAT_MIME: Record<OutputFormat, string> = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
const FORMAT_EXT: Record<OutputFormat, string> = { jpeg: 'jpg', png: 'png', webp: 'webp' };

interface SavedPreset { name: string; w: number; h: number; }
interface BatchItem {
  file: File;
  preview: string;
  result: string | null;
  resultSize: number;
  resultDims: { w: number; h: number };
  status: 'idle' | 'processing' | 'done' | 'error';
}

function getSavedPresets(): SavedPreset[] {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem('snappdf-resize-presets') || '[]'); } catch { return []; }
}
function savePresetsToStorage(presets: SavedPreset[]) {
  try { localStorage.setItem('snappdf-resize-presets', JSON.stringify(presets)); } catch { /* ignore */ }
}

export function ImageResize() {
  const { addRecentFile } = useAppStore();
  const { toast } = useToast();

  // ─── Web Worker for image resize (file-size mode) ───
  const { execute: executeImageTask, isWorkerActive } = useWorkerTask(
    createImageWorker,
    async (payload: any, _taskType: string | undefined, _reportProgress: (pct: number, msg: string) => void) => {
      const { imageData, width, height, format, quality } = payload;
      const mime = FORMAT_MIME[format];
      const bitmap = await createImageBitmap(new Blob([imageData]));
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bitmap, 0, 0, width, height);
      bitmap.close();
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mime, format === 'png' ? undefined : quality / 100));
      return blob ? { blob: await blob.arrayBuffer(), width, height, size: blob.size } : null;
    },
    { timeoutMs: 5 * 60 * 1000 },
  );

  const [batchMode, setBatchMode] = useState(false);
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string>('');
  const [originalDims, setOriginalDims] = useState({ w: 0, h: 0 });
  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState(0);
  const [lockAspect, setLockAspect] = useState(true);
  const [mode, setMode] = useState<'pixels' | 'filesize'>('pixels');
  const [targetKB, setTargetKB] = useState<number>(100);
  const [outputFormat, setOutputFormat] = useState<OutputFormat>('jpeg');
  const [stripExif, setStripExif] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<{ url: string; size: number; dims: { w: number; h: number } } | null>(null);
  const [comparisonPos, setComparisonPos] = useState(50);
  const [savedPresets, setSavedPresets] = useState<SavedPreset[]>([]);
  const [newPresetName, setNewPresetName] = useState('');
  const [showSavePreset, setShowSavePreset] = useState(false);
  const [batchProgress, setBatchProgress] = useState(0);

  const aspectRatio = originalDims.w > 0 ? originalDims.w / originalDims.h : 1;

  useEffect(() => { setSavedPresets(getSavedPresets()); }, []);

  const handleFiles = useCallback((files: File[]) => {
    const imgs = files.filter(f => ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'].includes(f.type));
    if (batchMode) {
      const newItems: BatchItem[] = imgs.map(f => ({
        file: f, preview: URL.createObjectURL(f), result: null, resultSize: 0, resultDims: { w: 0, h: 0 }, status: 'idle' as const,
      }));
      setBatchItems(prev => [...prev, ...newItems]);
    } else if (imgs[0]) {
      setFile(imgs[0]); setResult(null);
      const url = URL.createObjectURL(imgs[0]); setPreview(url);
      const el = new Image(); el.onload = () => { setOriginalDims({ w: el.width, h: el.height }); setWidth(el.width); setHeight(el.height); }; el.src = url;
    }
  }, [batchMode]);

  const handleWidthChange = useCallback((val: number) => {
    setWidth(val);
    if (lockAspect && originalDims.h > 0) setHeight(Math.round(val / aspectRatio));
  }, [lockAspect, aspectRatio, originalDims.h]);

  const handleHeightChange = useCallback((val: number) => {
    setHeight(val);
    if (lockAspect && originalDims.w > 0) setWidth(Math.round(val * aspectRatio));
  }, [lockAspect, aspectRatio, originalDims.w]);

  const handlePercentPreset = useCallback((pct: number) => {
    if (originalDims.w === 0 || originalDims.h === 0) return;
    setWidth(Math.round((originalDims.w * pct) / 100));
    setHeight(Math.round((originalDims.h * pct) / 100));
  }, [originalDims]);

  const handleSocialPreset = useCallback((preset: typeof SOCIAL_PRESETS[number]) => {
    setWidth(preset.w); setHeight(preset.h); setLockAspect(false);
    toast({ title: `Applied ${preset.name}`, description: `${preset.w}×${preset.h}px (${preset.desc})` });
  }, [toast]);

  const resizeSingleImage = useCallback(async (imgSrc: string, dims: { w: number; h: number }, format: OutputFormat, fileMode: boolean, tgtKB: number, origDims: { w: number; h: number }): Promise<{ url: string; size: number; dims: { w: number; h: number } } | null> => {
    if (fileMode) {
      // ── Use Web Worker for file-size mode ──
      try {
        const resp = await fetch(imgSrc);
        const blob = await resp.blob();
        const imageData = await blob.arrayBuffer();
        const workerResult = await executeImageTask(
          { imageData, width: dims.w, height: dims.h, format: 'jpeg', quality: 92, mode: 'filesize', targetKB: tgtKB },
          'resize-image',
        );
        if (workerResult) {
          const resultBlob = new Blob([workerResult.blob], { type: 'image/jpeg' });
          return { url: URL.createObjectURL(resultBlob), size: resultBlob.size, dims: { w: workerResult.width, h: workerResult.height } };
        }
      } catch { /* fall through to main thread */ }

      // ── Main-thread fallback ──
      const targetBytes = tgtKB * 1024;
      let quality = 0.9; let currentBlob: Blob | null = null; let finalW = origDims.w; let finalH = origDims.h;
      for (let i = 0; i < 20; i++) {
        const canvas = document.createElement('canvas');
        const scale = Math.pow(0.85, Math.floor(i / 4));
        finalW = Math.round(origDims.w * scale); finalH = Math.round(origDims.h * scale);
        canvas.width = finalW; canvas.height = finalH;
        const ctx = canvas.getContext('d')!; ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
        const imageEl = await new Promise<HTMLImageElement>((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = imgSrc; });
        ctx.drawImage(imageEl, 0, 0, finalW, finalH);
        currentBlob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
        if (!currentBlob) break;
        if (currentBlob.size <= targetBytes) break;
        quality -= 0.05;
      }
      if (currentBlob) return { url: URL.createObjectURL(currentBlob), size: currentBlob.size, dims: { w: finalW, h: finalH } };
      return null;
    } else {
      const imageEl = await new Promise<HTMLImageElement>((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = imgSrc; });
      const canvas = document.createElement('canvas');
      canvas.width = dims.w; canvas.height = dims.h;
      const ctx = canvas.getContext('2d')!; ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(imageEl, 0, 0, dims.w, dims.h);
      const mime = FORMAT_MIME[format];
      const quality = format === 'png' ? undefined : 0.92;
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, mime, quality));
      if (blob) return { url: URL.createObjectURL(blob), size: blob.size, dims: { w: dims.w, h: dims.h } };
      return null;
    }
  }, [executeImageTask]);

  const resizeImage = useCallback(async () => {
    if (!file || !preview) return;
    setProcessing(true);
    try {
      const res = await resizeSingleImage(preview, { w: width, h: height }, outputFormat, mode === 'filesize', targetKB, originalDims);
      if (res) setResult(res);
      else toast({ title: 'Resize Failed', description: 'Could not generate image.', variant: 'destructive' });
    } catch (err) {
      console.error('Resize error:', err);
      toast({ title: 'Resize Error', variant: 'destructive' });
    }
    setProcessing(false);
  }, [file, preview, width, height, outputFormat, mode, targetKB, originalDims, resizeSingleImage, toast]);

  const resizeAllBatch = useCallback(async () => {
    if (batchItems.length === 0) return;
    setProcessing(true); setBatchProgress(0);
    const updated = [...batchItems];
    for (let i = 0; i < updated.length; i++) {
      updated[i] = { ...updated[i], status: 'processing' };
      setBatchItems([...updated]); setBatchProgress(Math.round((i / updated.length) * 100));
      try {
        const el = await new Promise<HTMLImageElement>((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = updated[i].preview; });
        const oDims = { w: el.width, h: el.height };
        const res = await resizeSingleImage(updated[i].preview, { w: width, h: height }, outputFormat, mode === 'filesize', targetKB, oDims);
        if (res) updated[i] = { ...updated[i], result: res.url, resultSize: res.size, resultDims: res.dims, status: 'done' };
        else updated[i] = { ...updated[i], status: 'error' };
      } catch { updated[i] = { ...updated[i], status: 'error' }; }
      setBatchItems([...updated]); setBatchProgress(Math.round(((i + 1) / updated.length) * 100));
    }
    setProcessing(false);
  }, [batchItems, width, height, outputFormat, mode, targetKB, resizeSingleImage]);

  const downloadAllBatch = useCallback(async () => {
    const doneItems = batchItems.filter(i => i.status === 'done' && i.result);
    if (!doneItems.length) return;
    const zip = new JSZip();
    for (const item of doneItems) {
      const resp = await fetch(item.result!); const blob = await resp.blob();
      zip.add(`resized-${item.file.name}`, blob);
    }
    const content = await zip.generateAsync({ type: 'blob' });
    saveAs(content, `resized-batch-${Date.now()}.zip`);
    addRecentFile({ id: crypto.randomUUID(), name: `${doneItems.length}-images-batch.zip`, type: 'application/zip', tool: 'image-resize', size: formatSize(content.size), timestamp: Date.now() });
  }, [batchItems, addRecentFile]);

  const handleDownload = useCallback(() => {
    if (!result || !file) return;
    const ext = mode === 'filesize' ? 'jpg' : FORMAT_EXT[outputFormat];
    const dims = `${result.dims.w}x${result.dims.h}`;
    const fileName = `resized-${dims}-${Date.now()}.${ext}`;
    saveAs(result.url, fileName);
    addRecentFile({ id: crypto.randomUUID(), name: fileName, type: file.type, tool: 'image-resize', size: formatSize(result.size), timestamp: Date.now() });
    toast({ title: 'Image Downloaded', description: `${dims}px · ${formatSize(result.size)}` });
  }, [result, file, mode, outputFormat, addRecentFile, toast]);

  const saveCustomPreset = useCallback(() => {
    if (!newPresetName.trim() || width <= 0 || height <= 0) return;
    const updated = [...savedPresets, { name: newPresetName.trim(), w: width, h: height }];
    setSavedPresets(updated); savePresetsToStorage(updated); setNewPresetName(''); setShowSavePreset(false);
    toast({ title: 'Preset Saved', description: `"${newPresetName.trim()}" saved as ${width}×${height}` });
  }, [newPresetName, width, height, savedPresets, toast]);

  const deleteCustomPreset = useCallback((idx: number) => {
    const updated = savedPresets.filter((_, i) => i !== idx);
    setSavedPresets(updated); savePresetsToStorage(updated);
  }, [savedPresets]);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
      if (result?.url) URL.revokeObjectURL(result.url);
      batchItems.forEach(i => { if (i.preview) URL.revokeObjectURL(i.preview); if (i.result) URL.revokeObjectURL(i.result); });
    };
  }, [preview, result, batchItems]);

  return (
    <ToolLayout title="Resize Image" description="Resize images to exact dimensions or target file size">
      {/* Batch Mode Toggle */}
      <Card>
        <CardContent className="p-4 flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="text-sm font-medium flex items-center gap-2"><Share2 className="h-4 w-4" /> Batch Mode</Label>
            <p className="text-xs text-muted-foreground">Resize multiple images with the same settings</p>
          </div>
          <Switch checked={batchMode} onCheckedChange={(v) => { setBatchMode(v); setBatchItems([]); setFile(null); setPreview(''); setResult(null); }} />
        </CardContent>
      </Card>

      {batchMode ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
          {batchItems.length === 0 ? (
            <FileDropzone onFiles={handleFiles} accept="image/jpeg,image/png,image/jpg,image/webp" multiple={true} label="Drop multiple images here" sublabel="All images will use the same resize settings" icon="image" />
          ) : (
            <>
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">Images ({batchItems.length})</CardTitle>
                    <Button size="sm" variant="outline" onClick={() => setBatchItems([])}><Trash2 className="h-3.5 w-3.5 mr-1" />Clear</Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
                    {batchItems.map((item, idx) => (
                      <div key={idx} className="flex items-center gap-3 p-2 rounded-lg border bg-muted/30">
                        <div className="h-10 w-10 rounded-md overflow-hidden bg-muted flex-shrink-0">
                          <img src={item.preview} alt="" className="h-full w-full object-cover" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{item.file.name}</p>
                          <p className="text-xs text-muted-foreground">{formatSize(item.file.size)}</p>
                        </div>
                        {item.status === 'idle' && <Badge variant="secondary" className="text-xs">Pending</Badge>}
                        {item.status === 'processing' && <Badge className="bg-amber-500 text-xs"><Loader2 className="h-3 w-3 mr-1 animate-spin" />Processing</Badge>}
                        {item.status === 'done' && <Badge className="bg-green-600 text-xs"><Check className="h-3 w-3 mr-1" />{item.resultDims.w}×{item.resultDims.h}</Badge>}
                        {item.status === 'error' && <Badge variant="destructive" className="text-xs">Error</Badge>}
                        {item.status !== 'processing' && (
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setBatchItems(prev => prev.filter((_, i) => i !== idx))}><Trash2 className="h-3.5 w-3.5" /></Button>
                        )}
                      </div>
                    ))}
                  </div>
                  {batchItems.length < 30 && (
                    <FileDropzone onFiles={handleFiles} accept="image/jpeg,image/png,image/jpg,image/webp" multiple={true} label="Add more images" variant="compact" icon="plus" />
                  )}
                </CardContent>
              </Card>

              {processing && (
                <Card><CardContent className="p-4 space-y-2">
                  <div className="flex justify-between text-sm"><span>Resizing batch...</span><span>{batchProgress}%</span></div>
                  <Progress value={batchProgress} />
                </CardContent></Card>
              )}

              {batchItems.some(i => i.status === 'done') && !processing && (
                <Card className="border-green-200 dark:border-green-900">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-green-700 dark:text-green-400">
                        Batch Complete! {batchItems.filter(i => i.status === 'done').length}/{batchItems.length}
                      </h3>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Original: {formatSize(batchItems.reduce((a, i) => a + i.file.size, 0))} → Resized: {formatSize(batchItems.filter(i => i.status === 'done').reduce((a, i) => a + i.resultSize, 0))}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                      {batchItems.filter(i => i.status === 'done').map((item, idx) => (
                        <div key={idx} className="relative group rounded-lg overflow-hidden border bg-white">
                          <img src={item.result!} alt="" className="w-full aspect-square object-cover" />
                          <div className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-xs p-1 text-center">{formatSize(item.resultSize)}</div>
                          <a href={item.result!} download={`resized-${item.file.name}`} className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center bg-black/30">
                            <Download className="h-6 w-6 text-white" />
                          </a>
                        </div>
                      ))}
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
          <FileDropzone onFiles={handleFiles} accept="image/jpeg,image/png,image/jpg,image/webp" multiple={false} label="Drop image here or click to upload" sublabel="Supports JPG, PNG, and WebP" />
        ) : (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
            {/* File info */}
            <Card>
              <CardContent className="p-4 flex items-center gap-4">
                <div className="h-16 w-16 rounded-lg overflow-hidden bg-muted flex-shrink-0">
                  <img src={preview} alt="Preview" className="h-full w-full object-cover" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{file.name}</p>
                  <p className="text-sm text-muted-foreground">{originalDims.w} × {originalDims.h}px · {formatSize(file.size)}</p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => { setFile(null); setPreview(''); setResult(null); }}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>

            {/* Controls */}
            <Card>
              <CardHeader className="pb-3"><div className="flex items-center gap-2"><CardTitle className="text-base">Resize Settings</CardTitle><WorkerBadge active={isWorkerActive} /></div></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Mode</Label>
                  <Select value={mode} onValueChange={(v) => setMode(v as 'pixels' | 'filesize')}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pixels">By Pixels</SelectItem>
                      <SelectItem value="filesize">By File Size</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Social Media Presets */}
                {mode === 'pixels' && (
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1.5"><Star className="h-3.5 w-3.5" />Social Media Presets</Label>
                    <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
                      {SOCIAL_PRESETS.map((preset) => (
                        <button key={preset.name} onClick={() => handleSocialPreset(preset)}
                          className="w-full flex items-center justify-between p-2 rounded-lg border text-left hover:bg-muted/50 transition-colors">
                          <div><p className="text-sm font-medium">{preset.name}</p><p className="text-xs text-muted-foreground">{preset.w}×{preset.h}px</p></div>
                          <Badge variant="outline" className="text-xs shrink-0">{preset.desc}</Badge>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {mode === 'pixels' && (
                  <div className="space-y-2">
                    <Label>Output Format</Label>
                    <Select value={outputFormat} onValueChange={(v) => setOutputFormat(v as OutputFormat)}>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {OUTPUT_FORMATS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {mode === 'pixels' ? (
                  <div className="space-y-4">
                    <div className="flex items-end gap-3">
                      <div className="flex-1 space-y-2">
                        <Label htmlFor="resize-w">Width (px)</Label>
                        <Input id="resize-w" type="number" min={1} value={width} onChange={(e) => handleWidthChange(Number(e.target.value))} />
                      </div>
                      <Button variant="ghost" size="icon" className="mb-0.5" onClick={() => setLockAspect(!lockAspect)} aria-label={lockAspect ? 'Unlock' : 'Lock'}>
                        {lockAspect ? <Lock className="h-4 w-4 text-primary" /> : <Unlock className="h-4 w-4 text-muted-foreground" />}
                      </Button>
                      <div className="flex-1 space-y-2">
                        <Label htmlFor="resize-h">Height (px)</Label>
                        <Input id="resize-h" type="number" min={1} value={height} onChange={(e) => handleHeightChange(Number(e.target.value))} />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="flex items-center gap-1.5"><ImageIcon className="h-3.5 w-3.5" />Quick Resize</Label>
                      <div className="flex flex-wrap gap-2">
                        {PERCENT_PRESETS.map(pct => <Button key={pct} variant="outline" size="sm" className="text-xs" onClick={() => handlePercentPreset(pct)}>{pct}%</Button>)}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex flex-wrap gap-2">
                      {PRESET_SIZES.map(p => <Button key={p.value} variant={targetKB === p.value ? 'default' : 'outline'} size="sm" onClick={() => setTargetKB(p.value)}>{p.label}</Button>)}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="target-kb">Custom Target (KB)</Label>
                      <Input id="target-kb" type="number" min={1} max={10240} value={targetKB} onChange={(e) => setTargetKB(Number(e.target.value))} />
                    </div>
                  </div>
                )}

                {/* EXIF Toggle */}
                <div className="flex items-center justify-between p-3 rounded-lg border border-muted">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-medium">Strip EXIF Data</Label>
                    <p className="text-xs text-muted-foreground">Remove metadata for privacy (recommended)</p>
                  </div>
                  <Switch checked={stripExif} onCheckedChange={setStripExif} />
                </div>

                {/* Save Custom Preset */}
                {mode === 'pixels' && width > 0 && height > 0 && (
                  <div className="space-y-2">
                    {showSavePreset ? (
                      <div className="flex gap-2">
                        <Input value={newPresetName} onChange={(e) => setNewPresetName(e.target.value)} placeholder="Preset name" className="flex-1" onKeyDown={(e) => e.key === 'Enter' && saveCustomPreset()} />
                        <Button size="sm" onClick={saveCustomPreset}><Save className="h-3.5 w-3.5 mr-1" />Save</Button>
                        <Button size="sm" variant="ghost" onClick={() => setShowSavePreset(false)}><X className="h-3.5 w-3.5" /></Button>
                      </div>
                    ) : (
                      <Button variant="outline" size="sm" className="w-full" onClick={() => setShowSavePreset(true)}><Save className="h-3.5 w-3.5 mr-1.5" />Save as Custom Preset</Button>
                    )}
                  </div>
                )}

                {/* Saved Presets */}
                {savedPresets.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Custom Presets</Label>
                    <div className="flex flex-wrap gap-2">
                      {savedPresets.map((p, idx) => (
                        <div key={idx} className="flex items-center gap-1">
                          <Button variant="outline" size="sm" className="text-xs" onClick={() => { setWidth(p.w); setHeight(p.h); setLockAspect(false); }}>{p.name} ({p.w}×{p.h})</Button>
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => deleteCustomPreset(idx)}><X className="h-3 w-3" /></Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <Button className="w-full" size="lg" disabled={processing || (mode === 'pixels' && (width <= 0 || height <= 0))} onClick={batchMode ? resizeAllBatch : resizeImage}>
                  {processing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Resizing...</> : <><Scaling className="h-4 w-4 mr-2" />{batchMode ? `Resize All (${batchItems.length})` : 'Resize Image'}</>}
                </Button>
              </CardContent>
            </Card>

            {/* Result */}
            {result && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                <Card className="border-green-200 dark:border-green-900">
                  <CardContent className="p-6 space-y-4">
                    <h3 className="font-semibold text-green-700 dark:text-green-400">Resize Complete!</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="text-center p-3 rounded-lg bg-muted">
                        <p className="text-sm text-muted-foreground">Original</p>
                        <p className="text-lg font-bold">{originalDims.w}×{originalDims.h}</p>
                        <p className="text-sm text-muted-foreground">{formatSize(file.size)}</p>
                      </div>
                      <div className="text-center p-3 rounded-lg bg-green-50 dark:bg-green-950">
                        <p className="text-sm text-green-600 dark:text-green-400">Resized</p>
                        <p className="text-lg font-bold text-green-700 dark:text-green-400">{result.dims.w}×{result.dims.h}</p>
                        <p className="text-sm text-green-600 dark:text-green-400">{formatSize(result.size)}</p>
                      </div>
                    </div>

                    {/* Comparison slider */}
                    <div className="relative w-full h-48 rounded-lg overflow-hidden border">
                      <div className="absolute inset-0 flex">
                        <div className="overflow-hidden" style={{ width: `${comparisonPos}%` }}>
                          <img src={preview} alt="Original" className="h-full w-auto max-w-none object-contain" />
                        </div>
                        <div className="overflow-hidden flex-1">
                          <img src={result.url} alt="Resized" className="h-full w-auto max-w-none object-contain" />
                        </div>
                      </div>
                      <div className="absolute top-0 bottom-0 w-0.5 bg-white shadow-lg z-10 cursor-ew-resize" style={{ left: `${comparisonPos}%` }}
                        onMouseDown={(e) => {
                          const parent = (e.target as HTMLElement).parentElement;
                          if (!parent) return;
                          const rect = parent.getBoundingClientRect();
                          const onMove = (ev: MouseEvent) => setComparisonPos(Math.min(100, Math.max(0, ((ev.clientX - rect.left) / rect.width) * 100)));
                          const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
                          window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp);
                        }}>
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-white shadow-md flex items-center justify-center">
                          <div className="flex gap-0.5"><div className="w-0.5 h-3 bg-gray-400 rounded" /><div className="w-0.5 h-3 bg-gray-400 rounded" /></div>
                        </div>
                      </div>
                      <div className="absolute top-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded">Before</div>
                      <div className="absolute top-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded">After</div>
                    </div>
                    <Slider value={[comparisonPos]} onValueChange={([v]) => setComparisonPos(v)} min={0} max={100} step={1} />
                    <Button className="w-full" onClick={handleDownload}><Download className="h-4 w-4 mr-2" />Download Resized Image</Button>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </motion.div>
        )
      )}

      {/* Batch resize button when in batch mode with settings card */}
      {batchMode && batchItems.length > 0 && (
        <Card>
          <CardHeader className="pb-3"><div className="flex items-center gap-2"><CardTitle className="text-base">Resize Settings</CardTitle><WorkerBadge active={isWorkerActive} /></div></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-end gap-3">
              <div className="flex-1 space-y-2">
                <Label>Width (px)</Label>
                <Input type="number" min={1} value={width} onChange={(e) => handleWidthChange(Number(e.target.value))} />
              </div>
              <Button variant="ghost" size="icon" className="mb-0.5" onClick={() => setLockAspect(!lockAspect)}>
                {lockAspect ? <Lock className="h-4 w-4 text-primary" /> : <Unlock className="h-4 w-4 text-muted-foreground" />}
              </Button>
              <div className="flex-1 space-y-2">
                <Label>Height (px)</Label>
                <Input type="number" min={1} value={height} onChange={(e) => handleHeightChange(Number(e.target.value))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Output Format</Label>
              <Select value={outputFormat} onValueChange={(v) => setOutputFormat(v as OutputFormat)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{OUTPUT_FORMATS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg border border-muted">
              <Label className="text-sm font-medium">Strip EXIF Data</Label>
              <Switch checked={stripExif} onCheckedChange={setStripExif} />
            </div>
            <Button className="w-full" size="lg" disabled={processing || (width <= 0 || height <= 0)} onClick={resizeAllBatch}>
              {processing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Resizing {batchItems.length} images...</> : <><Scaling className="h-4 w-4 mr-2" />Resize All ({batchItems.length})</>}
            </Button>
          </CardContent>
        </Card>
      )}
    </ToolLayout>
  );
}
