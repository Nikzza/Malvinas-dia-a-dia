import { useEffect, useMemo, useRef, useState } from "react";
import type {
  CSSProperties,
  DragEvent as ReactDragEvent,
  PointerEvent as ReactPointerEvent,
  WheelEvent as ReactWheelEvent
} from "react";
import type { Day } from "../../../shared/types/day";
import type { MapDrawingLine, MapDrawingLineStyle } from "../../../shared/types/mapDrawingLine";
import type { DayIcon } from "../../../shared/types/dayIcon";
import type { MapIconPlacement } from "../../../shared/types/mapIconPlacement";
import { MapDrawingLayer } from "./MapDrawingLayer";
import type { MapDrawingTool } from "./MapDrawingLayer";

type MapCanvasProps = {
  activeDay: Day | null;
  drawingLines: MapDrawingLine[];
  drawingLineStyle: MapDrawingLineStyle;
  drawingTool: MapDrawingTool;
  dragLibraryIcon: DayIcon | null;
  isDrawingEnabled: boolean;
  isEditable: boolean;
  onActivatePlacement?: (placement: MapIconPlacement) => void;
  onCreateDrawingLine: (pointsPct: number[], style: MapDrawingLineStyle) => Promise<void>;
  onCreatePlacement: (libraryIconId: number, posXPct: number, posYPct: number) => Promise<void>;
  onMovePlacement: (placementId: number, posXPct: number, posYPct: number) => Promise<void>;
  onDeletePlacement: (placementId: number) => Promise<void>;
  onEditPlacement: (placement: MapIconPlacement) => void;
  placements: MapIconPlacement[];
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

export function MapCanvas({
  activeDay,
  drawingLines,
  drawingLineStyle,
  drawingTool,
  dragLibraryIcon,
  isDrawingEnabled,
  isEditable,
  onActivatePlacement,
  onCreateDrawingLine,
  onCreatePlacement,
  onDeletePlacement,
  onEditPlacement,
  onMovePlacement,
  placements
}: MapCanvasProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const placementDragStartRef = useRef<Point | null>(null);
  const placementOriginRef = useRef<{ posXPct: number; posYPct: number } | null>(null);
  const mapPanStartRef = useRef<Point | null>(null);
  const panOriginRef = useRef<Point>({ x: 0, y: 0 });

  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [displayMapSource, setDisplayMapSource] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [imageLoadFailed, setImageLoadFailed] = useState(false);

  const mapSource = useMemo(() => activeDay?.imagenFondoDataUrl ?? null, [activeDay?.imagenFondoDataUrl]);

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
    if (!viewportSize.width || !viewportSize.height || !imageSize.width || !imageSize.height) {
      return 1;
    }

    return Math.max(viewportSize.width / imageSize.width, viewportSize.height / imageSize.height);
  }, [imageSize.height, imageSize.width, viewportSize.height, viewportSize.width]);

  const containScale = useMemo(() => {
    if (!viewportSize.width || !viewportSize.height || !imageSize.width || !imageSize.height) {
      return 1;
    }

    return Math.min(viewportSize.width / imageSize.width, viewportSize.height / imageSize.height);
  }, [imageSize.height, imageSize.width, viewportSize.height, viewportSize.width]);

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

  const renderedWidth = imageSize.width * baseScale * zoom;
  const renderedHeight = imageSize.height * baseScale * zoom;
  const imageLeft = (viewportSize.width - renderedWidth) / 2 + pan.x;
  const imageTop = (viewportSize.height - renderedHeight) / 2 + pan.y;

  useEffect(() => {
    setImageLoadFailed(false);
    setImageSize({ width: 0, height: 0 });

    if (!mapSource) {
      setDisplayMapSource(null);
      return;
    }

    const preloadImage = new window.Image();

    preloadImage.onload = () => {
      setImageSize({
        width: preloadImage.naturalWidth,
        height: preloadImage.naturalHeight
      });
      setDisplayMapSource(mapSource);
    };

    preloadImage.onerror = () => {
      setImageLoadFailed(true);
      setDisplayMapSource(null);
    };

    preloadImage.src = mapSource;
  }, [mapSource]);

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

  function handleWheel(event: ReactWheelEvent<HTMLDivElement>) {
    event.preventDefault();

    if (!imageSize.width || !imageSize.height || !viewportSize.width || !viewportSize.height) {
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
    const nextRenderedWidth = imageSize.width * baseScale * nextZoom;
    const nextRenderedHeight = imageSize.height * baseScale * nextZoom;
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

    if (isDrawingEnabled) {
      return;
    }

    if (!displayMapSource) {
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
        onPointerCancel={handleViewportPointerUp}
        onPointerDown={handleViewportPointerDown}
        onPointerMove={handleViewportPointerMove}
        onPointerUp={handleViewportPointerUp}
        onWheel={handleWheel}
      >
        {displayMapSource && !imageLoadFailed ? (
          <>
            <img
              alt={activeDay?.etiquetaFecha ?? "Mapa de las Islas Malvinas"}
              className="map-image"
              draggable={false}
              onError={() => setImageLoadFailed(true)}
              onLoad={(event) =>
                setImageSize({
                  width: event.currentTarget.naturalWidth,
                  height: event.currentTarget.naturalHeight
                })
              }
              src={displayMapSource}
              style={imageStyle}
            />

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
              {placements.map((placement) => (
                <div
                  key={placement.id}
                  className="placed-icon-wrap"
                  style={{
                    left: `${placement.posXPct}%`,
                    top: `${placement.posYPct}%`
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
