import { Card } from '@/components/ui/card';

interface DashboardHomeProps {
  summary: {
    totalReports: number;
    approved: number;
    queried: number;
    rejected: number;
    pending: number;
    detailsMatched: number;
  };
  compact?: boolean;
  title?: string;
}

export const DashboardHome = ({ summary, compact = false, title }: DashboardHomeProps) => {
  return (
    <div className={compact ? 'space-y-3' : 'space-y-6'}>
      <Card className={`${compact ? 'p-4' : 'p-6'} bg-gradient-header text-primary-foreground shadow-card`}>
        <div className="flex flex-col gap-4">
          <div>
            <h1 className={`${compact ? 'text-lg' : 'text-2xl'} font-bold`}>
              {title || 'Damage Assessor Dashboard'}
            </h1>
            {!compact && (
              <p className="text-primary-foreground/80 text-sm">
              Upload a folder of reports to start an assessment session and review photos, maps, and details.
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="rounded-md bg-primary-foreground/10 p-3">
              <div className="text-xs uppercase tracking-wide text-primary-foreground/70">Reports</div>
              <div className="text-xl font-semibold">{summary.totalReports}</div>
            </div>
            <div className="rounded-md bg-primary-foreground/10 p-3">
              <div className="text-xs uppercase tracking-wide text-primary-foreground/70">Approved</div>
              <div className="text-xl font-semibold">{summary.approved}</div>
            </div>
            <div className="rounded-md bg-primary-foreground/10 p-3">
              <div className="text-xs uppercase tracking-wide text-primary-foreground/70">Queried</div>
              <div className="text-xl font-semibold">{summary.queried}</div>
            </div>
            <div className="rounded-md bg-primary-foreground/10 p-3">
              <div className="text-xs uppercase tracking-wide text-primary-foreground/70">Rejected</div>
              <div className="text-xl font-semibold">{summary.rejected}</div>
            </div>
            <div className="rounded-md bg-primary-foreground/10 p-3">
              <div className="text-xs uppercase tracking-wide text-primary-foreground/70">Pending</div>
              <div className="text-xl font-semibold">{summary.pending}</div>
            </div>
            <div className="rounded-md bg-primary-foreground/10 p-3">
              <div className="text-xs uppercase tracking-wide text-primary-foreground/70">Details Matched</div>
              <div className="text-xl font-semibold">{summary.detailsMatched}</div>
            </div>
          </div>
        </div>
      </Card>

    </div>
  );
};
