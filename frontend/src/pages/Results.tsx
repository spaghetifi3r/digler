import { useEffect, useState } from "react";
import { ArrowLeft, Folder, File, Image, FileText, Archive, Music, Video, Search, Download, Eye, CheckSquare, Square, Filter } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { api } from '../wailsjs/go/models';
import { ScanResult, FileContent } from '../wailsjs/go/api/ScanAPI';
import { formatFileSize } from '../lib/utils';

const enum FileType {
  Image = "image",
  Document = "document",
  Archive = "archive",
  Audio = "audio",
  Video = "video",
  Other = "other",
}

interface FileItem {
  id: string;
  name: string;
  path: string;
  size: string;
  type: FileType;
  status: "recoverable" | "corrupted" | "partial";
  preview?: string;
}

interface FolderItem {
  id: string;
  name: string;
  path: string;
  children: (FolderItem | FileItem)[];
}

interface ResultsProps {
  onBack: () => void;
  onStartRecovery: (results: { scanId: string; selectedFiles: FileItem[] }) => void;
  scanResults: { scanId: string; filesFound: number; path: string };
}

const fileType = (ext: string): FileType => {
  switch (ext.toLowerCase()) {
    case "jpg": case "jpeg": case "png": case "gif": case "bmp": case "tiff": return FileType.Image;
    case "pdf": case "doc": case "docx": case "txt": case "md": return FileType.Document;
    case "zip": case "rar": case "7z": case "tar": case "gz": return FileType.Archive;
    case "mp3": case "wav": case "flac": case "aac": return FileType.Audio;
    case "mp4": case "mkv": case "avi": case "mov": return FileType.Video;
    default: return FileType.Other;
  }
};

const getMimeType = (fileName: string) => {
  const ext = fileName.split('.').pop()?.toLowerCase();
  const map: Record<string, string> = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    gif: 'image/gif', bmp: 'image/bmp', mp3: 'audio/mpeg',
    wav: 'audio/wav', flac: 'audio/flac',
  };
  return map[ext ?? ''] ?? '';
};

const getImageDataUrl = async (scanId: string, fileName: string) => {
  const base64Content = await FileContent(scanId, fileName);
  const mimeType = getMimeType(fileName);
  if (!mimeType) return null;
  return `data:${mimeType};base64,${base64Content}`;
};

const FileIcon = ({ type, className = "h-4 w-4" }: { type: string; className?: string }) => {
  switch (type) {
    case "image":    return <Image className={className} />;
    case "document": return <FileText className={className} />;
    case "archive":  return <Archive className={className} />;
    case "audio":    return <Music className={className} />;
    case "video":    return <Video className={className} />;
    default:         return <File className={className} />;
  }
};

const typeColor: Record<string, string> = {
  image: "text-blue-500",
  document: "text-orange-500",
  archive: "text-purple-500",
  audio: "text-green-500",
  video: "text-red-500",
  other: "text-muted-foreground",
};

const getAllFileIds = (item: FolderItem | FileItem): string[] => {
  if ('size' in item) return [item.id];
  return (item as FolderItem).children.flatMap(getAllFileIds);
};

const getAllFiles = (item: FolderItem | FileItem): FileItem[] => {
  if ('size' in item) return [item as FileItem];
  return (item as FolderItem).children.flatMap(getAllFiles);
};

export const Results = ({ onBack, onStartRecovery, scanResults }: ResultsProps) => {
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [previewFile, setPreviewFile] = useState<FileItem | null>(null);
  const [fileTree, setFileTree] = useState<FolderItem[]>([]);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(["root", "images", "documents", "audio", "Other"]));

  useEffect(() => {
    document.body.style.overflowY = 'hidden';
    return () => { document.body.style.overflowY = 'unset'; };
  }, []);

  const handlePreview = async (file: FileItem) => {
    setIsPreviewLoading(true);
    const previewContent = await getImageDataUrl(scanResults.scanId, file.name);
    setPreviewFile({ ...file, preview: previewContent });
    setIsPreviewLoading(false);
  };

  useEffect(() => {
    const fetchScanResults = async () => {
      let res: api.ScanResultResponse = null;
      try {
        res = await ScanResult(scanResults.scanId);
      } catch { return; }

      const allFiles = res.files.map(file => ({
        id: file.name,
        name: file.name,
        path: file.name,
        size: formatFileSize(file.size),
        type: fileType(file.ext),
        status: "recoverable" as const,
      }));

      const groups = [
        { id: "images",    name: "Images",    items: allFiles.filter(f => f.type === FileType.Image) },
        { id: "documents", name: "Documents", items: allFiles.filter(f => f.type === FileType.Document) },
        { id: "audio",     name: "Audio",     items: allFiles.filter(f => f.type === FileType.Audio) },
        { id: "video",     name: "Video",     items: allFiles.filter(f => f.type === FileType.Video) },
        { id: "archive",   name: "Archives",  items: allFiles.filter(f => f.type === FileType.Archive) },
        { id: "Other",     name: "Other",     items: allFiles.filter(f => f.type === FileType.Other) },
      ];

      setFileTree([{
        id: "root",
        name: "Recovered Files",
        path: "/",
        children: groups
          .filter(g => g.items.length > 0)
          .map(g => ({ id: g.id, name: g.name, path: `/${g.name}`, children: g.items })),
      }]);

      setSelectedFiles(new Set(allFiles.map(f => f.id)));
    };
    fetchScanResults();
  }, []);

  const toggleFolder = (id: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleItemSelection = (item: FolderItem | FileItem) => {
    const next = new Set(selectedFiles);
    if ('size' in item) {
      next.has(item.id) ? next.delete(item.id) : next.add(item.id);
    } else {
      const ids = getAllFileIds(item);
      const allSelected = ids.every(id => next.has(id));
      ids.forEach(id => allSelected ? next.delete(id) : next.add(id));
    }
    setSelectedFiles(next);
  };

  const visibleFiles = (item: FolderItem | FileItem): FileItem[] => {
    if ('size' in item) {
      const f = item as FileItem;
      const matchesSearch = f.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesFilter = filterType === "all" || f.type === filterType;
      return matchesSearch && matchesFilter ? [f] : [];
    }
    return (item as FolderItem).children.flatMap(visibleFiles);
  };

  const renderTreeItem = (item: FolderItem | FileItem, level = 0): React.ReactNode => {
    const isFile = 'size' in item;
    const indent = level * 16;

    if (isFile) {
      const file = item as FileItem;
      const shown = visibleFiles(file);
      if (shown.length === 0 && (searchTerm || filterType !== "all")) return null;
      const isSelected = selectedFiles.has(file.id);

      return (
        <div
          key={file.id}
          className="flex items-center gap-2 px-3 py-2 hover:bg-muted/40 cursor-pointer rounded-lg group"
          style={{ paddingLeft: indent + 12 }}
          onClick={() => toggleItemSelection(file)}
        >
          {isSelected
            ? <CheckSquare className="h-3.5 w-3.5 text-primary flex-shrink-0" />
            : <Square className="h-3.5 w-3.5 text-muted-foreground/40 flex-shrink-0" />
          }
          <FileIcon type={file.type} className={`h-3.5 w-3.5 flex-shrink-0 ${typeColor[file.type]}`} />
          <span className="flex-1 text-[13px] text-foreground truncate">{file.name}</span>
          <span className="text-[11px] text-muted-foreground flex-shrink-0">{file.size}</span>
          <button
            className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-muted transition-all flex-shrink-0"
            onClick={e => { e.stopPropagation(); handlePreview(file); }}
          >
            <Eye className="h-3 w-3 text-muted-foreground" />
          </button>
        </div>
      );
    }

    const folder = item as FolderItem;
    const childFiles = visibleFiles(folder);
    if (childFiles.length === 0 && (searchTerm || filterType !== "all")) return null;

    const ids = getAllFileIds(folder);
    const selectedCount = ids.filter(id => selectedFiles.has(id)).length;
    const selState = selectedCount === 0 ? "none" : selectedCount === ids.length ? "all" : "partial";
    const isExpanded = expandedFolders.has(folder.id);

    return (
      <div key={folder.id}>
        <div
          className="flex items-center gap-2 px-3 py-2 hover:bg-muted/40 cursor-pointer rounded-lg"
          style={{ paddingLeft: indent + 12 }}
          onClick={() => toggleItemSelection(folder)}
        >
          {selState === "all"
            ? <CheckSquare className="h-3.5 w-3.5 text-primary flex-shrink-0" />
            : selState === "none"
              ? <Square className="h-3.5 w-3.5 text-muted-foreground/40 flex-shrink-0" />
              : <Square className="h-3.5 w-3.5 text-primary/60 flex-shrink-0" />
          }
          <button
            className="flex items-center gap-2 flex-1 min-w-0"
            onClick={e => { e.stopPropagation(); toggleFolder(folder.id); }}
          >
            <Folder className={`h-3.5 w-3.5 flex-shrink-0 ${folder.id === "root" ? "text-primary" : "text-muted-foreground"}`} />
            <span className="text-[13px] font-medium text-foreground truncate">{folder.name}</span>
          </button>
          <span className="text-[11px] text-muted-foreground flex-shrink-0">{childFiles.length} files</span>
        </div>
        {isExpanded && folder.children.map(child => renderTreeItem(child, level + 1))}
      </div>
    );
  };

  const handleStartRecovery = () => {
    const allFiles = fileTree.flatMap(getAllFiles);
    const files = allFiles.filter(f => selectedFiles.has(f.id));
    onStartRecovery({ scanId: scanResults.scanId, selectedFiles: files });
  };

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-border/60 bg-card/80 backdrop-blur-sm flex-shrink-0">
        <button onClick={onBack} className="h-7 w-7 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors">
          <ArrowLeft className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
        <img src="/lovable-uploads/f64971ef-af26-4710-aba1-43092c2d604f.png" alt="" className="h-6 w-6 object-contain" />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-[15px] text-foreground">Scan Results</p>
          <p className="text-[12px] text-muted-foreground">{scanResults.filesFound.toLocaleString()} files found</p>
        </div>
        <button
          onClick={handleStartRecovery}
          disabled={selectedFiles.size === 0}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-[13px] font-semibold disabled:opacity-40 hover:brightness-105 transition-all"
        >
          <Download className="h-3.5 w-3.5" />
          Recover {selectedFiles.size > 0 ? `(${selectedFiles.size})` : ""}
        </button>
      </div>

      {/* Search + filter bar */}
      <div className="flex gap-3 px-6 py-3 border-b border-border/40 bg-card/60 flex-shrink-0">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search files…"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="pl-9 text-[13px] rounded-xl border-border/60 bg-muted/40 h-8"
          />
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-36 text-[13px] rounded-xl border-border/60 bg-muted/40 h-8 gap-1.5">
            <Filter className="h-3 w-3 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="image">Images</SelectItem>
            <SelectItem value="video">Video</SelectItem>
            <SelectItem value="audio">Audio</SelectItem>
            <SelectItem value="document">Documents</SelectItem>
            <SelectItem value="archive">Archives</SelectItem>
            <SelectItem value="other">Other</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Content */}
      <div className="flex-1 flex gap-0 min-h-0 overflow-hidden">
        {/* File tree */}
        <div className="flex-1 overflow-y-auto p-3">
          {fileTree.map(item => renderTreeItem(item))}
        </div>

        {/* Preview panel */}
        <div className="w-64 border-l border-border/60 flex flex-col bg-card/60 flex-shrink-0">
          <div className="px-4 py-3.5 border-b border-border/40">
            <p className="text-[13px] font-semibold text-foreground">Preview</p>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center p-4 overflow-hidden">
            {isPreviewLoading ? (
              <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            ) : previewFile ? (
              <div className="w-full space-y-3">
                {previewFile.preview && previewFile.type === FileType.Image ? (
                  <div className="aspect-square rounded-xl bg-muted/40 flex items-center justify-center overflow-hidden">
                    <img src={previewFile.preview} alt={previewFile.name} className="max-w-full max-h-full object-contain" />
                  </div>
                ) : previewFile.preview && previewFile.type === FileType.Audio ? (
                  <audio controls className="w-full rounded-lg">
                    <source src={previewFile.preview} />
                  </audio>
                ) : (
                  <div className="aspect-square rounded-xl bg-muted/40 flex items-center justify-center">
                    <FileIcon type={previewFile.type} className={`h-12 w-12 ${typeColor[previewFile.type]}`} />
                  </div>
                )}
                <div className="space-y-2 text-[12px]">
                  <p className="font-semibold text-foreground truncate">{previewFile.name}</p>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Size</span>
                    <span>{previewFile.size}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Status</span>
                    <Badge className="text-[10px] bg-success/10 text-success border-success/20 h-5">Recoverable</Badge>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center text-muted-foreground">
                <Eye className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p className="text-[12px]">Hover a file to preview</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
