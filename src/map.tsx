import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { DamageMap } from './components/DamageMap';
import type { PhotoSet, PhotoMetadata } from './types/damage-report';
import type { DamageMapHandle } from './components/DamageMap';
import './index.css'; // Assuming shared styles
import { Button } from '@/components/ui/button';
import { Ruler, Satellite, MousePointer2 } from 'lucide-react';

declare global {
  interface Window {
    electron: {
      ipcRenderer: {
        on: (channel: string, func: (...args: any[]) => void) => () => void;
        send: (channel: string, data: any) => void;
      };
    };
  }
}

const MapApp = () => {
  const [photoSet, setPhotoSet] = useState<PhotoSet | undefined>(undefined);
  const mapRef = useRef<DamageMapHandle | null>(null);
  const [editorMode, setEditorMode] = useState(false);
  const [lastMeasuredDistance, setLastMeasuredDistance] = useState<number | null>(null);
  const [highlightedPhotoName, setHighlightedPhotoName] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem('dm_editor_mode');
    if (saved === '1') setEditorMode(true);
  }, []);

  useEffect(() => {
    localStorage.setItem('dm_editor_mode', editorMode ? '1' : '0');
  }, [editorMode]);

  const normalizePhotoSet = (raw: PhotoSet) => {
    const normalizePhotos = (photos: PhotoMetadata[]) =>
      photos.map((photo) => ({
        ...photo,
        timestamp: photo.timestamp ? new Date(photo.timestamp) : undefined
      }));
    return {
      ...raw,
      damagePhotos: normalizePhotos(raw.damagePhotos),
      preconditionPhotos: normalizePhotos(raw.preconditionPhotos),
      completionPhotos: normalizePhotos(raw.completionPhotos)
    };
  };

  useEffect(() => {
    if (window.electron?.ipcRenderer) {
      const cleanup = window.electron.ipcRenderer.on('damage-map-data', (data: { photoSet: PhotoSet }) => {
        setPhotoSet(normalizePhotoSet(data.photoSet));
      });

      const highlightCleanup = window.electron.ipcRenderer.on('highlight-photo-on-map', (photoName: string | null) => {
        setHighlightedPhotoName(photoName);
        mapRef.current?.highlightPhoto(photoName);
      });

      return () => { cleanup(); highlightCleanup(); };
    }

    const readFromStorage = () => {
      try {
        const raw = localStorage.getItem('dm_map_photoSet');
        if (!raw) return;
        const parsed = JSON.parse(raw) as PhotoSet;
        setPhotoSet(normalizePhotoSet(parsed));
      } catch (error) {
        console.error('Failed to read map data from storage:', error);
      }
    };

    readFromStorage();
    const onStorage = (event: StorageEvent) => {
      if (event.key === 'dm_map_photoSet') readFromStorage();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const handlePhotoSelect = (type: 'damage' | 'precondition' | 'completion', photo: PhotoMetadata) => {
    // Optionally send this back to the main window
    // window.electron.ipcRenderer.send('map-photo-selected', { type, photo });
  };

  const handleDistanceChange = (distanceMeters: number, source: 'auto' | 'manual' | 'photo') => {
    setLastMeasuredDistance(distanceMeters);
    // Optionally send this back to the main window
    // window.electron.ipcRenderer.send('map-distance-changed', { distanceMeters, source });
  };

  if (!photoSet) {
    return <div className="flex items-center justify-center h-screen">Loading map data...</div>;
  }

  return (
    <div className="h-screen w-screen">
      <div className="absolute top-0 left-0 right-0 p-3 border-b bg-gradient-header text-primary-foreground z-50">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold">Photo Locations & Measurements</h3>
            {lastMeasuredDistance && (
                <div className="flex items-center gap-1 mt-1 bg-primary-foreground/10 px-2 py-1 rounded">
                  <span className="font-medium">Last Measured: {lastMeasuredDistance.toFixed(1)}m</span>
                </div>
              )}
          </div>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setEditorMode(!editorMode)}
            >
              {editorMode ? 'Hide Tools' : 'Editor Mode'}
            </Button>
            {editorMode && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => mapRef.current?.toggleSatelliteView()}
                  title="Toggle base map"
                  className="bg-background/70 text-foreground hover:bg-background/90"
                >
                  <Satellite className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => mapRef.current?.toggleMeasurement()}
                  title="Manual ruler"
                  className="bg-background/70 text-foreground hover:bg-background/90"
                >
                  <Ruler className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => mapRef.current?.togglePhotoMeasurement()}
                  title="Photo distance"
                  className="bg-background/70 text-foreground hover:bg-background/90"
                >
                  <MousePointer2 className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => mapRef.current?.clearMeasurements()}
                  title="Clear measurements"
                  className="bg-background/70 text-foreground hover:bg-background/90"
                >
                  Clear
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
      <DamageMap
        ref={mapRef}
        photoSet={photoSet}
        visible={true} // Always visible in its own window
        fullHeight={true}
        onPhotoSelect={handlePhotoSelect}
        onDistanceChange={handleDistanceChange}
        highlightedPhotoName={highlightedPhotoName}
      />
    </div>
  );
};

createRoot(document.getElementById("map-root")!).render(
  <React.StrictMode>
    <MapApp />
  </React.StrictMode>
);
