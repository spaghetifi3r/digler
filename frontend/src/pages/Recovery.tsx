import { useState, useEffect } from "react";
import { ArrowLeft, Folder, CheckCircle, Download, AlertTriangle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProgressBar } from "@/components/ProgressBar";
import { StartRecovery, RecoveryProgress } from '../wailsjs/go/api/ScanAPI';
import { OpenFolderDialog } from '../wailsjs/go/app/App';
import { GetConfig } from '../wailsjs/go/api/ConfigAPI';

interface FileItem {
  id: string;
  name: string;
  path: string;
  size: string;
  type: string;
  status: string;
}

interface RecoveryProps {
  onBack: () => void;
  onComplete: () => void;
  scanID: string;
  selectedFiles: FileItem[];
}

export const Recovery = ({ onBack, onComplete, scanID, selectedFiles }: RecoveryProps) => {
  const [recoveryPath, setRecoveryPath] = useState("");
  const [isRecovering, setIsRecovering] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentFile, setCurrentFile] = useState("");
  const [recoveredCount, setRecoveredCount] = useState(0);
  const [errorCount, setErrorCount] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [totalFiles, setTotalFiles] = useState(0);

  useEffect(() => {
    GetConfig("OUTDIR").then(outDir => setRecoveryPath(outDir)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!isRecovering || isComplete) return;
    const interval = setInterval(async () => {
      const status = await RecoveryProgress(scanID);
      const totalProcessed = status.recovered + status.errors;
      setRecoveredCount(status.recovered);
      setErrorCount(status.errors);
      setTotalFiles(totalProcessed);
      if (totalProcessed - 1 < selectedFiles.length) {
        setCurrentFile(selectedFiles[totalProcessed - 1]?.name ?? "");
      }
      const newProgress = status.progress * 100;
      setProgress(newProgress);
      if (status.progress >= 1) {
        clearInterval(interval);
        setIsComplete(true);
      }
    }, 150);
    return () => clearInterval(interval);
  }, [isRecovering, isComplete, scanID, selectedFiles]);

  const browseRecoveryPath = async () => {
    try {
      const folderPath = await OpenFolderDialog();
      if (folderPath) setRecoveryPath(folderPath);
    } catch {}
  };

  const handleStartRecovery = async () => {
    if (!recoveryPath) return;
    try {
      await StartRecovery(scanID, selectedFiles.map(f => f.name), recoveryPath);
    } catch (err) {
      console.error(`unable to start recovery: ${err}`);
      return;
    }
    setIsRecovering(true);
  };

  const handleDownloadLog = () => {
    const logContent = [
      "Digler Recovery Report",
      `Generated: ${new Date().toLocaleString()}`,
      "",
      "Recovery Summary:",
      `- Total files processed: ${totalFiles}`,
      `- Successfully recovered: ${recoveredCount}`,
      `- Errors encountered: ${errorCount}`,
      `- Recovery path: ${recoveryPath}`,
      "",
      "File Details:",
      ...selectedFiles.map(f => `- ${f.name} (${f.size}) — ${f.status}`),
    ].join('\n');
    const blob = new Blob([logContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'digler_recovery_report.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  /* ── shared header ── */
  const Header = () => (
    <div className="flex items-center gap-3 px-6 py-4 border-b border-border/60 bg-card/80 backdrop-blur-sm">
      <button
        onClick={onBack}
        disabled={isRecovering && !isComplete}
        className="h-7 w-7 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors disabled:opacity-40"
      >
        <ArrowLeft className="h-3.5 w-3.5 text-muted-foreground" />
      </button>
      <img src="/lovable-uploads/f64971ef-af26-4710-aba1-43092c2d604f.png" alt="" className="h-6 w-6 object-contain" />
      <div className="flex-1">
        <p className="font-semibold text-[15px] text-foreground">
          {isComplete ? "Recovery Complete" : isRecovering ? "Recovering Files…" : "Recover Files"}
        </p>
        <p className="text-[12px] text-muted-foreground">
          {selectedFiles.length} files selected
        </p>
      </div>
    </div>
  );

  /* ── config view ── */
  if (!isRecovering) {
    return (
      <div className="flex flex-col h-screen bg-background">
        <Header />
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Destination */}
          <div className="bg-card rounded-2xl border border-border/60 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-border/40">
              <p className="font-semibold text-[15px] text-foreground flex items-center gap-2">
                <Folder className="h-4 w-4 text-muted-foreground" />
                Save Location
              </p>
              <p className="text-[12px] text-muted-foreground mt-0.5">Where to save your recovered files</p>
            </div>
            <div className="px-5 py-4">
              <Label className="text-[13px] font-medium text-foreground block mb-1.5">Output Directory</Label>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={recoveryPath}
                  placeholder="No directory selected"
                  className="text-[13px] rounded-xl border-border/60 bg-muted/40"
                />
                <button
                  onClick={browseRecoveryPath}
                  className="px-4 py-2 rounded-xl border border-border/60 text-[13px] font-medium text-foreground hover:bg-muted/40 transition-colors flex-shrink-0"
                >
                  Browse
                </button>
              </div>
            </div>
          </div>

          {/* Files summary */}
          <div className="bg-card rounded-2xl border border-border/60 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-border/40">
              <p className="font-semibold text-[15px] text-foreground">Files to Recover</p>
              <p className="text-[12px] text-muted-foreground mt-0.5">{selectedFiles.length} files selected</p>
            </div>
            <div className="max-h-52 overflow-y-auto">
              {selectedFiles.map((file, i) => (
                <div key={file.id}>
                  {i > 0 && <div className="h-px bg-border/40 mx-5" />}
                  <div className="flex items-center justify-between px-5 py-3">
                    <span className="text-[13px] font-medium text-foreground truncate max-w-xs">{file.name}</span>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-[12px] text-muted-foreground">{file.size}</span>
                      <div className={`h-1.5 w-1.5 rounded-full ${
                        file.status === 'recoverable' ? 'bg-success' :
                        file.status === 'partial' ? 'bg-warning' : 'bg-destructive'
                      }`} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="px-6 pb-6 pt-3 bg-background border-t border-border/40">
          <button
            onClick={handleStartRecovery}
            disabled={!recoveryPath}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-primary text-white font-semibold text-[15px] disabled:opacity-40 hover:brightness-105 transition-all shadow-sm"
          >
            <Download className="h-4 w-4" />
            Start Recovery
          </button>
        </div>
      </div>
    );
  }

  /* ── progress + completion view ── */
  return (
    <div className="flex flex-col h-screen bg-background">
      <Header />
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {/* Progress card */}
        <div className="bg-card rounded-2xl border border-border/60 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-border/40">
            <p className="font-semibold text-[15px] text-foreground">
              {isComplete ? "Recovery Complete" : "Recovering…"}
            </p>
            {!isComplete && (
              <p className="text-[12px] text-muted-foreground mt-0.5 truncate">Saving to {recoveryPath}</p>
            )}
          </div>
          <div className="px-5 py-5 space-y-5">
            <ProgressBar
              progress={progress}
              variant={isComplete ? "recovery" : "default"}
              showPercentage
            />

            {!isComplete && currentFile && (
              <p className="text-[12px] text-muted-foreground text-center truncate">
                Recovering: <span className="text-foreground font-medium">{currentFile}</span>
              </p>
            )}

            <div className="grid grid-cols-3 gap-3">
              <div className="bg-muted/40 rounded-xl p-3 text-center">
                <p className="text-[20px] font-bold text-success">{recoveredCount}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">Recovered</p>
              </div>
              <div className="bg-muted/40 rounded-xl p-3 text-center">
                <p className="text-[20px] font-bold text-foreground">
                  {Math.max(0, selectedFiles.length - recoveredCount - errorCount)}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">Remaining</p>
              </div>
              <div className="bg-muted/40 rounded-xl p-3 text-center">
                <p className="text-[20px] font-bold text-warning">{errorCount}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">Errors</p>
              </div>
            </div>
          </div>
        </div>

        {/* Completion card */}
        {isComplete && (
          <div className="bg-card rounded-2xl border border-success/20 shadow-sm overflow-hidden">
            <div className="px-5 py-5 space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-success/10 flex items-center justify-center flex-shrink-0">
                  <CheckCircle className="h-6 w-6 text-success" />
                </div>
                <div>
                  <p className="font-semibold text-[16px] text-foreground">All done!</p>
                  <p className="text-[13px] text-muted-foreground">
                    {recoveredCount} file{recoveredCount !== 1 ? 's' : ''} saved to your chosen location
                  </p>
                </div>
              </div>

              <div className="bg-muted/40 rounded-xl px-4 py-3 space-y-1.5 text-[13px]">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Recovered</span>
                  <span className="font-medium text-success">{recoveredCount}</span>
                </div>
                {errorCount > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3 text-warning" /> Errors
                    </span>
                    <span className="font-medium text-warning">{errorCount}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Location</span>
                  <span className="font-mono text-[11px] text-foreground truncate max-w-[180px]">{recoveryPath}</span>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handleDownloadLog}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-border/60 text-[13px] font-medium text-foreground hover:bg-muted/40 transition-colors"
                >
                  <Download className="h-3.5 w-3.5" />
                  Save Report
                </button>
                <button
                  onClick={onComplete}
                  className="flex-1 py-2.5 rounded-xl bg-primary text-white text-[13px] font-semibold hover:brightness-105 transition-all"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
