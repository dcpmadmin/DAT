import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

const HowToUse = () => {
  const navigate = useNavigate();

  const handleBack = () => {
    navigate(-1);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-6 max-w-3xl">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleBack}
          className="text-foreground hover:bg-muted mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <h1 className="text-2xl font-bold mb-4">How to Use Damage Assessor Tool</h1>

        <div className="space-y-6 text-sm leading-6">
          <section>
            <h2 className="text-lg font-semibold mb-2">What the app does</h2>
            <p>
              Review, assess, and report on damage using photo folders from site visits. The app
              groups your photos into stages, shows their locations on a map, and lets you export
              a summary to Excel.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">Folder structure to upload</h2>
            <p>Prepare a main folder with one subfolder per report/job:</p>
            <pre className="bg-muted p-3 rounded border mt-2 text-xs overflow-auto">
[Main Folder]/[Report ID]/[Photo Type]/[Images]

Where Photo Type is one of: precondition, damage, completion
            </pre>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">Quick steps</h2>
            <ol className="list-decimal pl-5 space-y-1">
              <li>Click “Select Folder” and choose your main folder.</li>
              <li>The app reads your reports and shows three photo galleries.</li>
              <li>Use the map to see where photos were taken and measure distances if needed.</li>
              <li>Mark each report as Approved, Rejected, or Queried. Add comments as needed.</li>
              <li>Export an Excel summary with statuses, counts, and comments.</li>
            </ol>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">Tips</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>Use Rotate, Zoom, and Pan to inspect photos closely.</li>
              <li>Satellite view can help verify locations visually.</li>
              <li>The map needs an internet connection to load map tiles.</li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
};

export default HowToUse;

