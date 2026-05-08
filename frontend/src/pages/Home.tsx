import { useState, useEffect } from "react";
import { Folder, HardDrive, ChevronRight, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { api } from '../wailsjs/go/models';
import { LoadScanHistory, SetCurrentScan, ClearScanHistory } from '../wailsjs/go/api/ScanAPI';

const MAX_HISTORY_ITEMS = 20;

interface HomeProps {
  onNavigateToScan: (mode: 'image' | 'device') => void;
  onOpenRecent: (scanId: string) => void;
}

const formatTime = (timestampSeconds: number): string => {
  const date = new Date(timestampSeconds * 1000);
  return date.toISOString().replace('T', ' ').split('.')[0];
};

export const Home = ({ onNavigateToScan, onOpenRecent }: HomeProps) => {
  const [recentScans, setRecentScans] = useState<api.ScanHistoryRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      try {
        const scans = await LoadScanHistory(MAX_HISTORY_ITEMS);
        setRecentScans(scans);
      } catch {}
      setLoading(false);
    };
    SetCurrentScan("").catch(() => {});
    fetch();
  }, []);

  return (
    <div className="flex flex-col h-screen bg-background select-none overflow-hidden">
      {/* Hero */}
      <div className="flex flex-col items-center pt-14 pb-8 px-8">
        <img
          src="/lovable-uploads/f64971ef-af26-4710-aba1-43092c2d604f.png"
          alt="Digler"
          className="h-20 w-20 object-contain mb-4"
        />
        <h1 className="text-[28px] font-bold text-foreground tracking-tight">Digler</h1>
        <p className="mt-1 text-[15px] text-muted-foreground">Go Deep. Get Back Your Data.</p>
      </div>

      {/* Action tiles */}
      <div className="grid grid-cols-2 gap-4 px-8 mb-8">
        <button
          onClick={() => onNavigateToScan('image')}
          className="flex flex-col items-center gap-3 p-7 bg-card rounded-2xl border border-border/60 shadow-sm hover:shadow-md hover:border-primary/30 transition-all duration-200 group"
        >
          <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/15 transition-colors">
            <Folder className="h-7 w-7 text-primary" />
          </div>
          <div className="text-center">
            <p className="font-semibold text-[15px] text-foreground">Open Disk Image</p>
            <p className="text-[13px] text-muted-foreground mt-0.5">Scan .dd, .img, .raw files</p>
          </div>
        </button>

        <button
          onClick={() => onNavigateToScan('device')}
          className="flex flex-col items-center gap-3 p-7 bg-card rounded-2xl border border-border/60 shadow-sm hover:shadow-md hover:border-primary/30 transition-all duration-200 group"
        >
          <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/15 transition-colors">
            <HardDrive className="h-7 w-7 text-primary" />
          </div>
          <div className="text-center">
            <p className="font-semibold text-[15px] text-foreground">Scan Device</p>
            <p className="text-[13px] text-muted-foreground mt-0.5">Scan physical drives directly</p>
          </div>
        </button>
      </div>

      {/* Recent scans */}
      <div className="flex-1 flex flex-col min-h-0 px-8 pb-8">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Recent Scans</p>
          {recentScans.length > 0 && (
            <button
              onClick={() => ClearScanHistory().then(() => setRecentScans([]))}
              className="text-[12px] text-muted-foreground hover:text-destructive transition-colors"
            >
              Clear All
            </button>
          )}
        </div>

        <div className="flex-1 min-h-0 bg-card rounded-2xl border border-border/60 shadow-sm overflow-hidden">
          <ScrollArea className="h-full">
            {loading ? (
              <div className="flex items-center justify-center h-24 text-[14px] text-muted-foreground">
                Loading…
              </div>
            ) : recentScans.length === 0 ? (
              <div className="flex items-center justify-center h-24 text-[14px] text-muted-foreground">
                No recent scans
              </div>
            ) : (
              <div>
                {recentScans.map((scan, i) => (
                  <div key={scan.id}>
                    {i > 0 && <div className="h-px bg-border/50 mx-4" />}
                    <button
                      className={`w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors ${
                        scan.isMissing
                          ? 'opacity-40 cursor-not-allowed'
                          : 'hover:bg-muted/40'
                      }`}
                      onClick={async () => {
                        if (scan.isMissing) return;
                        await SetCurrentScan(scan.id);
                        onOpenRecent(scan.id);
                      }}
                      disabled={scan.isMissing}
                    >
                      <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                        {scan.sourceType === 'image'
                          ? <Folder className="h-4 w-4 text-primary" />
                          : <HardDrive className="h-4 w-4 text-primary" />
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] font-medium text-foreground truncate">{scan.sourcePath}</p>
                        <p className="text-[12px] text-muted-foreground mt-0.5">
                          {formatTime(scan.scanStartedAt)} · {scan.filesFound.toLocaleString()} files found
                        </p>
                      </div>
                      {scan.isMissing ? (
                        <Badge variant="destructive" className="text-[11px] flex-shrink-0 gap-1">
                          <AlertCircle className="h-3 w-3" />
                          Missing
                        </Badge>
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground/60 flex-shrink-0" />
                      )}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      </div>
    </div>
  );
};
