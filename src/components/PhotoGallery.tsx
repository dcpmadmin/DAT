import { useState, useRef, useCallback, useEffect } from 'react';
import { RotateCw, ZoomIn, ZoomOut, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PhotoMetadata, GalleryType } from '@/types/damage-report';
import { getImageZoomTransform } from '@/utils/photo-processing';

interface PhotoGalleryProps {
  type: GalleryType;
  photos: PhotoMetadata[];
  selectedPhoto?: PhotoMetadata;
  onPhotoSelect: (photo: PhotoMetadata) => void;
  rotation: number;
  zoom: number;
  panX: number;
  panY: number;
  onRotate: () => void;
  onZoomToggle: () => void;
  onPan: (deltaX: number, deltaY: number) => void;
  visible: boolean;
}

export const PhotoGallery = ({
  type,
  photos,
  selectedPhoto,
  onPhotoSelect,
  rotation,
  zoom,
  panX,
  panY,
  onRotate,
  onZoomToggle,
  onPan,
  visible
}: PhotoGalleryProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const imageRef = useRef<HTMLImageElement>(null);
  const thumbContainerRef = useRef<HTMLDivElement>(null);
  const [thumbRange, setThumbRange] = useState({ start: 0, end: 0 });
  const [isImageLoading, setIsImageLoading] = useState(false);

  const THUMB_SIZE = 48;
  const THUMB_GAP = 6;
  const THUMB_ITEM = THUMB_SIZE + THUMB_GAP;
  const THUMB_BUFFER = 6;

  const getTypeColor = (type: GalleryType) => {
    switch (type) {
      case 'precondition': return 'precondition';
      case 'damage': return 'damage';
      case 'completion': return 'completion';
      default: return 'primary';
    }
  };

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (zoom > 1) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - panX, y: e.clientY - panY });
    }
  }, [zoom, panX, panY]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging && zoom > 1) {
      const deltaX = e.clientX - dragStart.x;
      const deltaY = e.clientY - dragStart.y;
      onPan(deltaX, deltaY);
    }
  }, [isDragging, zoom, dragStart, onPan]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const getCurrentPhotoIndex = () => {
    if (!selectedPhoto) return -1;
    return photos.findIndex(photo => photo.name === selectedPhoto.name);
  };

  const handlePreviousPhoto = () => {
    const currentIndex = getCurrentPhotoIndex();
    if (currentIndex > 0) {
      onPhotoSelect(photos[currentIndex - 1]);
    }
  };

  const handleNextPhoto = () => {
    const currentIndex = getCurrentPhotoIndex();
    if (currentIndex < photos.length - 1) {
      onPhotoSelect(photos[currentIndex + 1]);
    }
  };

  const updateThumbRange = useCallback(() => {
    const container = thumbContainerRef.current;
    if (!container) return;
    const width = container.clientWidth;
    const scrollLeft = container.scrollLeft;
    const start = Math.max(0, Math.floor(scrollLeft / THUMB_ITEM) - THUMB_BUFFER);
    const end = Math.min(
      photos.length,
      Math.ceil((scrollLeft + width) / THUMB_ITEM) + THUMB_BUFFER
    );
    setThumbRange((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
  }, [photos.length]);

  useEffect(() => {
    updateThumbRange();
    const container = thumbContainerRef.current;
    if (!container) return;
    let rafId = 0;
    const onScroll = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(updateThumbRange);
    };
    container.addEventListener('scroll', onScroll);
    window.addEventListener('resize', onScroll);
    return () => {
      container.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [updateThumbRange]);

  useEffect(() => {
    if (selectedPhoto) setIsImageLoading(true);
  }, [selectedPhoto?.name]);

  useEffect(() => {
    const container = thumbContainerRef.current;
    if (!container || !selectedPhoto) return;
    const index = photos.findIndex((photo) => photo.name === selectedPhoto.name);
    if (index < 0) return;
    const itemStart = index * THUMB_ITEM;
    const itemEnd = itemStart + THUMB_SIZE;
    if (itemStart < container.scrollLeft) {
      container.scrollLeft = itemStart;
    } else if (itemEnd > container.scrollLeft + container.clientWidth) {
      container.scrollLeft = itemEnd - container.clientWidth;
    }
  }, [selectedPhoto, photos]);

  if (!visible) return null;

  const getTypeStyles = () => {
    switch (type) {
      case 'precondition':
        return {
          bg: 'bg-precondition',
          text: 'text-precondition-foreground',
          hover: 'hover:opacity-90',
          border: 'border-precondition'
        };
      case 'damage':
        return {
          bg: 'bg-damage',
          text: 'text-damage-foreground',
          hover: 'hover:opacity-90',
          border: 'border-damage'
        };
      case 'completion':
        return {
          bg: 'bg-completion',
          text: 'text-completion-foreground',
          hover: 'hover:opacity-90',
          border: 'border-completion'
        };
      default:
        return {
          bg: 'bg-primary',
          text: 'text-primary-foreground',
          hover: 'hover:opacity-90',
          border: 'border-primary'
        };
    }
  };

  const styles = getTypeStyles();
  const range = thumbRange.end > 0 ? thumbRange : { start: 0, end: Math.min(photos.length, 24) };
  const visiblePhotos = photos.slice(range.start, range.end);
  const paddingLeft = range.start * THUMB_ITEM;
  const paddingRight = (photos.length - range.end) * THUMB_ITEM;

  return (
    <Card className="flex-1 bg-card shadow-lg overflow-hidden flex flex-col border h-full" style={{ minHeight: '640px' }}>
      {/* Improved Header */}
      <div className={`p-2 border-b ${styles.bg} ${styles.text} shadow-sm`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-sm capitalize tracking-wide">{type}</h3>
            {photos.length > 0 && (
              <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full">
                {photos.length} {photos.length === 1 ? 'photo' : 'photos'}
              </span>
            )}
          </div>
          <div className="flex gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              onClick={handlePreviousPhoto}
              disabled={getCurrentPhotoIndex() <= 0}
              className={`${styles.text} ${styles.hover} h-7 w-7 p-0 disabled:opacity-30 disabled:cursor-not-allowed`}
              title="Previous Photo"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleNextPhoto}
              disabled={getCurrentPhotoIndex() >= photos.length - 1}
              className={`${styles.text} ${styles.hover} h-7 w-7 p-0 disabled:opacity-30 disabled:cursor-not-allowed`}
              title="Next Photo"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
            <div className="w-px bg-white/30 mx-0.5" />
            <Button
              variant="ghost"
              size="sm"
              onClick={onRotate}
              className={`${styles.text} ${styles.hover} h-7 w-7 p-0`}
              title="Rotate 90"
            >
              <RotateCw className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onZoomToggle}
              className={`${styles.text} ${styles.hover} h-7 w-7 p-0`}
              title={zoom > 1 ? "Zoom Out" : "Zoom In"}
            >
              {zoom > 1 ? <ZoomOut className="w-4 h-4" /> : <ZoomIn className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      </div>

      {/* Main Photo Display - Larger viewing area */}
      <div className="flex-1 flex flex-col min-h-0 bg-gradient-gallery">
        <div className="flex-1 bg-muted/20 overflow-hidden relative" style={{ minHeight: '480px' }}>
          {selectedPhoto ? (
            <div 
              className={`w-full h-full flex items-start justify-center pt-2 photo-container cursor-move relative ${zoom > 1 ? 'zoomed' : ''}`}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            >
              <img
                ref={imageRef}
                src={selectedPhoto.url}
                alt={selectedPhoto.name}
                className="max-w-full max-h-full object-contain transition-all duration-200"
                style={{
                  transform: getImageZoomTransform(zoom, panX, panY, rotation),
                  transformOrigin: 'center center',
                  filter: 'drop-shadow(0 4px 6px rgba(0, 0, 0, 0.1))'
                }}
                draggable={false}
                loading="lazy"
                decoding="async"
                onLoad={() => setIsImageLoading(false)}
                onError={() => setIsImageLoading(false)}
              />
              {isImageLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/60">
                  <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              )}
            </div>
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <div className="w-20 h-20 bg-muted/50 rounded-full flex items-center justify-center mx-auto mb-4 border-2 border-dashed border-muted-foreground/30">
                  <ZoomIn className="w-10 h-10 text-muted-foreground/50" />
                </div>
                <p className="font-medium mb-1">No photo selected</p>
                <p className="text-sm text-muted-foreground/70">Click a thumbnail below to view</p>
              </div>
            </div>
          )}
        </div>

        {/* Improved Photo Info */}
        {selectedPhoto && (
          <div className="px-2 py-1 bg-background/80 backdrop-blur-sm border-t border-border/50">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-medium text-foreground truncate flex-1 mr-2" title={selectedPhoto.name}>
                {selectedPhoto.name}
              </p>
            </div>
          </div>
        )}

        {/* Improved Thumbnail Strip */}
        <div className="p-1.5 border-t bg-background/30">
          <div
            ref={thumbContainerRef}
            className="flex gap-1.5 overflow-x-auto pb-1 gallery-scroll"
            style={{ scrollbarWidth: 'thin', paddingLeft, paddingRight }}
          >
            {photos.length > 0 ? (
              visiblePhotos.map((photo) => {
                const isSelected = selectedPhoto?.name === photo.name;
                return (
                  <button
                    key={photo.name}
                    onClick={() => onPhotoSelect(photo)}
                    className={`flex-shrink-0 w-12 h-12 min-w-[48px] min-h-[48px] rounded overflow-hidden border-2 transition-all ${
                      isSelected 
                        ? `${styles.border} shadow-md` 
                        : 'border-border/40 hover:border-border/60'
                    }`}
                    title={photo.name}
                  >
                    <img
                      src={photo.url}
                      alt={photo.name}
                      className={`w-full h-full object-cover ${isSelected ? 'opacity-100' : 'opacity-80 hover:opacity-100'}`}
                      loading="lazy"
                    />
                  </button>
                );
              })
            ) : (
              <div className="flex-1 text-center py-3">
                <p className="text-xs text-muted-foreground">No {type} photos</p>
              </div>
            )}
          </div>
          
          {photos.length > 0 && (
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/30">
              <p className="text-xs font-medium text-muted-foreground">
                {photos.length} {photos.length === 1 ? 'photo' : 'photos'} total
              </p>
              {selectedPhoto && (
                <p className="text-xs font-semibold text-foreground">
                  {getCurrentPhotoIndex() + 1} / {photos.length}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
};
