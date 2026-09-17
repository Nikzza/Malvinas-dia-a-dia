type PointPct = { xPct: number; yPct: number };

export function buildCirclePoints(start: PointPct, end: PointPct, width: number, height: number): number[] {
  if (width <= 0 || height <= 0) return [];

  const startX = (start.xPct / 100) * width;
  const startY = (start.yPct / 100) * height;
  const dx = ((end.xPct - start.xPct) / 100) * width;
  const dy = ((end.yPct - start.yPct) / 100) * height;
  const directionX = dx < 0 ? -1 : 1;
  const directionY = dy < 0 ? -1 : 1;
  const diameter = Math.min(
    Math.max(Math.abs(dx), Math.abs(dy)),
    directionX > 0 ? width - startX : startX,
    directionY > 0 ? height - startY : startY
  );

  if (diameter < 4) return [];

  // Build in pixels so non-square viewports still produce a circle, then store percentages.
  const radius = diameter / 2;
  const centerX = startX + directionX * radius;
  const centerY = startY + directionY * radius;
  const segments = Math.min(512, Math.max(64, Math.ceil(Math.PI * diameter / 4)));
  const points: number[] = [];

  for (let step = 0; step < segments; step += 1) {
    const angle = (step / segments) * Math.PI * 2;
    points.push(
      ((centerX + Math.cos(angle) * radius) / width) * 100,
      ((centerY + Math.sin(angle) * radius) / height) * 100
    );
  }

  points.push(points[0], points[1]);
  return points;
}
