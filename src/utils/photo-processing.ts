import exifr from 'exifr';
import { PhotoMetadata, PhotoSet, PhotoLocation } from '@/types/damage-report';

/**
 * Calculate distance between two GPS coordinates using Haversine formula (exported function)
 */
export function calculateDistance(
  lat1: number, 
  lon1: number, 
  lat2: number, 
  lon2: number
): number {
  const R = 6371; // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c * 1000; // Return distance in meters
}

/**
 * Extract metadata from image file including GPS location and orientation
 */
export async function extractPhotoMetadata(file: File): Promise<PhotoMetadata> {
  const url = URL.createObjectURL(file);
  
  try {
    // Parse EXIF data with GPS tags
    const exifData = await exifr.parse(file, {
      gps: true,
      exif: true,
      tiff: true
    });

    console.log('EXIF data for', file.name, ':', exifData);

    let location: PhotoLocation | undefined;
    
    // Try multiple ways to access GPS data
    if (exifData?.latitude && exifData?.longitude) {
      console.log('GPS data found (direct):', exifData.latitude, exifData.longitude);
      location = {
        latitude: exifData.latitude,
        longitude: exifData.longitude
      };
    } else if (exifData?.GPS) {
      console.log('GPS object found:', exifData.GPS);
      if (exifData.GPS.latitude && exifData.GPS.longitude) {
        console.log('GPS data found (via GPS object):', exifData.GPS.latitude, exifData.GPS.longitude);
        location = {
          latitude: exifData.GPS.latitude,
          longitude: exifData.GPS.longitude
        };
      }
    }

    return {
      file,
      name: file.name,
      url,
      location,
      orientation: exifData?.orientation,
      timestamp: exifData?.DateTimeOriginal || new Date(file.lastModified)
    };
  } catch (error) {
    console.warn(`Failed to extract EXIF data from ${file.name}:`, error);
    return {
      file,
      name: file.name,
      url,
      timestamp: new Date(file.lastModified)
    };
  }
}

/**
 * Process uploaded folder structure and group photos by damage ID
 */
export async function processFolderStructure(files: FileList): Promise<PhotoSet[]> {
  const photoSets = new Map<string, {
    damage: PhotoMetadata[];
    precondition: PhotoMetadata[];
    completion: PhotoMetadata[];
  }>();

  // Process each file
  for (const file of Array.from(files)) {
    // Skip non-image files
    if (!file.type.startsWith('image/')) {
      continue;
    }

    const pathParts = file.webkitRelativePath.split('/');
    if (pathParts.length < 3) {
      console.warn(`Skipping file with unexpected path structure: ${file.webkitRelativePath}`);
      continue;
    }

    // Find the photo type folder by searching for keywords in folder names
    // Look for folders containing: precondition, damage, completion, before, after
    let photoTypeFolder: string | null = null;
    let photoTypeIndex = -1;
    
    for (let i = 0; i < pathParts.length - 1; i++) {
      const folder = pathParts[i].toLowerCase().trim();
      if (
        folder.includes('precondition') || 
        folder.includes('pre-condition') ||
        folder.includes('pre_condition') ||
        folder.includes('before') ||
        folder.includes('damage') ||
        folder.includes('completion') ||
        folder.includes('after') ||
        folder.startsWith('01-') ||
        folder.startsWith('02-') ||
        folder.startsWith('03-')
      ) {
        photoTypeFolder = folder;
        photoTypeIndex = i;
        break;
      }
    }

    // If no photo type folder found, try the second-to-last folder (before filename)
    if (!photoTypeFolder && pathParts.length >= 2) {
      photoTypeFolder = pathParts[pathParts.length - 2].toLowerCase().trim();
      photoTypeIndex = pathParts.length - 2;
    }

    // Damage ID is the folder before the photo type folder, or pathParts[1] if structure is simple
    let damageId: string;
    if (photoTypeIndex > 0) {
      damageId = pathParts[photoTypeIndex - 1];
    } else if (pathParts.length >= 2) {
      damageId = pathParts[1];
    } else {
      damageId = pathParts[0];
    }
    
    // Debug logging for folder structure
    console.log(`Processing file: ${file.name}, Path: ${file.webkitRelativePath}, DamageID: "${damageId}", PhotoTypeFolder: "${photoTypeFolder}"`);
    
    // Initialize photo set if not exists
    if (!photoSets.has(damageId)) {
      photoSets.set(damageId, {
        damage: [],
        precondition: [],
        completion: []
      });
    }

    const photoMetadata = await extractPhotoMetadata(file);
    const set = photoSets.get(damageId)!;

    // Categorize by folder name - more flexible matching
    if (!photoTypeFolder) {
      console.warn(`  ⚠️  Could not determine photo type for ${file.name}, defaulting to DAMAGE`);
      set.damage.push(photoMetadata);
    } else {
      const folderLower = photoTypeFolder;
      if (folderLower.includes('damage') || folderLower.startsWith('02-') || folderLower.includes('02-damage')) {
        set.damage.push(photoMetadata);
        console.log(`  → Categorized as DAMAGE: ${file.name}`);
      } else if (
        folderLower.includes('precondition') || 
        folderLower.includes('pre-condition') ||
        folderLower.includes('pre_condition') ||
        folderLower.includes('before') ||
        folderLower.startsWith('01-') ||
        folderLower.includes('01-precondition')
      ) {
        set.precondition.push(photoMetadata);
        console.log(`  → Categorized as PRECONDITION: ${file.name}`);
      } else if (
        folderLower.includes('completion') || 
        folderLower.includes('after') ||
        folderLower.startsWith('03-') ||
        folderLower.includes('03-completion')
      ) {
        set.completion.push(photoMetadata);
        console.log(`  → Categorized as COMPLETION: ${file.name}`);
      } else {
        // Default to damage if unclear, but log a warning
        console.warn(`  ⚠️  Unclear folder name "${photoTypeFolder}" for ${file.name}, defaulting to DAMAGE`);
        set.damage.push(photoMetadata);
      }
    }
  }

  // Convert to PhotoSet array and process proximity
  const processedSets: PhotoSet[] = [];
  
  for (const [damageId, photos] of photoSets) {
    // Find reference location from damage photos
    const damageWithGPS = photos.damage.find(photo => photo.location);
    const referenceLocation = damageWithGPS?.location;

    let selectedPrecondition = photos.precondition;
    let selectedCompletion = photos.completion;

    // If we have a reference location, find 10 closest photos for each category
    if (referenceLocation) {
      selectedPrecondition = photos.precondition
        .filter(photo => photo.location)
        .sort((a, b) => {
          const distanceA = calculateDistance(
            referenceLocation.latitude, 
            referenceLocation.longitude,
            a.location!.latitude, 
            a.location!.longitude
          );
          const distanceB = calculateDistance(
            referenceLocation.latitude, 
            referenceLocation.longitude,
            b.location!.latitude, 
            b.location!.longitude
          );
          return distanceA - distanceB;
        })
        .slice(0, 10)
        .concat(photos.precondition.filter(photo => !photo.location)); // Add photos without GPS at the end

      selectedCompletion = photos.completion
        .filter(photo => photo.location)
        .sort((a, b) => {
          const distanceA = calculateDistance(
            referenceLocation.latitude, 
            referenceLocation.longitude,
            a.location!.latitude, 
            a.location!.longitude
          );
          const distanceB = calculateDistance(
            referenceLocation.latitude, 
            referenceLocation.longitude,
            b.location!.latitude, 
            b.location!.longitude
          );
          return distanceA - distanceB;
        })
        .slice(0, 10)
        .concat(photos.completion.filter(photo => !photo.location)); // Add photos without GPS at the end
    }

    processedSets.push({
      damageId,
      damagePhotos: photos.damage,
      preconditionPhotos: selectedPrecondition,
      completionPhotos: selectedCompletion,
      referenceLocation
    });
  }

  return processedSets.sort((a, b) => a.damageId.localeCompare(b.damageId));
}

/**
 * Apply rotation transformation to image orientation
 */
export function getImageTransform(rotation: number): string {
  return `rotate(${rotation}deg)`;
}

/**
 * Get zoom and pan transform for image viewing
 */
export function getImageZoomTransform(
  zoom: number, 
  panX: number, 
  panY: number, 
  rotation: number
): string {
  return `scale(${zoom}) translate(${panX}px, ${panY}px) rotate(${rotation}deg)`;
}