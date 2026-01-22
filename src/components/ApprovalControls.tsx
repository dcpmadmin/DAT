import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { CheckCircle, XCircle, HelpCircle, MessageSquare } from 'lucide-react';
import { DamageDetails, PhotoSetApproval } from '@/types/damage-report';

interface ReportMetrics {
  distanceMeters?: number;
  costAUD?: number;
}

interface ApprovalControlsProps {
  damageId: string;
  approval?: PhotoSetApproval;
  details?: DamageDetails;
  folderSummary?: {
    totalPhotos: number;
    gpsPhotos: number;
    damagePhotos: number;
    preconditionPhotos: number;
    completionPhotos: number;
  };
  photoSummaries?: Array<{
    name: string;
    type: 'damage' | 'precondition' | 'completion';
    timestamp?: Date;
    coordinates?: string;
  }>;
  evidenceSummary?: {
    hasDamage: boolean;
    hasPrecondition: boolean;
    hasCompletion: boolean;
    hasGPS: boolean;
  };
  onOpenReport?: () => void;
  onApprovalChange: (damageId: string, approval: PhotoSetApproval) => void;
  metrics?: ReportMetrics;
  onMetricsChange?: (damageId: string, metrics: ReportMetrics) => void;
  lastMeasuredDistance?: number | null;
}

export const ApprovalControls = ({
  damageId,
  approval,
  details,
  folderSummary,
  photoSummaries,
  evidenceSummary,
  onOpenReport,
  onApprovalChange,
  metrics,
  onMetricsChange,
  lastMeasuredDistance
}: ApprovalControlsProps) => {
  const [comments, setComments] = useState(approval?.comments || '');
  const [showComments, setShowComments] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [submittedOpen, setSubmittedOpen] = useState(true);
  const [assessmentOpen, setAssessmentOpen] = useState(true);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [assetOpen, setAssetOpen] = useState(true);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [distance, setDistance] = useState<string>(metrics?.distanceMeters != null ? String(metrics.distanceMeters) : '');
  const [cost, setCost] = useState<string>(metrics?.costAUD != null ? String(metrics.costAUD) : '');
  const [severity, setSeverity] = useState<PhotoSetApproval['severity']>(approval?.severity);
  const [priority, setPriority] = useState<PhotoSetApproval['priority']>(approval?.priority);
  const [confidence, setConfidence] = useState<PhotoSetApproval['confidence']>(approval?.confidence);
  const [followUp, setFollowUp] = useState(approval?.followUp || '');
  const [notes, setNotes] = useState(approval?.notes || '');
  const [estimateDays, setEstimateDays] = useState<string>(approval?.estimateDays != null ? String(approval.estimateDays) : '');
  const [costRange, setCostRange] = useState(approval?.costRangeAud || '');
  const hasSubmittedDetails = !!(details?.damageType || details?.treatment || details?.dimensions || details?.costAUD != null);
  const formattedCost = details?.costAUD != null ? `AUD ${details.costAUD.toFixed(2)}` : undefined;
  const formatTimestamp = (value?: Date) => {
    if (!value) return 'N/A';
    const date = new Date(value);
    return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
  };

  useEffect(() => {
    setDistance(metrics?.distanceMeters != null ? String(metrics.distanceMeters) : '');
    setCost(metrics?.costAUD != null ? String(metrics.costAUD) : '');
  }, [metrics?.distanceMeters, metrics?.costAUD]);

  useEffect(() => {
    setComments(approval?.comments || '');
    setSeverity(approval?.severity);
    setPriority(approval?.priority);
    setConfidence(approval?.confidence);
    setFollowUp(approval?.followUp || '');
    setNotes(approval?.notes || '');
    setEstimateDays(approval?.estimateDays != null ? String(approval.estimateDays) : '');
    setCostRange(approval?.costRangeAud || '');
  }, [approval]);

  const emitMetrics = (dStr: string, cStr: string) => {
    const d = parseFloat(dStr);
    const c = parseFloat(cStr);
    onMetricsChange?.(damageId, {
      distanceMeters: Number.isFinite(d) ? d : undefined,
      costAUD: Number.isFinite(c) ? c : undefined,
    });
  };

  const persistApproval = (partial: Partial<PhotoSetApproval>) => {
    const next: PhotoSetApproval = {
      status: approval?.status || 'pending',
      comments,
      timestamp: new Date(),
      severity,
      priority,
      confidence,
      followUp,
      notes,
      estimateDays: estimateDays ? Number(estimateDays) : undefined,
      costRangeAud: costRange || undefined,
      ...partial
    };
    onApprovalChange(damageId, next);
  };

  const handleStatusChange = (status: PhotoSetApproval['status']) => {
    const newApproval: PhotoSetApproval = {
      status,
      comments,
      timestamp: new Date(),
      severity,
      priority,
      confidence,
      followUp,
      notes,
      estimateDays: estimateDays ? Number(estimateDays) : undefined,
      costRangeAud: costRange || undefined
    };
    onApprovalChange(damageId, newApproval);
  };

  const handleCommentsSubmit = () => {
    if (approval) {
      const updatedApproval: PhotoSetApproval = {
        ...approval,
        comments,
        timestamp: new Date()
      };
      onApprovalChange(damageId, updatedApproval);
    }
    setShowComments(false);
  };

  const getStatusColor = (status: PhotoSetApproval['status']) => {
    switch (status) {
      case 'approved': return 'bg-green-500';
      case 'rejected': return 'bg-red-500';
      case 'query': return 'bg-yellow-500';
      default: return 'bg-gray-500';
    }
  };

  const getStatusIcon = (status: PhotoSetApproval['status']) => {
    switch (status) {
      case 'approved': return <CheckCircle className="w-4 h-4" />;
      case 'rejected': return <XCircle className="w-4 h-4" />;
      case 'query': return <HelpCircle className="w-4 h-4" />;
      default: return null;
    }
  };

  return (
    <Card className="p-2 bg-card border shadow-sm">
      <div className="space-y-2">
        <Collapsible open={submittedOpen} onOpenChange={setSubmittedOpen}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Submitted Damage Details</span>
            <CollapsibleTrigger asChild>
              <Button variant="outline" size="sm">{submittedOpen ? 'Hide' : 'Show'}</Button>
            </CollapsibleTrigger>
          </div>
          <CollapsibleContent className="mt-2">
            {hasSubmittedDetails ? (
              <div className="rounded-md border bg-muted/30 p-2">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div>
                    <div className="text-muted-foreground">Damage Type</div>
                    <div className="font-medium">{details?.damageType || 'N/A'}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Treatment</div>
                    <div className="font-medium">{details?.treatment || 'N/A'}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Dimensions</div>
                    <div className="font-medium">{details?.dimensions || 'N/A'}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Cost</div>
                    <div className="font-medium">{formattedCost || 'N/A'}</div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">No submitted damage details loaded.</div>
            )}
          </CollapsibleContent>
        </Collapsible>

        <div className="flex items-center justify-between">
          <h4 className="font-medium text-sm text-foreground">Assessment Status</h4>
          <div className="flex items-center gap-2">
            {approval && (
              <Badge variant="outline" className={`${getStatusColor(approval.status)} text-white border-none`}>
                <div className="flex items-center gap-1">
                  {getStatusIcon(approval.status)}
                  <span className="capitalize">{approval.status}</span>
                </div>
              </Badge>
            )}
            {onOpenReport && (
              <Button variant="outline" size="sm" onClick={onOpenReport}>
                Open Full Report
              </Button>
            )}
          </div>
        </div>

        <Collapsible open={assessmentOpen} onOpenChange={setAssessmentOpen}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Assessment Details</span>
            <CollapsibleTrigger asChild>
              <Button variant="outline" size="sm">{assessmentOpen ? 'Hide' : 'Show'}</Button>
            </CollapsibleTrigger>
          </div>
          <CollapsibleContent className="mt-2">
            <div className="rounded-md border bg-muted/20 p-2 text-xs">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div>
                  <div className="text-muted-foreground">Severity</div>
                  <select
                    className="w-full rounded border border-input bg-background px-2 py-1 text-xs"
                    value={severity || ''}
                    onChange={(e) => { setSeverity(e.target.value as PhotoSetApproval['severity']); persistApproval({ severity: e.target.value as PhotoSetApproval['severity'] }); }}
                  >
                    <option value="">Not set</option>
                    <option value="minor">Minor</option>
                    <option value="moderate">Moderate</option>
                    <option value="major">Major</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
                <div>
                  <div className="text-muted-foreground">Priority</div>
                  <select
                    className="w-full rounded border border-input bg-background px-2 py-1 text-xs"
                    value={priority || ''}
                    onChange={(e) => { setPriority(e.target.value as PhotoSetApproval['priority']); persistApproval({ priority: e.target.value as PhotoSetApproval['priority'] }); }}
                  >
                    <option value="">Not set</option>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
                <div>
                  <div className="text-muted-foreground">Confidence</div>
                  <select
                    className="w-full rounded border border-input bg-background px-2 py-1 text-xs"
                    value={confidence || ''}
                    onChange={(e) => { setConfidence(e.target.value as PhotoSetApproval['confidence']); persistApproval({ confidence: e.target.value as PhotoSetApproval['confidence'] }); }}
                  >
                    <option value="">Not set</option>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
                <div>
                  <div className="text-muted-foreground">Estimate (days)</div>
                  <Input
                    inputMode="numeric"
                    placeholder="e.g. 5"
                    value={estimateDays}
                    onChange={(e) => {
                      setEstimateDays(e.target.value);
                      persistApproval({ estimateDays: e.target.value ? Number(e.target.value) : undefined });
                    }}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="sm:col-span-2">
                  <div className="text-muted-foreground">Follow-up Action</div>
                  <Input
                    placeholder="e.g. Quote required, re-inspect"
                    value={followUp}
                    onChange={(e) => { setFollowUp(e.target.value); persistApproval({ followUp: e.target.value }); }}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="sm:col-span-2">
                  <div className="text-muted-foreground">Cost Range (AUD)</div>
                  <Input
                    placeholder="e.g. 1500-2500"
                    value={costRange}
                    onChange={(e) => { setCostRange(e.target.value); persistApproval({ costRangeAud: e.target.value }); }}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="sm:col-span-4">
                  <div className="text-muted-foreground">Assessment Notes</div>
                  <Textarea
                    placeholder="Add assessor notes..."
                    value={notes}
                    onChange={(e) => { setNotes(e.target.value); persistApproval({ notes: e.target.value }); }}
                    className="min-h-[60px] resize-none text-xs"
                  />
                </div>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>

        {evidenceSummary && (
          <Collapsible open={evidenceOpen} onOpenChange={setEvidenceOpen}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Evidence Checklist</span>
              <CollapsibleTrigger asChild>
                <Button variant="outline" size="sm">{evidenceOpen ? 'Hide' : 'Show'}</Button>
              </CollapsibleTrigger>
            </div>
            <CollapsibleContent className="mt-2">
              <div className="rounded-md border bg-muted/20 p-2 text-xs">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="flex items-center gap-1">
                    {evidenceSummary.hasDamage ? (
                      <CheckCircle className="w-3 h-3 text-green-600" />
                    ) : (
                      <XCircle className="w-3 h-3 text-red-600" />
                    )}
                    <span>Damage photos</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {evidenceSummary.hasPrecondition ? (
                      <CheckCircle className="w-3 h-3 text-green-600" />
                    ) : (
                      <XCircle className="w-3 h-3 text-red-600" />
                    )}
                    <span>Precondition photos</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {evidenceSummary.hasCompletion ? (
                      <CheckCircle className="w-3 h-3 text-green-600" />
                    ) : (
                      <XCircle className="w-3 h-3 text-red-600" />
                    )}
                    <span>Completion photos</span>
                  </div>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {folderSummary && (
          <Collapsible open={assetOpen} onOpenChange={setAssetOpen}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Asset Summary</span>
              <CollapsibleTrigger asChild>
                <Button variant="outline" size="sm">{assetOpen ? 'Hide' : 'Show'}</Button>
              </CollapsibleTrigger>
            </div>
            <CollapsibleContent className="mt-2">
              <div className="rounded-md border bg-muted/20 p-2 text-xs">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div>
                    <div className="text-muted-foreground">Asset ID</div>
                    <div className="font-medium">{damageId}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Total Photos</div>
                    <div className="font-medium">{folderSummary.totalPhotos}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">GPS Photos</div>
                    <div className="font-medium">{folderSummary.gpsPhotos}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Damage / Pre / Comp</div>
                    <div className="font-medium">
                      {folderSummary.damagePhotos} / {folderSummary.preconditionPhotos} / {folderSummary.completionPhotos}
                    </div>
                  </div>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {photoSummaries && photoSummaries.length > 0 && (
          <Collapsible open={timelineOpen} onOpenChange={setTimelineOpen}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Photo Timeline</span>
              <CollapsibleTrigger asChild>
                <Button variant="outline" size="sm">{timelineOpen ? 'Hide' : 'Show'}</Button>
              </CollapsibleTrigger>
            </div>
            <CollapsibleContent className="mt-2">
              <div className="rounded-md border bg-muted/20 p-2 text-xs">
                <div className="max-h-32 overflow-auto">
                  <table className="w-full text-left border-collapse">
                    <thead className="text-muted-foreground">
                      <tr>
                        <th className="py-1 pr-2">Photo</th>
                        <th className="py-1 pr-2">Type</th>
                        <th className="py-1 pr-2">Taken</th>
                        <th className="py-1">Coordinates</th>
                      </tr>
                    </thead>
                    <tbody>
                      {photoSummaries.map((photo) => (
                        <tr key={`${photo.type}-${photo.name}`}>
                          <td className="py-1 pr-2">{photo.name}</td>
                          <td className="py-1 pr-2 capitalize">{photo.type}</td>
                          <td className="py-1 pr-2">{formatTimestamp(photo.timestamp)}</td>
                          <td className="py-1">
                            <span className="font-mono">{photo.coordinates || 'N/A'}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        <div className="flex gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleStatusChange('approved')}
            className={`flex-1 ${approval?.status === 'approved' ? 'bg-green-500 text-white border-green-500' : 'hover:bg-green-50 hover:border-green-300'}`}
          >
            <CheckCircle className="w-4 h-4 mr-1" />
            Approve
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => handleStatusChange('query')}
            className={`flex-1 ${approval?.status === 'query' ? 'bg-yellow-500 text-white border-yellow-500' : 'hover:bg-yellow-50 hover:border-yellow-300'}`}
          >
            <HelpCircle className="w-4 h-4 mr-1" />
            Query
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => handleStatusChange('rejected')}
            className={`flex-1 ${approval?.status === 'rejected' ? 'bg-red-500 text-white border-red-500' : 'hover:bg-red-50 hover:border-red-300'}`}
          >
            <XCircle className="w-4 h-4 mr-1" />
            Reject
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowComments(!showComments)}
            className={`${showComments || approval?.comments ? 'bg-blue-500 text-white border-blue-500' : 'hover:bg-blue-50 hover:border-blue-300'}`}
          >
            <MessageSquare className="w-4 h-4" />
          </Button>
        </div>

        {(showComments || approval?.comments) && (
          <div className="space-y-2">
            <Textarea
              placeholder="Add assessment comments..."
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              className="min-h-[64px] resize-none"
            />
            {showComments && (
              <div className="flex gap-2">
                <Button size="sm" onClick={handleCommentsSubmit}>
                  Save Comments
                </Button>
                <Button variant="outline" size="sm" onClick={() => setShowComments(false)}>
                  Cancel
                </Button>
              </div>
            )}
          </div>
        )}

        <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Metrics</span>
            <CollapsibleTrigger asChild>
              <Button variant="outline" size="sm">{detailsOpen ? 'Hide' : 'Show'}</Button>
            </CollapsibleTrigger>
          </div>
          <CollapsibleContent className="mt-2">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div>
                <label className="text-xs text-muted-foreground">Distance (m)</label>
                <div className="flex gap-2 mt-1">
                  <Input
                    inputMode="decimal"
                    placeholder="e.g. 12.5"
                    value={distance}
                    onChange={(e) => { setDistance(e.target.value); emitMetrics(e.target.value, cost); }}
                  />
                  {typeof lastMeasuredDistance === 'number' && distance === '' && (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        const v = String(lastMeasuredDistance.toFixed(1));
                        setDistance(v);
                        emitMetrics(v, cost);
                      }}
                    >
                      Use
                    </Button>
                  )}
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Cost (AUD)</label>
                <Input
                  inputMode="decimal"
                  placeholder="e.g. 1500"
                  value={cost}
                  onChange={(e) => { setCost(e.target.value); emitMetrics(distance, e.target.value); }}
                  className="mt-1"
                />
              </div>
              <div className="hidden sm:block" />
            </div>
          </CollapsibleContent>
        </Collapsible>

        {approval?.timestamp && (
          <div className="text-xs text-muted-foreground">
            Last updated: {approval.timestamp.toLocaleDateString()} {approval.timestamp.toLocaleTimeString()}
          </div>
        )}
      </div>
    </Card>
  );
};
