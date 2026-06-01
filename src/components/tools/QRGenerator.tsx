'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  QrCode,
  Download,
  Loader2,
  Copy,
  Check,
  Palette,
  ShieldCheck,
  ImagePlus,
  Archive,
  X,
  Phone,
  Mail,
  MapPin,
  Calendar,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { ToolLayout } from '@/components/shared/ToolLayout';
import { useAppStore } from '@/store';
import { useToast } from '@/hooks/use-toast';
import { saveAs } from 'file-saver';
import JSZip from 'jszip';
import QRCode from 'qrcode';

type QRType = 'url' | 'text' | 'wifi' | 'vcard' | 'upi' | 'email' | 'phone' | 'sms' | 'geo' | 'event';
type ErrorCorrectionLevel = 'L' | 'M' | 'Q' | 'H';

const EC_OPTIONS = [
  { value: 'L', label: 'Low (L)', desc: '7% recovery' },
  { value: 'M', label: 'Medium (M)', desc: '15% recovery' },
  { value: 'Q', label: 'Quartile (Q)', desc: '25% recovery' },
  { value: 'H', label: 'High (H)', desc: '30% recovery' },
];

export function QRGenerator() {
  const { addRecentFile } = useAppStore();
  const { toast } = useToast();
  const [qrType, setQrType] = useState<QRType>('url');
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [wifiSsid, setWifiSsid] = useState('');
  const [wifiPassword, setWifiPassword] = useState('');
  const [wifiEncryption, setWifiEncryption] = useState('WPA');
  const [upiId, setUpiId] = useState('');
  const [upiAmount, setUpiAmount] = useState('');
  const [upiName, setUpiName] = useState('');
  const [vcardName, setVcardName] = useState('');
  const [vcardPhone, setVcardPhone] = useState('');
  const [vcardEmail, setVcardEmail] = useState('');
  const [emailAddr, setEmailAddr] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [smsNumber, setSmsNumber] = useState('');
  const [smsMessage, setSmsMessage] = useState('');
  const [geoLat, setGeoLat] = useState('');
  const [geoLng, setGeoLng] = useState('');
  const [eventTitle, setEventTitle] = useState('');
  const [eventStart, setEventStart] = useState('');
  const [eventEnd, setEventEnd] = useState('');
  const [eventLocation, setEventLocation] = useState('');
  const [size, setSize] = useState('256');
  const [margin, setMargin] = useState(2);
  const [fgColor, setFgColor] = useState('#000000');
  const [bgColor, setBgColor] = useState('#ffffff');
  const [errorCorrectionLevel, setErrorCorrectionLevel] = useState<ErrorCorrectionLevel>('M');
  const [qrResult, setQrResult] = useState<string>('');
  const [processing, setProcessing] = useState(false);
  const [copied, setCopied] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Logo overlay
  const [logoEnabled, setLogoEnabled] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState('');
  const [logoSize, setLogoSize] = useState(20);
  const [logoPadding, setLogoPadding] = useState(4);
  const [logoShape, setLogoShape] = useState<'square' | 'circle'>('square');
  const logoImgRef = useRef<HTMLImageElement | null>(null);

  // Gradient
  const [gradientEnabled, setGradientEnabled] = useState(false);
  const [gradientType, setGradientType] = useState<'linear' | 'radial'>('linear');
  const [gradientStart, setGradientStart] = useState('#000000');
  const [gradientEnd, setGradientEnd] = useState('#434343');
  const [gradientAngle, setGradientAngle] = useState(45);

  // Batch
  const [batchMode, setBatchMode] = useState(false);
  const [batchLines, setBatchLines] = useState('');
  const [batchResults, setBatchResults] = useState<{ label: string; dataUrl: string }[]>([]);
  const [processingBatch, setProcessingBatch] = useState(false);

  useEffect(() => {
    if (logoFile) {
      const url = URL.createObjectURL(logoFile);
      setLogoPreview(url);
      const img = new Image();
      img.onload = () => { logoImgRef.current = img; };
      img.src = url;
      return () => URL.revokeObjectURL(url);
    }
  }, [logoFile]);

  const getQRData = useCallback((): string => {
    switch (qrType) {
      case 'url': return url;
      case 'text': return text;
      case 'wifi': return `WIFI:T:${wifiEncryption};S:${wifiSsid};P:${wifiPassword};;`;
      case 'vcard': return `BEGIN:VCARD\nVERSION:3.0\nFN:${vcardName}\nTEL:${vcardPhone}\nEMAIL:${vcardEmail}\nEND:VCARD`;
      case 'upi': {
        const p = new URLSearchParams();
        p.set('pa', upiId); if (upiAmount) p.set('am', upiAmount);
        if (upiName) p.set('pn', upiName); p.set('cu', 'INR');
        return `upi://pay?${p.toString()}`;
      }
      case 'email': {
        const params: string[] = [`mailto:${emailAddr}`];
        if (emailSubject) params.push(`subject=${encodeURIComponent(emailSubject)}`);
        if (emailBody) params.push(`body=${encodeURIComponent(emailBody)}`);
        return params.join('?');
      }
      case 'phone': return `tel:${phoneNumber}`;
      case 'sms': {
        const parts = [`smsto:${smsNumber}`];
        if (smsMessage) parts.push(`:${smsMessage}`);
        return parts.join('');
      }
      case 'geo': return `geo:${geoLat},${geoLng}`;
      case 'event': {
        const fmt = (d: string) => d.replace(/[-:]/g, '').replace('T', 'T').split('.')[0] + '00';
        const start = fmt(eventStart); const end = fmt(eventEnd);
        return `BEGIN:VCALENDAR\nBEGIN:VEVENT\nSUMMARY:${eventTitle}\nDTSTART:${start}\nDTEND:${end}\nLOCATION:${eventLocation}\nEND:VEVENT\nEND:VCALENDAR`;
      }
      default: return '';
    }
  }, [qrType, url, text, wifiSsid, wifiPassword, wifiEncryption, vcardName, vcardPhone, vcardEmail, upiId, upiAmount, upiName, emailAddr, emailSubject, emailBody, phoneNumber, smsNumber, smsMessage, geoLat, geoLng, eventTitle, eventStart, eventEnd, eventLocation]);

  const getQROptions = useCallback(() => ({
    width: parseInt(size),
    margin,
    color: { dark: fgColor, light: bgColor },
    errorCorrectionLevel: errorCorrectionLevel as 'L' | 'M' | 'Q' | 'H',
  }), [size, margin, fgColor, bgColor, errorCorrectionLevel]);

  /** Render QR with logo overlay and gradient support */
  const renderQRToCanvas = useCallback(async (data: string, targetCanvas: HTMLCanvasElement, opts: ReturnType<typeof getQROptions>): Promise<void> => {
    const sizeNum = opts.width;
    const marginPx = opts.margin * Math.round(sizeNum / 25);
    const totalSize = sizeNum + marginPx * 2;

    targetCanvas.width = totalSize;
    targetCanvas.height = totalSize;
    const ctx = targetCanvas.getContext('2d')!;

    // Fill background
    ctx.fillStyle = opts.color.light;
    ctx.fillRect(0, 0, totalSize, totalSize);

    // Get QR matrix for manual drawing
    const qr = QRCode.create(data, { errorCorrectionLevel: opts.errorCorrectionLevel });
    const modules = qr.modules;
    const modCount = modules.size;
    const moduleSize = sizeNum / modCount;

    // Create gradient if enabled
    let fillColor: string | CanvasGradient = opts.color.dark;
    if (gradientEnabled) {
      if (gradientType === 'linear') {
        const rad = (gradientAngle * Math.PI) / 180;
        const cx = totalSize / 2, cy = totalSize / 2;
        const len = totalSize * 0.7;
        const x1 = cx - Math.cos(rad) * len;
        const y1 = cy - Math.sin(rad) * len;
        const x2 = cx + Math.cos(rad) * len;
        const y2 = cy + Math.sin(rad) * len;
        fillColor = ctx.createLinearGradient(x1, y1, x2, y2);
      } else {
        fillColor = ctx.createRadialGradient(totalSize / 2, totalSize / 2, 0, totalSize / 2, totalSize / 2, totalSize / 2);
      }
      (fillColor as CanvasGradient).addColorStop(0, gradientStart);
      (fillColor as CanvasGradient).addColorStop(1, gradientEnd);
    }

    ctx.fillStyle = fillColor;

    // Draw modules
    for (let row = 0; row < modCount; row++) {
      for (let col = 0; col < modCount; col++) {
        if (modules.get(row, col)) {
          ctx.fillRect(
            marginPx + col * moduleSize,
            marginPx + row * moduleSize,
            Math.ceil(moduleSize),
            Math.ceil(moduleSize)
          );
        }
      }
    }

    // Draw logo if enabled
    if (logoEnabled && logoImgRef.current) {
      const logoPct = logoSize / 100;
      const logoW = sizeNum * logoPct;
      const logoH = logoW;
      const logoX = (totalSize - logoW) / 2;
      const logoY = (totalSize - logoH) / 2;
      const pad = logoPadding * (sizeNum / 100);

      // White background for logo
      ctx.fillStyle = opts.color.light;
      if (logoShape === 'circle') {
        ctx.beginPath();
        ctx.arc(logoX + logoW / 2, logoY + logoH / 2, (logoW / 2) + pad, 0, Math.PI * 2);
        ctx.fill();
      } else {
        const r = 8;
        ctx.beginPath();
        ctx.roundRect(logoX - pad, logoY - pad, logoW + pad * 2, logoH + pad * 2, r);
        ctx.fill();
      }

      // Draw logo
      ctx.save();
      if (logoShape === 'circle') {
        ctx.beginPath();
        ctx.arc(logoX + logoW / 2, logoY + logoH / 2, logoW / 2, 0, Math.PI * 2);
        ctx.clip();
      } else {
        ctx.beginPath();
        ctx.roundRect(logoX, logoY, logoW, logoH, 6);
        ctx.clip();
      }
      ctx.drawImage(logoImgRef.current, logoX, logoY, logoW, logoH);
      ctx.restore();
    }
  }, [gradientEnabled, gradientType, gradientStart, gradientEnd, gradientAngle, logoEnabled, logoSize, logoPadding, logoShape]);

  const generateQR = useCallback(async () => {
    const data = getQRData();
    if (!data) return;
    setProcessing(true);
    try {
      const opts = getQROptions();
      // If no logo and no gradient, use standard QR code generation
      if (!logoEnabled && !gradientEnabled) {
        const dataUrl = await QRCode.toDataURL(data, opts);
        setQrResult(dataUrl);
        if (canvasRef.current) QRCode.toCanvas(canvasRef.current, data, opts);
      } else {
        // Custom canvas rendering
        const canvas = document.createElement('canvas');
        await renderQRToCanvas(data, canvas, opts);
        const dataUrl = canvas.toDataURL('image/png');
        setQrResult(dataUrl);
        if (canvasRef.current) {
          canvasRef.current.width = canvas.width;
          canvasRef.current.height = canvas.height;
          canvasRef.current.getContext('2d')!.drawImage(canvas, 0, 0);
        }
      }
      toast({ title: 'QR Code Generated', description: `${qrType.toUpperCase()} QR code created.` });
    } catch (err) {
      console.error('QR error:', err);
      toast({ title: 'Generation Failed', variant: 'destructive' });
    } finally { setProcessing(false); }
  }, [getQRData, getQROptions, qrType, logoEnabled, gradientEnabled, renderQRToCanvas, toast]);

  // Auto-regenerate on style changes
  const hasDataRef = useRef(false);
  const generateQRRef = useRef(generateQR);
  const qrResultRef = useRef(qrResult);
  const processingRef = useRef(processing);
  generateQRRef.current = generateQR;
  qrResultRef.current = qrResult;
  processingRef.current = processing;

  useEffect(() => { hasDataRef.current = !!getQRData(); }, [getQRData]);
  useEffect(() => {
    if (qrResultRef.current && hasDataRef.current && !processingRef.current) generateQRRef.current();
  }, [fgColor, bgColor, errorCorrectionLevel, margin, gradientEnabled, gradientType, gradientStart, gradientEnd, gradientAngle, logoSize, logoPadding, logoShape, logoEnabled]);

  // Auto-set H correction when logo enabled
  useEffect(() => { if (logoEnabled && errorCorrectionLevel !== 'H') setErrorCorrectionLevel('H'); }, [logoEnabled, errorCorrectionLevel]);

  const downloadAsPng = useCallback(() => {
    if (!qrResult) return;
    const fileName = `qr-${qrType}-${Date.now()}.png`;
    saveAs(qrResult, fileName);
    addRecentFile({ id: crypto.randomUUID(), name: fileName, type: 'image/png', tool: 'qr-generator', size: 'QR Code', timestamp: Date.now() });
    toast({ title: 'Downloaded', description: 'QR code PNG saved.' });
  }, [qrResult, qrType, addRecentFile, toast]);

  const downloadAsSvg = useCallback(async () => {
    const data = getQRData();
    if (!data) return;
    try {
      const svg = await QRCode.toString(data, { type: 'svg', width: parseInt(size), margin, color: { dark: fgColor, light: bgColor }, errorCorrectionLevel: errorCorrectionLevel as 'L' | 'M' | 'Q' | 'H' });
      const blob = new Blob([svg], { type: 'image/svg+xml' });
      saveAs(blob, `qr-${qrType}-${Date.now()}.svg`);
      addRecentFile({ id: crypto.randomUUID(), name: `qr-${qrType}.svg`, type: 'image/svg+xml', tool: 'qr-generator', size: 'QR Code', timestamp: Date.now() });
    } catch { toast({ title: 'SVG Export Failed', variant: 'destructive' }); }
  }, [getQRData, size, margin, fgColor, bgColor, errorCorrectionLevel, qrType, addRecentFile, toast]);

  const copyToClipboard = useCallback(async () => {
    if (!qrResult) return;
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;
      const img = new Image();
      await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = () => reject(); img.src = qrResult; });
      canvas.width = img.width; canvas.height = img.height; ctx.drawImage(img, 0, 0);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(), 'image/png'));
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      setCopied(true); toast({ title: 'Copied!' }); setTimeout(() => setCopied(false), 2000);
    } catch { toast({ title: 'Copy Failed', variant: 'destructive' }); }
  }, [qrResult, toast]);

  const generateBatch = useCallback(async () => {
    const lines = batchLines.split('\n').filter(l => l.trim());
    if (!lines.length) return;
    setProcessingBatch(true); setBatchResults([]);
    const results: { label: string; dataUrl: string }[] = [];
    for (const line of lines) {
      try {
        const opts = getQROptions();
        const dataUrl = await QRCode.toDataURL(line.trim(), opts);
        results.push({ label: line.trim().substring(0, 30), dataUrl });
      } catch { /* skip */ }
    }
    setBatchResults(results); setProcessingBatch(false);
    toast({ title: `Generated ${results.length} QR codes` });
  }, [batchLines, getQROptions, toast]);

  const downloadAllBatch = useCallback(async () => {
    if (!batchResults.length) return;
    const zip = new JSZip();
    for (const item of batchResults) {
      const resp = await fetch(item.dataUrl); const blob = await resp.blob();
      zip.add(`qr-${item.label.replace(/[^a-zA-Z0-9]/g, '_')}.png`, blob);
    }
    const content = await zip.generateAsync({ type: 'blob' });
    saveAs(content, `qr-batch-${Date.now()}.zip`);
    addRecentFile({ id: crypto.randomUUID(), name: `${batchResults.length}-qr-codes.zip`, type: 'application/zip', tool: 'qr-generator', size: formatSize(content.size), timestamp: Date.now() });
  }, [batchResults, addRecentFile]);

  function formatSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  const isDisabled = (() => {
    switch (qrType) {
      case 'url': return !url.trim();
      case 'text': return !text.trim();
      case 'wifi': return !wifiSsid.trim();
      case 'vcard': return !vcardName.trim();
      case 'upi': return !upiId.trim();
      case 'email': return !emailAddr.trim();
      case 'phone': return !phoneNumber.trim();
      case 'sms': return !smsNumber.trim();
      case 'geo': return !geoLat.trim() || !geoLng.trim();
      case 'event': return !eventTitle.trim() || !eventStart.trim() || !eventEnd.trim();
      default: return true;
    }
  })();

  const qrTabs = [
    { value: 'url', label: 'URL' }, { value: 'text', label: 'Text' }, { value: 'wifi', label: 'WiFi' },
    { value: 'vcard', label: 'vCard' }, { value: 'upi', label: 'UPI' }, { value: 'email', label: 'Email' },
    { value: 'phone', label: 'Phone' }, { value: 'sms', label: 'SMS' }, { value: 'geo', label: 'Location' },
    { value: 'event', label: 'Event' },
  ];

  return (
    <ToolLayout title="QR Code Generator" description="Create QR codes for URLs, WiFi, UPI, vCard, and more">
      {/* Batch Toggle */}
      <Card>
        <CardContent className="p-4 flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="text-sm font-medium flex items-center gap-2"><Archive className="h-4 w-4" />Batch Mode</Label>
            <p className="text-xs text-muted-foreground">Generate multiple QR codes from a list</p>
          </div>
          <Switch checked={batchMode} onCheckedChange={(v) => { setBatchMode(v); setBatchResults([]); setBatchLines(''); setQrResult(''); }} />
        </CardContent>
      </Card>

      {batchMode ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
          <Card>
            <CardContent className="p-6 space-y-4">
              <div className="space-y-2">
                <Label>Paste items (one per line)</Label>
                <textarea
                  className="w-full min-h-32 p-3 rounded-lg border bg-background text-sm font-mono resize-y focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder={`https://example.com\nhttps://google.com\nhttps://github.com`}
                  value={batchLines}
                  onChange={(e) => setBatchLines(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">{batchLines.split('\n').filter(l => l.trim()).length} items detected</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Size</Label>
                  <Select value={size} onValueChange={setSize}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="128">128×128</SelectItem>
                      <SelectItem value="256">256×256</SelectItem>
                      <SelectItem value="512">512×512</SelectItem>
                      <SelectItem value="1024">1024×1024</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Correction</Label>
                  <Select value={errorCorrectionLevel} onValueChange={(v) => setErrorCorrectionLevel(v as ErrorCorrectionLevel)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{EC_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>

              <Button className="w-full" size="lg" disabled={processingBatch || !batchLines.trim()} onClick={generateBatch}>
                {processingBatch ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Generating...</> : <><QrCode className="h-4 w-4 mr-2" />Generate All QR Codes</>}
              </Button>
            </CardContent>
          </Card>

          {batchResults.length > 0 && (
            <Card className="border-green-200 dark:border-green-900">
              <CardContent className="p-4 space-y-3">
                <h3 className="font-semibold text-green-700 dark:text-green-400">{batchResults.length} QR Codes Generated</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {batchResults.map((item, idx) => (
                    <div key={idx} className="text-center space-y-1">
                      <div className="rounded-lg overflow-hidden border bg-white inline-block">
                        <img src={item.dataUrl} alt="" className="w-full max-w-32" />
                      </div>
                      <p className="text-xs text-muted-foreground truncate max-w-32">{item.label}</p>
                      <a href={item.dataUrl} download={`qr-${idx}.png`} className="inline-block">
                        <Button variant="ghost" size="sm" className="h-7 text-xs"><Download className="h-3 w-3 mr-1" /></Button>
                      </a>
                    </div>
                  ))}
                </div>
                <Button className="w-full" onClick={downloadAllBatch}><Archive className="h-4 w-4 mr-2" />Download All as ZIP</Button>
              </CardContent>
            </Card>
          )}
        </motion.div>
      ) : (
        /* Single QR Mode */
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
          <Card>
            <CardContent className="p-6 space-y-6">
              <Tabs value={qrType} onValueChange={(v) => setQrType(v as QRType)}>
                <TabsList className="flex overflow-x-auto no-scrollbar w-full">
                  {qrTabs.map(tab => (
                    <TabsTrigger key={tab.value} value={tab.value} className="text-xs shrink-0">{tab.label}</TabsTrigger>
                  ))}
                </TabsList>

                <TabsContent value="url" className="space-y-3">
                  <Label>URL</Label>
                  <Input type="url" placeholder="https://example.com" value={url} onChange={(e) => setUrl(e.target.value)} />
                </TabsContent>
                <TabsContent value="text" className="space-y-3">
                  <Label>Text</Label>
                  <Input type="text" placeholder="Enter any text" value={text} onChange={(e) => setText(e.target.value)} />
                </TabsContent>
                <TabsContent value="wifi" className="space-y-3">
                  <div className="space-y-2"><Label>Network Name (SSID)</Label><Input placeholder="MyWiFi" value={wifiSsid} onChange={(e) => setWifiSsid(e.target.value)} /></div>
                  <div className="space-y-2"><Label>Password</Label><Input placeholder="Password" value={wifiPassword} onChange={(e) => setWifiPassword(e.target.value)} /></div>
                  <div className="space-y-2">
                    <Label>Encryption</Label>
                    <RadioGroup value={wifiEncryption} onValueChange={setWifiEncryption} className="flex gap-4">
                      <div className="flex items-center space-x-2"><RadioGroupItem value="WPA" id="wpa" /><Label htmlFor="wpa" className="font-normal">WPA</Label></div>
                      <div className="flex items-center space-x-2"><RadioGroupItem value="WEP" id="wep" /><Label htmlFor="wep" className="font-normal">WEP</Label></div>
                      <div className="flex items-center space-x-2"><RadioGroupItem value="nopass" id="nopass" /><Label htmlFor="nopass" className="font-normal">None</Label></div>
                    </RadioGroup>
                  </div>
                </TabsContent>
                <TabsContent value="vcard" className="space-y-3">
                  <div className="space-y-2"><Label>Full Name</Label><Input placeholder="John Doe" value={vcardName} onChange={(e) => setVcardName(e.target.value)} /></div>
                  <div className="space-y-2"><Label>Phone</Label><Input type="tel" placeholder="+91 98765 43210" value={vcardPhone} onChange={(e) => setVcardPhone(e.target.value)} /></div>
                  <div className="space-y-2"><Label>Email</Label><Input type="email" placeholder="john@example.com" value={vcardEmail} onChange={(e) => setVcardEmail(e.target.value)} /></div>
                </TabsContent>
                <TabsContent value="upi" className="space-y-3">
                  <div className="space-y-2"><Label>UPI ID</Label><Input placeholder="name@upi" value={upiId} onChange={(e) => setUpiId(e.target.value)} /></div>
                  <div className="space-y-2"><Label>Amount (₹)</Label><Input type="number" placeholder="0.00" value={upiAmount} onChange={(e) => setUpiAmount(e.target.value)} /></div>
                  <div className="space-y-2"><Label>Payee Name</Label><Input placeholder="Optional" value={upiName} onChange={(e) => setUpiName(e.target.value)} /></div>
                </TabsContent>
                <TabsContent value="email" className="space-y-3">
                  <div className="space-y-2"><Label className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" />Email Address</Label><Input type="email" placeholder="hello@example.com" value={emailAddr} onChange={(e) => setEmailAddr(e.target.value)} /></div>
                  <div className="space-y-2"><Label>Subject</Label><Input placeholder="Hello" value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} /></div>
                  <div className="space-y-2"><Label>Body</Label><textarea className="w-full min-h-20 p-2 rounded-lg border bg-background text-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring" placeholder="Message body..." value={emailBody} onChange={(e) => setEmailBody(e.target.value)} /></div>
                </TabsContent>
                <TabsContent value="phone" className="space-y-3">
                  <Label className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" />Phone Number</Label>
                  <Input type="tel" placeholder="+91 98765 43210" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} />
                </TabsContent>
                <TabsContent value="sms" className="space-y-3">
                  <div className="space-y-2"><Label className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" />Phone Number</Label><Input type="tel" placeholder="+91 98765 43210" value={smsNumber} onChange={(e) => setSmsNumber(e.target.value)} /></div>
                  <div className="space-y-2"><Label>Message</Label><textarea className="w-full min-h-16 p-2 rounded-lg border bg-background text-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring" placeholder="Your message..." value={smsMessage} onChange={(e) => setSmsMessage(e.target.value)} /></div>
                </TabsContent>
                <TabsContent value="geo" className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2"><Label className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />Latitude</Label><Input type="text" placeholder="12.9716" value={geoLat} onChange={(e) => setGeoLat(e.target.value)} /></div>
                    <div className="space-y-2"><Label>Longitude</Label><Input type="text" placeholder="77.5946" value={geoLng} onChange={(e) => setGeoLng(e.target.value)} /></div>
                  </div>
                </TabsContent>
                <TabsContent value="event" className="space-y-3">
                  <div className="space-y-2"><Label className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" />Event Title</Label><Input placeholder="Team Meeting" value={eventTitle} onChange={(e) => setEventTitle(e.target.value)} /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2"><Label>Start</Label><Input type="datetime-local" value={eventStart} onChange={(e) => setEventStart(e.target.value)} /></div>
                    <div className="space-y-2"><Label>End</Label><Input type="datetime-local" value={eventEnd} onChange={(e) => setEventEnd(e.target.value)} /></div>
                  </div>
                  <div className="space-y-2"><Label>Location</Label><Input placeholder="Office, Bangalore" value={eventLocation} onChange={(e) => setEventLocation(e.target.value)} /></div>
                </TabsContent>
              </Tabs>

              <Separator />

              {/* Size, Colors, Margin */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Size</Label>
                  <Select value={size} onValueChange={setSize}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="128">128×128</SelectItem><SelectItem value="256">256×256</SelectItem>
                      <SelectItem value="512">512×512</SelectItem><SelectItem value="1024">1024×1024</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" />Correction</Label>
                  <Select value={errorCorrectionLevel} onValueChange={(v) => setErrorCorrectionLevel(v as ErrorCorrectionLevel)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{EC_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label} — {o.desc}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Margin</Label>
                  <Slider value={[margin]} onValueChange={([v]) => setMargin(v)} min={0} max={6} step={1} />
                  <p className="text-xs text-center text-muted-foreground">{margin} modules</p>
                </div>
              </div>

              {/* Colors */}
              <div className="space-y-3">
                {!gradientEnabled && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="flex items-center gap-1.5"><Palette className="h-3.5 w-3.5" />Foreground</Label>
                      <div className="flex gap-2">
                        <input type="color" value={fgColor} onChange={(e) => setFgColor(e.target.value)} className="h-10 w-10 shrink-0 rounded-md border cursor-pointer" />
                        <Input value={fgColor} onChange={(e) => setFgColor(e.target.value)} className="flex-1" maxLength={7} />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="flex items-center gap-1.5"><Palette className="h-3.5 w-3.5" />Background</Label>
                      <div className="flex gap-2">
                        <input type="color" value={bgColor} onChange={(e) => setBgColor(e.target.value)} className="h-10 w-10 shrink-0 rounded-md border cursor-pointer" />
                        <Input value={bgColor} onChange={(e) => setBgColor(e.target.value)} className="flex-1" maxLength={7} />
                      </div>
                    </div>
                  </div>
                )}

                {/* Gradient Toggle */}
                <div className="flex items-center justify-between p-3 rounded-lg border border-muted">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-medium">Gradient Colors</Label>
                    <p className="text-xs text-muted-foreground">Use gradient fill for QR modules</p>
                  </div>
                  <Switch checked={gradientEnabled} onCheckedChange={setGradientEnabled} />
                </div>

                {gradientEnabled && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="space-y-3 p-3 rounded-lg bg-muted/50">
                    <div className="flex gap-3">
                      <div className="space-y-1 flex-1">
                        <Label className="text-xs">Start Color</Label>
                        <div className="flex gap-1"><input type="color" value={gradientStart} onChange={(e) => setGradientStart(e.target.value)} className="h-8 w-8 rounded border cursor-pointer" /><Input value={gradientStart} onChange={(e) => setGradientStart(e.target.value)} className="text-xs" maxLength={7} /></div>
                      </div>
                      <div className="space-y-1 flex-1">
                        <Label className="text-xs">End Color</Label>
                        <div className="flex gap-1"><input type="color" value={gradientEnd} onChange={(e) => setGradientEnd(e.target.value)} className="h-8 w-8 rounded border cursor-pointer" /><Input value={gradientEnd} onChange={(e) => setGradientEnd(e.target.value)} className="text-xs" maxLength={7} /></div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">Type</Label>
                      <div className="flex gap-2">
                        <Button variant={gradientType === 'linear' ? 'default' : 'outline'} size="sm" className="text-xs h-7" onClick={() => setGradientType('linear')}>Linear</Button>
                        <Button variant={gradientType === 'radial' ? 'default' : 'outline'} size="sm" className="text-xs h-7" onClick={() => setGradientType('radial')}>Radial</Button>
                      </div>
                    </div>
                    {gradientType === 'linear' && (
                      <div className="space-y-1">
                        <div className="flex justify-between"><Label className="text-xs">Angle</Label><span className="text-xs text-muted-foreground">{gradientAngle}°</span></div>
                        <Slider value={[gradientAngle]} onValueChange={([v]) => setGradientAngle(v)} min={0} max={360} step={1} />
                      </div>
                    )}
                  </motion.div>
                )}
              </div>

              {/* Logo Overlay */}
              <div className="flex items-center justify-between p-3 rounded-lg border border-muted">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium flex items-center gap-1.5"><ImagePlus className="h-3.5 w-3.5" />Logo Overlay</Label>
                  <p className="text-xs text-muted-foreground">Add logo in center (requires H correction)</p>
                </div>
                <Switch checked={logoEnabled} onCheckedChange={setLogoEnabled} />
              </div>

              {logoEnabled && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="space-y-3 p-3 rounded-lg bg-muted/50">
                  <div className="space-y-2">
                    <Label className="text-xs">Upload Logo</Label>
                    <div className="flex items-center gap-3">
                      {logoPreview ? (
                        <div className="relative">
                          <div className="w-14 h-14 rounded-lg overflow-hidden border flex items-center justify-center bg-white">
                            <img src={logoPreview} alt="Logo" className="w-full h-full object-contain" />
                          </div>
                          <Button variant="ghost" size="icon" className="h-5 w-5 absolute -top-1 -right-1 bg-background rounded-full" onClick={() => { setLogoFile(null); setLogoPreview(''); logoImgRef.current = null; }}><X className="h-3 w-3" /></Button>
                        </div>
                      ) : (
                        <label className="flex items-center gap-2 p-3 rounded-lg border border-dashed cursor-pointer hover:border-primary/40 transition-colors">
                          <Upload className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm text-muted-foreground">Choose image</span>
                          <input type="file" accept="image/png,image/jpeg,image/jpg,image/webp" className="hidden" onChange={(e) => { if (e.target.files?.[0]) setLogoFile(e.target.files[0]); }} />
                        </label>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <div className="flex justify-between"><Label className="text-xs">Logo Size</Label><span className="text-xs text-muted-foreground">{logoSize}%</span></div>
                      <Slider value={[logoSize]} onValueChange={([v]) => setLogoSize(v)} min={10} max={30} step={1} />
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between"><Label className="text-xs">Padding</Label><span className="text-xs text-muted-foreground">{logoPadding}</span></div>
                      <Slider value={[logoPadding]} onValueChange={([v]) => setLogoPadding(v)} min={0} max={10} step={1} />
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Shape</Label>
                    <div className="flex gap-2">
                      <Button variant={logoShape === 'square' ? 'default' : 'outline'} size="sm" className="text-xs h-7" onClick={() => setLogoShape('square')}>Square</Button>
                      <Button variant={logoShape === 'circle' ? 'default' : 'outline'} size="sm" className="text-xs h-7" onClick={() => setLogoShape('circle')}>Circle</Button>
                    </div>
                  </div>
                </motion.div>
              )}

              <Button className="w-full" size="lg" disabled={isDisabled || processing} onClick={generateQR}>
                {processing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Generating...</> : <><QrCode className="h-4 w-4 mr-2" />Generate QR Code</>}
              </Button>
            </CardContent>
          </Card>

          {/* QR Result */}
          {qrResult && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
              <Card className="border-green-200 dark:border-green-900">
                <CardContent className="p-6 space-y-4">
                  <h3 className="font-semibold text-green-700 dark:text-green-400 text-center">QR Code Generated!</h3>
                  <div className="flex justify-center">
                    <div className="rounded-lg border p-2" style={{ backgroundColor: bgColor }}>
                      <img src={qrResult} alt="QR Code" className="max-w-64 max-h-64" />
                    </div>
                  </div>
                  <canvas ref={canvasRef} className="hidden" />
                  <div className="flex flex-wrap gap-2 justify-center">
                    {logoEnabled && <Badge variant="secondary">Logo</Badge>}
                    {gradientEnabled && <Badge variant="secondary">Gradient</Badge>}
                    <Badge variant="outline">{errorCorrectionLevel} Correction</Badge>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <Button className="flex-1" onClick={downloadAsPng}><Download className="h-4 w-4 mr-2" />PNG</Button>
                    <Button className="flex-1" variant="outline" onClick={downloadAsSvg}><Download className="h-4 w-4 mr-2" />SVG</Button>
                    <Button className="flex-1" variant="outline" onClick={copyToClipboard}>
                      {copied ? <><Check className="h-4 w-4 mr-2 text-green-500" />Copied!</> : <><Copy className="h-4 w-4 mr-2" />Copy</>}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </motion.div>
      )}
    </ToolLayout>
  );
}

function Upload(props: React.SVGProps<SVGSVGElement> & { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" x2="12" y1="3" y2="15" />
    </svg>
  );
}
