import { useEffect, useMemo, useRef, useState } from "react";
import type {
  CSSProperties,
  DragEvent as ReactDragEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  WheelEvent as ReactWheelEvent
} from "react";
import type { Day, DayBackgroundMediaType } from "../../../shared/types/day";
import type { MapDrawingLine, MapDrawingLineStyle } from "../../../shared/types/mapDrawingLine";
import type { DayIcon } from "../../../shared/types/dayIcon";
import type { MapIconPlacement } from "../../../shared/types/mapIconPlacement";
import { MapDrawingLayer } from "./MapDrawingLayer";
import type { MapDrawingTool } from "./MapDrawingLayer";

type MapCanvasProps = {
  activeDay: Day | null;
  animatedPlacementPositions: Record<number, { x: number; y: number }>;
  drawingLines: MapDrawingLine[];
  drawingLineStyle: MapDrawingLineStyle;
  drawingTool: MapDrawingTool;
  dragLibraryIcon: DayIcon | null;
  isDrawingEnabled: boolean;
  isEditable: boolean;
  isTransitionEditing: boolean;
  onActivatePlacement?: (placement: MapIconPlacement) => void;
  onAddTransitionWaypoint: (posXPct: number, posYPct: number) => void;
  onCreateDrawingLine: (pointsPct: number[], style: MapDrawingLineStyle) => Promise<void>;
  onCreatePlacement: (libraryIconId: number, posXPct: number, posYPct: number) => Promise<void>;
  onMovePlacement: (placementId: number, posXPct: number, posYPct: number) => Promise<void>;
  onMoveTransitionWaypoint: (index: number, posXPct: number, posYPct: number) => void;
  onDeletePlacement: (placementId: number) => Promise<void>;
  onEditPlacement: (placement: MapIconPlacement) => void;
  onEditTransition: (placement: MapIconPlacement) => void;
  placements: MapIconPlacement[];
  transitionEditorSourcePlacement: MapIconPlacement | null;
  transitionEditorTargetPlacement: MapIconPlacement | null;
  transitionWaypointPointsPct: number[];
};

type Point = {
  x: number;
  y: number;
};

const MAX_ZOOM = 12;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function clampPan(pan: Point, renderedWidth: number, renderedHeight: number, viewportWidth: number, viewportHeight: number) {
  const maxPanX = Math.max(0, (renderedWidth - viewportWidth) / 2);
  const maxPanY = Math.max(0, (renderedHeight - viewportHeight) / 2);

  return {
    x: clamp(pan.x, -maxPanX, maxPanX),
    y: clamp(pan.y, -maxPanY, maxPanY)
  };
}

function clampPct(value: number) {
  return clamp(value, 0, 100);
}

function toSvgPolylinePoints(pointsPct: number[], width: number, height: number) {
  const points: string[] = [];

  for (let index = 0; index < pointsPct.length; index += 2) {
    points.push(`${(pointsPct[index] / 100) * width},${(pointsPct[index + 1] / 100) * height}`);
  }

  return points.join(" ");
}

export function MapCanvas({
  activeDay,
  animatedPlacementPositions,
  drawingLines,
  drawingLineStyle,
  drawingTool,
  dragLibraryIcon,
  isDrawingEnabled,
  isEditable,
  isTransitionEditing,
  onActivatePlacement,
  onAddTransitionWaypoint,
  onCreateDrawingLine,
  onCreatePlacement,
  onDeletePlacement,
  onEditPlacement,
  onEditTransition,
  onMovePlacement,
  onMoveTransitionWaypoint,
  placements
  ,
  transitionEditorSourcePlacement,
  transitionEditorTargetPlacement,
  transitionWaypointPointsPct
}: MapCanvasProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const placementDragStartRef = useRef<Point | null>(null);
  const placementOriginRef = useRef<{ posXPct: number; posYPct: number } | null>(null);
  const mapPanStartRef = useRef<Point | null>(null);
  const panOriginRef = useRef<Point>({ x: 0, y: 0 });
  const transitionWaypointDragIndexRef = useRef<number | null>(null);

  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [mediaSize, setMediaSize] = useState({ width: 0, height: 0 });
  const [displayMediaSource, setDisplayMediaSource] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [mediaLoadFailed, setMediaLoadFailed] = useState(false);

  const backgroundSource = useMemo(
    () => activeDay?.fondoMediaDataUrl ?? activeDay?.imagenFondoDataUrl ?? null,
    [activeDay?.fondoMediaDataUrl, activeDay?.imagenFondoDataUrl]
  );
  const backgroundMediaType = useMemo<DayBackgroundMediaType | null>(
    () => activeDay?.tipoFondoMedia ?? (backgroundSource ? "imagen" : null),
    [activeDay?.tipoFondoMedia, backgroundSource]
  );

  useEffect(() => {
    const viewport = viewportRef.current;

    if (!viewport) {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];

      if (!entry) {
        return;
      }

      setViewportSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height
      });
    });

    observer.observe(viewport);

    return () => observer.disconnect();
  }, []);

  const baseScale = useMemo(() => {
    if (!viewportSize.width || !viewportSize.height || !mediaSize.width || !mediaSize.height) {
      return 1;
    }

    return Math.max(viewportSize.width / mediaSize.width, viewportSize.height / mediaSize.height);
  }, [mediaSize.height, mediaSize.width, viewportSize.height, viewportSize.width]);

  const containScale = useMemo(() => {
    if (!viewportSize.width || !viewportSize.height || !mediaSize.width || !mediaSize.height) {
      return 1;
    }

    return Math.min(viewportSize.width / mediaSize.width, viewportSize.height / mediaSize.height);
  }, [mediaSize.height, mediaSize.width, viewportSize.height, viewportSize.width]);

  const minZoom = useMemo(() => {
    if (!baseScale || !containScale) {
      return 1;
    }

    return Math.min(1, containScale / baseScale);
  }, [baseScale, containScale]);

  useEffect(() => {
    setZoom(minZoom);
    setPan({ x: 0, y: 0 });
  }, [minZoom]);

  const renderedWidth = mediaSize.width * baseScale * zoom;
  const renderedHeight = mediaSize.height * baseScale * zoom;
  const imageLeft = (viewportSize.width - renderedWidth) / 2 + pan.x;
  const imageTop = (viewportSize.height - renderedHeight) / 2 + pan.y;

  useEffect(() => {
    setMediaLoadFailed(false);
    setMediaSize({ width: 0, height: 0 });

    if (!backgroundSource) {
      setDisplayMediaSource(null);
      return;
    }

    if (backgroundMediaType === "video") {
      setDisplayMediaSource(backgroundSource);
      return;
    }

    const preloadImage = new window.Image();

    preloadImage.onload = () => {
      setMediaSize({
        width: preloadImage.naturalWidth,
        height: preloadImage.naturalHeight
      });
      setDisplayMediaSource(backgroundSource);
    };

    preloadImage.onerror = () => {
      setMediaLoadFailed(true);
      setDisplayMediaSource(null);
    };

    preloadImage.src = backgroundSource;
  }, [backgroundMediaType, backgroundSource]);

  useEffect(() => {
    if (!renderedWidth || !renderedHeight) {
      return;
    }
  }, [renderedHeight, renderedWidth, viewportSize.height, viewportSize.width]);

  function getPctFromPointer(clientX: number, clientY: number) {
    const viewportRect = viewportRef.current?.getBoundingClientRect();

    if (!viewportRect || !renderedWidth || !renderedHeight) {
      return null;
    }

    const relativeX = clientX - viewportRect.left - imageLeft;
    const relativeY = clientY - viewportRect.top - imageTop;

    return {
      x: clampPct((relativeX / renderedWidth) * 100),
      y: clampPct((relativeY / renderedHeight) * 100)
    };
  }

  const transitionPreviewPointsPct =
    transitionEditorSourcePlacement && transitionEditorTargetPlacement
      ? [
          transitionEditorSourcePlacement.posXPct,
          transitionEditorSourcePlacement.posYPct,
          ...transitionWaypointPointsPct,
          transitionEditorTargetPlacement.posXPct,
          transitionEditorTargetPlacement.posYPct
        ]
      : [];

  async function handlePlacementPointerMove(event: ReactPointerEvent<HTMLButtonElement>, placement: MapIconPlacement) {
    if (!placementDragStartRef.current || placementOriginRef.current === null) {
      return;
    }

    event.preventDefault();
  }

  async function handlePlacementPointerUp(event: ReactPointerEvent<HTMLButtonElement>, placement: MapIconPlacement) {
    const pct = getPctFromPointer(event.clientX, event.clientY);
    placementDragStartRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);

    if (!pct) {
      return;
    }

    await onMovePlacement(placement.id, pct.x, pct.y);
  }

  async function handleDrop(event: ReactDragEvent<HTMLDivElement>) {
    event.preventDefault();

    if (!isEditable) {
      return;
    }

    if (!dragLibraryIcon) {
      return;
    }

    const pct = getPctFromPointer(event.clientX, event.clientY);

    if (!pct) {
      return;
    }

    await onCreatePlacement(dragLibraryIcon.id, pct.x, pct.y);
  }

  function handleTransitionWaypointPointerDown(event: ReactPointerEvent<HTMLButtonElement>, index: number) {
    event.stopPropagation();
    event.preventDefault();
    transitionWaypointDragIndexRef.current = index;
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleTransitionWaypointPointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    if (transitionWaypointDragIndexRef.current === null) {
      return;
    }

    const pct = getPctFromPointer(event.clientX, event.clientY);

    if (!pct) {
      return;
    }

    event.preventDefault();
    onMoveTransitionWaypoint(transitionWaypointDragIndexRef.current, pct.x, pct.y);
  }

  function handleTransitionWaypointPointerUp(event: ReactPointerEvent<HTMLButtonElement>) {
    if (transitionWaypointDragIndexRef.current === null) {
      return;
    }

    transitionWaypointDragIndexRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function handleWheel(event: ReactWheelEvent<HTMLDivElement>) {
    event.preventDefault();

    if (!mediaSize.width || !mediaSize.height || !viewportSize.width || !viewportSize.height) {
      return;
    }

    const delta = event.deltaY > 0 ? -0.15 : 0.15;
    const nextZoom = clamp(Number((zoom + delta).toFixed(2)), minZoom, MAX_ZOOM);

    if (nextZoom === zoom) {
      return;
    }

    const viewportRect = viewportRef.current?.getBoundingClientRect();

    if (!viewportRect) {
      setZoom(nextZoom);
      return;
    }

    const pointerX = event.clientX - viewportRect.left;
    const pointerY = event.clientY - viewportRect.top;
    const currentImageLeft = (viewportSize.width - renderedWidth) / 2 + pan.x;
    const currentImageTop = (viewportSize.height - renderedHeight) / 2 + pan.y;
    const imageRelativeX = renderedWidth ? (pointerX - currentImageLeft) / renderedWidth : 0.5;
    const imageRelativeY = renderedHeight ? (pointerY - currentImageTop) / renderedHeight : 0.5;
    const nextRenderedWidth = mediaSize.width * baseScale * nextZoom;
    const nextRenderedHeight = mediaSize.height * baseScale * nextZoom;
    const unclampedPan = {
      x: pointerX - imageRelativeX * nextRenderedWidth - (viewportSize.width - nextRenderedWidth) / 2,
      y: pointerY - imageRelativeY * nextRenderedHeight - (viewportSize.height - nextRenderedHeight) / 2
    };

    setZoom(nextZoom);
    setPan(clampPan(unclampedPan, nextRenderedWidth, nextRenderedHeight, viewportSize.width, viewportSize.height));
  }

  function handleViewportPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    const target = event.target;

    if (target instanceof HTMLElement && target.closest(".placed-icon-wrap")) {
      return;
    }

    if (isDrawingEnabled || isTransitionEditing) {
      return;
    }

    if (!displayMediaSource) {
      return;
    }

    if (renderedWidth <= viewportSize.width && renderedHeight <= viewportSize.height) {
      return;
    }

    mapPanStartRef.current = { x: event.clientX, y: event.clientY };
    panOriginRef.current = pan;
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleViewportPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!mapPanStartRef.current) {
      return;
    }

    event.preventDefault();

    const deltaX = event.clientX - mapPanStartRef.current.x;
    const deltaY = event.clientY - mapPanStartRef.current.y;
    const nextPan = clampPan(
      {
        x: panOriginRef.current.x + deltaX,
        y: panOriginRef.current.y + deltaY
      },
      renderedWidth,
      renderedHeight,
      viewportSize.width,
      viewportSize.height
    );

    setPan(nextPan);
  }

  function handleViewportPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (!mapPanStartRef.current) {
      return;
    }

    mapPanStartRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function handleViewportClick(event: ReactMouseEvent<HTMLDivElement>) {
    if (!isTransitionEditing) {
      return;
    }

    const target = event.target;

    if (target instanceof HTMLElement && target.closest(".placed-icon-wrap, .transition-waypoint")) {
      return;
    }

    const pct = getPctFromPointer(event.clientX, event.clientY);

    if (!pct) {
      return;
    }

    onAddTransitionWaypoint(pct.x, pct.y);
  }

  const imageStyle: CSSProperties = {
    width: `${renderedWidth}px`,
    height: `${renderedHeight}px`,
    left: `${imageLeft}px`,
    top: `${imageTop}px`
  };

  return (
    <section className="map-stage">
      <div
        ref={viewportRef}
        aria-label={activeDay?.etiquetaFecha ?? "Mapa de las Islas Malvinas"}
        className="map-viewport"
        onDragOver={(event) => {
          if (isEditable) {
            event.preventDefault();
          }
        }}
        onDrop={(event) => void handleDrop(event)}
        onClick={handleViewportClick}
        onPointerCancel={handleViewportPointerUp}
        onPointerDown={handleViewportPointerDown}
        onPointerMove={handleViewportPointerMove}
        onPointerUp={handleViewportPointerUp}
        onWheel={handleWheel}
      >
        {displayMediaSource && !mediaLoadFailed ? (
          <>
            {backgroundMediaType === "video" ? (
              <video
                aria-label={activeDay?.etiquetaFecha ?? "Fondo del mapa de las Islas Malvinas"}
                autoPlay
                className="map-video"
                loop
                muted
                onError={() => setMediaLoadFailed(true)}
                onLoadedMetadata={(event) =>
                  setMediaSize({
                    width: event.currentTarget.videoWidth,
                    height: event.currentTarget.videoHeight
                  })
                }
                playsInline
                src={displayMediaSource}
                style={imageStyle}
              />
            ) : (
              <img
                alt={activeDay?.etiquetaFecha ?? "Mapa de las Islas Malvinas"}
                className="map-image"
                draggable={false}
                onError={() => setMediaLoadFailed(true)}
                onLoad={(event) =>
                  setMediaSize({
                    width: event.currentTarget.naturalWidth,
                    height: event.currentTarget.naturalHeight
                  })
                }
                src={displayMediaSource}
                style={imageStyle}
              />
            )}

            <div className="drawing-layer-surface" style={imageStyle}>
              <div className="drawing-layer-wrap" style={{ width: `${renderedWidth}px`, height: `${renderedHeight}px` }}>
                <MapDrawingLayer
                  drawingTool={drawingTool}
                  height={renderedHeight}
                  isDrawingEnabled={isEditable && isDrawingEnabled}
                  lineStyle={drawingLineStyle}
                  lines={drawingLines}
                  onCreateLine={onCreateDrawingLine}
                  width={renderedWidth}
                />
              </div>
            </div>

            <div className="placed-icons-layer" style={imageStyle}>
              {transitionPreviewPointsPct.length >= 4 ? (
                <svg className="transition-overlay" height={renderedHeight} width={renderedWidth}>
                  <polyline
                    className="transition-path-line"
                    points={toSvgPolylinePoints(transitionPreviewPointsPct, renderedWidth, renderedHeight)}
                  />
                </svg>
              ) : null}

              {transitionEditorSourcePlacement ? (
                <div
                  className="transition-endpoint-marker source"
                  style={{
                    left: `${transitionEditorSourcePlacement.posXPct}%`,
                    top: `${transitionEditorSourcePlacement.posYPct}%`
                  }}
                />
              ) : null}

              {transitionEditorTargetPlacement ? (
                <div
                  className="transition-endpoint-marker target"
                  style={{
                    left: `${transitionEditorTargetPlacement.posXPct}%`,
                    top: `${transitionEditorTargetPlacement.posYPct}%`
                  }}
                />
              ) : null}

              {transitionWaypointPointsPct.map((_, index) =>
                index % 2 === 0 ? (
                  <button
                    key={`transition-waypoint-${index / 2}`}
                    className="transition-waypoint"
                    onPointerCancel={handleTransitionWaypointPointerUp}
                    onPointerDown={(event) => handleTransitionWaypointPointerDown(event, index / 2)}
                    onPointerMove={handleTransitionWaypointPointerMove}
                    onPointerUp={handleTransitionWaypointPointerUp}
                    style={{
                      left: `${transitionWaypointPointsPct[index]}%`,
                      top: `${transitionWaypointPointsPct[index + 1]}%`
                    }}
                    type="button"
                  />
                ) : null
              )}

              {placements.map((placement) => (
                <div
                  key={placement.id}
                  className="placed-icon-wrap"
                  style={{
                    left: `${(animatedPlacementPositions[placement.id]?.x ?? placement.posXPct)}%`,
                    top: `${(animatedPlacementPositions[placement.id]?.y ?? placement.posYPct)}%`
                  }}
                >
                  <button
                    className="placed-icon-button"
                    onClick={
                      !isEditable
                        ? (event) => {
                            event.stopPropagation();
                            onActivatePlacement?.(placement);
                          }
                        : undefined
                    }
                    onPointerDown={
                      isEditable
                        ? (event) => {
                            event.stopPropagation();
                            event.preventDefault();
                            placementDragStartRef.current = { x: event.clientX, y: event.clientY };
                            placementOriginRef.current = {
                              posXPct: placement.posXPct,
                              posYPct: placement.posYPct
                            };
                            event.currentTarget.setPointerCapture(event.pointerId);
                          }
                        : undefined
                    }
                    onPointerMove={
                      isEditable
                        ? (event) => {
                            event.stopPropagation();
                            void handlePlacementPointerMove(event, placement);
                          }
                        : undefined
                    }
                    onPointerUp={
                      isEditable
                        ? (event) => {
                            event.stopPropagation();
                            void handlePlacementPointerUp(event, placement);
                          }
                        : undefined
                    }
                    onPointerCancel={
                      isEditable
                        ? (event) => {
                            event.stopPropagation();
                            placementDragStartRef.current = null;
                          }
                        : undefined
                    }
                    type="button"
                  >
                    {placement.iconoDataUrl ? (
                      <img
                        alt={placement.nombreIcono ?? "Icono"}
                        className="placed-icon-image"
                        src={placement.iconoDataUrl}
                      />
                    ) : null}
                  </button>
                  {isEditable ? (
                    <>
                      <button
                        className="placed-icon-delete"
                        onClick={(event) => {
                          event.stopPropagation();
                          void onDeletePlacement(placement.id);
                        }}
                        onPointerDown={(event) => event.stopPropagation()}
                        type="button"
                      >
                        x
                      </button>
                      <button
                        className="placed-icon-menu"
                        onClick={(event) => {
                          event.stopPropagation();
                          onEditPlacement(placement);
                        }}
                        onPointerDown={(event) => event.stopPropagation()}
                        type="button"
                      >
                        ...
                      </button>
                      <button
                        className="placed-icon-transition"
                        onClick={(event) => {
                          event.stopPropagation();
                          onEditTransition(placement);
                        }}
                        onPointerDown={(event) => event.stopPropagation()}
                        type="button"
                      >
                        →
                      </button>
                    </>
                  ) : null}
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="map-empty" />
        )}
      </div>
    </section>
  );
}
