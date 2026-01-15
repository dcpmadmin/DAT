import { useState } from 'react';
import { Download, FileSpreadsheet, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { PhotoSet, PhotoSetApproval } from '@/types/damage-report';
import { calculateDistance } from '@/utils/photo-processing';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';

interface ReportGeneratorProps {
  photoSets: PhotoSet[];
  approvals?: Record<string, PhotoSetApproval>;
}

type ReportStatus = 'pending' | 'checked' | 'needs-review';

interface ReportData {
  setId: string;
  status: ReportStatus;
  comments: string;
}

export const ReportGenerator = ({ photoSets, approvals = {} }: ReportGeneratorProps) => {
  const [reportData, setReportData] = useState<Record<string, ReportData>>({});
  const [globalComments, setGlobalComments] = useState('');

  const getStatusColor = (status: ReportStatus) => {
    switch (status) {
      case 'checked': return 'bg-green-500';
      case 'needs-review': return 'bg-yellow-500'; 
      case 'pending': return 'bg-gray-500';
    }
  };

  const getStatusLabel = (status: ReportStatus) => {
    switch (status) {
      case 'checked': return 'Checked';
      case 'needs-review': return 'Needs Review';
      case 'pending': return 'Pending';
    }
  };

  const updateReportStatus = (setId: string, status: ReportStatus) => {
    setReportData(prev => ({
      ...prev,
      [setId]: { ...prev[setId], setId, status, comments: prev[setId]?.comments || '' }
    }));
  };

  const updateReportComments = (setId: string, comments: string) => {
    setReportData(prev => ({
      ...prev,
      [setId]: { ...prev[setId], setId, status: prev[setId]?.status || 'pending', comments }
    }));
  };

  const generateExcelReport = () => {
    // ===== SUMMARY SHEET =====
    const worksheetData = photoSets.map(photoSet => {
      const data = reportData[photoSet.damageId] || { status: 'pending', comments: '' };
      const approval = approvals[photoSet.damageId];
      
      // Use approval status if available, otherwise use report data
      const finalDisplayStatus: ReportStatus = approval
        ? (approval.status === 'approved' ? 'checked' : approval.status === 'rejected' ? 'needs-review' : 'pending')
        : (data.status as ReportStatus);
      const finalComments = approval ? approval.comments : data.comments;
      
      return {
        'Report ID': photoSet.damageId,
        'Folder Path': photoSet.damageId,
        'Status': getStatusLabel(finalDisplayStatus),
        'Assessment Status': approval ? approval.status : 'Not Assessed',
        'Precondition Photos': photoSet.preconditionPhotos.length,
        'Damage Photos': photoSet.damagePhotos.length,
        'Completion Photos': photoSet.completionPhotos.length,
        'Total Photos': photoSet.preconditionPhotos.length + photoSet.damagePhotos.length + photoSet.completionPhotos.length,
        'Comments': finalComments,
        'Assessment Date': approval ? approval.timestamp.toLocaleDateString() : '',
        'Generated Date': new Date().toLocaleDateString(),
        'Generated Time': new Date().toLocaleTimeString()
      };
    });

    // Add summary row (respect approvals)
    let checkedCount = 0;
    let reviewCount = 0;
    let pendingCount = 0;
    photoSets.forEach((ps) => {
      const approval = approvals[ps.damageId];
      const local = reportData[ps.damageId];
      const st: ReportStatus = approval
        ? approval.status === 'approved'
          ? 'checked'
          : approval.status === 'rejected'
          ? 'needs-review'
          : 'pending'
        : (local?.status || 'pending');
      if (st === 'checked') checkedCount++;
      else if (st === 'needs-review') reviewCount++;
      else pendingCount++;
    });
    const totalReports = photoSets.length;

    worksheetData.unshift({
      'Report ID': 'SUMMARY',
      'Folder Path': `Total Reports: ${totalReports}`,
      'Status': `Checked: ${checkedCount}, Review: ${reviewCount}, Pending: ${pendingCount}`,
      'Assessment Status': 'Summary',
      'Precondition Photos': 0,
      'Damage Photos': 0,
      'Completion Photos': 0,
      'Total Photos': 0,
      'Comments': globalComments,
      'Assessment Date': '',
      'Generated Date': '',
      'Generated Time': ''
    });

    const summaryWorksheet = XLSX.utils.json_to_sheet(worksheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, summaryWorksheet, 'Summary Report');

    // ===== ASSESSMENT DETAILS SHEET =====
    const assessmentDetailsData = photoSets.map((photoSet) => {
      const approval = approvals[photoSet.damageId];
      return {
        'Report ID': photoSet.damageId,
        'Assessment Status': approval ? approval.status : 'Not Assessed',
        'Severity': approval?.severity ?? '',
        'Priority': approval?.priority ?? '',
        'Confidence': approval?.confidence ?? '',
        'Follow-up Action': approval?.followUp ?? '',
        'Assessment Notes': approval?.notes ?? '',
        'Estimate (days)': approval?.estimateDays ?? '',
        'Cost Range (AUD)': approval?.costRangeAud ?? '',
        'Comments': approval?.comments ?? '',
        'Assessment Date': approval?.timestamp ? approval.timestamp.toLocaleDateString() : '',
        'Assessment Time': approval?.timestamp ? approval.timestamp.toLocaleTimeString() : ''
      };
    });

    const assessmentDetailsWorksheet = XLSX.utils.json_to_sheet(assessmentDetailsData);
    XLSX.utils.book_append_sheet(workbook, assessmentDetailsWorksheet, 'Assessment Details');
    assessmentDetailsWorksheet['!cols'] = [
      { wch: 18 }, // Report ID
      { wch: 18 }, // Assessment Status
      { wch: 10 }, // Severity
      { wch: 10 }, // Priority
      { wch: 12 }, // Confidence
      { wch: 24 }, // Follow-up Action
      { wch: 40 }, // Assessment Notes
      { wch: 14 }, // Estimate (days)
      { wch: 16 }, // Cost Range (AUD)
      { wch: 30 }, // Comments
      { wch: 14 }, // Assessment Date
      { wch: 14 }  // Assessment Time
    ];

    // ===== DAMAGE DETAILS SHEET =====
    const damageDetailsData = photoSets.map((photoSet) => ({
      'Report ID': photoSet.damageId,
      'Damage Type': photoSet.damageDetails?.damageType ?? '',
      'Treatment': photoSet.damageDetails?.treatment ?? '',
      'Dimensions': photoSet.damageDetails?.dimensions ?? '',
      'Cost (AUD)': photoSet.damageDetails?.costAUD ?? ''
    }));

    const damageDetailsWorksheet = XLSX.utils.json_to_sheet(damageDetailsData);
    XLSX.utils.book_append_sheet(workbook, damageDetailsWorksheet, 'Damage Details');

    damageDetailsWorksheet['!cols'] = [
      { wch: 18 }, // Report ID
      { wch: 20 }, // Damage Type
      { wch: 25 }, // Treatment
      { wch: 18 }, // Dimensions
      { wch: 14 }  // Cost (AUD)
    ];

    // Auto-size columns for summary sheet
    const summaryCols = [
      { wch: 15 }, // Report ID
      { wch: 30 }, // Folder Path
      { wch: 15 }, // Status
      { wch: 20 }, // Assessment Status
      { wch: 18 }, // Precondition Photos
      { wch: 15 }, // Damage Photos
      { wch: 18 }, // Completion Photos
      { wch: 15 }, // Total Photos
      { wch: 40 }, // Comments
      { wch: 15 }, // Assessment Date
      { wch: 15 }, // Generated Date
      { wch: 15 }  // Generated Time
    ];
    summaryWorksheet['!cols'] = summaryCols;

    // ===== PHOTO DETAILS SHEET =====
    const photoDetailsData: any[] = [];

    photoSets.forEach(photoSet => {
      const data = reportData[photoSet.damageId] || { status: 'pending', comments: '' };
      const approval = approvals[photoSet.damageId];
      
      // Get report status for this photo set
      const finalDisplayStatus: ReportStatus = approval
        ? (approval.status === 'approved' ? 'checked' : approval.status === 'rejected' ? 'needs-review' : 'pending')
        : (data.status as ReportStatus);
      
      const reportStatus = getStatusLabel(finalDisplayStatus);
      const assessmentStatus = approval ? approval.status : 'Not Assessed';

      // Calculate distances from reference location if available
      const referenceLocation = photoSet.referenceLocation;
      
      // Process Precondition Photos
      photoSet.preconditionPhotos.forEach((photo, index) => {
        let distanceFromReference = 'N/A';
        if (referenceLocation && photo.location) {
          const distance = calculateDistance(
            referenceLocation.latitude,
            referenceLocation.longitude,
            photo.location.latitude,
            photo.location.longitude
          );
          distanceFromReference = `${distance.toFixed(2)}m`;
        }
        
        const fileSizeMB = photo.file ? (photo.file.size / (1024 * 1024)).toFixed(2) : 'N/A';
        
        photoDetailsData.push({
          'Report ID': photoSet.damageId,
          'Photo Index': index + 1,
          'Photo Name': photo.name,
          'Photo Type': 'Precondition',
          'File Size (MB)': fileSizeMB,
          'Latitude': photo.location?.latitude ?? 'N/A',
          'Longitude': photo.location?.longitude ?? 'N/A',
          'Coordinates': photo.location 
            ? `${photo.location.latitude.toFixed(6)}, ${photo.location.longitude.toFixed(6)}`
            : 'N/A',
          'Distance from Reference': distanceFromReference,
          'Date Taken': photo.timestamp 
            ? new Date(photo.timestamp).toLocaleDateString()
            : 'N/A',
          'Time Taken': photo.timestamp 
            ? new Date(photo.timestamp).toLocaleTimeString()
            : 'N/A',
          'Full Timestamp': photo.timestamp 
            ? new Date(photo.timestamp).toISOString()
            : 'N/A',
          'Orientation': photo.orientation ?? 'N/A',
          'GPS Available': photo.location ? 'Yes' : 'No',
          'Report Status': reportStatus,
          'Assessment Status': assessmentStatus,
          'Photo URL': photo.url,
          'File Path': photo.file?.webkitRelativePath || photo.name
        });
      });

      // Process Damage Photos
      photoSet.damagePhotos.forEach((photo, index) => {
        let distanceFromReference = 'N/A';
        if (referenceLocation && photo.location) {
          const distance = calculateDistance(
            referenceLocation.latitude,
            referenceLocation.longitude,
            photo.location.latitude,
            photo.location.longitude
          );
          distanceFromReference = `${distance.toFixed(2)}m`;
        }
        
        const fileSizeMB = photo.file ? (photo.file.size / (1024 * 1024)).toFixed(2) : 'N/A';
        
        photoDetailsData.push({
          'Report ID': photoSet.damageId,
          'Photo Index': index + 1,
          'Photo Name': photo.name,
          'Photo Type': 'Damage',
          'File Size (MB)': fileSizeMB,
          'Latitude': photo.location?.latitude ?? 'N/A',
          'Longitude': photo.location?.longitude ?? 'N/A',
          'Coordinates': photo.location 
            ? `${photo.location.latitude.toFixed(6)}, ${photo.location.longitude.toFixed(6)}`
            : 'N/A',
          'Distance from Reference': distanceFromReference,
          'Date Taken': photo.timestamp 
            ? new Date(photo.timestamp).toLocaleDateString()
            : 'N/A',
          'Time Taken': photo.timestamp 
            ? new Date(photo.timestamp).toLocaleTimeString()
            : 'N/A',
          'Full Timestamp': photo.timestamp 
            ? new Date(photo.timestamp).toISOString()
            : 'N/A',
          'Orientation': photo.orientation ?? 'N/A',
          'GPS Available': photo.location ? 'Yes' : 'No',
          'Report Status': reportStatus,
          'Assessment Status': assessmentStatus,
          'Photo URL': photo.url,
          'File Path': photo.file?.webkitRelativePath || photo.name
        });
      });

      // Process Completion Photos
      photoSet.completionPhotos.forEach((photo, index) => {
        let distanceFromReference = 'N/A';
        if (referenceLocation && photo.location) {
          const distance = calculateDistance(
            referenceLocation.latitude,
            referenceLocation.longitude,
            photo.location.latitude,
            photo.location.longitude
          );
          distanceFromReference = `${distance.toFixed(2)}m`;
        }
        
        const fileSizeMB = photo.file ? (photo.file.size / (1024 * 1024)).toFixed(2) : 'N/A';
        
        photoDetailsData.push({
          'Report ID': photoSet.damageId,
          'Photo Index': index + 1,
          'Photo Name': photo.name,
          'Photo Type': 'Completion',
          'File Size (MB)': fileSizeMB,
          'Latitude': photo.location?.latitude ?? 'N/A',
          'Longitude': photo.location?.longitude ?? 'N/A',
          'Coordinates': photo.location 
            ? `${photo.location.latitude.toFixed(6)}, ${photo.location.longitude.toFixed(6)}`
            : 'N/A',
          'Distance from Reference': distanceFromReference,
          'Date Taken': photo.timestamp 
            ? new Date(photo.timestamp).toLocaleDateString()
            : 'N/A',
          'Time Taken': photo.timestamp 
            ? new Date(photo.timestamp).toLocaleTimeString()
            : 'N/A',
          'Full Timestamp': photo.timestamp 
            ? new Date(photo.timestamp).toISOString()
            : 'N/A',
          'Orientation': photo.orientation ?? 'N/A',
          'GPS Available': photo.location ? 'Yes' : 'No',
          'Report Status': reportStatus,
          'Assessment Status': assessmentStatus,
          'Photo URL': photo.url,
          'File Path': photo.file?.webkitRelativePath || photo.name
        });
      });
    });

    // Create photo details worksheet
    const photoDetailsWorksheet = XLSX.utils.json_to_sheet(photoDetailsData);
    XLSX.utils.book_append_sheet(workbook, photoDetailsWorksheet, 'Photo Details');

    // Auto-size columns for photo details sheet
    const photoDetailsCols = [
      { wch: 18 }, // Report ID
      { wch: 12 }, // Photo Index
      { wch: 35 }, // Photo Name
      { wch: 15 }, // Photo Type
      { wch: 12 }, // File Size (MB)
      { wch: 14 }, // Latitude
      { wch: 14 }, // Longitude
      { wch: 28 }, // Coordinates
      { wch: 18 }, // Distance from Reference
      { wch: 12 }, // Date Taken
      { wch: 12 }, // Time Taken
      { wch: 22 }, // Full Timestamp
      { wch: 12 }, // Orientation
      { wch: 12 }, // GPS Available
      { wch: 15 }, // Report Status
      { wch: 18 }, // Assessment Status
      { wch: 50 }, // Photo URL
      { wch: 60 }  // File Path
    ];
    photoDetailsWorksheet['!cols'] = photoDetailsCols;

    // Generate filename and save
    const fileName = `damage_assessment_report_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(workbook, fileName);
    
    toast.success(`Excel report generated successfully! Check the "Photo Details" sheet for individual photo metadata with ${photoDetailsData.length} photos.`);
  };

  const getCompletionStats = () => {
    let checked = 0;
    let review = 0;
    let pending = 0;

    photoSets.forEach((ps) => {
      const data = reportData[ps.damageId] || { status: 'pending' as ReportStatus };
      const approval = approvals[ps.damageId];

      const displayStatus: ReportStatus = approval
        ? approval.status === 'approved'
          ? 'checked'
          : approval.status === 'rejected'
          ? 'needs-review'
          : 'pending'
        : (data.status as ReportStatus);

      if (displayStatus === 'checked') checked++;
      else if (displayStatus === 'needs-review') review++;
      else pending++;
    });

    return { total: photoSets.length, checked, review, pending };
  };

  const stats = getCompletionStats();

  return (
    <Card className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="w-5 h-5" />
          <h2 className="text-lg font-semibold">Assessment Report Generator</h2>
        </div>
        <Button onClick={generateExcelReport} className="flex items-center gap-2">
          <Download className="w-4 h-4" />
          Generate Excel Report
        </Button>
      </div>

      {/* Progress Overview */}
      <div className="grid grid-cols-4 gap-4">
        <div className="text-center">
          <div className="text-2xl font-bold">{stats.total}</div>
          <div className="text-sm text-muted-foreground">Total Reports</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-green-600">{stats.checked}</div>
          <div className="text-sm text-muted-foreground">Checked</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-yellow-600">{stats.review}</div>
          <div className="text-sm text-muted-foreground">Needs Review</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-gray-600">{stats.pending}</div>
          <div className="text-sm text-muted-foreground">Pending</div>
        </div>
      </div>

      {/* Global Comments */}
      <div className="space-y-2">
        <label className="text-sm font-medium flex items-center gap-2">
          <MessageSquare className="w-4 h-4" />
          Global Assessment Comments
        </label>
        <Textarea
          placeholder="Enter general comments about this assessment session..."
          value={globalComments}
          onChange={(e) => setGlobalComments(e.target.value)}
          className="min-h-[80px]"
        />
      </div>

      {/* Report List */}
      <div className="space-y-4">
        <h3 className="font-medium">Individual Report Status</h3>
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {photoSets.map((photoSet) => {
            const data = reportData[photoSet.damageId] || { status: 'pending', comments: '' };
            const approval = approvals[photoSet.damageId];
            
            // Use approval status if available, otherwise use local report data
            const displayStatus = approval ? (
              approval.status === 'approved' ? 'checked' : 
              approval.status === 'rejected' ? 'needs-review' : 'pending'
            ) : data.status;
            
            const displayComments = approval ? approval.comments : data.comments;
            
            return (
              <div key={photoSet.damageId} className="flex items-start gap-4 p-3 border rounded-lg">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="font-medium truncate" title={photoSet.damageId}>
                      {photoSet.damageId}
                    </div>
                    <Badge className={getStatusColor(displayStatus)}>
                      {getStatusLabel(displayStatus)}
                    </Badge>
                    {approval && (
                      <Badge variant="outline" className="text-xs">
                        {approval.status === 'approved' ? 'Approved' : 
                         approval.status === 'rejected' ? 'Rejected' : 'Queried'}
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground truncate" title={photoSet.damageId}>
                    {photoSet.damageId}
                  </p>
                  <div className="text-xs text-muted-foreground mt-1">
                    {photoSet.preconditionPhotos.length + photoSet.damagePhotos.length + photoSet.completionPhotos.length} photos
                  </div>
                </div>
                
                <div className="flex flex-col gap-2 min-w-0 flex-1">
                  <Select
                    value={displayStatus}
                    onValueChange={(value: ReportStatus) => updateReportStatus(photoSet.damageId, value)}
                    disabled={!!approval}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="z-[1300] bg-background" position="popper">
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="checked">Checked</SelectItem>
                      <SelectItem value="needs-review">Needs Review</SelectItem>
                    </SelectContent>
                  </Select>
                  
                  <Textarea
                    placeholder="Add comments..."
                    value={displayComments}
                    onChange={(e) => updateReportComments(photoSet.damageId, e.target.value)}
                    className="min-h-[60px] resize-none text-sm"
                    disabled={!!approval}
                  />
                  {approval && (
                    <div className="text-xs text-muted-foreground">
                      Status set by assessment controls
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
};
