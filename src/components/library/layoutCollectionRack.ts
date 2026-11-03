/**
 * Layout for the zoomed-out collection wall: the shelf rack the wall has always
 * had. The rack keeps the size of the original placeholder wall, so a collection
 * that does not fill it leaves shelves empty in view instead of zooming in to
 * fit the games it holds.
 */

export interface RackPoint {
  x: number;
  y: number;
}

export interface CollectionRack {
  /** One slot per non-featured game, in reading order. */
  slots: RackPoint[];
  /** Every rack row from top to bottom, featured rows included. */
  rows: number[];
  /** Rack edges: the grid, not the covers that happen to fill it. */
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

interface RackOptions {
  spacing?: number;
  /** Row pitch; defaults to the featured rows' own pitch. */
  rowGap?: number;
  /** Rack width in slots; widened to an odd number so the stagger lines up. */
  columns?: number;
  /** Empty rows above and below the featured pair, before the rack grows. */
  rowsAbove?: number;
  rowsBelow?: number;
}

interface RackRow {
  y: number;
  half: boolean;
  featured: RackPoint[];
}

/**
 * Rows alternate between `columns` slots on the shelf's own grid and
 * `columns - 1` slots offset by half a cover, the same stagger the featured
 * shelf already uses (four on top, five below). The featured rows fill first so
 * the shelf reads as one continuous run; the remaining games spread evenly over
 * the rows above, nearest the shelf first, centred in each row. Whatever is left
 * over stays an empty slot, which is why the wall shows a collection with room
 * to grow.
 */
export function layoutCollectionRack(
  featured: RackPoint[],
  extraCount: number,
  options: RackOptions = {},
): CollectionRack {
  const spacing = options.spacing ?? 1.34;
  const count = Math.max(0, Math.floor(extraCount));

  const grouped = new Map<number, RackPoint[]>();
  for (const point of featured) {
    const key = Math.round(point.y * 100);
    const row = grouped.get(key);
    if (row) row.push(point);
    else grouped.set(key, [point]);
  }
  const featuredRows: RackRow[] = [...grouped.values()]
    .map((points) => ({ y: points[0].y, half: isHalfOffset(points[0].x, spacing), featured: points }))
    .sort((a, b) => b.y - a.y);
  if (!featuredRows.length) featuredRows.push({ y: 0, half: false, featured: [] });

  const top = featuredRows[0];
  const bottom = featuredRows[featuredRows.length - 1];
  const rowGap =
    featuredRows.length > 1
      ? (top.y - bottom.y) / (featuredRows.length - 1)
      : (options.rowGap ?? 1.485);
  const shelfY = (top.y + bottom.y) / 2;

  const aligns = (width: number) =>
    featuredRows.every((row) =>
      row.featured.every((point) =>
        rowSlots(row.half, width, spacing).some((x) => Math.abs(point.x - x) < spacing * 0.25),
      ),
    );

  let columns = Math.max(1, Math.round(options.columns ?? 11));
  if (columns % 2 === 0) columns += 1;
  // Widen only if a featured sleeve does not land on the grid.
  while (columns < 81 && !aligns(columns)) columns += 2;

  const rowsFor = (above: number, below: number): RackRow[] => {
    const rows: RackRow[] = [];
    for (let index = above; index >= 1; index--) {
      rows.push({
        y: top.y + index * rowGap,
        half: top.half !== (index % 2 === 1),
        featured: [],
      });
    }
    rows.push(...featuredRows);
    for (let index = 1; index <= below; index++) {
      rows.push({
        y: bottom.y - index * rowGap,
        half: bottom.half !== (index % 2 === 1),
        featured: [],
      });
    }
    return rows;
  };

  const freeSlots = (row: RackRow) =>
    rowSlots(row.half, columns, spacing)
      .filter((x) => !row.featured.some((point) => Math.abs(point.x - x) < spacing * 0.75))
      .map((x) => ({ x, y: row.y }));

  // Grow upward when the collection outgrows the rack.
  let above = Math.max(0, Math.floor(options.rowsAbove ?? 3));
  const below = Math.max(0, Math.floor(options.rowsBelow ?? 0));
  const capacity = (rows: RackRow[]) => rows.reduce((sum, row) => sum + freeSlots(row).length, 0);
  let rows = rowsFor(above, below);
  while (capacity(rows) < count) {
    above += 1;
    rows = rowsFor(above, below);
  }

  // Centre outwards within a row, so leftovers become gaps at the row's ends.
  const centreOut = (row: RackRow) =>
    freeSlots(row).sort((a, b) => Math.abs(a.x) - Math.abs(b.x) || a.x - b.x);

  const chosen: RackPoint[] = [];
  for (const slot of featuredRows.flatMap(centreOut)) {
    if (chosen.length >= count) break;
    chosen.push(slot);
  }
  const outer = rows
    .filter((row) => !row.featured.length)
    .sort((a, b) => Math.abs(a.y - shelfY) - Math.abs(b.y - shelfY))
    .map(centreOut);
  let filled = true;
  while (chosen.length < count && filled) {
    filled = false;
    for (const slots of outer) {
      const slot = slots.shift();
      if (!slot) continue;
      chosen.push(slot);
      filled = true;
      if (chosen.length >= count) break;
    }
  }
  chosen.sort((a, b) => b.y - a.y || a.x - b.x);

  const halfSpan = ((columns - 1) / 2) * spacing;
  return {
    slots: chosen,
    rows: rows.map((row) => row.y),
    minX: -halfSpan,
    maxX: halfSpan,
    minY: rows[rows.length - 1].y,
    maxY: rows[0].y,
  };
}

function isHalfOffset(x: number, spacing: number) {
  const steps = x / spacing;
  return Math.abs(steps - Math.round(steps)) > 0.25;
}

/** Slot centres for one row; `columns` is odd, half-offset rows hold one fewer. */
function rowSlots(half: boolean, columns: number, spacing: number) {
  const reach = (columns - 1) / 2;
  const xs: number[] = [];
  if (half) {
    for (let index = -reach; index < reach; index++) xs.push((index + 0.5) * spacing);
  } else {
    for (let index = -reach; index <= reach; index++) xs.push(index * spacing);
  }
  return xs;
}
