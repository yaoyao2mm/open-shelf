/**
 * Layout utility for category wall covers.
 * Generates centered two-row layouts for any number of covers.
 */

export interface WallPosition {
  x: number;
  y: number;
  z: number;
}

const ALBUM_SIZE = 1.168;
const HORIZONTAL_SPACING = 1.32; // x spacing between covers
const VERTICAL_SPACING = 1.5; // y spacing between rows
const BASE_Y = 0.835; // top row y position
const BASE_Z = -1.19; // z position for all covers

/**
 * Layout covers in a centered two-row grid.
 * Top row gets ceil(count/2), bottom row gets floor(count/2).
 * Each row is centered around x=0.
 * 
 * For featured wall (9 covers), returns the exact original groupPosition values.
 * For other categories, computes centered layout.
 */
export function layoutWall(count: number, featured: boolean = false): WallPosition[] {
  // Featured wall uses exact original positions
  if (featured && count === 9) {
    return [
      { x: -2, y: 0.835, z: -1.19 },
      { x: -0.66, y: 0.835, z: -1.19 },
      { x: 0.66, y: 0.835, z: -1.19 },
      { x: 2, y: 0.835, z: -1.19 },
      { x: -2.66, y: -0.65, z: -1.19 },
      { x: -1.34, y: -0.65, z: -1.19 },
      { x: -0.005, y: -0.65, z: -1.19 },
      { x: 1.34, y: -0.65, z: -1.19 },
      { x: 2.66, y: -0.65, z: -1.19 },
    ];
  }

  const positions: WallPosition[] = [];
  
  // Split into two rows: top row gets more if odd count
  const topRowCount = Math.ceil(count / 2);
  const bottomRowCount = Math.floor(count / 2);
  
  // Top row
  const topRowWidth = (topRowCount - 1) * HORIZONTAL_SPACING;
  const topRowStartX = -topRowWidth / 2;
  for (let i = 0; i < topRowCount; i++) {
    positions.push({
      x: topRowStartX + i * HORIZONTAL_SPACING,
      y: BASE_Y,
      z: BASE_Z,
    });
  }
  
  // Bottom row (centered independently)
  if (bottomRowCount > 0) {
    const bottomRowWidth = (bottomRowCount - 1) * HORIZONTAL_SPACING;
    const bottomRowStartX = -bottomRowWidth / 2;
    const bottomRowY = BASE_Y - VERTICAL_SPACING;
    for (let i = 0; i < bottomRowCount; i++) {
      positions.push({
        x: bottomRowStartX + i * HORIZONTAL_SPACING,
        y: bottomRowY,
        z: BASE_Z,
      });
    }
  }
  
  return positions;
}

/**
 * Get position for a single cover at index in a wall layout.
 */
export function getWallPosition(index: number, totalCount: number, featured: boolean = false): WallPosition {
  const positions = layoutWall(totalCount, featured);
  return positions[index] || { x: 0, y: BASE_Y, z: BASE_Z };
}
