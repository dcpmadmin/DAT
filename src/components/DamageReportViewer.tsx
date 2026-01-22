import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { ReportUploader } from './ReportUploader';
import { DashboardHome } from './DashboardHome';
import { ReportHeader } from './ReportHeader';
import { PhotoGallery } from './PhotoGallery';
import { ReportGenerator } from './ReportGenerator';
import { ApprovalControls } from './ApprovalControls';
import { DamageMap } from './DamageMap';
import { GalleryType, DamageReportState, PhotoMetadata, PhotoSetApproval } from '@/types/damage-report';
import { processFolderStructure } from '@/utils/photo-processing';
import { parseDamageDetailsFile, DamageDetailsColumnMapping } from '@/utils/damage-details';
import { listAssessments, upsertAssessment } from '@/api/client';
import type { AssessmentUpsert, SerializedApproval } from '@/shared/assessment';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

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
  const [metricsById, setMetricsById] = useState<Record<string, ReportMetrics>>({});
  const [lastMeasuredDistance, setLastMeasuredDistance] = useState<number | null>(null);
  const [showOverview, setShowOverview] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'all' | 'approved' | 'rejected' | 'query' | 'pending'>('all');
  const [showMiniMap, setShowMiniMap] = useState(true);
  const [mapPanelOpen, setMapPanelOpen] = useState(true);
  const [processingProgress, setProcessingProgress] = useState<{ processed: number; total: number } | null>(null);
  const [panelWidth, setPanelWidth] = useState(360);
  const [isLargeScreen, setIsLargeScreen] = useState(() => window.innerWidth >= 1024);
  const layoutRef = useRef<HTMLDivElement | null>(null);
  const resizingRef = useRef(false);
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
  const jumpOptions = useMemo(() => {
    return filteredIndices.map((index) => state.photoSets[index].damageId);
  }, [filteredIndices, state.photoSets]);

  const handleFilesSelected = useCallback(async (files: FileList, mapping?: DamageDetailsColumnMapping) => {
    setIsProcessing(true);
    const imageFiles = Array.from(files).filter((file) => file.type.startsWith('image/'));
    if (imageFiles.length > 0) {
      setProcessingProgress({ processed: 0, total: imageFiles.length });
    } else {
      setProcessingProgress(null);
    }
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

      const photoSets = await processFolderStructure(files, (progress) => {
        setProcessingProgress(progress);
      });
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
        const records = await listAssessments();
        const damageIdSet = new Set(photoSetsWithDetails.map((ps) => ps.damageId));
        const approvals: Record<string, PhotoSetApproval> = {};
        const metricsById: Record<string, ReportMetrics> = {};
        records.forEach((record) => {
          if (!damageIdSet.has(record.damageId)) return;
          if (record.approval) {
            approvals[record.damageId] = {
              ...record.approval,
              timestamp: new Date(record.approval.timestamp)
            } as PhotoSetApproval;
          }
          if (record.metrics) {
            metricsById[record.damageId] = record.metrics;
          }
        });
        const overlapCount = Object.keys(approvals).length + Object.keys(metricsById).length;
        if (overlapCount > 0) {
          setResumeCandidate({ approvals, metricsById, overlapCount });
          setResumePromptOpen(true);
        }
      } catch (error) {
        console.warn('Failed to load saved assessments:', error);
      }
    } catch (error) {
      console.error('Error processing files:', error);
      toast.error('Failed to process uploaded files. Please check the folder structure.');
    } finally {
      setIsProcessing(false);
      setProcessingProgress(null);
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

  const handleJumpTo = useCallback((damageId: string) => {
    const index = state.photoSets.findIndex((set) => set.damageId === damageId);
    if (index >= 0) updateCurrentSet(index);
  }, [state.photoSets, updateCurrentSet]);

  const handleToggleGallery = useCallback((gallery: GalleryType, visible: boolean) => {
    setState(prev => ({
      ...prev,
      galleries: {
        ...prev.galleries,
        [gallery]: { ...prev.galleries[gallery], visible }
      }
    }));
  }, []);

  const handleToggleMap = useCallback(() => {
    setShowMiniMap((prev) => !prev);
  }, []);

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
    setShowMiniMap(true);
    setMapPanelOpen(true);
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
    const metrics = metricsById[damageId];
    const payload: AssessmentUpsert = {
      damageId,
      approval: {
        ...approval,
        timestamp: approval.timestamp.toISOString()
      } as SerializedApproval,
      metrics
    };
    upsertAssessment(payload).catch((error) => {
      console.warn('Failed to persist assessment:', error);
    });
  }, [metricsById]);

  const handleMetricsChange = useCallback((damageId: string, metrics: ReportMetrics) => {
    setMetricsById(prev => ({ ...prev, [damageId]: metrics }));
    const approval = state.approvals[damageId];
    const payload: AssessmentUpsert = {
      damageId,
      approval: approval
        ? ({
            ...approval,
            timestamp: approval.timestamp.toISOString()
          } as SerializedApproval)
        : undefined,
      metrics
    };
    upsertAssessment(payload).catch((error) => {
      console.warn('Failed to persist assessment:', error);
    });
  }, [state.approvals]);

  const handleDistanceChange = useCallback((distance: number) => { setLastMeasuredDistance(distance); }, []);

  useEffect(() => {
    const onResize = () => {
      setIsLargeScreen(window.innerWidth >= 1024);
      if (!layoutRef.current) return;
      const bounds = layoutRef.current.getBoundingClientRect();
      const minPanel = 280;
      const minLeft = 720;
      const maxPanel = Math.max(minPanel, bounds.width - minLeft);
      setPanelWidth((prev) => Math.min(maxPanel, Math.max(minPanel, prev)));
    };
    window.addEventListener('resize', onResize);
    onResize();
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    const onMouseMove = (event: MouseEvent) => {
      if (!resizingRef.current || !layoutRef.current) return;
      const bounds = layoutRef.current.getBoundingClientRect();
      const minPanel = 280;
      const minLeft = 720;
      const maxPanel = Math.max(minPanel, bounds.width - minLeft);
      const next = Math.min(maxPanel, Math.max(minPanel, bounds.right - event.clientX));
      setPanelWidth(next);
    };
    const onMouseUp = () => {
      if (!resizingRef.current) return;
      resizingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  const handleResizeStart = (event: React.MouseEvent) => {
    if (!isLargeScreen) return;
    resizingRef.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    event.preventDefault();
  };

  const applyQuickStatus = useCallback((status: PhotoSetApproval['status']) => {
    if (!currentSet) return;
    const existing = state.approvals[currentSet.damageId];
    const approval: PhotoSetApproval = {
      status,
      comments: existing?.comments || '',
      timestamp: new Date(),
      severity: existing?.severity,
      priority: existing?.priority,
      confidence: existing?.confidence,
      followUp: existing?.followUp || '',
      notes: existing?.notes || '',
      estimateDays: existing?.estimateDays,
      costRangeAud: existing?.costRangeAud
    };
    handleApprovalChange(currentSet.damageId, approval);
  }, [currentSet, state.approvals, handleApprovalChange]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) return;
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        handlePreviousReport();
        return;
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        handleNextReport();
        return;
      }
      if (isGuest || !currentSet) return;
      const key = event.key.toLowerCase();
      if (key === 'a') applyQuickStatus('approved');
      if (key === 'q') applyQuickStatus('query');
      if (key === 'r') applyQuickStatus('rejected');
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [applyQuickStatus, currentSet, handleNextReport, handlePreviousReport, isGuest]);


  useEffect(() => {
    if (filteredIndices.length === 0) return;
    if (!filteredIndices.includes(state.currentSetIndex)) {
      updateCurrentSet(filteredIndices[0]);
    }
  }, [filteredIndices, state.currentSetIndex, updateCurrentSet]);

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
      <div className="mx-auto w-full max-w-none px-3">
        {/* Upload Section or Header */}
        {state.photoSets.length === 0 ? (
          <div className="space-y-6">
            <DashboardHome summary={summary} />
            <div className="flex items-center justify-center min-h-[40vh]">
              <div className="w-full max-w-2xl">
                <ReportUploader 
                  onFilesSelected={handleFilesSelected} 
                  isProcessing={isProcessing}
                  processingProgress={processingProgress}
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
              mapVisible={showMiniMap}
              jumpOptions={jumpOptions}
              jumpValue={currentSet?.damageId}
              onJumpTo={handleJumpTo}
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

            <div ref={layoutRef} className="flex flex-col gap-2 lg:flex-row lg:gap-0">
              <div className="space-y-2 flex-1 min-w-0 lg:pr-2">
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
                <div className="relative">
                  <div className={`grid gap-2 ${
                    visibleGalleries === 1 ? 'grid-cols-1' :
                    visibleGalleries === 2 ? 'grid-cols-2' :
                    'grid-cols-3'
                  }`} style={{
                    minHeight: '72vh',
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
              </div>

              <div
                className="hidden lg:flex w-2 cursor-col-resize items-stretch"
                onMouseDown={handleResizeStart}
                role="separator"
                aria-orientation="vertical"
                title="Drag to resize panel"
              >
                <div className="w-px bg-border/60 mx-auto" />
              </div>

              <div
                className="space-y-2 w-full lg:pl-2 lg:max-h-[calc(100vh-200px)] lg:overflow-auto"
                style={isLargeScreen ? { width: panelWidth } : undefined}
              >
                {showMiniMap && currentSet && (
                  <Collapsible open={mapPanelOpen} onOpenChange={setMapPanelOpen}>
                    <div className="rounded-lg border bg-card p-2 shadow-sm">
                      <div className="flex items-center justify-between">
                        <div className="text-xs font-medium text-muted-foreground">Map Overview</div>
                        <CollapsibleTrigger asChild>
                          <Button variant="outline" size="sm">
                            {mapPanelOpen ? 'Hide' : 'Show'}
                          </Button>
                        </CollapsibleTrigger>
                      </div>
                      <CollapsibleContent className="mt-2">
                        <DamageMap
                          photoSet={currentSet}
                          visible={showMiniMap}
                          onPhotoSelect={handlePhotoSelect}
                          onDistanceChange={(distanceMeters, _source) => handleDistanceChange(distanceMeters)}
                          height={300}
                          variant="compact"
                        />
                      </CollapsibleContent>
                    </div>
                  </Collapsible>
                )}
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
