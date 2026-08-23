import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import type {
  DragEvent as ReactDragEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent
} from "react";
import maplibregl, { type StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Day } from "../../../shared/types/day";
import type {
  MapDrawingLine,
  MapDrawingLineColor,
  MapDrawingLineStyle
} from "../../../shared/types/mapDrawingLine";
import type { DayIcon } from "../../../shared/types/dayIcon";
import type { MapIconPlacement } from "../../../shared/types/mapIconPlacement";
import type { MapLabel, MapLabelStyle } from "../../../shared/types/mapLabel";
import { MapDrawingLayer } from "./MapDrawingLayer";
import type { MapDrawingTool } from "./MapDrawingLayer";

type MapCanvasProps = {
  activeDay: Day | null;
  animatedPlacementPositions: Record<number, { x: number; y: number }>;
  drawingLines: MapDrawingLine[];
  drawingLineColor: MapDrawingLineColor;
  drawingLineStyle: MapDrawingLineStyle;
  drawingTool: MapDrawingTool;
  dragLibraryIcon: DayIcon | null;
  dragLabelStyle: MapLabelStyle | null;
  isDrawingEnabled: boolean;
  isDrawingLineSelectionEnabled: boolean;
  isEditable: boolean;
  isTransitionEditing: boolean;
  onActivatePlacement?: (placement: MapIconPlacement) => void;
  onAddTransitionWaypoint: (posXPct: number, posYPct: number) => void;
  onCreateDrawingLine: (
    pointsPct: number[],
    style: MapDrawingLineStyle,
    color: MapDrawingLineColor
  ) => Promise<void>;
  onCreatePlacement: (libraryIconId: number, posXPct: number, posYPct: number) => Promise<void>;
  onCreateMapLabel: (style: MapLabelStyle, posXPct: number, posYPct: number) => Promise<void>;
  onDeleteMapLabel: (labelId: number) => Promise<void>;
  onEditMapLabel: (label: MapLabel) => void;
  onMoveMapLabel: (labelId: number, posXPct: number, posYPct: number) => Promise<void>;
  onMovePlacement: (placementId: number, posXPct: number, posYPct: number) => Promise<void>;
  onMoveTransitionWaypoint: (index: number, posXPct: number, posYPct: number) => void;
  onSelectDrawingLine: (lineId: number | null) => void;
  onDeletePlacement: (placementId: number) => Promise<void>;
  onEditPlacement: (placement: MapIconPlacement) => void;
  onEditTransition: (placement: MapIconPlacement) => void;
  placements: MapIconPlacement[];
  labels: MapLabel[];
  previousDrawingLines: MapDrawingLine[];
  previousLabels: MapLabel[];
  previousPlacements: MapIconPlacement[];
  selectedDrawingLineId: number | null;
  transitionProgress: number;
  transitionEditorSourcePlacement: MapIconPlacement | null;
  transitionEditorTargetPlacement: MapIconPlacement | null;
  transitionWaypointPointsPct: number[];
};

export type MapViewState = {
  longitude: number;
  latitude: number;
  zoom: number;
};

export type MapCanvasHandle = {
  getCurrentView: () => MapViewState | null;
  goToView: (view: MapViewState, speed: number) => void;
};

type ScreenPoint = {
  xPct: number;
  yPct: number;
};

const MAX_MERCATOR_LATITUDE = 85.05112878;
const MALVINAS_CENTER: [number, number] = [-59.5236, -51.7963];
const MAP_TILE_SIZE = 256;
const MAP_MIN_ZOOM_PADDING = 0.02;
const SAVED_VIEW_FAST_TRANSITION_MS = 900;
const SAVED_VIEW_SLOW_TRANSITION_MS = SAVED_VIEW_FAST_TRANSITION_MS * 3;
const MAPLIBRE_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    "raster-tiles": {
      type: "raster",
      tiles: [
        "https://mt0.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
        "https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
        "https://mt2.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
        "https://mt3.google.com/vt/lyrs=s&x={x}&y={y}&z={z}"
      ],
      tileSize: 256
    }
  },
  layers: [{ id: "raster-layer", type: "raster", source: "raster-tiles" }]
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getSavedViewTransitionDuration(speed: number) {
  const normalizedSpeed = clamp(speed, 0, 100) / 100;
  return Math.round(
    SAVED_VIEW_SLOW_TRANSITION_MS -
      (SAVED_VIEW_SLOW_TRANSITION_MS - SAVED_VIEW_FAST_TRANSITION_MS) * normalizedSpeed
  );
}

function getDistanceToSegment(
  pointX: number,
  pointY: number,
  startX: number,
  startY: number,
  endX: number,
  endY: number
) {
  const deltaX = endX - startX;
  const deltaY = endY - startY;
  const segmentLengthSquared = deltaX * deltaX + deltaY * deltaY;

  if (segmentLengthSquared === 0) {
    return Math.hypot(pointX - startX, pointY - startY);
  }

  const projection = clamp(
    ((pointX - startX) * deltaX + (pointY - startY) * deltaY) / segmentLengthSquared,
    0,
    1
  );
  const nearestX = startX + projection * deltaX;
  const nearestY = startY + projection * deltaY;

  return Math.hypot(pointX - nearestX, pointY - nearestY);
}

function getMinimumZoomForViewport(width: number) {
  if (!width) {
    return 0;
  }

  return Math.max(0, Math.log2(width / MAP_TILE_SIZE) + MAP_MIN_ZOOM_PADDING);
}

function normalizeLongitude(lng: number) {
  return ((((lng + 180) % 360) + 360) % 360) - 180;
}

function lngLatToWorldPct(lng: number, lat: number) {
  const normalizedLng = normalizeLongitude(lng);
  const clampedLat = clamp(lat, -MAX_MERCATOR_LATITUDE, MAX_MERCATOR_LATITUDE);
  const latRad = (clampedLat * Math.PI) / 180;
  const x = ((normalizedLng + 180) / 360) * 100;
  const y = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * 100;

  return {
    x: clamp(x, 0, 100),
    y: clamp(y, 0, 100)
  };
}

function worldPctToLngLat(xPct: number, yPct: number): [number, number] {
  const lng = (clamp(xPct, 0, 100) / 100) * 360 - 180;
  const mercatorY = clamp(yPct, 0, 100) / 100;
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * mercatorY)));
  return [lng, (latRad * 180) / Math.PI];
}

function pairsToScreenPct(pointsPct: number[], map: maplibregl.Map | null, width: number, height: number) {
  if (!map || !width || !height) {
    return pointsPct;
  }

  const projected: number[] = [];

  for (let index = 0; index < pointsPct.length; index += 2) {
    const point = map.project(worldPctToLngLat(pointsPct[index], pointsPct[index + 1]));
    projected.push((point.x / width) * 100, (point.y / height) * 100);
  }

  return projected;
}

function pairsToWorldPct(pointsPct: number[], map: maplibregl.Map | null, width: number, height: number) {
  if (!map || !width || !height) {
    return pointsPct;
  }

  const projected: number[] = [];

  for (let index = 0; index < pointsPct.length; index += 2) {
    const lngLat = map.unproject([(pointsPct[index] / 100) * width, (pointsPct[index + 1] / 100) * height]);
    const worldPct = lngLatToWorldPct(lngLat.lng, lngLat.lat);
    projected.push(worldPct.x, worldPct.y);
  }

  return projected;
}

function toSvgPolylinePoints(pointsPct: number[], width: number, height: number) {
  const points: string[] = [];

  for (let index = 0; index < pointsPct.length; index += 2) {
    points.push(`${(pointsPct[index] / 100) * width},${(pointsPct[index + 1] / 100) * height}`);
  }

  return points.join(" ");
}

export const MapCanvas = forwardRef<MapCanvasHandle, MapCanvasProps>(function MapCanvas({
  activeDay,
  animatedPlacementPositions,
  drawingLines,
  drawingLineColor,
  drawingLineStyle,
  drawingTool,
  dragLibraryIcon,
  dragLabelStyle,
  isDrawingEnabled,
  isDrawingLineSelectionEnabled,
  isEditable,
  isTransitionEditing,
  onActivatePlacement,
  onAddTransitionWaypoint,
  onCreateDrawingLine,
  onCreateMapLabel,
  onCreatePlacement,
  onDeleteMapLabel,
  onDeletePlacement,
  onEditMapLabel,
  onEditPlacement,
  onEditTransition,
  onMoveMapLabel,
  onMovePlacement,
  onMoveTransitionWaypoint,
  onSelectDrawingLine,
  placements,
  labels,
  previousDrawingLines,
  previousLabels,
  previousPlacements,
  selectedDrawingLineId,
  transitionProgress,
  transitionEditorSourcePlacement,
  transitionEditorTargetPlacement,
  transitionWaypointPointsPct
}: MapCanvasProps, ref) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<maplibregl.Map | null>(null);
  const transitionWaypointDragIndexRef = useRef<number | null>(null);

  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [mapViewVersion, setMapViewVersion] = useState(0);
  const [isMapReady, setIsMapReady] = useState(false);

  useImperativeHandle(ref, () => ({
    getCurrentView: () => {
      const currentMap = mapInstanceRef.current;

      if (!currentMap) {
        return null;
      }

      const center = currentMap.getCenter();

      return {
        longitude: center.lng,
        latitude: center.lat,
        zoom: currentMap.getZoom()
      };
    },
    goToView: (view, speed) => {
      const currentMap = mapInstanceRef.current;

      if (!currentMap) {
        return;
      }

      currentMap.stop();
      currentMap.easeTo({
        center: [view.longitude, view.latitude],
        zoom: view.zoom,
        duration: getSavedViewTransitionDuration(speed),
        essential: true
      });
    }
  }), []);

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

  useEffect(() => {
    const container = mapContainerRef.current;

    if (!container || mapInstanceRef.current) {
      return;
    }

    const map = new maplibregl.Map({
      container,
      style: MAPLIBRE_STYLE,
      center: MALVINAS_CENTER,
      zoom: 6.25,
      minZoom: getMinimumZoomForViewport(container.clientWidth),
      renderWorldCopies: false,
      attributionControl: false,
      dragRotate: false,
      touchPitch: false
    });

    const syncOverlay = () => setMapViewVersion((current) => current + 1);
    const handleLoad = () => {
      setIsMapReady(true);
      syncOverlay();
    };
    map.on("load", handleLoad);
    map.on("move", syncOverlay);
    map.on("zoom", syncOverlay);
    map.on("resize", syncOverlay);
    mapInstanceRef.current = map;

    return () => {
      map.off("load", handleLoad);
      map.off("move", syncOverlay);
      map.off("zoom", syncOverlay);
      map.off("resize", syncOverlay);
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (
      isEditable ||
      !isMapReady ||
      !activeDay ||
      activeDay.initialMapLongitude === null ||
      activeDay.initialMapLatitude === null ||
      activeDay.initialMapZoom === null
    ) {
      return;
    }

    const currentMap = mapInstanceRef.current;

    if (!currentMap) {
      return;
    }

    currentMap.stop();
    currentMap.easeTo({
      center: [activeDay.initialMapLongitude, activeDay.initialMapLatitude],
      zoom: activeDay.initialMapZoom,
      duration: getSavedViewTransitionDuration(activeDay.initialMapSpeed),
      essential: true
    });
  }, [
    activeDay?.id,
    activeDay?.initialMapLatitude,
    activeDay?.initialMapLongitude,
    activeDay?.initialMapSpeed,
    activeDay?.initialMapZoom,
    isEditable,
    isMapReady
  ]);

  useEffect(() => {
    const animationFrame = window.requestAnimationFrame(() => {
      const currentMap = mapInstanceRef.current;

      if (!currentMap) {
        return;
      }

      const nextMinZoom = getMinimumZoomForViewport(viewportSize.width);
      currentMap.setMinZoom(nextMinZoom);

      if (currentMap.getZoom() < nextMinZoom) {
        currentMap.zoomTo(nextMinZoom, { duration: 0 });
      }

      currentMap.resize();
      setMapViewVersion((current) => current + 1);
    });

    return () => window.cancelAnimationFrame(animationFrame);
  }, [viewportSize.height, viewportSize.width]);

  const map = mapInstanceRef.current;

  function getWorldPctFromPointer(clientX: number, clientY: number) {
    const viewportRect = viewportRef.current?.getBoundingClientRect();
    const currentMap = mapInstanceRef.current;

    if (!viewportRect || !currentMap || !viewportSize.width || !viewportSize.height) {
      return null;
    }

    const lngLat = currentMap.unproject([clientX - viewportRect.left, clientY - viewportRect.top]);
    return lngLatToWorldPct(lngLat.lng, lngLat.lat);
  }

  function getScreenPoint(worldXPct: number, worldYPct: number): ScreenPoint | null {
    if (!map || !viewportSize.width || !viewportSize.height) {
      return null;
    }

    const point = map.project(worldPctToLngLat(worldXPct, worldYPct));
    return {
      xPct: (point.x / viewportSize.width) * 100,
      yPct: (point.y / viewportSize.height) * 100
    };
  }

  const screenDrawingLines = useMemo(
    () =>
      drawingLines.map((line) => ({
        ...line,
        pointsPct: pairsToScreenPct(line.pointsPct, map, viewportSize.width, viewportSize.height)
      })),
    [drawingLines, map, mapViewVersion, viewportSize.height, viewportSize.width]
  );
  const previousScreenDrawingLines = useMemo(
    () =>
      previousDrawingLines.map((line) => ({
        ...line,
        pointsPct: pairsToScreenPct(line.pointsPct, map, viewportSize.width, viewportSize.height)
      })),
    [map, mapViewVersion, previousDrawingLines, viewportSize.height, viewportSize.width]
  );

  const transitionPreviewPointsPct = useMemo(() => {
    if (!transitionEditorSourcePlacement || !transitionEditorTargetPlacement) {
      return [];
    }

    return pairsToScreenPct(
      [
        transitionEditorSourcePlacement.posXPct,
        transitionEditorSourcePlacement.posYPct,
        ...transitionWaypointPointsPct,
        transitionEditorTargetPlacement.posXPct,
        transitionEditorTargetPlacement.posYPct
      ],
      map,
      viewportSize.width,
      viewportSize.height
    );
  }, [
    map,
    mapViewVersion,
    transitionEditorSourcePlacement,
    transitionEditorTargetPlacement,
    transitionWaypointPointsPct,
    viewportSize.height,
    viewportSize.width
  ]);

  const transitionSourceScreenPoint = transitionEditorSourcePlacement
    ? getScreenPoint(transitionEditorSourcePlacement.posXPct, transitionEditorSourcePlacement.posYPct)
    : null;
  const transitionTargetScreenPoint = transitionEditorTargetPlacement
    ? getScreenPoint(transitionEditorTargetPlacement.posXPct, transitionEditorTargetPlacement.posYPct)
    : null;
  const transitionWaypointScreenPoints = useMemo(
    () => pairsToScreenPct(transitionWaypointPointsPct, map, viewportSize.width, viewportSize.height),
    [map, mapViewVersion, transitionWaypointPointsPct, viewportSize.height, viewportSize.width]
  );

  async function handleCreateDrawingLine(
    pointsPct: number[],
    style: MapDrawingLineStyle,
    color: MapDrawingLineColor
  ) {
    const worldPointsPct = pairsToWorldPct(pointsPct, mapInstanceRef.current, viewportSize.width, viewportSize.height);
    await onCreateDrawingLine(worldPointsPct, style, color);
  }

  async function handlePlacementPointerUp(event: ReactPointerEvent<HTMLButtonElement>, placement: MapIconPlacement) {
    const pct = getWorldPctFromPointer(event.clientX, event.clientY);
    event.currentTarget.releasePointerCapture(event.pointerId);

    if (!pct) {
      return;
    }

    await onMovePlacement(placement.id, pct.x, pct.y);
  }

  async function handleLabelPointerUp(event: ReactPointerEvent<HTMLDivElement>, label: MapLabel) {
    const pct = getWorldPctFromPointer(event.clientX, event.clientY);
    event.currentTarget.releasePointerCapture(event.pointerId);

    if (!pct) {
      return;
    }

    await onMoveMapLabel(label.id, pct.x, pct.y);
  }

  async function handleDrop(event: ReactDragEvent<HTMLDivElement>) {
    event.preventDefault();

    if (!isEditable || (!dragLibraryIcon && !dragLabelStyle)) {
      return;
    }

    const pct = getWorldPctFromPointer(event.clientX, event.clientY);

    if (!pct) {
      return;
    }

    if (dragLabelStyle) {
      await onCreateMapLabel(dragLabelStyle, pct.x, pct.y);
      return;
    }

    if (dragLibraryIcon) {
      await onCreatePlacement(dragLibraryIcon.id, pct.x, pct.y);
    }
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

    const pct = getWorldPctFromPointer(event.clientX, event.clientY);

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

  function handleViewportClick(event: ReactMouseEvent<HTMLDivElement>) {
    const target = event.target;

    if (target instanceof HTMLElement && target.closest(".placed-icon-wrap, .map-label-wrap, .transition-waypoint")) {
      return;
    }

    if (isDrawingLineSelectionEnabled) {
      const viewport = viewportRef.current;

      if (!viewport) {
        return;
      }

      const rect = viewport.getBoundingClientRect();
      const pointerX = event.clientX - rect.left;
      const pointerY = event.clientY - rect.top;
      const selectionRadius = 14;
      let closestLineId: number | null = null;
      let closestDistance = selectionRadius;

      for (let lineIndex = screenDrawingLines.length - 1; lineIndex >= 0; lineIndex -= 1) {
        const line = screenDrawingLines[lineIndex];

        for (let pointIndex = 0; pointIndex < line.pointsPct.length - 2; pointIndex += 2) {
          const distance = getDistanceToSegment(
            pointerX,
            pointerY,
            (line.pointsPct[pointIndex] / 100) * rect.width,
            (line.pointsPct[pointIndex + 1] / 100) * rect.height,
            (line.pointsPct[pointIndex + 2] / 100) * rect.width,
            (line.pointsPct[pointIndex + 3] / 100) * rect.height
          );

          if (distance < closestDistance) {
            closestDistance = distance;
            closestLineId = line.id;
          }
        }
      }

      onSelectDrawingLine(closestLineId);
      return;
    }

    if (isEditable && dragLabelStyle) {
      const labelPct = getWorldPctFromPointer(event.clientX, event.clientY);

      if (labelPct) {
        void onCreateMapLabel(dragLabelStyle, labelPct.x, labelPct.y);
      }
      return;
    }

    if (!isTransitionEditing) {
      return;
    }

    const pct = getWorldPctFromPointer(event.clientX, event.clientY);

    if (!pct) {
      return;
    }

    onAddTransitionWaypoint(pct.x, pct.y);
  }

  const hasDayLayerTransition =
    transitionProgress < 1 ||
    previousDrawingLines.length > 0 ||
    previousPlacements.length > 0 ||
    previousLabels.length > 0;
  const currentLayerOpacity = hasDayLayerTransition ? transitionProgress : 1;
  const previousLayerOpacity = hasDayLayerTransition ? 1 - transitionProgress : 0;

  function renderPlacements(items: MapIconPlacement[], isInteractive: boolean) {
    return items.map((placement) => {
      const animatedPosition = isInteractive ? animatedPlacementPositions[placement.id] : null;
      const screenPoint = getScreenPoint(
        animatedPosition?.x ?? placement.posXPct,
        animatedPosition?.y ?? placement.posYPct
      );

      if (!screenPoint) {
        return null;
      }

      return (
        <div
          key={placement.id}
          className="placed-icon-wrap"
          style={{
            left: `${screenPoint.xPct}%`,
            top: `${screenPoint.yPct}%`
          }}
        >
          <button
            className="placed-icon-button"
            onClick={
              !isEditable && isInteractive
                ? (event) => {
                    event.stopPropagation();
                    onActivatePlacement?.(placement);
                  }
                : undefined
            }
            onPointerDown={
              isEditable && isInteractive
                ? (event) => {
                    event.stopPropagation();
                    event.preventDefault();
                    event.currentTarget.setPointerCapture(event.pointerId);
                  }
                : undefined
            }
            onPointerMove={
              isEditable && isInteractive
                ? (event) => {
                    event.stopPropagation();
                    event.preventDefault();
                  }
                : undefined
            }
            onPointerUp={
              isEditable && isInteractive
                ? (event) => {
                    event.stopPropagation();
                    void handlePlacementPointerUp(event, placement);
                  }
                : undefined
            }
            onPointerCancel={
              isEditable && isInteractive
                ? (event) => {
                    event.stopPropagation();
                  }
                : undefined
            }
            style={!isInteractive ? { pointerEvents: "none" } : undefined}
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
          <span className="placed-icon-label">
            {placement.tituloContenido?.trim() || placement.nombreIcono || "Posicion"}
          </span>
          {isEditable && isInteractive ? (
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
                aria-label="Editar trayectoria"
                className="placed-icon-transition"
                onClick={(event) => {
                  event.stopPropagation();
                  onEditTransition(placement);
                }}
                onPointerDown={(event) => event.stopPropagation()}
                type="button"
              >
                T
              </button>
            </>
          ) : null}
        </div>
      );
    });
  }

  function renderLabels(items: MapLabel[], isInteractive: boolean) {
    return items.map((label) => {
      const screenPoint = getScreenPoint(label.posXPct, label.posYPct);

      if (!screenPoint) {
        return null;
      }

      return (
        <div
          key={label.id}
          className="map-label-wrap"
          onClick={isEditable && isInteractive ? (event) => event.stopPropagation() : undefined}
          style={{
            left: `${screenPoint.xPct}%`,
            top: `${screenPoint.yPct}%`
          }}
        >
          <div
            aria-label={label.text}
            className={`map-label-shell ${label.style}`}
            onPointerCancel={
              isEditable && isInteractive
                ? (event) => {
                    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                      event.currentTarget.releasePointerCapture(event.pointerId);
                    }
                  }
                : undefined
            }
            onPointerDown={
              isEditable && isInteractive
                ? (event) => {
                    event.stopPropagation();
                    event.preventDefault();
                    event.currentTarget.setPointerCapture(event.pointerId);
                  }
                : undefined
            }
            onPointerMove={
              isEditable && isInteractive
                ? (event) => {
                    event.stopPropagation();
                    event.preventDefault();
                  }
                : undefined
            }
            onPointerUp={
              isEditable && isInteractive
                ? (event) => {
                    event.stopPropagation();
                    void handleLabelPointerUp(event, label);
                  }
                : undefined
            }
            style={!isEditable || !isInteractive ? { pointerEvents: "none" } : undefined}
          >
            <span className="map-label-face">{label.text}</span>
          </div>

          {isEditable && isInteractive ? (
            <>
              <button
                aria-label="Eliminar etiqueta"
                className="map-label-delete"
                onClick={(event) => {
                  event.stopPropagation();
                  void onDeleteMapLabel(label.id);
                }}
                onPointerDown={(event) => event.stopPropagation()}
                type="button"
              >
                x
              </button>
              <button
                aria-label="Editar etiqueta"
                className="map-label-edit"
                onClick={(event) => {
                  event.stopPropagation();
                  onEditMapLabel(label);
                }}
                onPointerDown={(event) => event.stopPropagation()}
                type="button"
              >
                ...
              </button>
            </>
          ) : null}
        </div>
      );
    });
  }

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
      >
        <div
          ref={mapContainerRef}
          aria-label={activeDay?.etiquetaFecha ?? "Mapa satelital"}
          className="maplibre-background"
        />

        {viewportSize.width && viewportSize.height ? (
          <>
            {hasDayLayerTransition ? (
              <>
                <div
                  className="drawing-layer-surface day-layer-previous"
                  style={{ opacity: previousLayerOpacity }}
                >
                  <MapDrawingLayer
                    lineColor={drawingLineColor}
                    drawingTool={drawingTool}
                    height={viewportSize.height}
                    isDrawingEnabled={false}
                    lineStyle={drawingLineStyle}
                    lines={previousScreenDrawingLines}
                    linesRevealProgress={1}
                    onCreateLine={handleCreateDrawingLine}
                    selectedLineId={null}
                    width={viewportSize.width}
                  />
                </div>
                <div
                  className="placed-icons-layer day-layer-previous"
                  style={{ opacity: previousLayerOpacity }}
                >
                  {renderPlacements(previousPlacements, false)}
                  {renderLabels(previousLabels, false)}
                </div>
              </>
            ) : null}

            <div className="drawing-layer-surface day-layer-current" style={{ opacity: currentLayerOpacity }}>
              <MapDrawingLayer
                lineColor={drawingLineColor}
                drawingTool={drawingTool}
                height={viewportSize.height}
                isDrawingEnabled={isEditable && isDrawingEnabled}
                lineStyle={drawingLineStyle}
                lines={screenDrawingLines}
                linesRevealProgress={hasDayLayerTransition ? transitionProgress : 1}
                onCreateLine={handleCreateDrawingLine}
                selectedLineId={selectedDrawingLineId}
                width={viewportSize.width}
              />
            </div>

            <div className="placed-icons-layer day-layer-current" style={{ opacity: currentLayerOpacity }}>
              {transitionPreviewPointsPct.length >= 4 ? (
                <svg className="transition-overlay" height={viewportSize.height} width={viewportSize.width}>
                  <polyline
                    className="transition-path-line"
                    points={toSvgPolylinePoints(transitionPreviewPointsPct, viewportSize.width, viewportSize.height)}
                  />
                </svg>
              ) : null}

              {transitionSourceScreenPoint ? (
                <div
                  className="transition-endpoint-marker source"
                  style={{
                    left: `${transitionSourceScreenPoint.xPct}%`,
                    top: `${transitionSourceScreenPoint.yPct}%`
                  }}
                />
              ) : null}

              {transitionTargetScreenPoint ? (
                <div
                  className="transition-endpoint-marker target"
                  style={{
                    left: `${transitionTargetScreenPoint.xPct}%`,
                    top: `${transitionTargetScreenPoint.yPct}%`
                  }}
                />
              ) : null}

              {transitionWaypointScreenPoints.map((_, index) =>
                index % 2 === 0 ? (
                  <button
                    key={`transition-waypoint-${index / 2}`}
                    className="transition-waypoint"
                    onPointerCancel={handleTransitionWaypointPointerUp}
                    onPointerDown={(event) => handleTransitionWaypointPointerDown(event, index / 2)}
                    onPointerMove={handleTransitionWaypointPointerMove}
                    onPointerUp={handleTransitionWaypointPointerUp}
                    style={{
                      left: `${transitionWaypointScreenPoints[index]}%`,
                      top: `${transitionWaypointScreenPoints[index + 1]}%`
                    }}
                    type="button"
                  />
                ) : null
              )}

              {renderPlacements(placements, true)}
              {renderLabels(labels, true)}
            </div>
          </>
        ) : (
          <div className="map-empty" />
        )}
      </div>
    </section>
  );
});
