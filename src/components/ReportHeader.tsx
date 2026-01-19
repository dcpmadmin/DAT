import { Search, ChevronLeft, ChevronRight, Map, ArrowLeft, FileSpreadsheet, HelpCircle, Upload, Download } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { PhotoSet, GalleryType } from '@/types/damage-report';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useRef } from 'react';

interface ReportHeaderProps {
  photoSets: PhotoSet[];
  currentSetIndex: number;
  searchTerm: string;
  onSearchChange: (term: string) => void;
  onPreviousReport: () => void;
  onNextReport: () => void;
  onToggleGallery: (gallery: GalleryType, visible: boolean) => void;
  galleryVisibility: Record<GalleryType, boolean>;
  onToggleMap: () => void;
  onReset: () => void;
  onToggleReportGenerator: () => void;
  showReportGenerator: boolean;
  statusFilter: 'all' | 'approved' | 'rejected' | 'query' | 'pending';
  filteredCount: number;
  filteredPosition: number;
  onStatusFilterChange: (value: 'all' | 'approved' | 'rejected' | 'query' | 'pending') => void;
  onExportSession: () => void;
  onImportSession: (file: File) => void;
  showInternalControls?: boolean;
}

export const ReportHeader = ({
  photoSets,
  currentSetIndex,
  searchTerm,
  onSearchChange,
  onPreviousReport,
  onNextReport,
  onToggleGallery,
  galleryVisibility,
  onToggleMap,
  onReset,
  onToggleReportGenerator,
  showReportGenerator,
  statusFilter,
  filteredCount,
  filteredPosition,
  onStatusFilterChange,
  onExportSession,
  onImportSession,
  showInternalControls = true
}: ReportHeaderProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const currentSet = photoSets[currentSetIndex];
  const isMissingDetails = currentSet ? !currentSet.damageDetails : false;
  const isMissingDamagePhotos = currentSet ? currentSet.damagePhotos.length === 0 : false;

  return (
    <Card className="bg-gradient-header text-primary-foreground shadow-card">
      <div className="flex flex-col gap-2">
        {/* Top row: Title and controls */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={onReset}
              className="text-primary-foreground hover:bg-primary-foreground/20"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Upload
            </Button>
            <div className="flex items-center">
              <img src="/dcpm-logo.png" alt="DCPM" className="h-6 w-auto" />
            </div>
            <h1 className="text-lg font-bold">Damage Assessor Tool</h1>
          </div>
          
          <div className="flex gap-2">
            <Link to="/how-to" className="inline-flex">
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="text-primary-foreground hover:bg-primary-foreground/20"
              >
                <span className="inline-flex items-center"><HelpCircle className="w-4 h-4 mr-2" /> How to Use</span>
              </Button>
            </Link>
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggleMap}
              className="text-primary-foreground hover:bg-primary-foreground/20"
              title="Open map window"
            >
              <Map className="w-4 h-4 mr-2" />
              Map
            </Button>

            {showInternalControls && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-primary-foreground hover:bg-primary-foreground/20"
                  title="Import assessment session JSON"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Import
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onExportSession}
                  className="text-primary-foreground hover:bg-primary-foreground/20"
                  title="Export assessment session JSON"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Export
                </Button>
                
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onToggleReportGenerator}
                  className={`text-primary-foreground hover:bg-primary-foreground/20 ${showReportGenerator ? 'bg-primary-foreground/20' : ''}`}
                >
                  <FileSpreadsheet className="w-4 h-4 mr-2" />
                  {showReportGenerator ? 'Hide Report' : 'Generate Report'}
                </Button>
              </>
            )}
          </div>
        </div>
        {showInternalControls && (
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onImportSession(file);
              event.currentTarget.value = '';
            }}
          />
        )}

        {/* Middle row: Search and navigation */}
        <div className="flex items-center gap-2">
          <div className="flex-1 max-w-md relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search damage reports..."
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-10 bg-primary-foreground/10 border-primary-foreground/30 text-primary-foreground placeholder:text-primary-foreground/70"
            />
          </div>

          {currentSet && (
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={onPreviousReport}
                disabled={filteredPosition <= 0}
                className="text-primary-foreground hover:bg-primary-foreground/20 disabled:opacity-50"
              >
                <ChevronLeft className="w-4 h-4" />
                Previous
              </Button>
              
              <span className="text-sm font-medium px-3 py-1 bg-primary-foreground/20 rounded">
                {(filteredPosition >= 0 ? filteredPosition + 1 : 0)} of {filteredCount}
              </span>
              
              <Button
                variant="ghost"
                size="sm"
                onClick={onNextReport}
                disabled={filteredPosition === -1 || filteredPosition >= filteredCount - 1}
                className="text-primary-foreground hover:bg-primary-foreground/20 disabled:opacity-50"
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          )}

          {showInternalControls && (
            <div className="ml-auto flex items-center gap-2">
              <span className="text-sm text-primary-foreground/80">Filter status:</span>
              <Select value={statusFilter} onValueChange={onStatusFilterChange}>
                <SelectTrigger className="h-8 w-36 bg-primary-foreground/10 border-primary-foreground/30 text-primary-foreground">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="z-[1300] bg-background" position="popper">
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="query">Queried</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {/* Bottom row: Current report info and gallery toggles */}
        {currentSet && (
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h2 className="text-base font-semibold">Report: {currentSet.damageId}</h2>
              <div className="text-sm text-primary-foreground/80 flex gap-4">
                <span>Damage: {currentSet.damagePhotos.length} photos</span>
                <span>Precondition: {currentSet.preconditionPhotos.length} photos</span>
                <span>Completion: {currentSet.completionPhotos.length} photos</span>
              </div>
              <div className="text-xs text-primary-foreground/80 flex gap-2 flex-wrap">
                {isMissingDetails && <span className="px-2 py-0.5 rounded bg-yellow-500/20">Missing details</span>}
                {isMissingDamagePhotos && <span className="px-2 py-0.5 rounded bg-yellow-500/20">No damage photos</span>}
              </div>
              {currentSet.damageDetails && (
                <div className="text-xs text-primary-foreground/80">
                  Details: {currentSet.damageDetails.damageType || 'N/A'} | {currentSet.damageDetails.treatment || 'N/A'} | {currentSet.damageDetails.dimensions || 'N/A'} | {currentSet.damageDetails.costAUD != null ? `AUD ${currentSet.damageDetails.costAUD.toFixed(2)}` : 'N/A'}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Gallery View:</span>
              {(['precondition', 'damage', 'completion'] as GalleryType[]).map((gallery) => (
                <div key={gallery} className="flex items-center gap-2">
                  <Checkbox
                    id={`gallery-${gallery}`}
                    checked={galleryVisibility[gallery]}
                    onCheckedChange={(checked) => onToggleGallery(gallery, checked as boolean)}
                    className="border-primary-foreground/30 data-[state=checked]:bg-primary-foreground data-[state=checked]:text-primary"
                  />
                  <label 
                    htmlFor={`gallery-${gallery}`}
                    className="text-sm capitalize cursor-pointer"
                  >
                    {gallery}
                  </label>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
};
