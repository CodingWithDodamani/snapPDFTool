'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  User,
  Download,
  Loader2,
  Trash2,
  Check,
  Printer,
  ImageIcon,
  Sun,
  Contrast,
  RotateCcw,
  ZoomIn,
  Archive,
  Eye,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { cn, formatSize } from '@/lib/utils';
import { ToolLayout } from '@/components/shared/ToolLayout';
import { FileDropzone } from '@/components/shared/FileDropzone';
import { useAppStore } from '@/store';
import { saveAs } from 'file-saver';
import JSZip from 'jszip';

const PHOTO_TYPES = [
  { id: 'passport', name: 'Indian Passport', description: '51×51mm (2×2 inch)', width: 600, height: 600 },
  { id: 'aadhaar', name: 'Aadhaar Card', description: '35×45mm (1.4×1.8 inch)', width: 413, height: 531 },
  { id: 'pan', name: 'PAN Card', description: '25×35mm (1×1.4 inch)', width: 295, height: 413 },
  { id: 'government', name: 'Government Form', description: '3.5×4.5cm', width: 413, height: 551 },
  { id: 'us-visa', name: 'US Visa', description: '2×2 inch (51×51mm)', width: 600, height: 600 },
  { id: 'schengen', name: 'Schengen Visa', description: '35×45mm', width: 413, height: 531 },
];

const BG_PRESETS = [
  { id: 'white', name: 'White', value: '#ffffff' },
  { id: 'red', name: 'Red', value: '#cc0000' },
  { id: 'blue', name: 'Blue', value: '#003399' },
];

const PRINT_LAYOUTS = [
  { id: '4x2', label: '4×2 (8 photos)', cols: 4, rows: 2 },
  { id: '5x3', label: '5×3 (15 photos)', cols: 5, rows: 3 },
  { id: '6x4', label: '6×4 (24 photos)', cols: 6, rows: 4 },
  { id: '8x5', label: '8×5 (40 photos)', cols: 8, rows: 5 },
];

const PAPER_SIZES = [
  { id: 'a4', name: 'A4', width: 2480, height: 3508, label: 'A4 (210×297mm)' },
  { id: '4x6', name: '4×6"', width: 1200, height: 1800, label: '4×6 inch (102×152mm)' },
  { id: '5x7', name: '5×7"', width: 1500, height: 2100, label: '5×7 inch (127×178mm)' },
  { id: 'letter', name: 'Letter', width: 2550, height: 3300, label: 'US Letter (8.5×11")' },
];

const CUT_MARK_LEN = 20;
const CUT_GAP = 8;
const PHOTO_GAP = 16;

/** Simple skin-tone detection heuristic to find face region */
function detectFaceRegion(canvas: HTMLCanvasElement): { faceY: number; faceH: number } | null {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const w = canvas.width;
  const h = canvas.height;
  const data = ctx.getImageData(0, 0, w, h).data;

  // Scan upper 60% of image for skin-tone pixels
  const scanH = Math.floor(h * 0.6);
  let topY = h;
  let bottomY = 0;
  let skinCount = 0;

  for (let y = 0; y < scanH; y++) {
    let rowSkin = 0;
    for (let x = Math.floor(w * 0.15); x < Math.floor(w * 0.85); x++) {
      const idx = (y * w + x) * 4;
      const r = data[idx], g = data[idx + 1], b = data[idx + 2];
      // Skin tone heuristic: r > 80, g > 40, b > 20, r > g, r > b, |r-g| > 15
      if (r > 80 && g > 40 && b > 20 && r > g && r > b && (r - g) > 15 && r - b > 15) {
        rowSkin++;
      }
    }
    if (rowSkin > (w * 0.2)) {
      skinCount += rowSkin;
      if (y < topY) topY = y;
      if (y > bottomY) bottomY = y;
    }
  }

  if (skinCount < (w * 10)) return null; // Not enough skin pixels detected

  return { faceY: topY, faceH: bottomY - topY };
}

function removeBackground(imageData: ImageData, bgColorHex: string, sensitivity: number): void {
  const { width, height, data } = imageData;
  const replaceR = parseInt(bgColorHex.slice(1, 3), 16);
  const replaceG = parseInt(bgColorHex.slice(3, 5), 16);
  const replaceB = parseInt(bgColorHex.slice(5, 7), 16);
  const totalPixels = width * height;
  const visited = new Uint8Array(totalPixels);

  const colorDist = (idx: number, r: number, g: number, b: number): number => {
    const dr = data[idx] - r, dg = data[idx + 1] - g, db = data[idx + 2] - b;
    return Math.sqrt(dr * dr + dg * dg + db * db);
  };

  const sampleCorners = [
    [0, 0], [width - 1, 0], [0, height - 1], [width - 1, height - 1],
    [Math.floor(width / 2), 0], [Math.floor(width / 2), height - 1],
    [0, Math.floor(height / 2)], [width - 1, Math.floor(height / 2)],
  ];

  let avgR = 0, avgG = 0, avgB = 0;
  for (const [cx, cy] of sampleCorners) {
    const idx = (cy * width + cx) * 4;
    avgR += data[idx]; avgG += data[idx + 1]; avgB += data[idx + 2];
  }
  avgR = Math.round(avgR / sampleCorners.length);
  avgG = Math.round(avgG / sampleCorners.length);
  avgB = Math.round(avgB / sampleCorners.length);

  const threshold = sensitivity;
  const queue: number[] = [];

  for (let x = 0; x < width; x++) {
    const topIdx = x * 4;
    if (!visited[x] && colorDist(topIdx, avgR, avgG, avgB) <= threshold) { queue.push(x); visited[x] = 1; }
    const botY = height - 1;
    const botPx = botY * width + x;
    if (!visited[botPx] && colorDist(botPx * 4, avgR, avgG, avgB) <= threshold) { queue.push(botPx); visited[botPx] = 1; }
  }
  for (let y = 0; y < height; y++) {
    const leftPx = y * width;
    if (!visited[leftPx] && colorDist(leftPx * 4, avgR, avgG, avgB) <= threshold) { queue.push(leftPx); visited[leftPx] = 1; }
    const rightPx = y * width + width - 1;
    if (!visited[rightPx] && colorDist(rightPx * 4, avgR, avgG, avgB) <= threshold) { queue.push(rightPx); visited[rightPx] = 1; }
  }

  let head = 0;
  while (head < queue.length) {
    const px = queue[head++];
    const x = px % width, y = (px - x) / width;
    const idx = px * 4;
    data[idx] = replaceR; data[idx + 1] = replaceG; data[idx + 2] = replaceB;
    const neighbors: number[] = [];
    if (x > 0) neighbors.push(px - 1);
    if (x < width - 1) neighbors.push(px + 1);
    if (y > 0) neighbors.push(px - width);
    if (y < height - 1) neighbors.push(px + width);
    for (const npx of neighbors) {
      if (!visited[npx] && colorDist(npx * 4, avgR, avgG, avgB) <= threshold) { visited[npx] = 1; queue.push(npx); }
    }
  }
}

function drawCutMarks(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.strokeStyle = '#999999';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y + CUT_GAP + CUT_MARK_LEN); ctx.lineTo(x, y + CUT_GAP); ctx.lineTo(x + CUT_GAP + CUT_MARK_LEN, y);
  ctx.moveTo(x + w - CUT_GAP - CUT_MARK_LEN, y); ctx.lineTo(x + w - CUT_GAP, y); ctx.lineTo(x + w, y + CUT_GAP + CUT_MARK_LEN);
  ctx.moveTo(x, y + h - CUT_GAP - CUT_MARK_LEN); ctx.lineTo(x, y + h - CUT_GAP); ctx.lineTo(x + CUT_GAP + CUT_MARK_LEN, y + h);
  ctx.moveTo(x + w - CUT_GAP - CUT_MARK_LEN, y + h); ctx.lineTo(x + w - CUT_GAP, y + h); ctx.lineTo(x + w, y + h - CUT_GAP - CUT_MARK_LEN);
  ctx.stroke();
}

interface BatchItem {
  file: File;
  preview: string;
  result: string;
  resultBlobSize: number;
  status: 'idle' | 'processing' | 'done' | 'error';
}

export function PassportPhotoMaker() {
  const { addRecentFile } = useAppStore();
  const [batchMode, setBatchMode] = useState(false);
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string>('');
  const [photoType, setPhotoType] = useState('passport');
  const [bgColor, setBgColor] = useState('white');
  const [customBgColor, setCustomBgColor] = useState('#3b82f6');
  const [bgRemoval, setBgRemoval] = useState(false);
  const [sensitivity, setSensitivity] = useState(30);
  const [brightness, setBrightness] = useState(0);
  const [contrast, setContrast] = useState(0);
  const [autoCenterFace, setAutoCenterFace] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<string>('');
  const [resultBlobSize, setResultBlobSize] = useState(0);
  const [headSizeOk, setHeadSizeOk] = useState<boolean | null>(null);
  const [printLayout, setPrintLayout] = useState('4x2');
  const [paperSize, setPaperSize] = useState('a4');
  const [generatingPrint, setGeneratingPrint] = useState(false);
  const [batchProgress, setBatchProgress] = useState(0);
  const resultCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const currentType = PHOTO_TYPES.find((t) => t.id === photoType)!;
  const currentPaper = PAPER_SIZES.find((p) => p.id === paperSize)!;
  const currentLayout = PRINT_LAYOUTS.find((l) => l.id === printLayout)!;

  const activeBgColor = bgColor === 'custom' ? customBgColor : (BG_PRESETS.find(c => c.id === bgColor)?.value || '#ffffff');

  const handleFiles = useCallback((files: File[]) => {
    const imgs = files.filter(f => ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'].includes(f.type));
    if (batchMode) {
      const newItems: BatchItem[] = imgs.map(f => ({
        file: f,
        preview: URL.createObjectURL(f),
        result: '',
        resultBlobSize: 0,
        status: 'idle' as const,
      }));
      setBatchItems(prev => [...prev, ...newItems]);
    } else if (imgs[0]) {
      setFile(imgs[0]);
      setResult(''); setResultBlobSize(0); setHeadSizeOk(null); resultCanvasRef.current = null;
      setPreview(URL.createObjectURL(imgs[0]));
    }
  }, [batchMode]);

  const processSingleImage = useCallback(async (imageSrc: string, type: typeof currentType, bgHex: string, doBgRemoval: boolean, sens: number, bright: number, cont: number, autoFace: boolean): Promise<{ url: string; size: number; canvas: HTMLCanvasElement; headOk: boolean | null }> => {
    const imageEl = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = imageSrc;
    });

    const canvas = document.createElement('canvas');
    canvas.width = type.width;
    canvas.height = type.height;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = bgHex;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const imgRatio = imageEl.width / imageEl.height;
    const targetRatio = canvas.width / canvas.height;

    let sx: number, sy: number, sw: number, sh: number;

    if (imgRatio > targetRatio) {
      sh = imageEl.height; sw = sh * targetRatio;
      sx = (imageEl.width - sw) / 2; sy = 0;
    } else {
      sw = imageEl.width; sh = sw / targetRatio;
      sx = 0; sy = 0;
    }

    // Auto-center face: adjust sy to center detected face
    let headOk: boolean | null = null;
    if (autoFace) {
      // First render to a temp canvas to detect face
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = imageEl.width;
      tempCanvas.height = imageEl.height;
      const tempCtx = tempCanvas.getContext('2d')!;
      tempCtx.drawImage(imageEl, 0, 0);
      const face = detectFaceRegion(tempCanvas);
      tempCanvas.width = 0; tempCanvas.height = 0;

      if (face && face.faceH > 0) {
        const faceCenterY = face.faceY + face.faceH / 2;
        const imgCenterY = imageEl.height / 2;
        // Offset to center face in the crop
        const offset = (faceCenterY - imgCenterY) * 0.3;
        sy = Math.max(0, Math.min(imageEl.height - sh, sy + offset));

        // Head size ratio check (head should be 70-80% of photo height)
        const headRatio = face.faceH / imageEl.height;
        headOk = headRatio >= 0.5 && headRatio <= 0.9;
      }
    }

    // Apply brightness/contrast via CSS filter on canvas
    ctx.filter = `brightness(${1 + bright / 100}) contrast(${1 + cont / 100})`;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(imageEl, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    ctx.filter = 'none';

    if (doBgRemoval) {
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      removeBackground(imageData, bgHex, sens);
      ctx.putImageData(imageData, 0, 0);
    }

    const blob = await new Promise<Blob>((resolve) => {
      canvas.toBlob(b => resolve(b!), 'image/jpeg', 0.95);
    });

    return {
      url: URL.createObjectURL(blob),
      size: blob.size,
      canvas,
      headOk,
    };
  }, []);

  const generatePhoto = useCallback(async () => {
    if (!preview) return;
    setProcessing(true); setResult(''); setResultBlobSize(0); setHeadSizeOk(null); resultCanvasRef.current = null;

    try {
      const res = await processSingleImage(preview, currentType, activeBgColor, bgRemoval, sensitivity, brightness, contrast, autoCenterFace);
      setResult(res.url); setResultBlobSize(res.size); setHeadSizeOk(res.headOk); resultCanvasRef.current = res.canvas;
    } catch (err) {
      console.error('Generation error:', err);
    }
    setProcessing(false);
  }, [preview, currentType, activeBgColor, bgRemoval, sensitivity, brightness, contrast, autoCenterFace, processSingleImage]);

  const generateAllBatch = useCallback(async () => {
    if (batchItems.length === 0) return;
    setProcessing(true); setBatchProgress(0);

    const updated = [...batchItems];
    for (let i = 0; i < updated.length; i++) {
      updated[i] = { ...updated[i], status: 'processing' as const };
      setBatchItems([...updated]);
      setBatchProgress(Math.round(((i) / updated.length) * 100));

      try {
        const res = await processSingleImage(updated[i].preview, currentType, activeBgColor, bgRemoval, sensitivity, brightness, contrast, autoCenterFace);
        updated[i] = { ...updated[i], result: res.url, resultBlobSize: res.size, status: 'done' as const };
      } catch {
        updated[i] = { ...updated[i], status: 'error' as const };
      }
      setBatchItems([...updated]);
      setBatchProgress(Math.round(((i + 1) / updated.length) * 100));
    }

    setProcessing(false);
  }, [batchItems, currentType, activeBgColor, bgRemoval, sensitivity, brightness, contrast, autoCenterFace, processSingleImage]);

  const downloadAllBatch = useCallback(async () => {
    const doneItems = batchItems.filter(i => i.status === 'done' && i.result);
    if (doneItems.length === 0) return;
    const zip = new JSZip();
    for (const item of doneItems) {
      const resp = await fetch(item.result);
      const blob = await resp.blob();
      zip.add(`${currentType.id}-photo-${item.file.name.replace(/\.[^.]+$/, '')}.jpg`, blob);
    }
    const content = await zip.generateAsync({ type: 'blob' });
    saveAs(content, `${currentType.id}-photos-batch-${Date.now()}.zip`);
    addRecentFile({ id: crypto.randomUUID(), name: `${doneItems.length}-photos-batch.zip`, type: 'application/zip', tool: 'passport-photo', size: formatSize(content.size), timestamp: Date.now() });
  }, [batchItems, currentType.id, addRecentFile]);

  const handleDownload = useCallback(() => {
    if (!result) return;
    const fileName = `${photoType}-photo-${Date.now()}.jpg`;
    saveAs(result, fileName);
    addRecentFile({ id: crypto.randomUUID(), name: fileName, type: 'image/jpeg', tool: 'passport-photo', size: formatSize(resultBlobSize || 0), timestamp: Date.now() });
  }, [result, photoType, resultBlobSize, addRecentFile]);

  const handlePrintDownload = useCallback(async () => {
    const imgSrc = result;
    if (!imgSrc) return;
    setGeneratingPrint(true);

    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image(); el.onload = () => resolve(el); el.onerror = reject; el.src = imgSrc;
      });

      const { cols, rows } = currentLayout;
      const paperW = currentPaper.width;
      const paperH = currentPaper.height;
      const photoW = currentType.width;
      const photoH = currentType.height;
      const margin = Math.round(Math.min(paperW, paperH) * 0.05);
      const usableW = paperW - 2 * margin;
      const usableH = paperH - 2 * margin;
      const cellW = (usableW - (cols - 1) * PHOTO_GAP) / cols;
      const cellH = (usableH - (rows - 1) * PHOTO_GAP) / rows;
      const scale = Math.min(cellW / photoW, cellH / photoH, 1);
      const drawW = Math.round(photoW * scale);
      const drawH = Math.round(photoH * scale);
      const gridW = cols * drawW + (cols - 1) * PHOTO_GAP;
      const gridH = rows * drawH + (rows - 1) * PHOTO_GAP;
      const offsetX = Math.round((paperW - gridW) / 2);
      const offsetY = Math.round((paperH - gridH) / 2);

      const a4Canvas = document.createElement('canvas');
      a4Canvas.width = paperW; a4Canvas.height = paperH;
      const ctx = a4Canvas.getContext('2d')!;
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, paperW, paperH);

      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const x = offsetX + col * (drawW + PHOTO_GAP);
          const y = offsetY + row * (drawH + PHOTO_GAP);
          drawCutMarks(ctx, x, y, drawW, drawH);
          ctx.drawImage(img, x, y, drawW, drawH);
        }
      }

      a4Canvas.toBlob((blob) => {
        if (blob) {
          const fileName = `${photoType}-print-${currentPaper.id}-${cols}x${rows}-${Date.now()}.jpg`;
          saveAs(blob, fileName);
          addRecentFile({ id: crypto.randomUUID(), name: fileName, type: 'image/jpeg', tool: 'passport-photo', size: formatSize(blob.size), timestamp: Date.now() });
        }
        setGeneratingPrint(false);
      }, 'image/jpeg', 0.95);
    } catch (err) {
      console.error('Print layout error:', err);
      setGeneratingPrint(false);
    }
  }, [result, currentLayout, currentPaper, currentType, photoType, addRecentFile]);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
      if (result) URL.revokeObjectURL(result);
      batchItems.forEach(item => { if (item.preview) URL.revokeObjectURL(item.preview); if (item.result) URL.revokeObjectURL(item.result); });
    };
  }, [preview, result, batchItems]);

  const resetAdjustments = useCallback(() => { setBrightness(0); setContrast(0); }, []);
  const previewScale = Math.min(300, currentType.width);
  const previewHeight = Math.round(currentType.height * (previewScale / currentType.width));

  return (
    <ToolLayout title="Passport Photo Maker" description="Create passport-size photos for documents worldwide">
      {/* Batch Mode Toggle */}
      <Card>
        <CardContent className="p-4 flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="text-sm font-medium flex items-center gap-2">
              <Archive className="h-4 w-4" />
              Batch Mode
            </Label>
            <p className="text-xs text-muted-foreground">Process multiple photos with the same settings</p>
          </div>
          <Switch checked={batchMode} onCheckedChange={(v) => { setBatchMode(v); setBatchItems([]); setResult(''); setFile(null); setPreview(''); }} />
        </CardContent>
      </Card>

      {batchMode ? (
        /* Batch Mode UI */
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
          {batchItems.length === 0 ? (
            <FileDropzone onFiles={handleFiles} accept="image/jpeg,image/png,image/jpg,image/webp" multiple={true} label="Drop multiple photos here" sublabel="All photos will use the same settings below" icon="image" />
          ) : (
            <>
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">Photos ({batchItems.length})</CardTitle>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => setBatchItems([])}>
                        <Trash2 className="h-3.5 w-3.5 mr-1" /> Clear All
                      </Button>
                    </div>
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
                        {item.status === 'done' && <Badge className="bg-green-600 text-xs"><Check className="h-3 w-3 mr-1" />Done</Badge>}
                        {item.status === 'error' && <Badge variant="destructive" className="text-xs">Error</Badge>}
                        {item.status !== 'processing' && (
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setBatchItems(prev => prev.filter((_, i) => i !== idx))}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                  {batchItems.length < 20 && (
                    <FileDropzone onFiles={handleFiles} accept="image/jpeg,image/png,image/jpg,image/webp" multiple={true} label="Add more photos" variant="compact" icon="plus" />
                  )}
                </CardContent>
              </Card>

              {/* Batch Progress */}
              {processing && (
                <Card>
                  <CardContent className="p-4 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Processing batch...</span>
                      <span>{batchProgress}%</span>
                    </div>
                    <Progress value={batchProgress} />
                  </CardContent>
                </Card>
              )}

              {/* Batch Results */}
              {batchItems.some(i => i.status === 'done') && !processing && (
                <Card className="border-green-200 dark:border-green-900">
                  <CardContent className="p-4 space-y-3">
                    <h3 className="font-semibold text-green-700 dark:text-green-400">
                      Batch Complete! {batchItems.filter(i => i.status === 'done').length} of {batchItems.length} photos generated
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                      {batchItems.filter(i => i.status === 'done').map((item, idx) => (
                        <div key={idx} className="relative group rounded-lg overflow-hidden border bg-white">
                          <img src={item.result} alt="" className="w-full aspect-square object-cover" />
                          <div className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-xs p-1 text-center">
                            {formatSize(item.resultBlobSize)}
                          </div>
                          <a href={item.result} download={`${currentType.id}-photo-${item.file.name}`} className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center bg-black/30">
                            <Download className="h-6 w-6 text-white" />
                          </a>
                        </div>
                      ))}
                    </div>
                    <Button className="w-full" onClick={downloadAllBatch}>
                      <Archive className="h-4 w-4 mr-2" />
                      Download All as ZIP
                    </Button>
                  </CardContent>
                </Card>
              )}

              <Button className="w-full" size="lg" disabled={processing || batchItems.length === 0} onClick={generateAllBatch}>
                {processing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Processing {batchItems.length} photos...</> : <><User className="h-4 w-4 mr-2" />Generate All ({batchItems.length}) Photos</>}
              </Button>
            </>
          )}
        </motion.div>
      ) : (
        /* Single Photo Mode */
        !file ? (
          <FileDropzone onFiles={handleFiles} accept="image/jpeg,image/png,image/jpg,image/webp" multiple={false} label="Drop your photo here or click to upload" sublabel="Best with a clear face photo on a plain background" />
        ) : (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
            {/* File info card */}
            <Card>
              <CardContent className="p-4 flex items-center gap-4">
                <div className="h-12 w-12 rounded-full overflow-hidden bg-muted flex-shrink-0">
                  <img src={preview} alt="Preview" className="h-full w-full object-cover" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{file.name}</p>
                  <p className="text-sm text-muted-foreground">{formatSize(file.size)}</p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => { setFile(null); setPreview(''); setResult(''); setResultBlobSize(0); setHeadSizeOk(null); resultCanvasRef.current = null; }}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>

            {/* Photo Type Selection */}
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Photo Type</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  {PHOTO_TYPES.map((type) => (
                    <button key={type.id} onClick={() => { setPhotoType(type.id); setResult(''); setResultBlobSize(0); setHeadSizeOk(null); resultCanvasRef.current = null; }}
                      className={cn('p-3 rounded-lg border-2 text-left transition-all', photoType === type.id ? 'border-primary bg-primary/5' : 'border-muted hover:border-muted-foreground/30')}>
                      <div className="flex items-center gap-2">
                        {photoType === type.id && <Check className="h-4 w-4 text-primary" />}
                        <span className="font-medium text-sm">{type.name}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{type.description}</p>
                      <p className="text-xs text-muted-foreground">{type.width}×{type.height}px</p>
                    </button>
                  ))}
                </div>

                {/* Background Color */}
                <div className="space-y-2">
                  <Label>Background Color</Label>
                  <div className="flex gap-3 flex-wrap items-center">
                    {BG_PRESETS.map((color) => (
                      <button key={color.id} onClick={() => setBgColor(color.id)}
                        className={cn('w-10 h-10 rounded-full border-2 transition-all flex items-center justify-center', bgColor === color.id ? 'border-primary ring-2 ring-primary/20' : 'border-muted hover:border-muted-foreground/30')}
                        style={{ backgroundColor: color.value }} title={color.name}>
                        {bgColor === color.id && <Check className={cn('h-4 w-4', color.id === 'white' ? 'text-gray-700' : 'text-white')} />}
                      </button>
                    ))}
                    {/* Custom color */}
                    <div className="flex items-center gap-2">
                      <button onClick={() => setBgColor('custom')}
                        className={cn('w-10 h-10 rounded-full border-2 transition-all flex items-center justify-center bg-gradient-to-br from-pink-500 via-purple-500 to-cyan-500',
                          bgColor === 'custom' ? 'border-primary ring-2 ring-primary/20' : 'border-muted hover:border-muted-foreground/30')} title="Custom color">
                        {bgColor === 'custom' && <Check className="h-4 w-4 text-white" />}
                      </button>
                      {bgColor === 'custom' && (
                        <div className="flex items-center gap-1.5">
                          <input type="color" value={customBgColor} onChange={(e) => setCustomBgColor(e.target.value)} className="h-8 w-8 rounded border cursor-pointer" />
                          <Input value={customBgColor} onChange={(e) => setCustomBgColor(e.target.value)} className="w-24 h-8 text-xs" maxLength={7} />
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Background Removal */}
                <div className="flex items-center justify-between p-3 rounded-lg border border-muted">
                  <div className="space-y-0.5">
                    <Label htmlFor="bg-removal" className="text-sm font-medium">Background Removal</Label>
                    <p className="text-xs text-muted-foreground">Detect and replace the original background</p>
                  </div>
                  <Switch id="bg-removal" checked={bgRemoval} onCheckedChange={setBgRemoval} />
                </div>

                {bgRemoval && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="space-y-3 p-3 rounded-lg bg-muted/50">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm">Background Sensitivity</Label>
                      <span className="text-xs text-muted-foreground font-mono">{sensitivity}</span>
                    </div>
                    <Slider value={[sensitivity]} onValueChange={([v]) => setSensitivity(v)} min={10} max={50} step={1} />
                    <div className="flex justify-between text-xs text-muted-foreground"><span>Strict</span><span>Lenient</span></div>
                  </motion.div>
                )}

                <Separator />

                {/* Brightness & Contrast */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium flex items-center gap-2">
                      <Sun className="h-3.5 w-3.5" /> Photo Adjustments
                    </Label>
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={resetAdjustments}>
                      <RotateCcw className="h-3 w-3 mr-1" /> Reset
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs">Brightness</Label>
                        <span className="text-xs text-muted-foreground font-mono">{brightness > 0 ? '+' : ''}{brightness}</span>
                      </div>
                      <Slider value={[brightness]} onValueChange={([v]) => setBrightness(v)} min={-50} max={50} step={1} />
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs">Contrast</Label>
                        <span className="text-xs text-muted-foreground font-mono">{contrast > 0 ? '+' : ''}{contrast}</span>
                      </div>
                      <Slider value={[contrast]} onValueChange={([v]) => setContrast(v)} min={-50} max={50} step={1} />
                    </div>
                  </div>
                </div>

                {/* Face Auto-Center */}
                <div className="flex items-center justify-between p-3 rounded-lg border border-muted">
                  <div className="space-y-0.5">
                    <Label htmlFor="face-center" className="text-sm font-medium flex items-center gap-1.5">
                      <Eye className="h-3.5 w-3.5" /> Auto-Center Face
                    </Label>
                    <p className="text-xs text-muted-foreground">Detect and center face in the crop area</p>
                  </div>
                  <Switch id="face-center" checked={autoCenterFace} onCheckedChange={setAutoCenterFace} />
                </div>

                <Button className="w-full" size="lg" disabled={processing} onClick={generatePhoto}>
                  {processing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Generating...</> : <><User className="h-4 w-4 mr-2" />Generate Passport Photo</>}
                </Button>
              </CardContent>
            </Card>

            {/* Result */}
            {result && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                <Card className="border-green-200 dark:border-green-900">
                  <CardContent className="p-6 space-y-4">
                    <h3 className="font-semibold text-green-700 dark:text-green-400">Photo Generated!</h3>

                    {/* Head Size Compliance */}
                    {headSizeOk !== null && (
                      <div className={cn('flex items-center gap-2 p-2.5 rounded-lg text-sm', headSizeOk ? 'bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-400' : 'bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-400')}>
                        {headSizeOk ? <><Check className="h-4 w-4" /><span>Head size looks good for {currentType.name}</span></> : <><ZoomIn className="h-4 w-4" /><span>Head size may not match standard. Try a closer photo.</span></>}
                      </div>
                    )}

                    <div className="flex justify-center">
                      <div className="rounded-lg overflow-hidden border-2 border-dashed border-muted-foreground/30" style={{ width: previewScale, height: previewHeight }}>
                        <img src={result} alt="Passport Photo" className="w-full h-full object-cover" />
                      </div>
                    </div>
                    <div className="text-center text-sm text-muted-foreground space-y-0.5">
                      <p>{currentType.name} · {currentType.width}×{currentType.height}px</p>
                      {(brightness !== 0 || contrast !== 0) && <p className="text-xs">Brightness: {brightness > 0 ? '+' : ''}{brightness} · Contrast: {contrast > 0 ? '+' : ''}{contrast}</p>}
                      {resultBlobSize > 0 && <p className="text-xs">Output size: {formatSize(resultBlobSize)}</p>}
                    </div>
                    <Button className="w-full" onClick={handleDownload}><Download className="h-4 w-4 mr-2" />Download Photo</Button>

                    {/* Print Layout */}
                    <div className="border-t pt-4 mt-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Printer className="h-4 w-4 text-muted-foreground" />
                        <Label className="text-sm font-medium">Print Layout</Label>
                      </div>
                      <div className="grid grid-cols-2 gap-3 mb-3">
                        <div className="space-y-1.5">
                          <Label className="text-xs">Paper Size</Label>
                          <Select value={paperSize} onValueChange={setPaperSize}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {PAPER_SIZES.map(p => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Photo Grid</Label>
                          <Select value={printLayout} onValueChange={setPrintLayout}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {PRINT_LAYOUTS.map(l => <SelectItem key={l.id} value={l.id}>{l.label}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="bg-muted/50 rounded-lg p-3 flex items-center justify-center">
                        <div className="bg-white border border-border rounded shadow-sm flex items-center justify-center" style={{ width: Math.min(280, '100%' as unknown as number), aspectRatio: currentPaper.width / currentPaper.height }}>
                          <div className="grid gap-0.5" style={{ gridTemplateColumns: `repeat(${currentLayout.cols}, 1fr)`, gridTemplateRows: `repeat(${currentLayout.rows}, 1fr)`, width: '80%', height: '80%' }}>
                            {Array.from({ length: currentLayout.cols * currentLayout.rows }).map((_, i) => (
                              <div key={i} className="bg-muted border border-muted-foreground/20 rounded-[1px]" />
                            ))}
                          </div>
                        </div>
                      </div>

                      <Button className="w-full mt-3" variant="outline" disabled={generatingPrint} onClick={handlePrintDownload}>
                        {generatingPrint ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Generating Print Sheet...</> : <><ImageIcon className="h-4 w-4 mr-2" />Download {currentPaper.name} Print Sheet ({currentLayout.cols}×{currentLayout.rows})</>}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </motion.div>
        )
      )}
    </ToolLayout>
  );
}
