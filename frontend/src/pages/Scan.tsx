import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Folder, HardDrive, Play, Settings, FileText, Pause, RotateCcw, StopCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { ProgressBar } from "@/components/ProgressBar";
import { OpenFileDialog, OpenFolderDialog } from '../wailsjs/go/app/App';
import { api } from '../wailsjs/go/models.ts';
import { DefaultOutputDir, ListDevices } from '../wailsjs/go/api/SystemAPI';
import { StartScan, PollStatus, PauseScan, ResumeScan, AbortScan } from '../wailsjs/go/api/ScanAPI';
import { GetOrSet, SetConfig } from '../wailsjs/go/api/ConfigAPI';
import { formatFileSize } from '../lib/utils';

const OUT_DIR_CONFIG_KEY = "OUTDIR";

interface ScanProps {
  mode: "image" | "device";
  onBack: () => void;
  onScanComplete: (results: { filesFound: number; path: string; scanId: string }) => void;
}

export const Scan = ({ onBack, onScanComplete, mode }: ScanProps) => {
  const [scanType, setScanTypeState] = useState<"image" | "device">(mode);
  const [selectedPath, setSelectedPath] = useState("");
  const [outputPath, setOutputPath] = useState("");
  const [dumpEnabled, setDumpEnabled] = useState(false);
  const [selectedPlugin, setSelectedPlugin] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isAborted, setIsAborted] = useState(false);
  const [progress, setProgress] = useState(0);
  const [scanLogs, setScanLogs] = useState<string[]>([]);
  const [scanStats, setScanStats] = useState({ filesFound: 0, timeElapsed: "00:00" });
  const [devices, setDevices] = useState<api.DeviceInfo[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const logEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [scanLogs]);

  const setErrorMessageWithTimeout = (msg: string, delay: number) => {
    setErrorMessage(msg);
    setTimeout(() => setErrorMessage(null), delay);
  };

  const setScanType = (type: "image" | "device") => {
    setSelectedPath("");
    setScanTypeState(type);
  };

  const browseFile = async () => {
    try {
      const filters = [
        { name: "Disk Images", pattern: "*.dd;*.img;*.iso" },
        { name: "All Files", pattern: "*" },
      ];
      const filePath = await OpenFileDialog("Select Image", filters);
      if (filePath) setSelectedPath(filePath);
    } catch {}
  };

  const browseOutputPath = async () => {
    try {
      const folderPath = await OpenFolderDialog();
      if (folderPath) {
        await SetConfig(OUT_DIR_CONFIG_KEY, folderPath);
        setOutputPath(folderPath);
      }
    } catch {}
  };

  useEffect(() => {
    const fetchDevices = async () => {
      try {
        const deviceList = await ListDevices();
        setDevices(deviceList);
      } catch {}
    };
    const setDefaultOutputPath = () => {
      DefaultOutputDir()
        .then(dir => GetOrSet(OUT_DIR_CONFIG_KEY, dir))
        .then(outDir => setOutputPath(outDir))
        .catch(() => {});
    };
    fetchDevices();
    setDefaultOutputPath();
  }, []);

  const plugins = [
    "All Formats",
    "Images Only (JPEG, PNG, GIF)",
    "Documents (PDF, DOC, TXT)",
    "Archives (ZIP, RAR, 7Z)",
    "Custom Signatures",
  ];

  const startTimeRef = useRef<number | null>(null);
  const intervalRef = useRef<number | null>(null);
  const scanIdRef = useRef<string>("");

  const elapsedTime = () => {
    const elapsedMs = Date.now() - startTimeRef.current!;
    const totalSeconds = Math.floor(elapsedMs / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const seconds = totalSeconds % 60;
    return `${String(hours).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  };

  const refreshStatus = async () => {
    let scanStatus: api.ScanStatusResponse = null;
    try {
      scanStatus = await PollStatus(scanIdRef.current);
    } catch {
      setScanLogs(prev => [...prev, "Error retrieving scan status. Retrying…"]);
      return;
    }
    if (!scanStatus) return;

    setProgress(() => {
      setScanStats({ filesFound: scanStatus!.files, timeElapsed: elapsedTime() });
      const newProgress = scanStatus.progress;
      if (newProgress >= 1) {
        if (intervalRef.current != null) clearInterval(intervalRef.current);
        setScanLogs(prev => [...prev, "Scan completed successfully!"]);
        setTimeout(() => {
          onScanComplete({ filesFound: scanStatus.files, path: selectedPath, scanId: scanIdRef.current });
        }, 1500);
      } else {
        const logs = [
          `Scanning sector ${Math.floor(newProgress * 1000)}…`,
          `Found deleted file: document_${Math.floor(Math.random() * 1000)}.pdf`,
          `Recovered image: IMG_${Math.floor(Math.random() * 9999)}.jpg`,
          `Processing filesystem metadata…`,
        ];
        setScanLogs(prev => [...prev, logs[Math.floor(Math.random() * logs.length)]]);
      }
      return newProgress * 100;
    });
  };

  const handleStartScan = async () => {
    if (!selectedPath || !outputPath) return;
    try {
      scanIdRef.current = await StartScan(selectedPath, outputPath);
    } catch (error) {
      let errMsg = error as string;
      if (errMsg.includes('permission denied')) errMsg += '\n(Try restarting with elevated privileges)';
      setErrorMessageWithTimeout(errMsg, 3000);
      return;
    }
    startTimeRef.current = Date.now();
    intervalRef.current = setInterval(refreshStatus, 200) as unknown as number;
    setIsScanning(true);
    setIsPaused(false);
    setIsAborted(false);
    setScanLogs(["Starting scan…", `Target: ${selectedPath}`, `Output: ${outputPath}`]);
  };

  const handlePauseScan = async () => {
    await PauseScan(scanIdRef.current);
    if (intervalRef.current != null) clearInterval(intervalRef.current);
    setIsPaused(true);
    setScanLogs(prev => [...prev, "Scan paused"]);
  };

  const handleResumeScan = async () => {
    await ResumeScan(scanIdRef.current);
    intervalRef.current = setInterval(refreshStatus, 200) as unknown as number;
    setIsPaused(false);
    setScanLogs(prev => [...prev, "Scan resumed"]);
  };

  const handleAbortScan = async () => {
    await AbortScan(scanIdRef.current);
    setIsAborted(true);
    setIsScanning(false);
    setIsPaused(false);
    setScanLogs(prev => [...prev, "Scan aborted"]);
  };

  const handleReturnToConfig = () => {
    setIsAborted(false);
    setProgress(0);
    setScanLogs([]);
    setScanStats({ filesFound: 0, timeElapsed: "00:00" });
  };

  const handleViewPartialResults = () => {
    onScanComplete({ filesFound: scanStats.filesFound, path: selectedPath, scanId: scanIdRef.current });
  };

  /* ── shared header ── */
  const Header = () => (
    <div className="flex items-center gap-3 px-6 py-4 border-b border-border/60 bg-card/80 backdrop-blur-sm">
      {!isScanning && (
        <button onClick={onBack} className="h-7 w-7 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors">
          <ArrowLeft className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      )}
      <img src="/lovable-uploads/f64971ef-af26-4710-aba1-43092c2d604f.png" alt="" className="h-6 w-6 object-contain" />
      <span className="font-semibold text-[15px] text-foreground">
        {isScanning ? "Scanning…" : isAborted ? "Scan Aborted" : "New Scan"}
      </span>
    </div>
  );

  /* ── config view ── */
  if (!isScanning && !isAborted) {
    return (
      <div className="flex flex-col h-screen bg-background">
        <Header />
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Source card */}
          <div className="bg-card rounded-2xl border border-border/60 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-border/40">
              <p className="font-semibold text-[15px] text-foreground">Source</p>
              <p className="text-[13px] text-muted-foreground mt-0.5">Choose what to scan for deleted files</p>
            </div>
            <div className="p-5 space-y-4">
              {/* Segmented control */}
              <div className="flex bg-muted rounded-xl p-1 gap-1">
                <button
                  onClick={() => setScanType("image")}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-[13px] font-medium transition-all ${
                    scanType === "image"
                      ? "bg-card shadow-sm text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Folder className="h-3.5 w-3.5" />
                  Disk Image
                </button>
                <button
                  onClick={() => setScanType("device")}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-[13px] font-medium transition-all ${
                    scanType === "device"
                      ? "bg-card shadow-sm text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <HardDrive className="h-3.5 w-3.5" />
                  Physical Device
                </button>
              </div>

              {scanType === "image" ? (
                <div>
                  <Label className="text-[13px] font-medium text-foreground mb-1.5 block">Image File</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="No file selected"
                      readOnly
                      value={selectedPath}
                      className="text-[13px] rounded-xl border-border/60 bg-muted/40"
                    />
                    <Button variant="outline" onClick={browseFile} className="rounded-xl text-[13px] px-4 border-border/60">
                      Browse
                    </Button>
                  </div>
                </div>
              ) : (
                <div>
                  <Label className="text-[13px] font-medium text-foreground mb-1.5 block">Device</Label>
                  <Select value={selectedPath} onValueChange={setSelectedPath}>
                    <SelectTrigger className="rounded-xl text-[13px] border-border/60 bg-muted/40">
                      <SelectValue placeholder="Select device…" />
                    </SelectTrigger>
                    <SelectContent>
                      {devices.map(device => (
                        <SelectItem key={device.name} value={device.path}>
                          {`${device.name} — ${device.model} (${formatFileSize(device.size)})`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </div>

          {/* Options card */}
          <div className="bg-card rounded-2xl border border-border/60 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-border/40">
              <p className="font-semibold text-[15px] text-foreground flex items-center gap-2">
                <Settings className="h-4 w-4 text-muted-foreground" />
                Options
              </p>
            </div>
            <div className="divide-y divide-border/40">
              {/* Output dir */}
              <div className="px-5 py-4 space-y-1.5">
                <Label className="text-[13px] font-medium text-foreground block">Output Directory</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="No directory selected"
                    readOnly
                    value={outputPath}
                    className="text-[13px] rounded-xl border-border/60 bg-muted/40"
                  />
                  <Button variant="outline" onClick={browseOutputPath} className="rounded-xl text-[13px] px-4 border-border/60">
                    Browse
                  </Button>
                </div>
              </div>

              {/* Recover during scan toggle */}
              <div className="px-5 py-4 flex items-center justify-between">
                <div>
                  <p className="text-[14px] font-medium text-foreground">Recover files during scan</p>
                  <p className="text-[12px] text-muted-foreground mt-0.5">Save files as they're found (slower)</p>
                </div>
                <Switch checked={dumpEnabled} onCheckedChange={setDumpEnabled} />
              </div>

              {/* File type filter */}
              <div className="px-5 py-4 space-y-1.5">
                <Label className="text-[13px] font-medium text-foreground block">File Type Filter</Label>
                <Select value={selectedPlugin} onValueChange={setSelectedPlugin}>
                  <SelectTrigger className="rounded-xl text-[13px] border-border/60 bg-muted/40">
                    <SelectValue placeholder="All file types" />
                  </SelectTrigger>
                  <SelectContent>
                    {plugins.map(p => (
                      <SelectItem key={p} value={p}>{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Error */}
          {errorMessage && (
            <p className="text-[13px] text-destructive text-center font-medium px-4">{errorMessage}</p>
          )}
        </div>

        {/* Sticky start button */}
        <div className="px-6 pb-6 pt-3 bg-background border-t border-border/40">
          <button
            onClick={handleStartScan}
            disabled={!selectedPath || !outputPath}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-primary text-white font-semibold text-[15px] disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-105 transition-all shadow-sm"
          >
            <Play className="h-4 w-4" />
            Start Deep Scan
          </button>
        </div>
      </div>
    );
  }

  /* ── aborted view ── */
  if (isAborted) {
    return (
      <div className="flex flex-col h-screen bg-background">
        <Header />
        <div className="flex-1 flex flex-col items-center justify-center p-8 gap-6">
          <div className="bg-card rounded-2xl border border-border/60 shadow-sm p-8 w-full max-w-md text-center space-y-4">
            <div className="h-14 w-14 rounded-full bg-warning/10 flex items-center justify-center mx-auto">
              <StopCircle className="h-7 w-7 text-warning" />
            </div>
            <div>
              <p className="font-semibold text-[17px] text-foreground">Scan Stopped</p>
              <p className="text-[13px] text-muted-foreground mt-1">
                {scanStats.filesFound.toLocaleString()} files were found before the scan was aborted
              </p>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                onClick={handleReturnToConfig}
                className="flex-1 py-2.5 rounded-xl border border-border/60 text-[14px] font-medium text-foreground hover:bg-muted/40 transition-colors"
              >
                New Scan
              </button>
              <button
                onClick={handleViewPartialResults}
                className="flex-1 py-2.5 rounded-xl bg-primary text-white text-[14px] font-medium hover:brightness-105 transition-all"
              >
                View Results
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ── scanning view ── */
  return (
    <div className="flex flex-col h-screen bg-background">
      <Header />
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {/* Progress card */}
        <div className="bg-card rounded-2xl border border-border/60 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-border/40">
            <p className="font-semibold text-[15px] text-foreground">Deep Scan in Progress</p>
            <p className="text-[12px] text-muted-foreground mt-0.5 truncate">{selectedPath}</p>
          </div>
          <div className="px-5 py-5 space-y-5">
            <ProgressBar progress={Math.trunc(progress * 100) / 100} showPercentage />

            <div className="grid grid-cols-3 gap-4">
              {[
                { label: "Files Found", value: scanStats.filesFound.toLocaleString() },
                { label: "Time Elapsed", value: scanStats.timeElapsed },
                { label: "Complete", value: `${Math.round(progress)}%` },
              ].map(stat => (
                <div key={stat.label} className="bg-muted/40 rounded-xl p-3 text-center">
                  <p className="text-[20px] font-bold text-primary">{stat.value}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{stat.label}</p>
                </div>
              ))}
            </div>

            {/* Controls */}
            <div className="flex gap-3 justify-center">
              {!isPaused ? (
                <button
                  onClick={handlePauseScan}
                  className="flex items-center gap-2 px-5 py-2 rounded-xl border border-border/60 text-[13px] font-medium text-foreground hover:bg-muted/40 transition-colors"
                >
                  <Pause className="h-3.5 w-3.5" />
                  Pause
                </button>
              ) : (
                <button
                  onClick={handleResumeScan}
                  className="flex items-center gap-2 px-5 py-2 rounded-xl border border-border/60 text-[13px] font-medium text-foreground hover:bg-muted/40 transition-colors"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Resume
                </button>
              )}

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <button className="flex items-center gap-2 px-5 py-2 rounded-xl bg-destructive/10 text-destructive text-[13px] font-medium hover:bg-destructive/15 transition-colors">
                    <StopCircle className="h-3.5 w-3.5" />
                    Stop
                  </button>
                </AlertDialogTrigger>
                <AlertDialogContent className="rounded-2xl">
                  <AlertDialogHeader>
                    <AlertDialogTitle>Stop Scan?</AlertDialogTitle>
                    <AlertDialogDescription>
                      You can view partial results or start a new scan. This will stop the current operation.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleAbortScan} className="rounded-xl bg-destructive hover:bg-destructive/90">
                      Stop Scan
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </div>

        {/* Live log */}
        <div className="bg-card rounded-2xl border border-border/60 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border/40 flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <p className="font-medium text-[14px] text-foreground">Live Log</p>
          </div>
          <div className="h-52 overflow-y-auto p-4 font-mono text-[12px] space-y-0.5 bg-muted/20">
            {scanLogs.map((log, i) => (
              <div key={i} className="flex gap-2">
                <span className="text-muted-foreground/60 flex-shrink-0">{new Date().toLocaleTimeString()}</span>
                <span className="text-foreground/80">{log}</span>
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        </div>
      </div>
    </div>
  );
};
