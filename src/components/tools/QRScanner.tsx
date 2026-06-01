'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import jsQR from 'jsqr';
import {
  Scan,
  Camera,
  CameraOff,
  Upload,
  Copy,
  ExternalLink,
  Check,
  RotateCcw,
  History,
  Trash2,
  Wifi,
  User,
  Phone,
  Mail,
  Building,
  Download,
  FileSpreadsheet,
  Eye,
  EyeOff,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ToolLayout } from '@/components/shared/ToolLayout';
import { useAppStore } from '@/store';
import { toast } from '@/hooks/use-toast';
import { saveAs } from 'file-saver';

// ─── Types ─────────────────────────────────────────────────────────────

type QRContentType = 'url' | 'vcard' | 'wifi' | 'email' | 'phone' | 'sms' | 'text';

interface ScanEntry {
  id: string;
  data: string;
  timestamp: number;
  method: 'camera' | 'upload';
  type: QRContentType;
}

interface VCardData {
  fn: string;
  tel: string;
  email: string;
  org: string;
  title: string;
}

interface WifiData {
  ssid: string;
  encryption: string;
  password: string;
}

// ─── Utility Functions ─────────────────────────────────────────────────

function detectQRType(data: string): QRContentType {
  if (data.startsWith('http://') || data.startsWith('https://')) return 'url';
  if (data.toUpperCase().startsWith('BEGIN:VCARD')) return 'vcard';
  if (data.toUpperCase().startsWith('WIFI:')) return 'wifi';
  if (data.startsWith('mailto:') || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data)) return 'email';
  if (data.startsWith('tel:') || data.startsWith('TEL:') || /^\+?\d{7,15}$/.test(data)) return 'phone';
  if (data.toUpperCase().startsWith('SMSTO:') || data.toLowerCase().startsWith('sms:')) return 'sms';
  return 'text';
}

function getTypeLabel(type: QRContentType): string {
  const labels: Record<QRContentType, string> = {
    url: 'URL',
    vcard: 'vCard',
    wifi: 'WiFi',
    email: 'Email',
    phone: 'Phone',
    sms: 'SMS',
    text: 'Text',
  };
  return labels[type];
}

function parseVCard(data: string): VCardData {
  const lines = data.split(/\r?\n/);
  const result: VCardData = { fn: '', tel: '', email: '', org: '', title: '' };
  for (const line of lines) {
    const upper = line.toUpperCase();
    if (upper.startsWith('FN:')) result.fn = line.slice(3).trim();
    else if (upper.startsWith('TEL:')) result.tel = line.slice(4).trim();
    else if (upper.startsWith('EMAIL:')) result.email = line.slice(6).trim();
    else if (upper.startsWith('ORG:')) result.org = line.slice(4).trim();
    else if (upper.startsWith('TITLE:')) result.title = line.slice(6).trim();
  }
  return result;
}

function parseWifiQr(data: string): WifiData {
  const result: WifiData = { ssid: '', encryption: 'nopass', password: '' };
  const upper = data.toUpperCase();
  const ssidMatch = data.match(/S:([^;]*)/i);
  const tMatch = upper.match(/T:([^;]*)/i);
  const pMatch = data.match(/P:([^;]*)/i);
  if (ssidMatch) result.ssid = ssidMatch[1];
  if (tMatch) result.encryption = tMatch[1];
  if (pMatch) result.password = pMatch[1];
  return result;
}

function scanCanvasForQr(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number
): string | null {
  const imageData = ctx.getImageData(x, y, width, height);
  const code = jsQR(imageData.data, imageData.width, imageData.height);
  return code && code.data ? code.data : null;
}

function scanImageGrid(canvas: HTMLCanvasElement): string[] {
  const ctx = canvas.getContext('2d');
  if (!ctx) return [];

  const results: string[] = [];
  const seen = new Set<string>();

  const addResult = (data: string) => {
    if (data && !seen.has(data)) {
      seen.add(data);
      results.push(data);
    }
  };

  // Scan full image first
  addResult(scanCanvasForQr(ctx, 0, 0, canvas.width, canvas.height));

  // Scan 3x3 grid
  const cols = 3;
  const rows = 3;
  const sectionW = Math.floor(canvas.width / cols);
  const sectionH = Math.floor(canvas.height / rows);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const sx = c * sectionW;
      const sy = r * sectionH;
      const sw = c === cols - 1 ? canvas.width - sx : sectionW;
      const sh = r === rows - 1 ? canvas.height - sy : sectionH;
      addResult(scanCanvasForQr(ctx, sx, sy, sw, sh));
    }
  }

  return results;
}

function generateVcfFile(data: string): string {
  // If the data already is a vCard, use it directly
  if (data.toUpperCase().startsWith('BEGIN:VCARD')) {
    return data;
  }
  // Otherwise build a minimal vCard from the parsed data
  const parsed = parseVCard(data);
  let vcf = 'BEGIN:VCARD\nVERSION:3.0\n';
  if (parsed.fn) vcf += `FN:${parsed.fn}\n`;
  if (parsed.tel) vcf += `TEL:${parsed.tel}\n`;
  if (parsed.email) vcf += `EMAIL:${parsed.email}\n`;
  if (parsed.org) vcf += `ORG:${parsed.org}\n`;
  if (parsed.title) vcf += `TITLE:${parsed.title}\n`;
  vcf += 'END:VCARD';
  return vcf;
}

// ─── Component ─────────────────────────────────────────────────────────

export function QRScanner() {
  const { addRecentFile } = useAppStore();
  const [cameraActive, setCameraActive] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [scanHistory, setScanHistory] = useState<ScanEntry[]>([]);
  const [multiResults, setMultiResults] = useState<string[]>([]);
  const [wifiPasswordVisible, setWifiPasswordVisible] = useState(false);
  const [copiedMultiIdx, setCopiedMultiIdx] = useState<number | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number>(0);
  const scanningRef = useRef(false);

  const resultType = result ? detectQRType(result) : 'text' as QRContentType;

  const vCardData = resultType === 'vcard' ? parseVCard(result) : null;
  const wifiData = resultType === 'wifi' ? parseWifiQr(result) : null;

  const addToHistory = useCallback((data: string, method: 'camera' | 'upload') => {
    const entry: ScanEntry = {
      id: crypto.randomUUID(),
      data,
      timestamp: Date.now(),
      method,
      type: detectQRType(data),
    };
    setScanHistory((prev) => [entry, ...prev].slice(0, 20));
  }, []);

  const handleDetected = useCallback(
    (data: string, method: 'camera' | 'upload') => {
      setResult(data);
      setMultiResults([]);
      setScanning(false);
      scanningRef.current = false;
      setWifiPasswordVisible(false);
      setError('');
      addToHistory(data, method);
      toast({
        title: 'QR Code Scanned!',
        description: data.length > 80 ? data.slice(0, 80) + '...' : data,
      });
      addRecentFile({
        id: crypto.randomUUID(),
        name: data.length > 60 ? data.slice(0, 60) + '...' : data,
        type: 'url',
        tool: 'qr-scanner',
        size: 'QR Scan',
        timestamp: Date.now(),
      });
    },
    [addToHistory, addRecentFile]
  );

  const handleMultiDetected = useCallback(
    (results: string[], method: 'camera' | 'upload') => {
      setMultiResults(results);
      setResult(results[0]);
      setWifiPasswordVisible(false);
      setError('');
      // Add all results to history
      for (const data of results) {
        const entry: ScanEntry = {
          id: crypto.randomUUID(),
          data,
          timestamp: Date.now(),
          method,
          type: detectQRType(data),
        };
        setScanHistory((prev) => [entry, ...prev].slice(0, 20));
      }
      toast({
        title: `Found ${results.length} QR Codes!`,
        description: `${results.length} QR codes were detected in the image.`,
      });
    },
    []
  );

  const startCamera = useCallback(async () => {
    setError('');
    setResult('');
    setMultiResults([]);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setCameraActive(true);
        setScanning(true);
        scanningRef.current = true;
      }
    } catch (err) {
      setError('Camera access denied. Please allow camera access or upload an image instead.');
      console.error('Camera error:', err);
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
    }
    setCameraActive(false);
    setScanning(false);
    scanningRef.current = false;
  }, []);

  const scanAgain = useCallback(() => {
    setResult('');
    setMultiResults([]);
    setError('');
    setCopied(false);
    setWifiPasswordVisible(false);
    // If camera was active, restart scanning
    if (cameraActive && videoRef.current) {
      setScanning(true);
      scanningRef.current = true;
    }
  }, [cameraActive]);

  // Scan frames in a loop using ref to avoid circular dependency
  const scanFrameRef = useRef<() => void>(null);

  useEffect(() => {
    scanFrameRef.current = () => {
      if (!videoRef.current || !canvasRef.current || !scanningRef.current) return;

      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');

      if (video.readyState === video.HAVE_ENOUGH_DATA && ctx) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height);

        if (code && code.data) {
          scanningRef.current = false;
          setScanning(false);
          // Stop the camera stream after detection
          if (streamRef.current) {
            streamRef.current.getTracks().forEach((t) => t.stop());
            streamRef.current = null;
          }
          if (animFrameRef.current) {
            cancelAnimationFrame(animFrameRef.current);
          }
          setCameraActive(false);
          handleDetected(code.data, 'camera');
          return;
        }
      }

      animFrameRef.current = requestAnimationFrame(() => scanFrameRef.current?.());
    };
  }, [handleDetected]);

  useEffect(() => {
    if (scanning) {
      animFrameRef.current = requestAnimationFrame(() => scanFrameRef.current?.());
    }
    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [scanning]);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  const handleImageUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setError('');
      setResult('');
      setMultiResults([]);

      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.drawImage(img, 0, 0);

        // Multi-QR detection: scan full image + grid
        const allQrCodes = scanImageGrid(canvas);

        if (allQrCodes.length > 1) {
          handleMultiDetected(allQrCodes, 'upload');
        } else if (allQrCodes.length === 1) {
          handleDetected(allQrCodes[0], 'upload');
        } else {
          setError('No QR code detected in the image. Please try a clearer image.');
        }

        // Clean up object URL
        URL.revokeObjectURL(img.src);
      };
      img.onerror = () => {
        setError('Failed to load the image. Please try another file.');
        URL.revokeObjectURL(img.src);
      };
      img.src = URL.createObjectURL(file);

      // Reset the file input so the same file can be re-uploaded
      e.target.value = '';
    },
    [handleDetected, handleMultiDetected]
  );

  const copyResult = useCallback(() => {
    navigator.clipboard.writeText(result);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [result]);

  const copyMultiResult = useCallback((data: string, idx: number) => {
    navigator.clipboard.writeText(data);
    setCopiedMultiIdx(idx);
    setTimeout(() => setCopiedMultiIdx(null), 2000);
    toast({
      title: 'Copied!',
      description: 'QR data copied to clipboard.',
    });
  }, []);

  const copyWifiDetails = useCallback(() => {
    if (!wifiData) return;
    const details = `SSID: ${wifiData.ssid}, Password: ${wifiData.password}, Security: ${wifiData.encryption}`;
    navigator.clipboard.writeText(details);
    toast({
      title: 'Copied!',
      description: 'WiFi details copied to clipboard.',
    });
  }, [wifiData]);

  const downloadVCard = useCallback(() => {
    if (!result) return;
    const vcfContent = generateVcfFile(result);
    const blob = new Blob([vcfContent], { type: 'text/vcard;charset=utf-8' });
    const name = vCardData?.fn || 'contact';
    saveAs(blob, `${name.replace(/\s+/g, '_')}.vcf`);
    toast({
      title: 'Contact Saved!',
      description: 'vCard file has been downloaded.',
    });
  }, [result, vCardData]);

  const openUrl = useCallback(() => {
    if (resultType === 'url') {
      window.open(result, '_blank', 'noopener,noreferrer');
    }
  }, [result, resultType]);

  const clearHistory = useCallback(() => {
    setScanHistory([]);
  }, []);

  const loadFromHistory = useCallback((entry: ScanEntry) => {
    setResult(entry.data);
    setMultiResults([]);
    setCopied(false);
    setWifiPasswordVisible(false);
    setError('');
  }, []);

  const exportHistoryCsv = useCallback(() => {
    if (scanHistory.length === 0) return;
    const headers = ['Date', 'Time', 'Method', 'Data', 'Type'];
    const rows = scanHistory.map((entry) => {
      const d = new Date(entry.timestamp);
      const date = d.toLocaleDateString();
      const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const method = entry.method === 'camera' ? 'Camera' : 'Upload';
      const data = `"${entry.data.replace(/"/g, '""')}"`;
      const type = getTypeLabel(entry.type);
      return [date, time, method, data, type].join(',');
    });
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    saveAs(blob, `qr_scan_history_${Date.now()}.csv`);
    toast({
      title: 'History Exported!',
      description: 'CSV file has been downloaded.',
    });
  }, [scanHistory]);

  const formatTimestamp = (timestamp: number) => {
    const d = new Date(timestamp);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  return (
    <ToolLayout
      title="QR Scanner"
      description="Scan QR codes using your camera or upload an image"
    >
      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="relative rounded-xl overflow-hidden bg-black aspect-video">
            {cameraActive ? (
              <>
                <video
                  ref={videoRef}
                  className="w-full h-full object-cover"
                  playsInline
                  muted
                />
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="relative w-48 h-48 md:w-64 md:h-64">
                    <div className="absolute top-0 left-0 w-8 h-8 border-t-3 border-l-3 border-white rounded-tl-lg" />
                    <div className="absolute top-0 right-0 w-8 h-8 border-t-3 border-r-3 border-white rounded-tr-lg" />
                    <div className="absolute bottom-0 left-0 w-8 h-8 border-b-3 border-l-3 border-white rounded-bl-lg" />
                    <div className="absolute bottom-0 right-0 w-8 h-8 border-b-3 border-r-3 border-white rounded-br-lg" />
                    {scanning && (
                      <motion.div
                        className="absolute left-2 right-2 h-0.5 bg-green-400"
                        animate={{ y: [0, 200, 0] }}
                        transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                      />
                    )}
                  </div>
                </div>
                <div className="absolute top-3 left-3">
                  <Badge variant="destructive" className="animate-pulse">
                    LIVE
                  </Badge>
                </div>
              </>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-white gap-4 bg-gray-900">
                <Scan className="h-16 w-16 text-muted-foreground" />
                <p className="text-muted-foreground text-sm text-center px-4">
                  Camera preview will appear here
                </p>
              </div>
            )}
            <canvas ref={canvasRef} className="hidden" />
          </div>

          <div className="flex gap-3">
            <Button
              className="flex-1"
              variant={cameraActive ? 'destructive' : 'default'}
              onClick={cameraActive ? stopCamera : startCamera}
            >
              {cameraActive ? (
                <>
                  <CameraOff className="h-4 w-4 mr-2" />
                  Stop Camera
                </>
              ) : (
                <>
                  <Camera className="h-4 w-4 mr-2" />
                  Start Camera
                </>
              )}
            </Button>

            <label className="flex-1">
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImageUpload}
              />
              <Button variant="outline" className="w-full" asChild>
                <span>
                  <Upload className="h-4 w-4 mr-2" />
                  Upload Image
                </span>
              </Button>
            </label>
          </div>

          {error && (
            <p className="text-sm text-destructive text-center">{error}</p>
          )}
        </CardContent>
      </Card>

      {/* Multi-QR Results */}
      {multiResults.length > 1 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="border-emerald-200 dark:border-emerald-900">
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center gap-3">
                <h3 className="font-semibold text-emerald-700 dark:text-emerald-400">
                  Multiple QR Codes Detected!
                </h3>
                <Badge className="bg-emerald-600 text-white">
                  Found {multiResults.length} QR codes
                </Badge>
              </div>
              <div className="grid gap-3">
                {multiResults.map((qrData, idx) => {
                  const qrType = detectQRType(qrData);
                  return (
                    <motion.div
                      key={idx}
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.05 }}
                    >
                      <Card className="border-border">
                        <CardContent className="p-4 space-y-3">
                          <div className="flex items-center justify-between gap-2">
                            <Badge variant="outline" className="shrink-0">
                              QR #{idx + 1} · {getTypeLabel(qrType)}
                            </Badge>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => copyMultiResult(qrData, idx)}
                            >
                              {copiedMultiIdx === idx ? (
                                <>
                                  <Check className="h-3.5 w-3.5 mr-1" />
                                  Copied
                                </>
                              ) : (
                                <>
                                  <Copy className="h-3.5 w-3.5 mr-1" />
                                  Copy
                                </>
                              )}
                            </Button>
                          </div>

                          {/* vCard preview inside multi-QR */}
                          {qrType === 'vcard' && (
                            <VCardPreview data={qrData} />
                          )}

                          {/* WiFi preview inside multi-QR */}
                          {qrType === 'wifi' && (
                            <WifiPreview data={qrData} />
                          )}

                          {/* URL action */}
                          {qrType === 'url' && (
                            <a
                              href={qrData}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400 hover:underline"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                              Open URL
                            </a>
                          )}

                          <div className="p-3 rounded-lg bg-muted break-all text-xs font-mono max-h-20 overflow-y-auto">
                            {qrData}
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  );
                })}
              </div>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={scanAgain}>
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Scan Again
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Single QR Result */}
      {result && multiResults.length <= 1 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="border-green-200 dark:border-green-900">
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-green-700 dark:text-green-400">
                  QR Code Detected!
                </h3>
                <Badge variant="outline">{getTypeLabel(resultType)}</Badge>
              </div>

              {/* vCard Contact Card UI */}
              {vCardData && (vCardData.fn || vCardData.tel || vCardData.email || vCardData.org || vCardData.title) && (
                <VCardPreview data={result} onSave={downloadVCard} />
              )}

              {/* WiFi Network Card UI */}
              {wifiData && (
                <WifiPreview
                  data={result}
                  passwordVisible={wifiPasswordVisible}
                  onTogglePassword={() => setWifiPasswordVisible((v) => !v)}
                  onCopyDetails={copyWifiDetails}
                />
              )}

              {/* Email link */}
              {resultType === 'email' && (
                <a
                  href={result.startsWith('mailto:') ? result : `mailto:${result}`}
                  className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400 hover:underline"
                >
                  <Mail className="h-4 w-4" />
                  Open Email Client
                </a>
              )}

              {/* Phone link */}
              {resultType === 'phone' && (
                <a
                  href={result.startsWith('tel:') ? result : `tel:${result}`}
                  className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400 hover:underline"
                >
                  <Phone className="h-4 w-4" />
                  Call Number
                </a>
              )}

              {/* SMS link */}
              {resultType === 'sms' && (
                <a
                  href={result.startsWith('SMSTO:') || result.startsWith('sms:')
                    ? `sms:${result.replace(/^(SMSTO:|sms:)/i, '')}`
                    : `sms:${result}`}
                  className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400 hover:underline"
                >
                  <Phone className="h-4 w-4" />
                  Send SMS
                </a>
              )}

              <div className="p-4 rounded-lg bg-muted break-all text-sm font-mono">
                {result}
              </div>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={copyResult}
                >
                  {copied ? (
                    <>
                      <Check className="h-4 w-4 mr-2" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4 mr-2" />
                      Copy Text
                    </>
                  )}
                </Button>
                {resultType === 'url' && (
                  <Button className="flex-1" onClick={openUrl}>
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Open URL
                  </Button>
                )}
                <Button variant="outline" className="flex-1" onClick={scanAgain}>
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Scan Again
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Scan History */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <History className="h-4 w-4" />
              Scan History
              {scanHistory.length > 0 && (
                <Badge variant="secondary" className="ml-1">
                  {scanHistory.length}
                </Badge>
              )}
            </CardTitle>
            <div className="flex items-center gap-2">
              {scanHistory.length > 0 && (
                <>
                  <Button variant="ghost" size="sm" onClick={exportHistoryCsv}>
                    <FileSpreadsheet className="h-4 w-4 mr-1" />
                    <span className="hidden sm:inline">Export</span>
                    <span className="sm:hidden">CSV</span>
                  </Button>
                  <Button variant="ghost" size="sm" onClick={clearHistory}>
                    <Trash2 className="h-4 w-4 mr-1" />
                    Clear
                  </Button>
                </>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {scanHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No scans yet. Use the camera or upload an image to scan a QR code.
            </p>
          ) : (
            <div className="max-h-64 overflow-y-auto space-y-2">
              {scanHistory.map((entry) => (
                <motion.button
                  key={entry.id}
                  className="w-full text-left p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                  onClick={() => loadFromHistory(entry)}
                  whileTap={{ scale: 0.98 }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm break-all font-mono flex-1 line-clamp-2">
                      {entry.data}
                    </p>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="outline" className="text-xs">
                        {getTypeLabel(entry.type)}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {entry.method === 'camera' ? '📷 Camera' : '📁 Upload'}
                      </Badge>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatTimestamp(entry.timestamp)}
                      </span>
                    </div>
                  </div>
                </motion.button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </ToolLayout>
  );
}

// ─── Sub-Components ─────────────────────────────────────────────────────

interface VCardPreviewProps {
  data: string;
  onSave?: () => void;
}

function VCardPreview({ data, onSave }: VCardPreviewProps) {
  const vCard = parseVCard(data);
  const hasData = vCard.fn || vCard.tel || vCard.email || vCard.org || vCard.title;

  if (!hasData) return null;

  return (
    <Card className="border-border">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <User className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="font-semibold text-sm">{vCard.fn || 'Unknown Contact'}</p>
            {vCard.title && (
              <p className="text-xs text-muted-foreground">{vCard.title}</p>
            )}
          </div>
        </div>

        <div className="space-y-2">
          {vCard.tel && (
            <div className="flex items-center gap-2 text-sm">
              <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
              <span>{vCard.tel}</span>
            </div>
          )}
          {vCard.email && (
            <div className="flex items-center gap-2 text-sm">
              <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
              <span>{vCard.email}</span>
            </div>
          )}
          {vCard.org && (
            <div className="flex items-center gap-2 text-sm">
              <Building className="h-4 w-4 text-muted-foreground shrink-0" />
              <span>{vCard.org}</span>
            </div>
          )}
        </div>

        {onSave && (
          <Separator className="my-2" />
        )}
        {onSave && (
          <Button variant="outline" size="sm" onClick={onSave} className="w-full">
            <Download className="h-4 w-4 mr-2" />
            Save Contact (.vcf)
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

interface WifiPreviewProps {
  data: string;
  passwordVisible?: boolean;
  onTogglePassword?: () => void;
  onCopyDetails?: () => void;
}

function WifiPreview({ data, passwordVisible, onTogglePassword, onCopyDetails }: WifiPreviewProps) {
  const wifi = parseWifiQr(data);

  return (
    <Card className="border-border">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <Wifi className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="font-semibold text-sm">{wifi.ssid || 'Unknown Network'}</p>
            <p className="text-xs text-muted-foreground">{wifi.encryption} encryption</p>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Network (SSID):</span>
            <span className="font-mono font-medium">{wifi.ssid || '—'}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Security:</span>
            <Badge variant="outline" className="text-xs">{wifi.encryption}</Badge>
          </div>
          {wifi.password && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Password:</span>
              <div className="flex items-center gap-2">
                <span className="font-mono font-medium">
                  {passwordVisible ? wifi.password : '••••••••'}
                </span>
                {onTogglePassword && (
                  <button
                    onClick={onTogglePassword}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    aria-label={passwordVisible ? 'Hide password' : 'Show password'}
                  >
                    {passwordVisible ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {(onCopyDetails) && (
          <Separator className="my-2" />
        )}
        {onCopyDetails && (
          <Button variant="outline" size="sm" onClick={onCopyDetails} className="w-full">
            <Copy className="h-4 w-4 mr-2" />
            Copy Network Details
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
