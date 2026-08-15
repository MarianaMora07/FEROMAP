import type { MazeDefinition, MazePoint } from './mazeTypes';
import type { DemoAcoAntDecision } from './demoAcoFrames';
import { mazeNodeId } from './mazeGraph';
import {
  collectMazeEdgePheromoneValues,
  computePheromoneRange,
  pheromoneLineWidth,
  pheromoneToCss,
} from './pheromoneColor';

export interface MazeCanvasTheme {
  cellFill: string;
  cellStroke: string;
  wallStroke: string;
  bestPathStroke: string;
  antMarkerStroke: string;
  startFill: string;
  endFill: string;
  markerStroke: string;
}

export const MAZE_CANVAS_THEME_LIGHT: MazeCanvasTheme = {
  cellFill: '#f1f5f9',
  cellStroke: '#e2e8f0',
  wallStroke: '#334155',
  bestPathStroke: '#34d634',
  antMarkerStroke: '#0f172a',
  startFill: '#1143f3',
  endFill: '#f59e0b',
  markerStroke: '#0f172a',
};

export const MAZE_CANVAS_THEME_DARK: MazeCanvasTheme = {
  cellFill: '#1e293b',
  cellStroke: '#334155',
  wallStroke: '#94a3b8',
  bestPathStroke: '#93f555',
  antMarkerStroke: '#f1f5f9',
  startFill: '#3b82f6',
  endFill: '#fbbf24',
  markerStroke: '#0f172a',
};

export const MAZE_ANT_TRAIL_COLORS = [
  '#94a3b8',
  '#a78bfa',
  '#f472b6',
  '#2dd4bf',
  '#fb923c',
  '#60a5fa',
  '#e879f9',
  '#4ade80',
  '#f87171',
  '#38bdf8',
  '#c084fc',
  '#facc15',
] as const;

export interface MazeCanvasLayout {
  width: number;
  height: number;
  cellSize: number;
  offsetX: number;
  offsetY: number;
}

export function computeMazeCanvasLayout(
  maze: MazeDefinition,
  canvasWidth: number,
  canvasHeight: number,
  padding = 16,
): MazeCanvasLayout {
  const innerWidth = Math.max(canvasWidth - padding * 2, 1);
  const innerHeight = Math.max(canvasHeight - padding * 2, 1);
  const cellSize = Math.min(innerWidth / maze.width, innerHeight / maze.height);
  const gridWidth = cellSize * maze.width;
  const gridHeight = cellSize * maze.height;
  const offsetX = (canvasWidth - gridWidth) / 2;
  const offsetY = (canvasHeight - gridHeight) / 2;

  return {
    width: canvasWidth,
    height: canvasHeight,
    cellSize,
    offsetX,
    offsetY,
  };
}

export function mazeCellCenter(layout: MazeCanvasLayout, point: MazePoint): { x: number; y: number } {
  return {
    x: layout.offsetX + point.x * layout.cellSize + layout.cellSize / 2,
    y: layout.offsetY + point.y * layout.cellSize + layout.cellSize / 2,
  };
}

export interface MazeCanvasDrawOptions {
  maze: MazeDefinition;
  pheromone: number[][];
  bestPath: MazePoint[];
  antPaths?: Array<{ id: number; path: MazePoint[]; completed: boolean }>;
  activeAntId?: number | null;
  decision?: DemoAcoAntDecision | null;
  showPheromones?: boolean;
  showAntTrails?: boolean;
  showBestPath?: boolean;
  theme?: MazeCanvasTheme;
}

export function drawMazeCanvas(
  ctx: CanvasRenderingContext2D,
  layout: MazeCanvasLayout,
  options: MazeCanvasDrawOptions,
): void {
  const theme = options.theme ?? MAZE_CANVAS_THEME_LIGHT;
  const { maze } = options;
  const showAntTrails = options.showAntTrails ?? false;
  const pheromoneAlpha = showAntTrails ? 0.38 : 0.72;

  ctx.clearRect(0, 0, layout.width, layout.height);
  drawCells(ctx, layout, maze, theme);

  if (options.showPheromones) {
    drawPheromoneEdges(ctx, layout, maze, options.pheromone, theme, pheromoneAlpha);
  }

  if (showAntTrails && options.antPaths) {
    drawAntTrails(ctx, layout, options.antPaths);
    drawAntFootprints(ctx, layout, options.antPaths);
  }

  const showBestPath = options.showBestPath ?? true;
  if (showBestPath && options.bestPath.length >= 2) {
    const bestWidth = Math.max(4, layout.cellSize * 0.2);
    drawPathLine(ctx, layout, options.bestPath, {
      strokeStyle: theme.bestPathStroke,
      lineWidth: bestWidth + 4,
      alpha: 0.22,
      dashed: false,
    });
    drawPathLine(ctx, layout, options.bestPath, {
      strokeStyle: theme.bestPathStroke,
      lineWidth: bestWidth,
      alpha: 1,
      dashed: false,
    });
  }

  if (showAntTrails && options.antPaths) {
    drawAntHeadMarkers(ctx, layout, options.antPaths, theme, options.activeAntId);
  }

  if (options.decision) {
    drawDecisionOverlay(ctx, layout, options.decision, theme);
  }

  if (options.activeAntId != null && options.antPaths) {
    const activeAnt = options.antPaths.find((ant) => ant.id === options.activeAntId);
    if (activeAnt && activeAnt.path.length > 0) {
      const head = activeAnt.path[activeAnt.path.length - 1]!;
      const center = mazeCellCenter(layout, head);
      const radius = layout.cellSize * 0.26;
      ctx.save();
      ctx.beginPath();
      ctx.arc(center.x, center.y, radius + 3, 0, Math.PI * 2);
      ctx.strokeStyle = theme.antMarkerStroke;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.35;
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = MAZE_ANT_TRAIL_COLORS[activeAnt.id % MAZE_ANT_TRAIL_COLORS.length]!;
      ctx.fill();
      ctx.strokeStyle = theme.antMarkerStroke;
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.restore();
    }
  }

  drawStartEndMarkers(ctx, layout, maze, theme);
}

function drawCells(
  ctx: CanvasRenderingContext2D,
  layout: MazeCanvasLayout,
  maze: MazeDefinition,
  theme: MazeCanvasTheme,
): void {
  const { cellSize, offsetX, offsetY } = layout;

  for (const cell of maze.cells) {
    const x = offsetX + cell.x * cellSize;
    const y = offsetY + cell.y * cellSize;

    ctx.fillStyle = theme.cellFill;
    ctx.fillRect(x, y, cellSize, cellSize);

    ctx.strokeStyle = theme.cellStroke;
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, cellSize, cellSize);
  }

  ctx.strokeStyle = theme.wallStroke;
  ctx.lineWidth = Math.max(2, cellSize * 0.1);
  ctx.lineCap = 'square';

  for (const cell of maze.cells) {
    const x = offsetX + cell.x * cellSize;
    const y = offsetY + cell.y * cellSize;

    if (cell.walls.north) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + cellSize, y);
      ctx.stroke();
    }
    if (cell.walls.west) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + cellSize);
      ctx.stroke();
    }
    if (cell.walls.east) {
      ctx.beginPath();
      ctx.moveTo(x + cellSize, y);
      ctx.lineTo(x + cellSize, y + cellSize);
      ctx.stroke();
    }
    if (cell.walls.south) {
      ctx.beginPath();
      ctx.moveTo(x, y + cellSize);
      ctx.lineTo(x + cellSize, y + cellSize);
      ctx.stroke();
    }
  }
}

function drawPheromoneEdges(
  ctx: CanvasRenderingContext2D,
  layout: MazeCanvasLayout,
  maze: MazeDefinition,
  pheromone: number[][],
  theme: MazeCanvasTheme,
  alpha = 0.72,
): void {
  const values = collectMazeEdgePheromoneValues(maze.width, maze.cells, pheromone);
  const range = computePheromoneRange(values);
  const { cellSize, offsetX, offsetY } = layout;

  ctx.save();
  ctx.lineCap = 'round';

  for (const cell of maze.cells) {
    const fromId = mazeNodeId(maze.width, cell);
    const cx = offsetX + cell.x * cellSize + cellSize / 2;
    const cy = offsetY + cell.y * cellSize + cellSize / 2;

    if (!cell.walls.east && cell.x < maze.width - 1) {
      const toId = mazeNodeId(maze.width, { x: cell.x + 1, y: cell.y });
      const tau = pheromone[fromId]?.[toId] ?? range.min;
      const x2 = offsetX + (cell.x + 1) * cellSize + cellSize / 2;
      ctx.strokeStyle = pheromoneToCss(tau, range, alpha);
      ctx.lineWidth = pheromoneLineWidth(tau, range, cellSize);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(x2, cy);
      ctx.stroke();
    }

    if (!cell.walls.south && cell.y < maze.height - 1) {
      const toId = mazeNodeId(maze.width, { x: cell.x, y: cell.y + 1 });
      const tau = pheromone[fromId]?.[toId] ?? range.min;
      const y2 = offsetY + (cell.y + 1) * cellSize + cellSize / 2;
      ctx.strokeStyle = pheromoneToCss(tau, range, alpha);
      ctx.lineWidth = pheromoneLineWidth(tau, range, cellSize);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx, y2);
      ctx.stroke();
    }
  }

  ctx.restore();
}

function drawAntTrails(
  ctx: CanvasRenderingContext2D,
  layout: MazeCanvasLayout,
  antPaths: Array<{ id: number; path: MazePoint[]; completed: boolean }>,
): void {
  for (const ant of antPaths) {
    if (ant.path.length < 2) continue;
    const color = MAZE_ANT_TRAIL_COLORS[ant.id % MAZE_ANT_TRAIL_COLORS.length]!;
    drawPathLine(ctx, layout, ant.path, {
      strokeStyle: color,
      lineWidth: Math.max(3, layout.cellSize * 0.13),
      alpha: ant.completed ? 0.82 : 0.68,
      dashed: !ant.completed,
    });
  }
}

function drawAntFootprints(
  ctx: CanvasRenderingContext2D,
  layout: MazeCanvasLayout,
  antPaths: Array<{ id: number; path: MazePoint[]; completed: boolean }>,
): void {
  const radius = Math.max(2, layout.cellSize * 0.09);

  for (const ant of antPaths) {
    if (ant.path.length === 0) continue;
    const color = MAZE_ANT_TRAIL_COLORS[ant.id % MAZE_ANT_TRAIL_COLORS.length]!;

    ctx.save();
    for (let index = 0; index < ant.path.length; index++) {
      const center = mazeCellCenter(layout, ant.path[index]!);
      ctx.beginPath();
      ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.globalAlpha = ant.completed ? 0.65 : 0.5;
      ctx.fill();
    }
    ctx.restore();
  }
}

function drawAntHeadMarkers(
  ctx: CanvasRenderingContext2D,
  layout: MazeCanvasLayout,
  antPaths: Array<{ id: number; path: MazePoint[]; completed: boolean }>,
  theme: MazeCanvasTheme,
  activeAntId?: number | null,
): void {
  for (const ant of antPaths) {
    if (ant.path.length === 0 || ant.id === activeAntId) continue;
    const head = ant.path[ant.path.length - 1]!;
    const center = mazeCellCenter(layout, head);
    const radius = layout.cellSize * 0.16;
    const color = MAZE_ANT_TRAIL_COLORS[ant.id % MAZE_ANT_TRAIL_COLORS.length]!;

    ctx.save();
    ctx.beginPath();
    ctx.arc(center.x, center.y, radius + 2, 0, Math.PI * 2);
    ctx.strokeStyle = theme.antMarkerStroke;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.35;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.globalAlpha = ant.completed ? 0.92 : 0.78;
    ctx.fill();
    ctx.strokeStyle = theme.antMarkerStroke;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 1;
    ctx.stroke();
    ctx.restore();
  }
}

function drawDecisionOverlay(
  ctx: CanvasRenderingContext2D,
  layout: MazeCanvasLayout,
  decision: DemoAcoAntDecision,
  theme: MazeCanvasTheme,
): void {
  const from = mazeCellCenter(layout, decision.from);
  const chosen = mazeCellCenter(layout, decision.chosen);
  const antColor = MAZE_ANT_TRAIL_COLORS[decision.antId % MAZE_ANT_TRAIL_COLORS.length]!;

  ctx.save();
  for (let index = 0; index < decision.candidates.length; index++) {
    const candidate = decision.candidates[index]!;
    const isChosen =
      candidate.x === decision.chosen.x && candidate.y === decision.chosen.y;
    const center = mazeCellCenter(layout, candidate);
    const probability = decision.candidateProbabilities[index] ?? 0;
    const radius = layout.cellSize * (isChosen ? 0.22 : 0.14 + probability * 0.08);

    ctx.beginPath();
    ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
    if (isChosen) {
      ctx.fillStyle = antColor;
      ctx.globalAlpha = 0.92;
      ctx.fill();
      ctx.strokeStyle = theme.antMarkerStroke;
      ctx.lineWidth = 2.5;
      ctx.stroke();
    } else {
      ctx.fillStyle = '#f8fafc';
      ctx.globalAlpha = 0.55;
      ctx.fill();
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  ctx.globalAlpha = 0.95;
  ctx.strokeStyle = antColor;
  ctx.fillStyle = antColor;
  ctx.lineWidth = Math.max(3, layout.cellSize * 0.1);
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(chosen.x, chosen.y);
  ctx.stroke();

  const angle = Math.atan2(chosen.y - from.y, chosen.x - from.x);
  const arrowSize = layout.cellSize * 0.14;
  ctx.beginPath();
  ctx.moveTo(chosen.x, chosen.y);
  ctx.lineTo(
    chosen.x - arrowSize * Math.cos(angle - Math.PI / 6),
    chosen.y - arrowSize * Math.sin(angle - Math.PI / 6),
  );
  ctx.lineTo(
    chosen.x - arrowSize * Math.cos(angle + Math.PI / 6),
    chosen.y - arrowSize * Math.sin(angle + Math.PI / 6),
  );
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

function drawPathLine(
  ctx: CanvasRenderingContext2D,
  layout: MazeCanvasLayout,
  path: MazePoint[],
  style: { strokeStyle: string; lineWidth: number; alpha: number; dashed: boolean },
): void {
  ctx.save();
  ctx.strokeStyle = style.strokeStyle;
  ctx.lineWidth = style.lineWidth;
  ctx.globalAlpha = style.alpha;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (style.dashed) {
    ctx.setLineDash([layout.cellSize * 0.15, layout.cellSize * 0.12]);
  }

  ctx.beginPath();
  const first = mazeCellCenter(layout, path[0]!);
  ctx.moveTo(first.x, first.y);
  for (let index = 1; index < path.length; index++) {
    const point = mazeCellCenter(layout, path[index]!);
    ctx.lineTo(point.x, point.y);
  }
  ctx.stroke();
  ctx.restore();
}

function drawStartEndMarkers(
  ctx: CanvasRenderingContext2D,
  layout: MazeCanvasLayout,
  maze: MazeDefinition,
  theme: MazeCanvasTheme,
): void {
  const radius = layout.cellSize * 0.28;

  drawMarker(ctx, layout, maze.start, theme.startFill, theme.markerStroke, radius, 'S');
  drawMarker(ctx, layout, maze.end, theme.endFill, theme.markerStroke, radius, 'M');
}

function drawMarker(
  ctx: CanvasRenderingContext2D,
  layout: MazeCanvasLayout,
  point: MazePoint,
  fill: string,
  stroke: string,
  radius: number,
  label: string,
): void {
  const center = mazeCellCenter(layout, point);
  ctx.save();
  ctx.beginPath();
  ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = stroke;
  ctx.font = `bold ${Math.max(10, layout.cellSize * 0.28)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, center.x, center.y);
  ctx.restore();
}
