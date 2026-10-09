/**
 * Hand-drawn pictorial SVG illustrations for the antique cartography aesthetic.
 * Generates Tolkien/Renaissance-style mountain ridges, volcanic cones,
 * forest tree groves, stone bastion fortresses, and nautical ocean embellishments.
 */

export interface MountainFeatureProps {
  id?: string;
  name?: string;
  elevation?: number;
  type?: 'volcano' | 'range' | 'ridge' | 'plateau' | 'summit' | string;
  rank?: number;
}

export interface ForestFeatureProps {
  id?: string;
  name?: string;
  type?: string;
  trees?: number;
}

export interface EmbellishmentProps {
  id?: string;
  name?: string;
  kind?: 'sea-monster' | 'ship' | 'compass-rose' | string;
  scale?: number;
}

/**
 * Hand-drawn pictorial mountain peak or ridge.
 */
export function renderMountainSvg(p: MountainFeatureProps = {}): string {
  const name = (p.name ?? '').toLowerCase();
  const isVolcano = p.type === 'volcano' || name.includes('gunung');
  const isRange = p.type === 'range' || p.type === 'ridge' || p.type === 'plateau' || name.includes('pegunungan') || name.includes('dataran');

  if (isRange) {
    // Overlapping 3-peak ridge cluster (like 'BERGENDAHL' in Tolkien reference)
    return `
      <svg class="hm-pictorial-mountain is-range" viewBox="0 0 56 30" width="42" height="23" aria-hidden="true">
        <!-- Mountain Silhouette & Translucent Land Fill -->
        <path d="M 2,28 L 12,12 L 18,17 L 28,4 L 38,16 L 44,11 L 54,28 Z" fill="var(--hm-mountain-fill, #E2C99D)" />

        <!-- Left Peak (x=12, y=12) -->
        <path d="M 2,28 L 12,12 L 20,28" fill="none" stroke="var(--hm-mountain-stroke, #221C16)" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" />
        <path d="M 12,12 L 13,28" fill="none" stroke="var(--hm-mountain-stroke, #221C16)" stroke-width="1.1" />
        <!-- Left Peak Hatching -->
        <path d="M 13,16 L 16,18 M 13,20 L 18,23 M 13,24 L 19,27" fill="none" stroke="var(--hm-mountain-hatch, rgba(34,28,22,0.6))" stroke-width="0.9" />

        <!-- Right Peak (x=44, y=11) -->
        <path d="M 36,28 L 44,11 L 54,28" fill="none" stroke="var(--hm-mountain-stroke, #221C16)" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" />
        <path d="M 44,11 L 45,28" fill="none" stroke="var(--hm-mountain-stroke, #221C16)" stroke-width="1.1" />
        <!-- Right Peak Hatching -->
        <path d="M 45,15 L 48,17 M 45,19 L 50,22 M 45,23 L 52,26" fill="none" stroke="var(--hm-mountain-hatch, rgba(34,28,22,0.6))" stroke-width="0.9" />

        <!-- Center Master Summit (x=28, y=4) -->
        <path d="M 16,28 L 28,4 L 40,28" fill="none" stroke="var(--hm-mountain-stroke, #221C16)" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />
        <path d="M 28,4 Q 28.5,16 29,28" fill="none" stroke="var(--hm-mountain-stroke, #221C16)" stroke-width="1.2" />
        <!-- Center Peak Shading Hachures (East slope) -->
        <path d="M 29,9 L 33,12 M 29,13 L 35,17 M 29,18 L 38,22 M 29,22 L 39,26" fill="none" stroke="var(--hm-mountain-hatch, rgba(34,28,22,0.6))" stroke-width="0.95" />

        <!-- Foothill contour ticks -->
        <path d="M 0,29 L 56,29 M 4,31 L 22,31 M 34,31 L 52,31" fill="none" stroke="var(--hm-mountain-stroke, #221C16)" stroke-width="1.0" stroke-linecap="round" opacity="0.8" />
      </svg>
    `;
  }

  if (isVolcano) {
    // Conical stratovolcano with crater and subtle ash plume (Merapi, Semeru, etc.)
    return `
      <svg class="hm-pictorial-mountain is-volcano" viewBox="0 0 46 32" width="34" height="24" aria-hidden="true">
        <!-- Mountain Silhouette & Fill -->
        <path d="M 3,30 C 10,22 17,14 20,7 L 26,7 C 29,14 36,22 43,30 Z" fill="var(--hm-mountain-fill, #E2C99D)" />

        <!-- Flanks Outline -->
        <path d="M 3,30 C 10,22 17,14 20,7" fill="none" stroke="var(--hm-mountain-stroke, #221C16)" stroke-width="1.4" stroke-linecap="round" />
        <path d="M 26,7 C 29,14 36,22 43,30" fill="none" stroke="var(--hm-mountain-stroke, #221C16)" stroke-width="1.4" stroke-linecap="round" />

        <!-- Crater Rim -->
        <ellipse cx="23" cy="7" rx="3.5" ry="1.4" fill="var(--hm-mountain-fill, #E2C99D)" stroke="var(--hm-mountain-stroke, #221C16)" stroke-width="1.2" />

        <!-- Wisp of volcanic ash/smoke -->
        <path d="M 23,5.5 Q 25,2 22,-0.5 Q 20,-3 24,-5" fill="none" stroke="var(--hm-mountain-stroke, #221C16)" stroke-width="0.85" stroke-dasharray="1.5 1.5" opacity="0.65" />

        <!-- Central Ridge Spine -->
        <path d="M 23,8.4 Q 23.5,18 24,30" fill="none" stroke="var(--hm-mountain-stroke, #221C16)" stroke-width="1.2" />

        <!-- Shadow Hatching on Eastern Flank -->
        <path d="M 23.5,12 L 29,14 M 23.8,16 L 32,19 M 24,20 L 35,24 M 24,25 L 39,28" fill="none" stroke="var(--hm-mountain-hatch, rgba(34,28,22,0.6))" stroke-width="0.95" />

        <!-- Base Contours -->
        <path d="M 1,31 L 45,31 M 6,33 L 20,33 M 28,33 L 41,33" fill="none" stroke="var(--hm-mountain-stroke, #221C16)" stroke-width="1.0" stroke-linecap="round" opacity="0.75" />
      </svg>
    `;
  }

  // Solitary Jagged Summit
  return `
    <svg class="hm-pictorial-mountain is-summit" viewBox="0 0 38 28" width="28" height="21" aria-hidden="true">
      <path d="M 3,26 L 19,3 L 35,26 Z" fill="var(--hm-mountain-fill, #E2C99D)" />
      <path d="M 3,26 L 19,3 L 35,26" fill="none" stroke="var(--hm-mountain-stroke, #221C16)" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M 19,3 Q 19.5,14 20,26" fill="none" stroke="var(--hm-mountain-stroke, #221C16)" stroke-width="1.2" />
      <path d="M 19.5,8 L 24,10 M 19.8,13 L 27,16 M 20,18 L 30,21 M 20,22 L 32,25" fill="none" stroke="var(--hm-mountain-hatch, rgba(34,28,22,0.6))" stroke-width="0.95" />
      <path d="M 1,27 L 37,27" fill="none" stroke="var(--hm-mountain-stroke, #221C16)" stroke-width="1.0" opacity="0.8" />
    </svg>
  `;
}

/**
 * Hand-drawn pictorial tree grove matching the "Murksap Bog" clusters in the reference image.
 */
export function renderForestSvg(p: ForestFeatureProps): string {
  return `
    <svg class="hm-pictorial-forest" viewBox="0 0 46 26" width="46" height="26" aria-hidden="true">
      <!-- Back Row Trees -->
      <!-- Tree 1 (Back-Left) -->
      <path d="M 9,13 L 9,19" stroke="var(--hm-tree-stroke, #2D3A2C)" stroke-width="1.2" stroke-linecap="round" />
      <path d="M 5,13 C 2,11 3,7 7,6 C 8,4 12,4 13,6 C 16,7 16,11 13,13 Z" fill="var(--hm-tree-canopy, rgba(102,128,102,0.35))" stroke="var(--hm-tree-stroke, #2D3A2C)" stroke-width="1.1" stroke-linejoin="round" />

      <!-- Tree 2 (Back-Center, High) -->
      <path d="M 21,11 L 21,18" stroke="var(--hm-tree-stroke, #2D3A2C)" stroke-width="1.2" stroke-linecap="round" />
      <path d="M 17,11 C 14,9 15,5 19,4 C 20,2 24,2 25,4 C 28,5 28,9 25,11 Z" fill="var(--hm-tree-canopy, rgba(102,128,102,0.35))" stroke="var(--hm-tree-stroke, #2D3A2C)" stroke-width="1.1" stroke-linejoin="round" />

      <!-- Tree 3 (Back-Right) -->
      <path d="M 34,13 L 34,19" stroke="var(--hm-tree-stroke, #2D3A2C)" stroke-width="1.2" stroke-linecap="round" />
      <path d="M 30,13 C 27,11 28,7 32,6 C 33,4 37,4 38,6 C 41,7 41,11 38,13 Z" fill="var(--hm-tree-canopy, rgba(102,128,102,0.35))" stroke="var(--hm-tree-stroke, #2D3A2C)" stroke-width="1.1" stroke-linejoin="round" />

      <!-- Front Row Trees (Overlapping) -->
      <!-- Tree 4 (Front-Left) -->
      <path d="M 14,17 L 14,23" stroke="var(--hm-tree-stroke, #2D3A2C)" stroke-width="1.3" stroke-linecap="round" />
      <path d="M 10,17 C 7,15 8,11 12,10 C 13,8 17,8 18,10 C 21,11 21,15 18,17 Z" fill="var(--hm-tree-canopy, rgba(102,128,102,0.45))" stroke="var(--hm-tree-stroke, #2D3A2C)" stroke-width="1.2" stroke-linejoin="round" />

      <!-- Tree 5 (Front-Right) -->
      <path d="M 27,17 L 27,23" stroke="var(--hm-tree-stroke, #2D3A2C)" stroke-width="1.3" stroke-linecap="round" />
      <path d="M 23,17 C 20,15 21,11 25,10 C 26,8 30,8 31,10 C 34,11 34,15 31,17 Z" fill="var(--hm-tree-canopy, rgba(102,128,102,0.45))" stroke="var(--hm-tree-stroke, #2D3A2C)" stroke-width="1.2" stroke-linejoin="round" />

      <!-- Forest floor grass tufts -->
      <path d="M 7,24 L 11,24 M 13,24.5 L 17,24.5 M 25,24.5 L 30,24.5 M 33,24 L 37,24" stroke="var(--hm-tree-stroke, #2D3A2C)" stroke-width="0.85" stroke-linecap="round" opacity="0.6" />
    </svg>
  `;
}

/**
 * Hand-drawn stone star bastion / fortress icon.
 */
export function renderFortressSvg(color = '#1F3A5F'): string {
  return `
    <svg class="hm-pictorial-fort" viewBox="0 0 26 26" width="22" height="22" aria-hidden="true">
      <!-- Star Bastion Points -->
      <polygon points="13,2 16,8 22,5 19,11 25,13 19,15 22,21 16,18 13,24 10,18 4,21 7,15 1,13 7,11 4,5 10,8"
        fill="var(--hm-land, #ECE3CD)" stroke="var(--hm-colour, ${color})" stroke-width="1.4" stroke-linejoin="round" />

      <!-- Inner Keep / Citadel -->
      <rect x="9.5" y="9.5" width="7" height="7" fill="var(--hm-colour, ${color})" stroke="var(--hm-land, #ECE3CD)" stroke-width="0.8" />

      <!-- Pennant flag on central mast -->
      <path d="M 13,9.5 L 13,3 L 17,5 L 13,7" fill="var(--hm-colour, ${color})" stroke="none" />
    </svg>
  `;
}

/**
 * Hand-drawn nautical ocean embellishments (Sea Monster, Ship, Compass Rose).
 */
export function renderEmbellishmentSvg(kind: string): string {
  if (kind === 'sea-monster') {
    // Javanese Naga Laut / antique sea serpent
    return `
      <svg class="hm-nautical-embellishment is-monster" viewBox="0 0 72 40" width="72" height="40" aria-hidden="true">
        <!-- Serpent Coils & Spines -->
        <path d="M 6,32 C 10,24 16,24 20,32 C 24,20 32,18 38,32 C 42,16 52,14 58,26 C 62,22 66,24 68,28"
          fill="none" stroke="var(--hm-watermark, rgba(40,55,50,0.22))" stroke-width="1.4" stroke-linecap="round" />

        <!-- Dragon Head & Crest -->
        <path d="M 58,26 C 60,18 65,16 68,18 C 70,19 71,22 68,25 C 65,26 62,25 60,26"
          fill="none" stroke="var(--hm-watermark, rgba(40,55,50,0.22))" stroke-width="1.3" />
        <path d="M 66,17 L 69,13 M 64,18 L 66,14" stroke="var(--hm-watermark, rgba(40,55,50,0.22))" stroke-width="1.0" />

        <!-- Dorsal fin spines on body arches -->
        <path d="M 15,25 L 15,22 M 17,25 L 18,21 M 30,21 L 30,17 M 33,21 L 34,18 M 49,18 L 49,14 M 52,19 L 53,15"
          stroke="var(--hm-watermark, rgba(40,55,50,0.22))" stroke-width="1.1" stroke-linecap="round" />

        <!-- Water waves and splashing foam -->
        <path d="M 2,34 Q 8,31 14,34 Q 20,37 26,34 Q 32,31 38,34 Q 44,37 50,34 Q 56,31 62,34 Q 67,37 71,34"
          fill="none" stroke="var(--hm-watermark, rgba(40,55,50,0.22))" stroke-width="1.0" opacity="0.75" />
      </svg>
    `;
  }

  if (kind === 'ship') {
    // Historical VOC Galleon / Javanese Pinisi with sails and rigging
    return `
      <svg class="hm-nautical-embellishment is-ship" viewBox="0 0 54 48" width="54" height="48" aria-hidden="true">
        <!-- Ship Hull & Sterncastle -->
        <path d="M 6,34 C 14,35 38,35 48,31 C 49,34 46,38 38,39 L 14,39 C 8,39 5,36 6,34 Z"
          fill="var(--hm-mountain-fill, #E2C99D)" stroke="var(--hm-watermark, rgba(40,55,50,0.22))" stroke-width="1.3" />

        <!-- Main Masts -->
        <path d="M 18,34 L 18,12 M 32,34 L 32,8 M 44,32 L 44,16" stroke="var(--hm-watermark, rgba(40,55,50,0.22))" stroke-width="1.2" />

        <!-- Billowing Sails -->
        <!-- Foremast Sail -->
        <path d="M 12,14 Q 18,17 24,14 L 23,26 Q 18,29 13,26 Z" fill="var(--hm-mountain-fill, #E2C99D)" stroke="var(--hm-watermark, rgba(40,55,50,0.22))" stroke-width="1.1" />
        <!-- Mainmast Sail -->
        <path d="M 25,10 Q 32,13 39,10 L 38,24 Q 32,27 26,24 Z" fill="var(--hm-mountain-fill, #E2C99D)" stroke="var(--hm-watermark, rgba(40,55,50,0.22))" stroke-width="1.1" />
        <!-- Mizzen Sail -->
        <path d="M 40,18 Q 44,20 48,18 L 47,27 Q 44,29 41,27 Z" fill="var(--hm-mountain-fill, #E2C99D)" stroke="var(--hm-watermark, rgba(40,55,50,0.22))" stroke-width="1.0" />

        <!-- Rigging Stays & Pennant Flags -->
        <path d="M 8,34 L 18,12 L 32,8 L 44,16 L 48,31" fill="none" stroke="var(--hm-watermark, rgba(40,55,50,0.22))" stroke-width="0.75" stroke-dasharray="2 1" />
        <path d="M 32,8 L 37,9 L 32,10" fill="var(--hm-watermark, rgba(40,55,50,0.22))" />

        <!-- Ocean wave swells -->
        <path d="M 2,38 Q 12,35 22,38 Q 32,41 42,38 Q 48,36 52,38" fill="none" stroke="var(--hm-watermark, rgba(40,55,50,0.22))" stroke-width="1.0" />
      </svg>
    `;
  }

  // Compass Rose (Rosa Ventorum)
  return `
    <svg class="hm-nautical-embellishment is-compass" viewBox="0 0 56 56" width="56" height="56" aria-hidden="true">
      <circle cx="28" cy="28" r="24" fill="none" stroke="var(--hm-watermark, rgba(40,55,50,0.22))" stroke-width="0.85" />
      <circle cx="28" cy="28" r="16" fill="none" stroke="var(--hm-watermark, rgba(40,55,50,0.22))" stroke-width="0.6" stroke-dasharray="2 2" />

      <!-- North Point (Shaded & Lit) -->
      <polygon points="28,4 28,28 25,28" fill="var(--hm-watermark, rgba(40,55,50,0.22))" />
      <polygon points="28,4 28,28 31,28" fill="none" stroke="var(--hm-watermark, rgba(40,55,50,0.22))" stroke-width="0.9" />

      <!-- South Point -->
      <polygon points="28,52 28,28 31,28" fill="var(--hm-watermark, rgba(40,55,50,0.22))" />
      <polygon points="28,52 28,28 25,28" fill="none" stroke="var(--hm-watermark, rgba(40,55,50,0.22))" stroke-width="0.9" />

      <!-- East Point -->
      <polygon points="52,28 28,28 28,25" fill="var(--hm-watermark, rgba(40,55,50,0.22))" />
      <polygon points="52,28 28,28 28,31" fill="none" stroke="var(--hm-watermark, rgba(40,55,50,0.22))" stroke-width="0.9" />

      <!-- West Point -->
      <polygon points="4,28 28,28 28,31" fill="var(--hm-watermark, rgba(40,55,50,0.22))" />
      <polygon points="4,28 28,28 28,25" fill="none" stroke="var(--hm-watermark, rgba(40,55,50,0.22))" stroke-width="0.9" />

      <!-- Ordinal Points (NE, NW, SE, SW) -->
      <polygon points="45,11 28,28 26,26" fill="var(--hm-watermark, rgba(40,55,50,0.22))" opacity="0.7" />
      <polygon points="11,11 28,28 26,30" fill="var(--hm-watermark, rgba(40,55,50,0.22))" opacity="0.7" />
      <polygon points="45,45 28,28 30,26" fill="var(--hm-watermark, rgba(40,55,50,0.22))" opacity="0.7" />
      <polygon points="11,45 28,28 30,30" fill="var(--hm-watermark, rgba(40,55,50,0.22))" opacity="0.7" />

      <!-- Center Hub -->
      <circle cx="28" cy="28" r="2.5" fill="var(--hm-watermark, rgba(40,55,50,0.22))" />
    </svg>
  `;
}
