import { Fragment, useEffect, useMemo, useState } from "react";
import { Circle, Layer, Line, Stage } from "react-konva";
import type Konva from "konva";
import type {
  MapDrawingLine,
  MapDrawingLineColor,
  MapDrawingLineStyle
} from "../../../shared/types/mapDrawingLine";

export type MapDrawingTool = "freehand" | "straight" | "curve";

type MapDrawingLayerProps = {
  width: number;
  height: number;
  lines: MapDrawingLine[];
  isDrawingEnabled: boolean;
  lineColor: MapDrawingLineColor;
  lineStyle: MapDrawingLineStyle;
  drawingTool: MapDrawingTool;
  onCreateLine: (pointsPct: number[], style: MapDrawingLineStyle, color: MapDrawingLineColor) => Promise<void>;
  linesOpacity?: number;
  linesRevealProgress?: number;
  selectedLineId?: number | null;
};

const DRAWING_LINE_COLOR_HEX: Record<MapDrawingLineColor, string> = {
  red: "#E65050",
  yellow: "#DBB060",
  blue: "#3B82F6",
  white: "#F7F7F2",
  black: "#11151B"
};

function getDash(style: MapDrawingLineStyle) {
  switch (style) {
    case "dashed":
      return [18, 12];
    case "dotted":
      return [2, 14];
    default:
      return [];
  }
}

function toCanvasPoints(pointsPct: number[], width: number, height: number) {
  const result: number[] = [];

  for (let index = 0; index < pointsPct.length; index += 2) {
    result.push((pointsPct[index] / 100) * width);
    result.push((pointsPct[index + 1] / 100) * height);
  }

  return result;
}

function getPartialCanvasPoints(points: number[], progress: number) {
  if (progress >= 1 || points.length < 4) {
    return points;
  }

  const segments: Array<{ startX: number; startY: number; endX: number; endY: number; length: number }> = [];
  let totalLength = 0;

  for (let index = 0; index < points.length - 2; index += 2) {
    const startX = points[index];
    const startY = points[index + 1];
    const endX = points[index + 2];
    const endY = points[index + 3];
    const length = Math.hypot(endX - startX, endY - startY);
    segments.push({ startX, startY, endX, endY, length });
    totalLength += length;
  }

  if (!segments.length || totalLength === 0) {
    return points.slice(0, 4);
  }

  const targetLength = totalLength * Math.min(Math.max(progress, 0), 1);
  const partialPoints = [segments[0].startX, segments[0].startY];
  let traversedLength = 0;

  for (const segment of segments) {
    const nextTraversedLength = traversedLength + segment.length;

    if (targetLength >= nextTraversedLength) {
      partialPoints.push(segment.endX, segment.endY);
      traversedLength = nextTraversedLength;
      continue;
    }

    const localProgress = segment.length === 0 ? 0 : (targetLength - traversedLength) / segment.length;
    partialPoints.push(
      segment.startX + (segment.endX - segment.startX) * localProgress,
      segment.startY + (segment.endY - segment.startY) * localProgress
    );
    break;
  }

  return partialPoints.length >= 4 ? partialPoints : points.slice(0, 4);
}

function clampPct(value: number) {
  return Math.min(Math.max(value, 0), 100);
}

type PointPct = {
  xPct: number;
  yPct: number;
};

function buildStraightLinePoints(startPoint: PointPct, endPoint: PointPct) {
  return [startPoint.xPct, startPoint.yPct, endPoint.xPct, endPoint.yPct];
}

function buildCurvedLinePoints(startPoint: PointPct, endPoint: PointPct, controlPoint: PointPct) {
  const result: number[] = [];

  for (let step = 0; step <= 32; step += 1) {
    const t = step / 32;
    const oneMinusT = 1 - t;
    const x =
      oneMinusT * oneMinusT * startPoint.xPct +
      2 * oneMinusT * t * controlPoint.xPct +
      t * t * endPoint.xPct;
    const y =
      oneMinusT * oneMinusT * startPoint.yPct +
      2 * oneMinusT * t * controlPoint.yPct +
      t * t * endPoint.yPct;
    result.push(x, y);
  }

  return result;
}

export function MapDrawingLayer({
  width,
  height,
  lines,
  isDrawingEnabled,
  lineColor,
  lineStyle,
  drawingTool,
  onCreateLine,
  linesOpacity = 1,
  linesRevealProgress = 1,
  selectedLineId = null
}: MapDrawingLayerProps) {
  const [currentPointsPct, setCurrentPointsPct] = useState<number[]>([]);
  const [isPointerDown, setIsPointerDown] = useState(false);
  const [isSavingLine, setIsSavingLine] = useState(false);
  const [curveStartPoint, setCurveStartPoint] = useState<PointPct | null>(null);
  const [curveEndPoint, setCurveEndPoint] = useState<PointPct | null>(null);
  const [previewPoint, setPreviewPoint] = useState<PointPct | null>(null);

  useEffect(() => {
    if (!isDrawingEnabled) {
      setCurrentPointsPct([]);
      setIsPointerDown(false);
      setCurveStartPoint(null);
      setCurveEndPoint(null);
      setPreviewPoint(null);
    }
  }, [isDrawingEnabled]);

  const renderedCurrentPoints = useMemo(
    () => toCanvasPoints(currentPointsPct, width, height),
    [currentPointsPct, height, width]
  );

  function getPointerPoint(stage: Konva.Stage) {
    const pointerPosition = stage.getPointerPosition();

    if (!pointerPosition || !width || !height) {
      return null;
    }

    return {
      xPct: clampPct((pointerPosition.x / width) * 100),
      yPct: clampPct((pointerPosition.y / height) * 100)
    };
  }

  function handlePointerDown(event: Konva.KonvaEventObject<PointerEvent>) {
    if (!isDrawingEnabled || isSavingLine) {
      return;
    }

    const stage = event.target.getStage();

    if (!stage) {
      return;
    }

    const point = getPointerPoint(stage);

    if (!point) {
      return;
    }

    if (drawingTool === "straight") {
      if (!curveStartPoint) {
        setCurveStartPoint(point);
        setPreviewPoint(point);
        return;
      }

      const nextLinePoints = buildStraightLinePoints(curveStartPoint, point);
      setCurveStartPoint(null);
      setPreviewPoint(null);
      setIsSavingLine(true);

      void onCreateLine(nextLinePoints, lineStyle, lineColor).finally(() => {
        setIsSavingLine(false);
      });
      return;
    }

    if (drawingTool === "curve") {
      if (!curveStartPoint) {
        setCurveStartPoint(point);
        setPreviewPoint(point);
        return;
      }

      if (!curveEndPoint) {
        setCurveEndPoint(point);
        setPreviewPoint(point);
        return;
      }

      const nextLinePoints = buildCurvedLinePoints(curveStartPoint, curveEndPoint, point);
      setCurveStartPoint(null);
      setCurveEndPoint(null);
      setPreviewPoint(null);
      setIsSavingLine(true);

      void onCreateLine(nextLinePoints, lineStyle, lineColor).finally(() => {
        setIsSavingLine(false);
      });
      return;
    }

    setCurrentPointsPct([point.xPct, point.yPct]);
    setIsPointerDown(true);
  }

  function handlePointerMove(event: Konva.KonvaEventObject<PointerEvent>) {
    if (!isDrawingEnabled || isSavingLine) {
      return;
    }

    const stage = event.target.getStage();

    if (!stage) {
      return;
    }

    const point = getPointerPoint(stage);

    if (!point) {
      return;
    }

    if (drawingTool === "straight") {
      if (curveStartPoint) {
        setPreviewPoint(point);
      }
      return;
    }

    if (drawingTool === "curve") {
      if (curveStartPoint) {
        setPreviewPoint(point);
      }
      return;
    }

    if (!isPointerDown) {
      return;
    }

    setCurrentPointsPct((current) => [...current, point.xPct, point.yPct]);
  }

  async function finishCurrentLine() {
    if (!isPointerDown) {
      return;
    }

    setIsPointerDown(false);

    if (currentPointsPct.length < 4) {
      setCurrentPointsPct([]);
      return;
    }

    setIsSavingLine(true);

    try {
      await onCreateLine(currentPointsPct, lineStyle, lineColor);
    } finally {
      setCurrentPointsPct([]);
      setIsSavingLine(false);
    }
  }

  const pointToPointPreview = useMemo(() => {
    if (drawingTool === "straight") {
      if (!curveStartPoint || !previewPoint) {
        return [];
      }

      return toCanvasPoints(buildStraightLinePoints(curveStartPoint, previewPoint), width, height);
    }

    if (drawingTool === "curve") {
      if (!curveStartPoint || !curveEndPoint || !previewPoint) {
        return [];
      }

      return toCanvasPoints(buildCurvedLinePoints(curveStartPoint, curveEndPoint, previewPoint), width, height);
    }

    return [];
  }, [curveEndPoint, curveStartPoint, drawingTool, height, previewPoint, width]);

  const pointMarkers = useMemo(() => {
    if (drawingTool === "straight") {
      return curveStartPoint ? [curveStartPoint] : [];
    }

    if (drawingTool === "curve") {
      return [curveStartPoint, curveEndPoint].filter(Boolean) as PointPct[];
    }

    return [];
  }, [curveEndPoint, curveStartPoint, drawingTool]);

  if (!width || !height) {
    return null;
  }

  return (
    <Stage
      className={isDrawingEnabled ? "drawing-stage drawing-stage-active" : "drawing-stage"}
      height={height}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={() => void finishCurrentLine()}
      onPointerLeave={() => void finishCurrentLine()}
      width={width}
    >
      <Layer listening={false}>
        {lines.map((line) => {
          const points = getPartialCanvasPoints(toCanvasPoints(line.pointsPct, width, height), linesRevealProgress);
          const isSelected = line.id === selectedLineId;

          return (
            <Fragment key={line.id}>
              {isSelected ? (
                <Line
                  dash={getDash(line.style)}
                  lineCap="round"
                  lineJoin="round"
                  listening={false}
                  opacity={linesOpacity * 0.9}
                  points={points}
                  stroke="#81D2F7"
                  strokeWidth={12}
                />
              ) : null}
              <Line
                dash={getDash(line.style)}
                lineCap="round"
                lineJoin="round"
                listening={false}
                opacity={linesOpacity}
                points={points}
                stroke={DRAWING_LINE_COLOR_HEX[line.color]}
                strokeWidth={6}
              />
            </Fragment>
          );
        })}
        {renderedCurrentPoints.length >= 4 ? (
          <Line
            dash={getDash(lineStyle)}
            lineCap="round"
            lineJoin="round"
            listening={false}
            points={renderedCurrentPoints}
            stroke={DRAWING_LINE_COLOR_HEX[lineColor]}
            strokeWidth={6}
          />
        ) : null}
        {pointToPointPreview.length >= 4 ? (
          <Line
            dash={getDash(lineStyle)}
            lineCap="round"
            lineJoin="round"
            listening={false}
            points={pointToPointPreview}
            stroke={DRAWING_LINE_COLOR_HEX[lineColor]}
            strokeWidth={6}
          />
        ) : null}
        {pointMarkers.map((point, index) => (
          <Circle
            key={`marker-${index}`}
            fill={DRAWING_LINE_COLOR_HEX[lineColor]}
            listening={false}
            radius={6}
            stroke={DRAWING_LINE_COLOR_HEX[lineColor]}
            strokeWidth={0}
            x={(point.xPct / 100) * width}
            y={(point.yPct / 100) * height}
          />
        ))}
      </Layer>
    </Stage>
  );
}
