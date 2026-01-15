import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { ReportUploader } from './ReportUploader';
import { DashboardHome } from './DashboardHome';
import { ReportHeader } from './ReportHeader';
import { PhotoGallery } from './PhotoGallery';
import { DamageMap } from './DamageMap';
import type { DamageMapHandle } from './DamageMap';
import { ReportGenerator } from './ReportGenerator';
import { ApprovalControls } from './ApprovalControls';
import { PhotoSet, GalleryType, DamageReportState, PhotoMetadata, PhotoSetApproval } from '@/types/damage-report';
import { processFolderStructure } from '@/utils/photo-processing';
import { parseDamageDetailsFile, DamageDetailsColumnMapping } from '@/utils/damage-details';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Ruler, Satellite, MousePointer2 } from 'lucide-react';

declare global {
  interface Window {
    electron: {
      ipcRenderer: {
        send: (channel: string, data: any) => void;
        on: (channel: string, func: (...args: any[]) => void) => () => void;
      };
    };
  }
}

interface ReportMetrics {
  distanceMeters?: number;
  costAUD?: number;
}

interface DamageReportViewerProps {
  mode?: 'internal' | 'guest';
}

export const DamageReportViewer = ({ mode = 'internal' }: DamageReportViewerProps) => {
  const [state, setState] = useState<DamageReportState>({
    photoSets: [],
    currentSetIndex: 0,
    selectedPhotos: {},
    galleries: {
      precondition: { visible: true, rotation: 0, zoom: 1, panX: 0, panY: 0, candidatePhotos: [] },
      damage: { visible: true, rotation: 0, zoom: 1, panX: 0, panY: 0, candidatePhotos: [] },
      completion: { visible: true, rotation: 0, zoom: 1, panX: 0, panY: 0, candidatePhotos: [] }
    },
    searchTerm: '',
    approvals: {}
  });
const [isProcessing, setIsProcessing] = useState(false);
  const [showReportGenerator, setShowReportGenerator] = useState(false);
  const [editorMode, setEditorMode] = useState(false);
  const [metricsById, setMetricsById] = useState<Record<string, ReportMetrics>>({});
  const [lastMeasuredDistance, setLastMeasuredDistance] = useState<number | null>(null);
  const [showOverview, setShowOverview] = useState(true);
  const mapWindowRef = useRef<Window | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'approved' | 'rejected' | 'query' | 'pending'>('all');
  const [detailsSummary, setDetailsSummary] = useState<{
    sourceFileName: string;
    matchedCount: number;
    missingInCsv: string[];
    unmatchedInCsv: string[];
  } | null>(null);
  const [resumePromptOpen, setResumePromptOpen] = useState(false);
  const [resumeCandidate, setResumeCandidate] = useState<{
    approvals: Record<string, PhotoSetApproval>;
    metricsById: Record<string, ReportMetrics>;
    overlapCount: number;
  } | null>(null);

  const currentSet = state.photoSets[state.currentSetIndex];
  const isGuest = mode === 'guest';
  const filteredIndices = useMemo(() => {
    return state.photoSets.reduce<number[]>((acc, ps, index) => {
      const status = state.approvals[ps.damageId]?.status ?? 'pending';
      const matchesStatus = statusFilter === 'all' ? true : status === statusFilter;
      const matchesSearch = ps.damageId.toLowerCase().includes(state.searchTerm.toLowerCase());
      if (matchesStatus && matchesSearch) acc.push(index);
      return acc;
    }, []);
  }, [state.photoSets, state.approvals, statusFilter, state.searchTerm]);
  const filteredPosition = filteredIndices.indexOf(state.currentSetIndex);

  useEffect(() => {
    const saved = localStorage.getItem('dm_editor_mode');
    if (saved === '1') setEditorMode(true);
  }, []);

  useEffect(() => {
    localStorage.setItem('dm_editor_mode', editorMode ? '1' : '0');
  }, [editorMode]);

  const handleFilesSelected = useCallback(async (files: FileList, mapping?: DamageDetailsColumnMapping) => {
    setIsProcessing(true);
    try {
      const detailsResult = await parseDamageDetailsFile(files, mapping);
      if (detailsResult.error) {
        toast.error(`Damage details file error: ${detailsResult.error}`);
      } else if (detailsResult.sourceFileName) {
        toast.success(`Loaded damage details from ${detailsResult.sourceFileName}`);
      }
      if (mapping) {
        try { localStorage.setItem('dm_details_mapping', JSON.stringify(mapping)); } catch {}
      }

      const photoSets = await processFolderStructure(files);
      const photoSetsWithDetails = photoSets.map((photoSet) => ({
        ...photoSet,
        damageDetails: detailsResult.detailsById[photoSet.damageId]
      }));

      if (detailsResult.sourceFileName) {
        const detailIds = Object.keys(detailsResult.detailsById);
        const photoIdSet = new Set(photoSets.map((ps) => ps.damageId));
        const missingInCsv = photoSets
          .filter((ps) => !detailsResult.detailsById[ps.damageId])
          .map((ps) => ps.damageId);
        const unmatchedInCsv = detailIds.filter((id) => !photoIdSet.has(id));
        const matchedCount = photoSets.length - missingInCsv.length;
        setDetailsSummary({
          sourceFileName: detailsResult.sourceFileName,
          matchedCount,
          missingInCsv,
          unmatchedInCsv
        });
      } else {
        setDetailsSummary(null);
      }
      
      if (photoSetsWithDetails.length === 0) {
        toast.error('No valid damage reports found in the uploaded folder structure.');
        return;
      }

      // Initialize galleries with first photo set
      const firstSet = photoSetsWithDetails[0];
      const newState: DamageReportState = {
        photoSets: photoSetsWithDetails,
        currentSetIndex: 0,
        selectedPhotos: {
          precondition: firstSet.preconditionPhotos[0],
          damage: firstSet.damagePhotos[0],
          completion: firstSet.completionPhotos[0]
        },
        galleries: {
          precondition: { 
            visible: true, 
            rotation: 0, 
            zoom: 1, 
            panX: 0, 
            panY: 0, 
            candidatePhotos: firstSet.preconditionPhotos,
            selectedPhoto: firstSet.preconditionPhotos[0]
          },
          damage: { 
            visible: true, 
            rotation: 0, 
            zoom: 1, 
            panX: 0, 
            panY: 0, 
            candidatePhotos: firstSet.damagePhotos,
            selectedPhoto: firstSet.damagePhotos[0]
          },
          completion: { 
            visible: true, 
            rotation: 0, 
            zoom: 1, 
            panX: 0, 
            panY: 0, 
            candidatePhotos: firstSet.completionPhotos,
            selectedPhoto: firstSet.completionPhotos[0]
          }
        },
        searchTerm: '',
        approvals: {}
      };

      setState(newState);
      toast.success(`Successfully processed ${photoSetsWithDetails.length} damage reports!`);

      try {
        const raw = localStorage.getItem('dm_session');
        if (raw) {
          const parsed = JSON.parse(raw) as { approvals?: Record<string, PhotoSetApproval>; metricsById?: Record<string, ReportMetrics> };
          const damageIdSet = new Set(photoSetsWithDetails.map((ps) => ps.damageId));
          const approvals = Object.fromEntries(
            Object.entries(parsed.approvals || {}).filter(([id]) => damageIdSet.has(id)).map(([id, approval]) => [
              id,
              { ...approval, timestamp: approval?.timestamp ? new Date(approval.timestamp as any) : new Date() }
            ])
          );
          const metricsById = Object.fromEntries(
            Object.entries(parsed.metricsById || {}).filter(([id]) => damageIdSet.has(id))
          );
          const overlapCount = Object.keys(approvals).length + Object.keys(metricsById).length;
          if (overlapCount > 0) {
            setResumeCandidate({ approvals, metricsById, overlapCount });
            setResumePromptOpen(true);
          }
        }
      } catch {}
    } catch (error) {
      console.error('Error processing files:', error);
      toast.error('Failed to process uploaded files. Please check the folder structure.');
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const updateCurrentSet = useCallback((setIndex: number) => {
    if (setIndex < 0 || setIndex >= state.photoSets.length) return;

    const currentSet = state.photoSets[setIndex];
    setState(prev => ({
      ...prev,
      currentSetIndex: setIndex,
      selectedPhotos: {
        precondition: currentSet.preconditionPhotos[0],
        damage: currentSet.damagePhotos[0],
        completion: currentSet.completionPhotos[0]
      },
      galleries: {
        precondition: { 
          ...prev.galleries.precondition,
          candidatePhotos: currentSet.preconditionPhotos,
          selectedPhoto: currentSet.preconditionPhotos[0],
          rotation: 0,
          zoom: 1,
          panX: 0,
          panY: 0
        },
        damage: { 
          ...prev.galleries.damage,
          candidatePhotos: currentSet.damagePhotos,
          selectedPhoto: currentSet.damagePhotos[0],
          rotation: 0,
          zoom: 1,
          panX: 0,
          panY: 0
        },
        completion: { 
          ...prev.galleries.completion,
          candidatePhotos: currentSet.completionPhotos,
          selectedPhoto: currentSet.completionPhotos[0],
          rotation: 0,
          zoom: 1,
          panX: 0,
          panY: 0
        }
      }
    }));
  }, [state.photoSets]);

  const handleSearchChange = useCallback((term: string) => {
    setState(prev => ({ ...prev, searchTerm: term }));
  }, []);

  const handlePreviousReport = useCallback(() => {
    if (filteredIndices.length === 0) return;
    const currentPos = filteredIndices.indexOf(state.currentSetIndex);
    if (currentPos <= 0) return;
    updateCurrentSet(filteredIndices[currentPos - 1]);
  }, [filteredIndices, state.currentSetIndex, updateCurrentSet]);

  const handleNextReport = useCallback(() => {
    if (filteredIndices.length === 0) return;
    const currentPos = filteredIndices.indexOf(state.currentSetIndex);
    if (currentPos === -1 || currentPos >= filteredIndices.length - 1) return;
    updateCurrentSet(filteredIndices[currentPos + 1]);
  }, [filteredIndices, state.currentSetIndex, updateCurrentSet]);

  const handleToggleGallery = useCallback((gallery: GalleryType, visible: boolean) => {
    setState(prev => ({
      ...prev,
      galleries: {
        ...prev.galleries,
        [gallery]: { ...prev.galleries[gallery], visible }
      }
    }));
  }, []);

  const buildMapPayload = useCallback((set: PhotoSet) => {
    return {
      damageId: set.damageId,
      damagePhotos: set.damagePhotos.map(p => ({
        name: p.name,
        url: '',
        location: p.location,
        orientation: p.orientation,
        timestamp: p.timestamp
      })),
      preconditionPhotos: set.preconditionPhotos.map(p => ({
        name: p.name,
        url: '',
        location: p.location,
        orientation: p.orientation,
        timestamp: p.timestamp
      })),
      completionPhotos: set.completionPhotos.map(p => ({
        name: p.name,
        url: '',
        location: p.location,
        orientation: p.orientation,
        timestamp: p.timestamp
      })),
      referenceLocation: set.referenceLocation
    };
  }, []);

  const handleToggleMap = useCallback(() => {
    if (!currentSet) {
      toast.error("Please upload photos first.");
      return;
    }
    if (window.electron?.ipcRenderer) {
      try {
        window.electron.ipcRenderer.send('open-damage-map-window', { photoSet: currentSet });
      } catch (error) {
        console.warn('Failed to open map in separate window:', error);
      }
      return;
    }
    try {
      const mapPayload = buildMapPayload(currentSet);
      localStorage.setItem('dm_map_photoSet', JSON.stringify(mapPayload));
      localStorage.setItem('dm_map_photoSet_updatedAt', new Date().toISOString());
      const width = Math.min(1200, window.innerWidth - 40);
      const height = Math.min(800, window.innerHeight - 40);
      const left = Math.max(20, Math.round((window.innerWidth - width) / 2));
      const top = Math.max(20, Math.round((window.innerHeight - height) / 2));
      const features = `popup=yes,width=${width},height=${height},left=${left},top=${top}`;
      if (mapWindowRef.current && !mapWindowRef.current.closed) {
        mapWindowRef.current.focus();
      } else {
        mapWindowRef.current = window.open('/map.html', 'damage-map', features);
      }
    } catch (error) {
      console.error('Failed to open map tab:', error);
      toast.error('Failed to open map in a new tab.');
    }
  }, [currentSet, buildMapPayload]);

  const handlePhotoSelect = useCallback((gallery: GalleryType, photo: PhotoMetadata) => {
    setState(prev => ({
      ...prev,
      galleries: {
        ...prev.galleries,
        [gallery]: { ...prev.galleries[gallery], selectedPhoto: photo }
      },
      selectedPhotos: {
        ...prev.selectedPhotos,
        [gallery]: photo
      }
    }));
    // Send message to map window to highlight this photo
    if (window.electron?.ipcRenderer) {
      window.electron.ipcRenderer.send('highlight-photo-on-map', photo.name);
    }
  }, []);

  const handleRotate = useCallback((gallery: GalleryType) => {
    setState(prev => ({
      ...prev,
      galleries: {
        ...prev.galleries,
        [gallery]: { 
          ...prev.galleries[gallery], 
          rotation: (prev.galleries[gallery].rotation + 90) % 360,
          panX: 0,
          panY: 0
        }
      }
    }));
  }, []);

  const handleZoomToggle = useCallback((gallery: GalleryType) => {
    setState(prev => ({
      ...prev,
      galleries: {
        ...prev.galleries,
        [gallery]: { 
          ...prev.galleries[gallery], 
          zoom: prev.galleries[gallery].zoom > 1 ? 1 : 2,
          panX: 0,
          panY: 0
        }
      }
    }));
  }, []);

  const handlePan = useCallback((gallery: GalleryType, deltaX: number, deltaY: number) => {
    setState(prev => ({
      ...prev,
      galleries: {
        ...prev.galleries,
        [gallery]: { 
          ...prev.galleries[gallery], 
          panX: deltaX,
          panY: deltaY
        }
      }
    }));
  }, []);

  const handleReset = useCallback(() => {
    setState({
      photoSets: [],
      currentSetIndex: 0,
      selectedPhotos: {},
      galleries: {
        precondition: { visible: true, rotation: 0, zoom: 1, panX: 0, panY: 0, candidatePhotos: [] },
        damage: { visible: true, rotation: 0, zoom: 1, panX: 0, panY: 0, candidatePhotos: [] },
        completion: { visible: true, rotation: 0, zoom: 1, panX: 0, panY: 0, candidatePhotos: [] }
      },
      searchTerm: '',
      approvals: {}
    });
    setMetricsById({});
    setStatusFilter('all');
    setDetailsSummary(null);
    setShowOverview(true);
  }, []);

  const handleApprovalChange = useCallback((damageId: string, approval: PhotoSetApproval) => {
    setState(prev => {
      const prevStatus = prev.approvals[damageId]?.status;
      const nextState = {
        ...prev,
        approvals: {
          ...prev.approvals,
          [damageId]: approval
        }
      };
      if (prevStatus !== approval.status) {
        const statusText = approval.status === 'approved' ? 'Approved' : 
                          approval.status === 'rejected' ? 'Rejected' : 'Queried';
        toast.success(`Assessment updated: ${statusText} for ${damageId}`);
      }
      return nextState;
    });
    
    // Force a re-render to ensure UI updates
    setTimeout(() => {
      setState(prev => ({ ...prev }));
    }, 100);
  }, []);

  const handleMetricsChange = useCallback((damageId: string, metrics: ReportMetrics) => {
    setMetricsById(prev => ({ ...prev, [damageId]: metrics }));
    try { localStorage.setItem(`dm_metrics_${damageId}`, JSON.stringify(metrics)); } catch {}
  }, []);

  const handleDistanceChange = useCallback((distance: number) => { setLastMeasuredDistance(distance); }, []);

  useEffect(() => {
    if (!currentSet) return;
    try {
      const raw = localStorage.getItem(`dm_metrics_${currentSet.damageId}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        setMetricsById(prev => ({ ...prev, [currentSet.damageId]: parsed }));
      }
    } catch {}
  }, [currentSet?.damageId]);

  useEffect(() => {
    if (state.photoSets.length === 0) return;
    try {
      localStorage.setItem('dm_session', JSON.stringify({
        approvals: state.approvals,
        metricsById,
        savedAt: new Date().toISOString()
      }));
    } catch {}
  }, [state.photoSets.length, state.approvals, metricsById]);

  useEffect(() => {
    if (filteredIndices.length === 0) return;
    if (!filteredIndices.includes(state.currentSetIndex)) {
      updateCurrentSet(filteredIndices[0]);
    }
  }, [filteredIndices, state.currentSetIndex, updateCurrentSet]);

  useEffect(() => {
    if (!currentSet) return;
    if (window.electron?.ipcRenderer) {
      window.electron.ipcRenderer.send('open-damage-map-window', { photoSet: currentSet });
      return;
    }
    if (mapWindowRef.current && !mapWindowRef.current.closed) {
      const mapPayload = buildMapPayload(currentSet);
      try {
        localStorage.setItem('dm_map_photoSet', JSON.stringify(mapPayload));
        localStorage.setItem('dm_map_photoSet_updatedAt', new Date().toISOString());
      } catch {}
    }
  }, [currentSet, buildMapPayload]);

  const handleExportSession = useCallback(() => {
    const payload = {
      approvals: state.approvals,
      metricsById,
      exportedAt: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `damage_assessment_session_${new Date().toISOString().split('T')[0]}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast.success('Session exported.');
  }, [state.approvals, metricsById]);

  const handleImportSession = useCallback(async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const rawApprovals = parsed.approvals || {};
      const approvals = Object.fromEntries(
        Object.entries(rawApprovals).map(([key, value]) => {
          const approval = value as any;
          return [key, { ...approval, timestamp: approval?.timestamp ? new Date(approval.timestamp) : new Date() }];
        })
      );
      setState((prev) => ({ ...prev, approvals }));
      setMetricsById(parsed.metricsById || {});
      toast.success('Session imported.');
    } catch (error) {
      console.error('Failed to import session:', error);
      toast.error('Failed to import session file.');
    }
  }, []);

  const handleResumeApply = useCallback(() => {
    if (!resumeCandidate) return;
    setState(prev => ({
      ...prev,
      approvals: { ...prev.approvals, ...resumeCandidate.approvals }
    }));
    setMetricsById(prev => ({ ...prev, ...resumeCandidate.metricsById }));
    setResumePromptOpen(false);
    setResumeCandidate(null);
    toast.success('Previous session data applied.');
  }, [resumeCandidate]);

  const handleResumeSkip = useCallback(() => {
    setResumePromptOpen(false);
    setResumeCandidate(null);
  }, []);
  const galleryVisibility = {
    precondition: state.galleries.precondition.visible,
    damage: state.galleries.damage.visible,
    completion: state.galleries.completion.visible
  };

  const visibleGalleries = Object.values(galleryVisibility).filter(Boolean).length;
  const folderSummary = currentSet ? {
    totalPhotos: currentSet.preconditionPhotos.length + currentSet.damagePhotos.length + currentSet.completionPhotos.length,
    gpsPhotos: [...currentSet.preconditionPhotos, ...currentSet.damagePhotos, ...currentSet.completionPhotos].filter(p => p.location).length,
    damagePhotos: currentSet.damagePhotos.length,
    preconditionPhotos: currentSet.preconditionPhotos.length,
    completionPhotos: currentSet.completionPhotos.length
  } : undefined;
  const evidenceSummary = currentSet ? {
    hasDamage: currentSet.damagePhotos.length > 0,
    hasPrecondition: currentSet.preconditionPhotos.length > 0,
    hasCompletion: currentSet.completionPhotos.length > 0,
    hasGPS: [...currentSet.preconditionPhotos, ...currentSet.damagePhotos, ...currentSet.completionPhotos].some(p => p.location)
  } : undefined;
  const photoSummaries = currentSet ? [
    ...currentSet.preconditionPhotos.map((p) => ({
      name: p.name,
      type: 'precondition' as const,
      timestamp: p.timestamp,
      coordinates: p.location ? `${p.location.latitude.toFixed(6)}, ${p.location.longitude.toFixed(6)}` : undefined
    })),
    ...currentSet.damagePhotos.map((p) => ({
      name: p.name,
      type: 'damage' as const,
      timestamp: p.timestamp,
      coordinates: p.location ? `${p.location.latitude.toFixed(6)}, ${p.location.longitude.toFixed(6)}` : undefined
    })),
    ...currentSet.completionPhotos.map((p) => ({
      name: p.name,
      type: 'completion' as const,
      timestamp: p.timestamp,
      coordinates: p.location ? `${p.location.latitude.toFixed(6)}, ${p.location.longitude.toFixed(6)}` : undefined
    }))
  ].sort((a, b) => {
    const aTime = a.timestamp ? new Date(a.timestamp).getTime() : 0;
    const bTime = b.timestamp ? new Date(b.timestamp).getTime() : 0;
    return aTime - bTime;
  }) : undefined;
  const summary = useMemo(() => {
    const approvals = Object.values(state.approvals);
    const approved = approvals.filter((a) => a.status === 'approved').length;
    const queried = approvals.filter((a) => a.status === 'query').length;
    const rejected = approvals.filter((a) => a.status === 'rejected').length;
    const pending = state.photoSets.length - approved - queried - rejected;
    const detailsMatched = detailsSummary ? detailsSummary.matchedCount : 0;
    return {
      totalReports: state.photoSets.length,
      approved,
      queried,
      rejected,
      pending: pending < 0 ? 0 : pending,
      detailsMatched
    };
  }, [state.photoSets.length, state.approvals, detailsSummary]);

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-[1800px] px-4">
        {/* Upload Section or Header */}
        {state.photoSets.length === 0 ? (
          <div className="space-y-6">
            <DashboardHome summary={summary} />
            <div className="flex items-center justify-center min-h-[40vh]">
              <div className="w-full max-w-2xl">
                <ReportUploader 
                  onFilesSelected={handleFilesSelected} 
                  isProcessing={isProcessing} 
                />
              </div>
            </div>
          </div>
        ) : (
          <>
            <ReportHeader
              photoSets={state.photoSets}
              currentSetIndex={state.currentSetIndex}
              searchTerm={state.searchTerm}
              onSearchChange={handleSearchChange}
              onPreviousReport={handlePreviousReport}
              onNextReport={handleNextReport}
              onToggleGallery={handleToggleGallery}
              galleryVisibility={galleryVisibility}
              onToggleMap={handleToggleMap}
              onReset={handleReset}
              onToggleReportGenerator={() => setShowReportGenerator(!showReportGenerator)}
              showReportGenerator={showReportGenerator}
              statusFilter={statusFilter}
              filteredCount={filteredIndices.length}
              filteredPosition={filteredPosition}
              onStatusFilterChange={setStatusFilter}
              onExportSession={handleExportSession}
              onImportSession={handleImportSession}
              showInternalControls={!isGuest}
            />

            {/* Report Generator Modal */}
            {!isGuest && (
              <Dialog open={showReportGenerator} onOpenChange={setShowReportGenerator}>
                <DialogContent className="max-w-6xl sm:max-w-7xl z-[1200]">
                  <DialogHeader>
                    <DialogTitle>Assessment Report Generator</DialogTitle>
                  </DialogHeader>
                  <ReportGenerator photoSets={state.photoSets} approvals={state.approvals} />
                </DialogContent>
              </Dialog>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-[4fr_1fr] gap-4">
              <div className="space-y-4">
                {!isGuest && (
                  <div>
                    <div className="flex justify-end">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowOverview((prev) => !prev)}
                      >
                        {showOverview ? 'Hide Overview' : 'Show Overview'}
                      </Button>
                    </div>
                    {showOverview && (
                      <div className="mt-2">
                        <DashboardHome summary={summary} compact title="Session Overview" />
                      </div>
                    )}
                  </div>
                )}

                {/* Photo Galleries */}
                <div className={`grid gap-4 ${
                  visibleGalleries === 1 ? 'grid-cols-1' :
                  visibleGalleries === 2 ? 'grid-cols-2' : 
                  'grid-cols-3'
                }`} style={{ 
                  minHeight: '760px',
                  gridTemplateColumns: visibleGalleries === 3 ? '1fr 1fr 1fr' : undefined,
                  maxWidth: '100%'
                }}>
                  <PhotoGallery
                    type="precondition"
                    photos={state.galleries.precondition.candidatePhotos}
                    selectedPhoto={state.galleries.precondition.selectedPhoto}
                    onPhotoSelect={(photo) => handlePhotoSelect('precondition', photo)}
                    rotation={state.galleries.precondition.rotation}
                    zoom={state.galleries.precondition.zoom}
                    panX={state.galleries.precondition.panX}
                    panY={state.galleries.precondition.panY}
                    onRotate={() => handleRotate('precondition')}
                    onZoomToggle={() => handleZoomToggle('precondition')}
                    onPan={(deltaX, deltaY) => handlePan('precondition', deltaX, deltaY)}
                    visible={state.galleries.precondition.visible}
                  />

                  <PhotoGallery
                    type="damage"
                    photos={state.galleries.damage.candidatePhotos}
                    selectedPhoto={state.galleries.damage.selectedPhoto}
                    onPhotoSelect={(photo) => handlePhotoSelect('damage', photo)}
                    rotation={state.galleries.damage.rotation}
                    zoom={state.galleries.damage.zoom}
                    panX={state.galleries.damage.panX}
                    panY={state.galleries.damage.panY}
                    onRotate={() => handleRotate('damage')}
                    onZoomToggle={() => handleZoomToggle('damage')}
                    onPan={(deltaX, deltaY) => handlePan('damage', deltaX, deltaY)}
                    visible={state.galleries.damage.visible}
                  />

                  <PhotoGallery
                    type="completion"
                    photos={state.galleries.completion.candidatePhotos}
                    selectedPhoto={state.galleries.completion.selectedPhoto}
                    onPhotoSelect={(photo) => handlePhotoSelect('completion', photo)}
                    rotation={state.galleries.completion.rotation}
                    zoom={state.galleries.completion.zoom}
                    panX={state.galleries.completion.panX}
                    panY={state.galleries.completion.panY}
                    onRotate={() => handleRotate('completion')}
                    onZoomToggle={() => handleZoomToggle('completion')}
                    onPan={(deltaX, deltaY) => handlePan('completion', deltaX, deltaY)}
                    visible={state.galleries.completion.visible}
                  />
                </div>
              </div>

              <div className="space-y-4 lg:max-h-[calc(100vh-240px)] lg:overflow-auto">
                {/* Inline Approval Controls */}
                {currentSet && !isGuest && (
                  <>
                    {detailsSummary && (
                      <div className="rounded-md border bg-card p-2 text-xs text-muted-foreground">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span>
                            Details file: <span className="font-medium text-foreground">{detailsSummary.sourceFileName}</span>
                          </span>
                          <span>
                            Matched: <span className="font-medium text-foreground">{detailsSummary.matchedCount}</span>
                            {' '}of {state.photoSets.length}
                          </span>
                        </div>
                        {detailsSummary.missingInCsv.length > 0 && (
                          <div className="mt-1">
                            Missing in CSV: {detailsSummary.missingInCsv.slice(0, 6).join(', ')}
                            {detailsSummary.missingInCsv.length > 6 && ` (+${detailsSummary.missingInCsv.length - 6} more)`}
                          </div>
                        )}
                        {detailsSummary.unmatchedInCsv.length > 0 && (
                          <div className="mt-1">
                            Unmatched CSV rows: {detailsSummary.unmatchedInCsv.slice(0, 6).join(', ')}
                            {detailsSummary.unmatchedInCsv.length > 6 && ` (+${detailsSummary.unmatchedInCsv.length - 6} more)`}
                          </div>
                        )}
                      </div>
                    )}
                    <ApprovalControls
                      damageId={currentSet.damageId}
                      approval={state.approvals[currentSet.damageId]}
                      details={currentSet.damageDetails}
                      folderSummary={folderSummary}
                      photoSummaries={photoSummaries}
                      evidenceSummary={evidenceSummary}
                      onOpenReport={() => setShowReportGenerator(true)}
                      onApprovalChange={handleApprovalChange}
                      metrics={metricsById[currentSet.damageId]}
                      onMetricsChange={handleMetricsChange}
                      lastMeasuredDistance={lastMeasuredDistance}
                    />
                  </>
                )}
              </div>
            </div>

            {!isGuest && (
              <Dialog open={resumePromptOpen} onOpenChange={setResumePromptOpen}>
                <DialogContent className="max-w-lg z-[1200]">
                  <DialogHeader>
                    <DialogTitle>Resume previous session?</DialogTitle>
                  </DialogHeader>
                  <div className="text-sm text-muted-foreground">
                    Found saved approvals/metrics for this folder. Apply them to the current session?
                  </div>
                  <div className="flex justify-end gap-2 mt-4">
                    <Button variant="outline" onClick={handleResumeSkip}>Skip</Button>
                    <Button onClick={handleResumeApply}>Apply</Button>
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </>
        )}
      </div>
    </div>
  );
};
