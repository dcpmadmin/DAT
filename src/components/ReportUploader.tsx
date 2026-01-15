import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Upload, FolderOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';
import { parseDamageDetailsFile, getDetailsFileHeaders, suggestColumnMapping, DamageDetailsColumnMapping } from '@/utils/damage-details';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface ReportUploaderProps {
  onFilesSelected: (files: FileList, mapping?: DamageDetailsColumnMapping) => void;
  isProcessing: boolean;
}

export const ReportUploader = ({ onFilesSelected, isProcessing }: ReportUploaderProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [summary, setSummary] = useState<{ total: number; images: number; details: number; other: number } | null>(null);
  const [pendingFiles, setPendingFiles] = useState<FileList | null>(null);
  const [detailsHeaders, setDetailsHeaders] = useState<string[]>([]);
  const [detailsFileName, setDetailsFileName] = useState<string | undefined>(undefined);
  const [mapping, setMapping] = useState<DamageDetailsColumnMapping>({});
  const [issuesCsv, setIssuesCsv] = useState<string | null>(null);
  const [preflight, setPreflight] = useState<{
    reportCount: number;
    missingByType: { damage: number; precondition: number; completion: number };
    missingSample: string[];
    detailsFileName?: string;
    detailsMatched?: number;
    detailsMissing?: number;
    detailsUnmatched?: number;
    detailsError?: string;
    issues: Array<{ issue: string; damageId: string; detail?: string }>;
  } | null>(null);
  const [isPreflighting, setIsPreflighting] = useState(false);

  const handleFileSelect = () => {
    fileInputRef.current?.click();
  };

  const detectPhotoTypeFolder = (pathParts: string[]) => {
    for (let i = 0; i < pathParts.length - 1; i++) {
      const folder = pathParts[i].toLowerCase().trim();
      if (
        folder.includes('precondition') || 
        folder.includes('pre-condition') ||
        folder.includes('pre_condition') ||
        folder.includes('before') ||
        folder.includes('damage') ||
        folder.includes('completion') ||
        folder.includes('after') ||
        folder.startsWith('01-') ||
        folder.startsWith('02-') ||
        folder.startsWith('03-')
      ) {
        return { folder, index: i };
      }
    }
    if (pathParts.length >= 2) {
      return { folder: pathParts[pathParts.length - 2].toLowerCase().trim(), index: pathParts.length - 2 };
    }
    return null;
  };

  const classifyPhotoType = (folder: string | null) => {
    if (!folder) return 'damage' as const;
    if (folder.includes('damage') || folder.startsWith('02-') || folder.includes('02-damage')) return 'damage' as const;
    if (
      folder.includes('precondition') ||
      folder.includes('pre-condition') ||
      folder.includes('pre_condition') ||
      folder.includes('before') ||
      folder.startsWith('01-') ||
      folder.includes('01-precondition')
    ) return 'precondition' as const;
    if (
      folder.includes('completion') ||
      folder.includes('after') ||
      folder.startsWith('03-') ||
      folder.includes('03-completion')
    ) return 'completion' as const;
    return 'damage' as const;
  };

  const analyzeStructure = async (files: FileList, mappingOverride?: DamageDetailsColumnMapping) => {
    const reportMap = new Map<string, { damage: boolean; precondition: boolean; completion: boolean }>();
    const imageFiles = Array.from(files).filter((file) => file.type.startsWith('image/'));
    for (const file of imageFiles) {
      const pathParts = file.webkitRelativePath.split('/');
      const photoTypeFolder = detectPhotoTypeFolder(pathParts);
      const damageId = photoTypeFolder && photoTypeFolder.index > 0
        ? pathParts[photoTypeFolder.index - 1]
        : pathParts.length >= 2 ? pathParts[1] : pathParts[0];
      const type = classifyPhotoType(photoTypeFolder?.folder || null);
      if (!reportMap.has(damageId)) {
        reportMap.set(damageId, { damage: false, precondition: false, completion: false });
      }
      const entry = reportMap.get(damageId)!;
      entry[type] = true;
    }

    const missingByType = { damage: 0, precondition: 0, completion: 0 };
    const missingSample: string[] = [];
    const issues: Array<{ issue: string; damageId: string; detail?: string }> = [];
    for (const [damageId, types] of reportMap.entries()) {
      const missingAny = !types.damage || !types.precondition || !types.completion;
      if (!types.damage) missingByType.damage++;
      if (!types.precondition) missingByType.precondition++;
      if (!types.completion) missingByType.completion++;
      if (missingAny && missingSample.length < 5) missingSample.push(damageId);
      if (!types.damage) issues.push({ issue: 'missing_damage_photos', damageId });
      if (!types.precondition) issues.push({ issue: 'missing_precondition_photos', damageId });
      if (!types.completion) issues.push({ issue: 'missing_completion_photos', damageId });
    }

    const detailsResult = await parseDamageDetailsFile(files, mappingOverride);
    const detailsIds = Object.keys(detailsResult.detailsById);
    const reportIds = Array.from(reportMap.keys());
    const reportIdSet = new Set(reportIds);
    const detailsMissing = reportIds.filter((id) => !detailsResult.detailsById[id]).length;
    const detailsUnmatched = detailsIds.filter((id) => !reportIdSet.has(id)).length;
    const detailsMatched = reportIds.length - detailsMissing;
    if (detailsResult.sourceFileName) {
      reportIds.forEach((id) => {
        if (!detailsResult.detailsById[id]) {
          issues.push({ issue: 'missing_details_row', damageId: id });
        }
      });
      detailsIds.forEach((id) => {
        if (!reportIdSet.has(id)) {
          issues.push({ issue: 'details_row_unmatched', damageId: id });
        }
      });
    }
    if (detailsResult.error) {
      issues.push({ issue: 'details_file_error', damageId: '', detail: detailsResult.error });
    }

    return {
      reportCount: reportMap.size,
      missingByType,
      missingSample,
      detailsFileName: detailsResult.sourceFileName,
      detailsMatched: detailsResult.sourceFileName ? detailsMatched : undefined,
      detailsMissing: detailsResult.sourceFileName ? detailsMissing : undefined,
      detailsUnmatched: detailsResult.sourceFileName ? detailsUnmatched : undefined,
      detailsError: detailsResult.error,
      issues
    };
  };

  const summarizeFiles = (files: FileList) => {
    let images = 0;
    let details = 0;
    let other = 0;
    for (const file of Array.from(files)) {
      const name = file.name.toLowerCase();
      if (file.type.startsWith('image/')) images++;
      else if (name.endsWith('.csv') || name.endsWith('.xlsx') || name.endsWith('.xls')) details++;
      else other++;
    }
    setSummary({ total: files.length, images, details, other });
  };

  useEffect(() => {
    if (!pendingFiles) {
      setPreflight(null);
      setDetailsHeaders([]);
      setDetailsFileName(undefined);
      setMapping({});
      setIssuesCsv(null);
      return;
    }
    let cancelled = false;
    const run = async () => {
      setIsPreflighting(true);
      try {
        const headersResult = await getDetailsFileHeaders(pendingFiles);
        if (!cancelled) {
          setDetailsHeaders(headersResult.headers);
          setDetailsFileName(headersResult.sourceFileName);
          if (headersResult.headers.length > 0 && Object.keys(mapping).length === 0) {
            let nextMapping = suggestColumnMapping(headersResult.headers);
            try {
              const raw = localStorage.getItem('dm_details_mapping');
              if (raw) {
                const stored = JSON.parse(raw) as DamageDetailsColumnMapping;
                nextMapping = { ...nextMapping, ...stored };
              }
            } catch {}
            setMapping(nextMapping);
          }
        }
        const result = await analyzeStructure(pendingFiles, mapping);
        if (!cancelled) {
          setPreflight(result);
          if (result.issues.length > 0) {
            const lines = [
              'issue,damageId,detail',
              ...result.issues.map((issue) => {
                const detail = issue.detail ? `"${String(issue.detail).replace(/"/g, '""')}"` : '';
                return `${issue.issue},${issue.damageId},${detail}`;
              })
            ];
            setIssuesCsv(lines.join('\n'));
          } else {
            setIssuesCsv(null);
          }
        }
      } catch (error) {
        console.error('Preflight failed:', error);
        if (!cancelled) {
          setPreflight(null);
          setIssuesCsv(null);
        }
      } finally {
        if (!cancelled) setIsPreflighting(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [pendingFiles, mapping]);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      summarizeFiles(files);
      setPendingFiles(files);
    }
  };

  return (
    <Card
      className={`p-6 border-2 border-dashed transition-smooth bg-gradient-card shadow-card ${
        isDragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
      }`}
      onDragOver={(event) => {
        event.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={async (event) => {
        event.preventDefault();
        setIsDragging(false);
        const files = event.dataTransfer?.files;
        if (files && files.length > 0) {
          summarizeFiles(files);
          setPendingFiles(files);
        }
      }}
    >
      <div className="text-center space-y-4">
        <div className="flex justify-center">
          <div className="w-16 h-16 bg-gradient-header rounded-full flex items-center justify-center">
            <FolderOpen className="w-8 h-8 text-primary-foreground" />
          </div>
        </div>
        
        <div className="space-y-2">
          <h3 className="text-lg font-semibold">Upload Damage Report Folders</h3>
          <p className="text-muted-foreground text-sm">
            Select the main folder containing damage reports with the expected structure:<br />
            <code className="text-xs bg-muted px-1 py-0.5 rounded">
              [Main Folder] / [Damage ID] / [Photo Type] / [Images]
            </code>
            <br />
            Optional: include a CSV/XLSX in the main folder with columns like
            <code className="text-xs bg-muted px-1 py-0.5 rounded ml-1">
              damageId, damageType, treatment, dimensions, costAUD
            </code>
          </p>
        </div>

        <Button 
          onClick={handleFileSelect}
          disabled={isProcessing}
          variant="professional"
          size="lg"
          className="w-full max-w-xs"
        >
          {isProcessing ? (
            <>
              <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <Upload className="w-4 h-4" />
              Select Folder
            </>
          )}
        </Button>
        <div className="text-xs text-muted-foreground">
          or drag and drop a folder here
        </div>

        {summary && (
          <div className="rounded-md border bg-muted/40 p-2 text-xs text-muted-foreground">
            <div className="flex items-center justify-center gap-2">
              <span>{summary.total} files</span>
              <span>•</span>
              <span>{summary.images} images</span>
              <span>•</span>
              <span>{summary.details} detail files</span>
              {summary.other > 0 && (
                <>
                  <span>•</span>
                  <span>{summary.other} other</span>
                </>
              )}
            </div>
          </div>
        )}
        {isPreflighting && (
          <div className="text-xs text-muted-foreground">Analyzing folder structure...</div>
        )}
        {detailsHeaders.length > 0 && (
          <div className="rounded-md border bg-muted/30 p-2 text-xs text-muted-foreground text-left">
            <div className="text-xs font-medium text-muted-foreground mb-2">
              Column mapping ({detailsFileName})
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <div className="text-muted-foreground mb-1">Damage ID (required)</div>
                <Select
                  value={mapping.damageId || ''}
                  onValueChange={(value) => setMapping((prev) => ({ ...prev, damageId: value || undefined }))}
                >
                  <SelectTrigger className="h-8">
                    <SelectValue placeholder="Select column" />
                  </SelectTrigger>
                  <SelectContent className="z-[1300] bg-background" position="popper">
                    <SelectItem value="">Not mapped</SelectItem>
                    {detailsHeaders.map((header) => (
                      <SelectItem key={`damageId-${header}`} value={header}>{header}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <div className="text-muted-foreground mb-1">Damage Type</div>
                <Select
                  value={mapping.damageType || ''}
                  onValueChange={(value) => setMapping((prev) => ({ ...prev, damageType: value || undefined }))}
                >
                  <SelectTrigger className="h-8">
                    <SelectValue placeholder="Select column" />
                  </SelectTrigger>
                  <SelectContent className="z-[1300] bg-background" position="popper">
                    <SelectItem value="">Not mapped</SelectItem>
                    {detailsHeaders.map((header) => (
                      <SelectItem key={`damageType-${header}`} value={header}>{header}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <div className="text-muted-foreground mb-1">Treatment</div>
                <Select
                  value={mapping.treatment || ''}
                  onValueChange={(value) => setMapping((prev) => ({ ...prev, treatment: value || undefined }))}
                >
                  <SelectTrigger className="h-8">
                    <SelectValue placeholder="Select column" />
                  </SelectTrigger>
                  <SelectContent className="z-[1300] bg-background" position="popper">
                    <SelectItem value="">Not mapped</SelectItem>
                    {detailsHeaders.map((header) => (
                      <SelectItem key={`treatment-${header}`} value={header}>{header}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <div className="text-muted-foreground mb-1">Dimensions</div>
                <Select
                  value={mapping.dimensions || ''}
                  onValueChange={(value) => setMapping((prev) => ({ ...prev, dimensions: value || undefined }))}
                >
                  <SelectTrigger className="h-8">
                    <SelectValue placeholder="Select column" />
                  </SelectTrigger>
                  <SelectContent className="z-[1300] bg-background" position="popper">
                    <SelectItem value="">Not mapped</SelectItem>
                    {detailsHeaders.map((header) => (
                      <SelectItem key={`dimensions-${header}`} value={header}>{header}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <div className="text-muted-foreground mb-1">Cost (AUD)</div>
                <Select
                  value={mapping.costAUD || ''}
                  onValueChange={(value) => setMapping((prev) => ({ ...prev, costAUD: value || undefined }))}
                >
                  <SelectTrigger className="h-8">
                    <SelectValue placeholder="Select column" />
                  </SelectTrigger>
                  <SelectContent className="z-[1300] bg-background" position="popper">
                    <SelectItem value="">Not mapped</SelectItem>
                    {detailsHeaders.map((header) => (
                      <SelectItem key={`cost-${header}`} value={header}>{header}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        )}
        {preflight && (
          <div className="rounded-md border bg-muted/30 p-2 text-xs text-muted-foreground text-left">
            <div className="flex flex-wrap gap-2">
              <span>Reports found: <span className="font-medium text-foreground">{preflight.reportCount}</span></span>
              <span>Missing damage: <span className="font-medium text-foreground">{preflight.missingByType.damage}</span></span>
              <span>Missing precondition: <span className="font-medium text-foreground">{preflight.missingByType.precondition}</span></span>
              <span>Missing completion: <span className="font-medium text-foreground">{preflight.missingByType.completion}</span></span>
            </div>
            {preflight.missingSample.length > 0 && (
              <div className="mt-1">
                Example missing: {preflight.missingSample.join(', ')}
              </div>
            )}
            {preflight.detailsFileName && (
              <div className="mt-1">
                Details file: <span className="font-medium text-foreground">{preflight.detailsFileName}</span> | Matched: <span className="font-medium text-foreground">{preflight.detailsMatched}</span> | Missing: <span className="font-medium text-foreground">{preflight.detailsMissing}</span> | Unmatched: <span className="font-medium text-foreground">{preflight.detailsUnmatched}</span>
              </div>
            )}
            {preflight.detailsError && (
              <div className="mt-1 text-red-600">
                Details file error: {preflight.detailsError}
              </div>
            )}
            {issuesCsv && (
              <div className="mt-2">
                <Button variant="secondary" size="sm" onClick={() => {
                  const blob = new Blob([issuesCsv], { type: 'text/csv' });
                  const url = URL.createObjectURL(blob);
                  const anchor = document.createElement('a');
                  anchor.href = url;
                  anchor.download = 'damage_report_issues.csv';
                  anchor.click();
                  URL.revokeObjectURL(url);
                }}>
                  Download Issues List
                </Button>
              </div>
            )}
          </div>
        )}
        {pendingFiles && (
          <div className="flex items-center justify-center gap-2">
            <Button
              variant="professional"
              size="lg"
              className="w-full max-w-xs"
              disabled={isProcessing || isPreflighting}
              onClick={() => {
                if (!pendingFiles) return;
                onFilesSelected(pendingFiles, mapping);
                setPendingFiles(null);
                toast.success(`Processing ${pendingFiles.length} files (${Array.from(pendingFiles).filter(f => f.type.startsWith('image/')).length} images).`);
              }}
            >
              {isProcessing ? (
                <>
                  <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  Process Files
                </>
              )}
            </Button>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          {...({ webkitdirectory: "" } as any)}
          multiple
          onChange={handleFileChange}
          className="hidden"
          accept="image/*,.csv,.xlsx,.xls"
        />
      </div>
      <div className="text-center mt-4">
        <Link to="/how-to" className="text-sm text-primary underline">
          How to Use this app
        </Link>
      </div>
    </Card>
  );
};
