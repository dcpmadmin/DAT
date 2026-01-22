import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import L from 'leaflet';
import { Card } from '@/components/ui/card';
import { PhotoSet, PhotoMetadata } from '@/types/damage-report';
import { calculateDistance } from '@/utils/photo-processing';

// Fix for default markers in Leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface DamageMapProps {
  photoSet?: PhotoSet;
  visible: boolean;
  onPhotoSelect?: (type: 'damage' | 'precondition' | 'completion', photo: PhotoMetadata) => void;
  onDistanceChange?: (distanceMeters: number, source: 'auto' | 'manual' | 'photo') => void;
  highlightedPhotoName?: string;
  fullHeight?: boolean;
  height?: number;
  variant?: 'full' | 'compact';
}

export type DamageMapHandle = {
  toggleSatelliteView: () => void;
  toggleMeasurement: () => void;
  togglePhotoMeasurement: () => void;
  clearMeasurements: () => void;
  setEditorMode: (v: boolean) => void;
  getState: () => { satelliteView: boolean; measuring: boolean; photoMeasuring: boolean; editorMode: boolean };
  highlightPhoto: (photoName: string | null) => void;
};

export const DamageMap = forwardRef<DamageMapHandle, DamageMapProps>(({ photoSet, visible, onPhotoSelect, onDistanceChange, highlightedPhotoName, fullHeight, height, variant = 'full' }, ref) => {
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const [satelliteView, setSatelliteView] = useState(false);
  const [measuring, setMeasuring] = useState(false);
  const [photoMeasuring, setPhotoMeasuring] = useState(false);
  const [autoDistance, setAutoDistance] = useState<number | null>(null);
  const [selectedPhotoMarkers, setSelectedPhotoMarkers] = useState<{first?: {photo: PhotoMetadata, type: string}, second?: {photo: PhotoMetadata, type: string}}>({});
  const [editorMode, setEditorMode] = useState(false);
  const [showLabels, setShowLabels] = useState(variant !== 'compact');
  const [photoTypeFilter, setPhotoTypeFilter] = useState<'all' | 'damage' | 'precondition' | 'completion'>('all');
  const [showAutoDistance, setShowAutoDistance] = useState(variant !== 'compact');
  const measureLayerRef = useRef<L.LayerGroup | null>(null);
  const originalIcons = useRef<Record<string, L.DivIcon>>({});
  const markersRef = useRef<L.Marker[]>([]);
  const isCompact = variant === 'compact';

  // Persist editor mode across re-mounts so tools don't "disappear"
  useEffect(() => {
    const saved = localStorage.getItem('dm_editor_mode');
    if (saved === '1') setEditorMode(true);
  }, []);

  useEffect(() => {
    localStorage.setItem('dm_editor_mode', editorMode ? '1' : '0');
  }, [editorMode]);

  useEffect(() => {
    if (!visible || !mapContainerRef.current) return;

    // Initialize map
    if (!mapRef.current) {
      mapRef.current = L.map(mapContainerRef.current, {
        zoomControl: true,
        scrollWheelZoom: true,
      }).setView([40.7128, -74.0060], 13); // Default to NYC

      // Add base tile layers
      const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
      });

      const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
      });

      // Add default layer
      osmLayer.addTo(mapRef.current);

      // Initialize measure layer
      measureLayerRef.current = L.layerGroup().addTo(mapRef.current);

      // Store layers for later use
      (mapRef.current as any)._osmLayer = osmLayer;
      (mapRef.current as any)._satelliteLayer = satelliteLayer;
    }

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [visible]);

  useEffect(() => {
    if (!mapRef.current || !photoSet || !visible) return;

    // Clear existing markers (except those in measure layer)
    mapRef.current.eachLayer((layer) => {
      if (layer instanceof L.Marker && !measureLayerRef.current?.hasLayer(layer)) {
        mapRef.current!.removeLayer(layer);
      }
    });

    // Clear previous auto-distance measurements
    if (measureLayerRef.current) {
      measureLayerRef.current.eachLayer((layer) => {
        if ((layer as any)._autoDistance) {
          measureLayerRef.current!.removeLayer(layer);
        }
      });
    }

    const allPhotos = [
      ...photoSet.damagePhotos,
      ...photoSet.preconditionPhotos,
      ...photoSet.completionPhotos
    ];

    const photosWithLocation = allPhotos.filter(photo => photo.location);

    console.log('Photos with location:', photosWithLocation.length, 'out of', allPhotos.length);

    if (photosWithLocation.length === 0) {
      console.log('No photos with location data found');
      // Show a message on the map
      if (mapRef.current) {
        const center = mapRef.current.getCenter();
        const noDataDiv = document.createElement('div');
        noDataDiv.className = 'no-gps-message';
        noDataDiv.innerHTML = `
          <div style="
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            text-align: center;
            max-width: 300px;
          ">
            <h4 style="margin: 0 0 10px 0; font-weight: 600; color: #333;">No GPS Data Available</h4>
            <p style="margin: 0; color: #666; font-size: 14px;">
              Photos need GPS coordinates (EXIF data) to appear on the map.
              <br/>Upload photos taken with GPS-enabled devices.
            </p>
          </div>
        `;
        const noDataMarker = L.marker(center, {
          icon: L.divIcon({
            className: 'no-gps-marker',
            html: noDataDiv.outerHTML,
            iconSize: [300, 100],
            iconAnchor: [150, 50]
          })
        }).addTo(mapRef.current);
        (noDataMarker as any)._noDataMarker = true;
      }
      return;
    }

    // Create marker icons for different photo types
    const createIcon = (color: string, label: string, showLabel: boolean = true) => L.divIcon({
      className: 'custom-marker damage-map-marker',
      html: `<div style="
        width: 20px; 
        height: 20px; 
        border-radius: 50%; 
        background-color: ${color}; 
        border: 2px solid white; 
        box-shadow: 0 2px 4px rgba(0,0,0,0.3);
      "></div>${showLabel ? `<div style="
        position: absolute;
        bottom: 100%;
        left: 50%;
        transform: translateX(-50%);
        white-space: nowrap;
        background: rgba(0,0,0,0.7);
        color: white;
        padding: 2px 6px;
        border-radius: 3px;
        font-size: 10px;
        margin-bottom: 5px;
      ">${label}</div>` : ''}`,
      iconSize: [20, 20],
      iconAnchor: [10, 10]
    });

    // Use CSS variables for colors - get computed styles
    const getColorFromCSS = (cssVar: string) => {
      if (typeof window !== 'undefined') {
        const root = document.documentElement;
        const color = getComputedStyle(root).getPropertyValue(cssVar).trim();
        if (color) {
          // Convert HSL to RGB if needed, or use as-is
          return color.startsWith('hsl') ? color : `hsl(${color})`;
        }
      }
      // Fallback colors
      return cssVar.includes('damage') ? 'hsl(15, 85%, 55%)' :
             cssVar.includes('precondition') ? 'hsl(120, 60%, 45%)' :
             'hsl(45, 95%, 50%)';
    };

    const damageColor = getColorFromCSS('--damage');
    const preconditionColor = getColorFromCSS('--precondition');
    const completionColor = getColorFromCSS('--completion');

    const damageIcon = (label: string, showLabel: boolean = true) => createIcon(damageColor, label, showLabel);
    const preconditionIcon = (label: string, showLabel: boolean = true) => createIcon(preconditionColor, label, showLabel);
    const completionIcon = (label: string, showLabel: boolean = true) => createIcon(completionColor, label, showLabel);

    // Function to create a generic icon for restoring
    const getOriginalIcon = (type: string, photo: PhotoMetadata, index: number) => {
      switch (type) {
        case 'damage': return damageIcon(`${photo.name}` + (index + 1));
        case 'precondition': return preconditionIcon(`Precondition ${index + 1}`);
        case 'completion': return completionIcon(`Completion ${index + 1}`);
        default: return createIcon('#cccccc', 'Unknown');
      }
    };

    // Clear existing markers
    markersRef.current.forEach(marker => {
      mapRef.current!.removeLayer(marker);
    });
    markersRef.current = [];

    // Add markers for each photo type based on filter
    if (photoTypeFilter === 'all' || photoTypeFilter === 'damage') {
      photoSet.damagePhotos.forEach((photo, index) => {
        if (photo.location) {
          const label = photo.name;
          const icon = damageIcon(label, showLabels);
          originalIcons.current[photo.name] = icon;
          const marker = L.marker([photo.location.latitude, photo.location.longitude], { icon: icon })
            .bindPopup(`<strong>Damage Photo</strong><br/>${photo.name}`)
            .on('click', (e) => {
              if (measuring || photoMeasuring) {
                L.DomEvent.stopPropagation(e);
              }
              if (photoMeasuring) {
                handlePhotoMeasurement('damage', photo);
              } else {
                onPhotoSelect?.('damage', photo);
              }
            });
          marker.addTo(mapRef.current!);
          (marker as any)._photoData = { photo, type: 'damage', label };
          markersRef.current.push(marker);
        }
      });
    }

    if (photoTypeFilter === 'all' || photoTypeFilter === 'precondition') {
      photoSet.preconditionPhotos.forEach((photo, index) => {
        if (photo.location) {
          const label = photo.name;
          const icon = preconditionIcon(label, showLabels);
          originalIcons.current[photo.name] = icon;
          const marker = L.marker([photo.location.latitude, photo.location.longitude], { icon: icon })
            .bindPopup(`<strong>Precondition Photo</strong><br/>${photo.name}`)
            .on('click', (e) => {
              if (measuring || photoMeasuring) {
                L.DomEvent.stopPropagation(e);
              }
              if (photoMeasuring) {
                handlePhotoMeasurement('precondition', photo);
              } else {
                onPhotoSelect?.('precondition', photo);
              }
            });
          marker.addTo(mapRef.current!);
          (marker as any)._photoData = { photo, type: 'precondition', label };
          markersRef.current.push(marker);
        }
      });
    }

    if (photoTypeFilter === 'all' || photoTypeFilter === 'completion') {
      photoSet.completionPhotos.forEach((photo, index) => {
        if (photo.location) {
          const label = photo.name;
          const icon = completionIcon(label, showLabels);
          originalIcons.current[photo.name] = icon;
          const marker = L.marker([photo.location.latitude, photo.location.longitude], { icon: icon })
            .bindPopup(`<strong>Completion Photo</strong><br/>${photo.name}`)
            .on('click', (e) => {
              if (measuring || photoMeasuring) {
                L.DomEvent.stopPropagation(e);
              }
              if (photoMeasuring) {
                handlePhotoMeasurement('completion', photo);
              } else {
                onPhotoSelect?.('completion', photo);
              }
            });
          marker.addTo(mapRef.current!);
          (marker as any)._photoData = { photo, type: 'completion', label };
          markersRef.current.push(marker);
        }
      });
    }

    // Fit map to show all markers
    if (photosWithLocation.length > 0) {
      const group = new L.FeatureGroup(
        photosWithLocation.map(photo => 
          L.marker([photo.location!.latitude, photo.location!.longitude])
        )
      );
      mapRef.current.fitBounds(group.getBounds().pad(0.1));

      // Calculate automatic distance from first to last GPS point (only if showAutoDistance is true)
      if (photosWithLocation.length >= 2 && showAutoDistance) {
        // Clear existing auto distance first
        if (measureLayerRef.current) {
          measureLayerRef.current.eachLayer((layer) => {
            if ((layer as any)._autoDistance) {
              measureLayerRef.current!.removeLayer(layer);
            }
          });
        }
        
        const sortedPhotos = [...photosWithLocation].sort((a, b) => 
          (a.timestamp?.getTime() || 0) - (b.timestamp?.getTime() || 0)
        );
        const firstPhoto = sortedPhotos[0];
        const lastPhoto = sortedPhotos[sortedPhotos.length - 1];
        
        if (firstPhoto.location && lastPhoto.location) {
          const distance = calculateDistance(
            firstPhoto.location.latitude,
            firstPhoto.location.longitude,
            lastPhoto.location.latitude,
            lastPhoto.location.longitude
          );
          setAutoDistance(distance);
          onDistanceChange?.(distance, 'auto');
          const polyline = L.polyline([
            [firstPhoto.location.latitude, firstPhoto.location.longitude],
            [lastPhoto.location.latitude, lastPhoto.location.longitude]
          ], {
            color: '#3b82f6',
            weight: 3,
            opacity: 0.7,
            dashArray: '10, 10'
          }).addTo(measureLayerRef.current!);
          
          // Mark as auto-distance layer
          (polyline as any)._autoDistance = true;
          
          // Add distance label
          const midpoint = polyline.getCenter();
          const distanceMarker = L.marker(midpoint, {
            icon: L.divIcon({
              className: 'distance-label',
              html: `<div style="background: white; padding: 2px 6px; border-radius: 4px; font-size: 12px; font-weight: bold; border: 1px solid #3b82f6; color: #3b82f6;">Auto: ${distance.toFixed(1)}m</div>`,
              iconSize: [80, 20],
              iconAnchor: [40, 10]
            })
          }).addTo(measureLayerRef.current!);
          
          // Mark as auto-distance layer
          (distanceMarker as any)._autoDistance = true;
        }
      } else if (!showAutoDistance && measureLayerRef.current) {
        // Clear auto distance if toggle is off
        measureLayerRef.current.eachLayer((layer) => {
          if ((layer as any)._autoDistance) {
            measureLayerRef.current!.removeLayer(layer);
          }
        });
        if (photosWithLocation.length < 2) {
          setAutoDistance(null);
        }
      }
    }
  }, [photoSet, visible, onPhotoSelect, showLabels, photoTypeFilter, showAutoDistance]);

  useEffect(() => {
    if (!mapRef.current || !photoSet) return;

    mapRef.current.eachLayer((layer) => {
      if (layer instanceof L.Marker && (layer as any)._photoData) {
        const photoName = (layer as any)._photoData.photo.name;
        const originalIcon = originalIcons.current[photoName];
        
        if (photoName === highlightedPhotoName) {
          // Highlight this marker
          layer.setIcon(L.divIcon({
            className: 'highlighted-marker damage-map-marker',
            html: `<div style="
              width: 28px; 
              height: 28px; 
              border-radius: 50%; 
              background-color: #3b82f6; 
              border: 4px solid white; 
              box-shadow: 0 0 10px rgba(59, 130, 246, 0.7);
            "></div><div style="
              position: absolute;
              bottom: 100%;
              left: 50%;
              transform: translateX(-50%);
              white-space: nowrap;
              background: rgba(59, 130, 246, 0.9);
              color: white;
              padding: 2px 8px;
              border-radius: 4px;
              font-size: 11px;
              font-weight: bold;
              margin-bottom: 8px;
            ">${(layer as any)._photoData.label}</div>`,
            iconSize: [28, 28],
            iconAnchor: [14, 14]
          }));
          // Pan to and zoom the highlighted marker
          mapRef.current?.setView(layer.getLatLng(), mapRef.current.getZoom() < 15 ? 15 : mapRef.current.getZoom());

        } else if (originalIcon) {
          // Restore original icon
          layer.setIcon(originalIcon);
        }
      }
    });
  }, [highlightedPhotoName, photoSet]);

  // Handle satellite view toggle
  const toggleSatelliteView = () => {
    if (!mapRef.current) return;
    
    const map = mapRef.current as any;
    if (satelliteView) {
      map.removeLayer(map._satelliteLayer);
      map.addLayer(map._osmLayer);
      setSatelliteView(false);
    } else {
      map.removeLayer(map._osmLayer);
      map.addLayer(map._satelliteLayer);
      setSatelliteView(true);
    }
  };

  // Check if there are any measurements to clear
  const hasMeasurements = () => {
    if (!measureLayerRef.current) return false;
    let hasAny = false;
    measureLayerRef.current.eachLayer((layer) => {
      // Only count non-auto-distance measurements, or all if auto distance is hidden
      if (!showAutoDistance || !(layer as any)._autoDistance) {
        hasAny = true;
      }
    });
    return hasAny;
  };

  // Handle photo distance measurement
  const handlePhotoMeasurement = (type: string, photo: PhotoMetadata) => {
    if (!selectedPhotoMarkers.first) {
      setSelectedPhotoMarkers({ first: { photo, type } });
      
      // Highlight selected marker
      mapRef.current?.eachLayer((layer) => {
        if (layer instanceof L.Marker && (layer as any)._photoData?.photo === photo) {
          layer.setIcon(L.divIcon({
            className: 'selected-marker',
            html: `<div style="
              width: 24px; 
              height: 24px; 
              border-radius: 50%; 
              background-color: #3b82f6; 
              border: 3px solid white; 
              box-shadow: 0 2px 4px rgba(0,0,0,0.3);
            "></div>`,
            iconSize: [24, 24],
            iconAnchor: [12, 12]
          }));
        }
      });
    } else if (selectedPhotoMarkers.first.photo !== photo) {
      // Calculate distance between photos
      const first = selectedPhotoMarkers.first.photo;
      if (first.location && photo.location) {
        const distance = calculateDistance(
          first.location.latitude, first.location.longitude,
          photo.location.latitude, photo.location.longitude
        );
        
        // Draw line
        const polyline = L.polyline([
          [first.location.latitude, first.location.longitude],
          [photo.location.latitude, photo.location.longitude]
        ], {
          color: '#3b82f6',
          weight: 3,
          opacity: 0.8
        }).addTo(measureLayerRef.current!);
        
        // Add distance label
        const midpoint = polyline.getCenter();
        L.marker(midpoint, {
          icon: L.divIcon({
            className: 'distance-label',
            html: `<div style="background: white; padding: 2px 6px; border-radius: 4px; font-size: 12px; font-weight: bold; border: 1px solid #3b82f6; color: #3b82f6;">${selectedPhotoMarkers.first.type} to ${type}: ${distance.toFixed(1)}m</div>`,
            iconSize: [120, 20],
            iconAnchor: [60, 10]
          })
        }).addTo(measureLayerRef.current!);
        onDistanceChange?.(distance, 'photo');
      }
      
      // Reset selection
      setSelectedPhotoMarkers({});
      setPhotoMeasuring(false);
      
      // Restore original markers
      if (photoSet) {
        const allPhotos = [
          ...photoSet.damagePhotos.map(p => ({ photo: p, type: 'damage' })),
          ...photoSet.preconditionPhotos.map(p => ({ photo: p, type: 'precondition' })),
          ...photoSet.completionPhotos.map(p => ({ photo: p, type: 'completion' }))
        ];
        
        mapRef.current?.eachLayer((layer) => {
          if (layer instanceof L.Marker && (layer as any)._photoData) {
            const photoData = (layer as any)._photoData;
            const createIcon = (color: string) => L.divIcon({
              className: 'custom-marker',
              html: `<div style="
                width: 20px; 
                height: 20px; 
                border-radius: 50%; 
                background-color: ${color}; 
                border: 2px solid white; 
                box-shadow: 0 2px 4px rgba(0,0,0,0.3);
              "></div>`,
              iconSize: [20, 20],
              iconAnchor: [10, 10]
            });
            
            const getColorFromCSS = (type: string) => {
              if (typeof window !== 'undefined') {
                const root = document.documentElement;
                const cssVar = type === 'damage' ? '--damage' : 
                              type === 'precondition' ? '--precondition' : '--completion';
                const color = getComputedStyle(root).getPropertyValue(cssVar).trim();
                if (color) return color.startsWith('hsl') ? color : `hsl(${color})`;
              }
              return type === 'damage' ? 'hsl(15, 85%, 55%)' :
                     type === 'precondition' ? 'hsl(120, 60%, 45%)' :
                     'hsl(45, 95%, 50%)';
            };
            const iconColor = getColorFromCSS(photoData.type);
            layer.setIcon(createIcon(iconColor));
          }
        });
      }
    }
  };

  // Handle manual measurement
  const toggleMeasurement = () => {
    if (!mapRef.current || !measureLayerRef.current) return;
    
    if (measuring) {
      // Stop measuring - remove all event listeners and reset state
      mapRef.current.off('click');
      setMeasuring(false);
      
      // Clear any partial measurements
      measureLayerRef.current.eachLayer((layer) => {
        if ((layer as any)._measureMarker && !(layer as any)._measureDistance) {
          measureLayerRef.current!.removeLayer(layer);
        }
      });
    } else {
      // Start measuring
      let isFirstClick = true;
      let firstPoint: L.LatLng | null = null;
      
      setMeasuring(true);
      
      const handleMapClick = (e: L.LeafletMouseEvent) => {
        if (isFirstClick) {
          firstPoint = e.latlng;
          isFirstClick = false;
          
          // Add start marker with proper z-index
          const startMarker = L.marker(firstPoint, {
            icon: L.divIcon({
              className: 'measure-marker',
              html: '<div style="width: 8px; height: 8px; border-radius: 50%; background-color: #ef4444; border: 2px solid white; z-index: 1000;"></div>',
              iconSize: [12, 12],
              iconAnchor: [6, 6]
            }),
            zIndexOffset: 1000
          }).addTo(measureLayerRef.current!);
          (startMarker as any)._measureMarker = true;
        } else if (firstPoint) {
          // Add end marker and line
          const secondPoint = e.latlng;
          
          const endMarker = L.marker(secondPoint, {
            icon: L.divIcon({
              className: 'measure-marker',
              html: '<div style="width: 8px; height: 8px; border-radius: 50%; background-color: #ef4444; border: 2px solid white; z-index: 1000;"></div>',
              iconSize: [12, 12],
              iconAnchor: [6, 6]
            }),
            zIndexOffset: 1000
          }).addTo(measureLayerRef.current!);
          (endMarker as any)._measureMarker = true;
          
          const distance = calculateDistance(
            firstPoint.lat, firstPoint.lng,
            secondPoint.lat, secondPoint.lng
          );
          
          const polyline = L.polyline([firstPoint, secondPoint], {
            color: '#ef4444',
            weight: 3,
            opacity: 0.8
          }).addTo(measureLayerRef.current!);
          (polyline as any)._measureMarker = true;
          (polyline as any)._measureDistance = true;
          
          // Add distance label
          const midpoint = polyline.getCenter();
          const distanceMarker = L.marker(midpoint, {
            icon: L.divIcon({
              className: 'distance-label',
              html: `<div style="background: white; padding: 2px 6px; border-radius: 4px; font-size: 12px; font-weight: bold; border: 1px solid #ef4444; color: #ef4444; z-index: 1000;">${distance.toFixed(1)}m</div>`,
              iconSize: [60, 20],
              iconAnchor: [30, 10]
            }),
            zIndexOffset: 1000
          }).addTo(measureLayerRef.current!);
          (distanceMarker as any)._measureMarker = true;
          (distanceMarker as any)._measureDistance = true;
          onDistanceChange?.(distance, 'manual');
          
          // Reset for next measurement
          firstPoint = null;
          isFirstClick = true;
        }
      };
      
      mapRef.current.on('click', handleMapClick);
    }
  };

  // Toggle photo measurement mode
  const togglePhotoMeasurement = () => {
    setPhotoMeasuring(!photoMeasuring);
    if (photoMeasuring) {
      setSelectedPhotoMarkers({});
      // Restore original markers if needed
      if (photoSet) {
        mapRef.current?.eachLayer((layer) => {
          if (layer instanceof L.Marker && (layer as any)._photoData) {
            const photoData = (layer as any)._photoData;
            const createIcon = (color: string) => L.divIcon({
              className: 'custom-marker',
              html: `<div style="
                width: 20px; 
                height: 20px; 
                border-radius: 50%; 
                background-color: ${color}; 
                border: 2px solid white; 
                box-shadow: 0 2px 4px rgba(0,0,0,0.3);
              "></div>`,
              iconSize: [20, 20],
              iconAnchor: [10, 10]
            });
            
            const getColorFromCSS = (type: string) => {
              if (typeof window !== 'undefined') {
                const root = document.documentElement;
                const cssVar = type === 'damage' ? '--damage' : 
                              type === 'precondition' ? '--precondition' : '--completion';
                const color = getComputedStyle(root).getPropertyValue(cssVar).trim();
                if (color) return color.startsWith('hsl') ? color : `hsl(${color})`;
              }
              return type === 'damage' ? 'hsl(15, 85%, 55%)' :
                     type === 'precondition' ? 'hsl(120, 60%, 45%)' :
                     'hsl(45, 95%, 50%)';
            };
            const iconColor = getColorFromCSS(photoData.type);
            layer.setIcon(createIcon(iconColor));
          }
        });
      }
    }
  };

  // Clear all measurements
  const clearMeasurements = () => {
    if (measureLayerRef.current) {
      // Clear all measurements including auto-distance if showAutoDistance is false
      measureLayerRef.current.eachLayer((layer) => {
        if (!showAutoDistance || !(layer as any)._autoDistance) {
          measureLayerRef.current!.removeLayer(layer);
        }
      });
    }
    
    // Properly stop all measurement modes
    if (mapRef.current) {
      mapRef.current.off('click');
    }
    
    setMeasuring(false);
    setPhotoMeasuring(false);
    setSelectedPhotoMarkers({});
    
    // Clear auto distance if toggle is off
    if (!showAutoDistance) {
      setAutoDistance(null);
    }
  };

  useImperativeHandle(ref, () => ({
    toggleSatelliteView,
    toggleMeasurement,
    togglePhotoMeasurement,
    clearMeasurements,
    setEditorMode: (v: boolean) => setEditorMode(v),
    getState: () => ({ satelliteView, measuring, photoMeasuring, editorMode }),
    highlightPhoto: (photoName: string | null) => {
      // This will trigger the useEffect above
      // No direct state update here, prop change handles it
    }
  }));
  
  if (!visible) return null;

  if (!photoSet) {
    return (
      <Card className="h-[500px] flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground">No photo data available</p>
        </div>
      </Card>
    );
  }

  const mapHeight = fullHeight ? '100vh' : `${height ?? 500}px`;

  return (
    <div className="h-full w-full relative" style={{ height: mapHeight, minHeight: mapHeight }}>
      <Card className="h-full overflow-hidden shadow-map relative flex flex-col" style={{ height: mapHeight, minHeight: mapHeight }}>
        <div className={`border-b border-white/10 bg-slate-900/80 text-white backdrop-blur-md relative z-50 shadow-sm ${isCompact ? 'px-2 py-2' : 'p-3'}`}>
          <div className="flex items-center justify-between">
            <div>
              <h3 className={`font-semibold ${isCompact ? 'text-xs' : 'text-sm'}`}>Photo Locations</h3>
              {!isCompact && (
                <div className="flex gap-4 text-xs mt-1 flex-wrap text-white/80">
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 bg-damage rounded-full border border-white"></div>
                    <span>Damage ({photoSet?.damagePhotos.filter(p => p.location).length || 0})</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 bg-precondition rounded-full border border-white"></div>
                    <span>Precondition ({photoSet?.preconditionPhotos.filter(p => p.location).length || 0})</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 bg-completion rounded-full border border-white"></div>
                    <span>Completion ({photoSet?.completionPhotos.filter(p => p.location).length || 0})</span>
                  </div>
                  {autoDistance && showAutoDistance && (
                    <div className="flex items-center gap-1 ml-4 bg-white/10 px-2 py-1 rounded">
                      <span className="font-medium text-white">Auto Distance: {autoDistance.toFixed(1)}m</span>
                    </div>
                  )}
                </div>
              )}
            </div>
            
            <div className="flex gap-2 relative z-50 flex-wrap">
              {/* Toggle Labels */}
              {!isCompact && (
                <button
                  onClick={() => setShowLabels(!showLabels)}
                  className="px-3 py-1.5 text-xs bg-white/10 hover:bg-white/20 rounded transition-colors text-white border border-white/20"
                  title="Toggle photo labels"
                >
                  {showLabels ? 'Hide Labels' : 'Show Labels'}
                </button>
              )}
              
              {/* Filter by Photo Type */}
              <select
                value={photoTypeFilter}
                onChange={(e) => setPhotoTypeFilter(e.target.value as any)}
                className="px-2 py-1 text-xs bg-white/10 hover:bg-white/20 rounded transition-colors text-white border border-white/20"
                title="Filter photos by type"
              >
                <option value="all" className="text-slate-900 bg-white">All Photos</option>
                <option value="damage" className="text-slate-900 bg-white">Damage Only</option>
                <option value="precondition" className="text-slate-900 bg-white">Precondition Only</option>
                <option value="completion" className="text-slate-900 bg-white">Completion Only</option>
              </select>
              
              {/* Manual Measurement Toggle */}
              {!isCompact && (
                <button
                  onClick={() => toggleMeasurement()}
                  className={`px-3 py-1.5 text-xs rounded transition-colors text-white border border-white/20 ${
                    measuring 
                      ? 'bg-red-500/80 hover:bg-red-500 text-white' 
                      : 'bg-white/10 hover:bg-white/20'
                  }`}
                  title="Click two points on map to measure distance"
                >
                  {measuring ? 'Stop Measuring' : 'Measure Distance'}
                </button>
              )}
              
              {/* Clear Measurements Button */}
              {!isCompact && hasMeasurements() && (
                <button
                  onClick={() => clearMeasurements()}
                  className="px-3 py-1.5 text-xs bg-white/10 hover:bg-white/20 rounded transition-colors text-white border border-white/20"
                  title="Clear all measurements"
                >
                  Clear Measurements
                </button>
              )}
              
              {/* Toggle Auto Distance */}
              {!isCompact && autoDistance !== null && (
                <button
                  onClick={() => setShowAutoDistance(!showAutoDistance)}
                  className={`px-3 py-1.5 text-xs rounded transition-colors text-white border border-white/20 ${
                    showAutoDistance 
                      ? 'bg-white/10 hover:bg-white/20' 
                      : 'bg-white/5 hover:bg-white/10 opacity-60'
                  }`}
                  title="Toggle auto distance display"
                >
                  {showAutoDistance ? 'Hide Auto Distance' : 'Show Auto Distance'}
                </button>
              )}
              
              {/* Satellite View Toggle */}
              <button
                onClick={() => toggleSatelliteView()}
                className={`px-2 py-1 text-xs rounded transition-colors text-white border border-white/20 ${
                  satelliteView 
                    ? 'bg-blue-500/80 hover:bg-blue-500 text-white' 
                    : 'bg-white/10 hover:bg-white/20'
                }`}
                title="Toggle satellite/street map view"
              >
                {satelliteView ? 'Street Map' : 'Satellite'}
              </button>
            </div>
          </div>
        </div>
        <div
          ref={mapContainerRef}
          className="w-full relative z-10 flex-1"
        />
      </Card>
    </div>
  );
});
