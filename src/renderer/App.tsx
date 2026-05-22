import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, KeyboardEvent as ReactKeyboardEvent } from "react";
import type { BootstrapData } from "../shared/types/ipc";
import type { MapDrawingLine, MapDrawingLineStyle } from "../shared/types/mapDrawingLine";
import type { DayIcon } from "../shared/types/dayIcon";
import type { MapIconPlacement } from "../shared/types/mapIconPlacement";
import type { MapIconTransition } from "../shared/types/mapIconTransition";
import type { MapDrawingTool } from "./components/layout/MapDrawingLayer";
import { MapCanvas } from "./components/layout/MapCanvas";
import { TopTimeline } from "./components/layout/TopTimeline";

type AppMode = "menu" | "edit" | "view";
type MediaContentType = "imagen" | "video";
const EDIT_PASSWORD = "1111";
const TRANSITION_ANIMATION_MS = 1800;
const DAY_LAYER_TRANSITION_MS = 900;

type TransitionEditingState = {
  transitionId: number | null;
  sourcePlacementId: number;
  targetPlacementId: number;
  waypointPointsPct: number[];
};

type DayLayerSnapshot = {
  drawingLines: MapDrawingLine[];
  placements: MapIconPlacement[];
};

export function App() {
  const [data, setData] = useState<BootstrapData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeDayId, setActiveDayId] = useState<number | null>(null);
  const [isSavingDay, setIsSavingDay] = useState(false);
  const [isIconsPanelOpen, setIsIconsPanelOpen] = useState(false);
  const [dragLibraryIcon, setDragLibraryIcon] = useState<DayIcon | null>(null);
  const [editingPlacement, setEditingPlacement] = useState<MapIconPlacement | null>(null);
  const [contentType, setContentType] = useState<"texto" | "imagen" | "video">("texto");
  const [contentTitle, setContentTitle] = useState("");
  const [contentText, setContentText] = useState("");
  const [contentResourcePath, setContentResourcePath] = useState<string | null>(null);
  const [isDrawingPanelOpen, setIsDrawingPanelOpen] = useState(false);
  const [isDrawingEnabled, setIsDrawingEnabled] = useState(false);
  const [drawingLineStyle, setDrawingLineStyle] = useState<MapDrawingLineStyle>("solid");
  const [drawingTool, setDrawingTool] = useState<MapDrawingTool>("freehand");
  const [mode, setMode] = useState<AppMode>("menu");
  const [selectedPlacement, setSelectedPlacement] = useState<MapIconPlacement | null>(null);
  const [transitionEditing, setTransitionEditing] = useState<TransitionEditingState | null>(null);
  const [animatedPlacementPositions, setAnimatedPlacementPositions] = useState<Record<number, { x: number; y: number }>>({});
  const [isEditPasswordOpen, setIsEditPasswordOpen] = useState(false);
  const [editPasswordDigits, setEditPasswordDigits] = useState(["", "", "", ""]);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [isDayTransitionRunning, setIsDayTransitionRunning] = useState(false);
  const [dayLayerSnapshot, setDayLayerSnapshot] = useState<DayLayerSnapshot | null>(null);
  const [dayLayerTransitionProgress, setDayLayerTransitionProgress] = useState(1);

  useEffect(() => {
    window.mapaMalvinas
      .getBootstrapData()
      .then(setData)
      .catch((cause: unknown) => {
        const message = cause instanceof Error ? cause.message : "No se pudo iniciar la aplicacion.";
        setError(message);
      });
  }, []);

  useEffect(() => {
    if (!data?.days.length) {
      return;
    }

    setActiveDayId((current) => current ?? data.days[0].id);
  }, [data]);

  const activeDay = data?.days.find((day) => day.id === activeDayId) ?? null;
  const days = data?.days ?? [];
  const iconsLibrary = Object.values(data?.iconsByDay ?? {}).flat();
  const activeDrawingLines = activeDayId ? data?.mapDrawingLinesByDay[activeDayId] ?? [] : [];
  const activeMapPlacements = activeDayId ? data?.mapPlacementsByDay[activeDayId] ?? [] : [];
  const allMapPlacements = useMemo(() => Object.values(data?.mapPlacementsByDay ?? {}).flat(), [data?.mapPlacementsByDay]);
  const placementById = useMemo(() => new Map(allMapPlacements.map((placement) => [placement.id, placement] as const)), [allMapPlacements]);
  const transitions = data?.mapIconTransitions ?? [];
  const isEditMode = mode === "edit";
  const isViewMode = mode === "view";
  const isReadOnlyMode = isViewMode;
  const previousActiveDayIdRef = useRef<number | null>(null);
  const transitionSourcePlacement = transitionEditing ? placementById.get(transitionEditing.sourcePlacementId) ?? null : null;
  const transitionTargetPlacement = transitionEditing ? placementById.get(transitionEditing.targetPlacementId) ?? null : null;

  useEffect(() => {
    setSelectedPlacement(null);
    setIsDrawingEnabled(false);
    setTransitionEditing(null);
    setAnimatedPlacementPositions({});
  }, [activeDayId, mode]);

  useEffect(() => {
    if (!selectedPlacement) {
      return;
    }

    const nextPlacement = activeMapPlacements.find((placement) => placement.id === selectedPlacement.id) ?? null;
    setSelectedPlacement(nextPlacement);
  }, [activeMapPlacements, selectedPlacement]);

  useEffect(() => {
    if (!selectedPlacement) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSelectedPlacement(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedPlacement]);

  useEffect(() => {
    if (!transitionEditing) {
      return;
    }

    const sourcePlacement = placementById.get(transitionEditing.sourcePlacementId);
    const targetPlacement = placementById.get(transitionEditing.targetPlacementId);

    if (!sourcePlacement || !targetPlacement) {
      setTransitionEditing(null);
      return;
    }
  }, [placementById, transitionEditing]);

  useEffect(() => {
    const previousDayId = previousActiveDayIdRef.current;
    previousActiveDayIdRef.current = activeDayId;

    if (mode !== "view" || !activeDayId || !previousDayId || previousDayId === activeDayId) {
      setAnimatedPlacementPositions({});
      return;
    }

    const direction = getAdjacentDayDirection(days, previousDayId, activeDayId);

    if (direction === 0) {
      setAnimatedPlacementPositions({});
      return;
    }

    const relevantTransitions = transitions.filter((transition) => {
      const sourcePlacement = placementById.get(transition.sourcePlacementId);
      const targetPlacement = placementById.get(transition.targetPlacementId);

      if (!sourcePlacement || !targetPlacement) {
        return false;
      }

      if (direction > 0) {
        return sourcePlacement.dayId === previousDayId && targetPlacement.dayId === activeDayId;
      }

      return sourcePlacement.dayId === activeDayId && targetPlacement.dayId === previousDayId;
    });

    if (!relevantTransitions.length) {
      setAnimatedPlacementPositions({});
      return;
    }

    let animationFrame = 0;
    const startTime = performance.now();

    const runFrame = (now: number) => {
      const progress = Math.min(1, (now - startTime) / TRANSITION_ANIMATION_MS);
      const nextPositions: Record<number, { x: number; y: number }> = {};

      for (const transition of relevantTransitions) {
        const placementId = direction > 0 ? transition.targetPlacementId : transition.sourcePlacementId;
        const pointsPct = direction > 0 ? transition.pointsPct : reversePointsPct(transition.pointsPct);
        const point = getPointAlongPolyline(pointsPct, progress);

        if (point) {
          nextPositions[placementId] = point;
        }
      }

      setAnimatedPlacementPositions(nextPositions);

      if (progress < 1) {
        animationFrame = window.requestAnimationFrame(runFrame);
        return;
      }

      setAnimatedPlacementPositions({});
    };

    animationFrame = window.requestAnimationFrame(runFrame);

    return () => {
      window.cancelAnimationFrame(animationFrame);
    };
  }, [activeDayId, days, mode, placementById, transitions]);

  async function handleCreateDay(label: string) {
    setIsSavingDay(true);
    setError(null);

    try {
      const nextData = await window.mapaMalvinas.createDay({
        etiquetaFecha: label
      });
      setData(nextData);
      setActiveDayId(nextData.days[nextData.days.length - 1]?.id ?? null);
    } catch (cause: unknown) {
      const message = cause instanceof Error ? cause.message : "No se pudo crear el dia.";
      setError(message);
    } finally {
      setIsSavingDay(false);
    }
  }

  async function handleAddDay(label: string) {
    await handleCreateDay(label);
  }

  async function handleDeleteDay(dayId: number) {
    setError(null);

    try {
      const nextData = await window.mapaMalvinas.deleteDay(dayId);
      setData(nextData);
      setActiveDayId((current) => {
        if (current !== dayId) {
          return current;
        }

        return nextData.days[0]?.id ?? null;
      });
    } catch (cause: unknown) {
      const message = cause instanceof Error ? cause.message : "No se pudo borrar el dia.";
      setError(message);
    }
  }

  async function handleUpdateDay(dayId: number, label: string) {
    setError(null);

    try {
      const nextData = await window.mapaMalvinas.updateDay({
        id: dayId,
        etiquetaFecha: label
      });
      setData(nextData);
    } catch (cause: unknown) {
      const message = cause instanceof Error ? cause.message : "No se pudo editar el dia.";
      setError(message);
    }
  }

  async function handleAddIcon() {
    if (!activeDayId) {
      setError("Primero selecciona un dia para agregar iconos.");
      return;
    }

    const selectedPath = await window.mapaMalvinas.selectIconPng();

    if (!selectedPath) {
      return;
    }

    const fileName = selectedPath.split("\\").pop() ?? "Icono";

    try {
      const nextData = await window.mapaMalvinas.createDayIcon({
        dayId: activeDayId,
        nombre: fileName.replace(/\.png$/i, ""),
        rutaIconoLocal: selectedPath
      });
      setData(nextData);
      setError(null);
      setIsIconsPanelOpen(true);
    } catch (cause: unknown) {
      const message = cause instanceof Error ? cause.message : "No se pudo guardar el icono.";
      setError(message);
    }
  }

  async function handleDeleteIcon(iconId: number) {
    try {
      const nextData = await window.mapaMalvinas.deleteDayIcon({ iconId });
      setData(nextData);
      setError(null);
    } catch (cause: unknown) {
      const message = cause instanceof Error ? cause.message : "No se pudo borrar el icono.";
      setError(message);
    }
  }

  async function handleCreatePlacement(libraryIconId: number, posXPct: number, posYPct: number) {
    if (!activeDayId) {
      setError("Primero selecciona un dia.");
      return;
    }

    try {
      const nextData = await window.mapaMalvinas.createMapIconPlacement({
        dayId: activeDayId,
        libraryIconId,
        posXPct,
        posYPct
      });
      setData(nextData);
      setError(null);
    } catch (cause: unknown) {
      const message = cause instanceof Error ? cause.message : "No se pudo colocar el icono.";
      setError(message);
    }
  }

  async function handleMovePlacement(placementId: number, posXPct: number, posYPct: number) {
    try {
      const nextData = await window.mapaMalvinas.updateMapIconPlacement({
        placementId,
        posXPct,
        posYPct
      });
      setData(nextData);
      setError(null);
    } catch (cause: unknown) {
      const message = cause instanceof Error ? cause.message : "No se pudo mover el icono.";
      setError(message);
    }
  }

  async function handleDeletePlacement(placementId: number) {
    try {
      const nextData = await window.mapaMalvinas.deleteMapIconPlacement({ placementId });
      setData(nextData);
      setError(null);
    } catch (cause: unknown) {
      const message = cause instanceof Error ? cause.message : "No se pudo borrar el icono colocado.";
      setError(message);
    }
  }

  function handleOpenPlacementEditor(placement: MapIconPlacement) {
    setEditingPlacement(placement);
    setContentType((placement.tipoContenido as "texto" | "imagen" | "video" | null) ?? "texto");
    setContentTitle(placement.tituloContenido ?? "");
    setContentText(placement.textoDescriptivo ?? "");
    setContentResourcePath(placement.rutaRecursoLocal ?? null);
  }

  async function handlePickContentResource() {
    if (contentType === "texto") {
      return;
    }

    const selectedPath = await window.mapaMalvinas.selectContentResource({
      tipoContenido: contentType
    });

    if (!selectedPath) {
      return;
    }

    setContentResourcePath(selectedPath);
  }

  async function handleSavePlacementContent() {
    if (!editingPlacement) {
      return;
    }

    try {
      const nextData = await window.mapaMalvinas.updateMapIconPlacementContent({
        placementId: editingPlacement.id,
        tipoContenido: contentType,
        tituloContenido: contentTitle.trim() || null,
        textoDescriptivo: contentText || null,
        rutaRecursoLocal: contentType === "texto" ? null : contentResourcePath
      });
      setData(nextData);
      setEditingPlacement(null);
      setError(null);
    } catch (cause: unknown) {
      const message = cause instanceof Error ? cause.message : "No se pudo guardar el contenido del icono.";
      setError(message);
    }
  }

  function handleSelectDay(nextDayId: number) {
    if (nextDayId === activeDayId) {
      return;
    }

    if (isDayTransitionRunning) {
      return;
    }

    if (!activeDayId) {
      setActiveDayId(nextDayId);
      return;
    }

    setDayLayerSnapshot({
      drawingLines: activeDrawingLines,
      placements: activeMapPlacements
    });
    setDayLayerTransitionProgress(0);
    setIsDayTransitionRunning(true);
    setActiveDayId(nextDayId);

    const startTime = performance.now();
    let animationFrame = 0;

    const runFrame = (now: number) => {
      const progress = Math.min(1, (now - startTime) / DAY_LAYER_TRANSITION_MS);
      const easedProgress = easeInOutCubic(progress);

      setDayLayerTransitionProgress(easedProgress);

      if (progress < 1) {
        animationFrame = window.requestAnimationFrame(runFrame);
        return;
      }

      setDayLayerSnapshot(null);
      setDayLayerTransitionProgress(1);
      setIsDayTransitionRunning(false);
    };

    animationFrame = window.requestAnimationFrame(runFrame);
  }

  function handleStartTransitionEdit(sourcePlacement: MapIconPlacement) {
    const nextDay = getNextDay(days, sourcePlacement.dayId);

    if (!nextDay) {
      setError("Ese icono no tiene un dia siguiente para crear transicion.");
      return;
    }

    const targetPlacement =
      (data?.mapPlacementsByDay[nextDay.id] ?? []).find(
        (placement) => placement.libraryIconId === sourcePlacement.libraryIconId
      ) ?? null;

    if (!targetPlacement) {
      setError("No existe el mismo icono en el dia siguiente para crear la transicion.");
      return;
    }

    const existingTransition =
      transitions.find(
        (transition) =>
          transition.sourcePlacementId === sourcePlacement.id && transition.targetPlacementId === targetPlacement.id
      ) ?? null;

    setTransitionEditing({
      transitionId: existingTransition?.id ?? null,
      sourcePlacementId: sourcePlacement.id,
      targetPlacementId: targetPlacement.id,
      waypointPointsPct: stripTransitionEndpoints(existingTransition?.pointsPct ?? [])
    });
    setIsDrawingPanelOpen(false);
    setIsDrawingEnabled(false);
    setError(null);
  }

  function handleAddTransitionWaypoint(posXPct: number, posYPct: number) {
    setTransitionEditing((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        waypointPointsPct: [...current.waypointPointsPct, posXPct, posYPct]
      };
    });
  }

  function handleMoveTransitionWaypoint(index: number, posXPct: number, posYPct: number) {
    setTransitionEditing((current) => {
      if (!current) {
        return current;
      }

      const nextWaypoints = [...current.waypointPointsPct];
      nextWaypoints[index * 2] = posXPct;
      nextWaypoints[index * 2 + 1] = posYPct;

      return {
        ...current,
        waypointPointsPct: nextWaypoints
      };
    });
  }

  function handleUndoTransitionWaypoint() {
    setTransitionEditing((current) => {
      if (!current || current.waypointPointsPct.length < 2) {
        return current;
      }

      return {
        ...current,
        waypointPointsPct: current.waypointPointsPct.slice(0, -2)
      };
    });
  }

  function handleClearTransitionWaypoint() {
    setTransitionEditing((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        waypointPointsPct: []
      };
    });
  }

  async function handleSaveTransition() {
    if (!transitionEditing) {
      return;
    }

    const sourcePlacement = placementById.get(transitionEditing.sourcePlacementId);
    const targetPlacement = placementById.get(transitionEditing.targetPlacementId);

    if (!sourcePlacement || !targetPlacement) {
      setError("No se pudo resolver el origen o destino de la transicion.");
      return;
    }

    const fullPointsPct = [
      sourcePlacement.posXPct,
      sourcePlacement.posYPct,
      ...transitionEditing.waypointPointsPct,
      targetPlacement.posXPct,
      targetPlacement.posYPct
    ];

    try {
      const nextData = await window.mapaMalvinas.upsertMapIconTransition({
        sourcePlacementId: sourcePlacement.id,
        targetPlacementId: targetPlacement.id,
        pointsPct: fullPointsPct
      });
      setData(nextData);
      setTransitionEditing(null);
      setError(null);
    } catch (cause: unknown) {
      const message = cause instanceof Error ? cause.message : "No se pudo guardar la transicion.";
      setError(message);
    }
  }

  async function handleDeleteTransition() {
    if (!transitionEditing?.transitionId) {
      setTransitionEditing(null);
      return;
    }

    try {
      const nextData = await window.mapaMalvinas.deleteMapIconTransition({
        transitionId: transitionEditing.transitionId
      });
      setData(nextData);
      setTransitionEditing(null);
      setError(null);
    } catch (cause: unknown) {
      const message = cause instanceof Error ? cause.message : "No se pudo borrar la transicion.";
      setError(message);
    }
  }

  async function handleCreateDrawingLine(pointsPct: number[], style: MapDrawingLineStyle) {
    if (!activeDayId) {
      setError("Primero selecciona un dia.");
      return;
    }

    try {
      const nextData = await window.mapaMalvinas.createMapDrawingLine({
        dayId: activeDayId,
        style,
        pointsPct
      });
      setData(nextData);
      setError(null);
    } catch (cause: unknown) {
      const message = cause instanceof Error ? cause.message : "No se pudo guardar la linea.";
      setError(message);
    }
  }

  async function handleDeleteLastDrawingLine() {
    const lastLine = activeDrawingLines[activeDrawingLines.length - 1];

    if (!lastLine) {
      return;
    }

    try {
      const nextData = await window.mapaMalvinas.deleteMapDrawingLine({ lineId: lastLine.id });
      setData(nextData);
      setError(null);
    } catch (cause: unknown) {
      const message = cause instanceof Error ? cause.message : "No se pudo borrar la ultima linea.";
      setError(message);
    }
  }

  function handleChangeContentType(nextType: "texto" | "imagen" | "video") {
    setContentType(nextType);

    if (nextType === "texto") {
      setContentResourcePath(null);
      return;
    }

    if (!contentResourcePath || isAllowedResource(contentResourcePath, nextType)) {
      return;
    }

    setContentResourcePath(null);
  }

  function handleOpenPlacementViewer(placement: MapIconPlacement) {
    const hasText = Boolean(placement.textoDescriptivo?.trim());
    const hasResource = Boolean(placement.recursoDataUrl);

    if (!hasText && !hasResource) {
      return;
    }

    setSelectedPlacement(placement);
  }

  function handleOpenEditPassword() {
    setIsEditPasswordOpen(true);
    setEditPasswordDigits(["", "", "", ""]);
    setPasswordError(null);
  }

  function handleCloseEditPassword() {
    setIsEditPasswordOpen(false);
    setEditPasswordDigits(["", "", "", ""]);
    setPasswordError(null);
  }

  function handlePasswordDigitChange(index: number, event: ChangeEvent<HTMLInputElement>) {
    const nextValue = event.target.value.replace(/\D/g, "").slice(-1);

    setEditPasswordDigits((current) => {
      const nextDigits = [...current];
      nextDigits[index] = nextValue;
      return nextDigits;
    });
    setPasswordError(null);

    if (nextValue && index < 3) {
      const nextInput = document.querySelector<HTMLInputElement>(`input[data-password-index="${index + 1}"]`);
      nextInput?.focus();
      nextInput?.select();
    }
  }

  function handlePasswordDigitKeyDown(index: number, event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === "Backspace" && !editPasswordDigits[index] && index > 0) {
      const previousInput = document.querySelector<HTMLInputElement>(`input[data-password-index="${index - 1}"]`);
      previousInput?.focus();
      previousInput?.select();
      return;
    }

    if (event.key === "ArrowLeft" && index > 0) {
      const previousInput = document.querySelector<HTMLInputElement>(`input[data-password-index="${index - 1}"]`);
      previousInput?.focus();
      previousInput?.select();
      return;
    }

    if (event.key === "ArrowRight" && index < 3) {
      const nextInput = document.querySelector<HTMLInputElement>(`input[data-password-index="${index + 1}"]`);
      nextInput?.focus();
      nextInput?.select();
    }
  }

  function handleSubmitEditPassword() {
    const enteredPassword = editPasswordDigits.join("");

    if (enteredPassword === EDIT_PASSWORD) {
      setMode("edit");
      handleCloseEditPassword();
      return;
    }

    setPasswordError("Contrasena incorrecta.");
    setEditPasswordDigits(["", "", "", ""]);
    const firstInput = document.querySelector<HTMLInputElement>('input[data-password-index="0"]');
    firstInput?.focus();
  }

  if (mode === "menu") {
    return (
      <main className="menu-shell">
        <section className="menu-card">
          <h1>Malvinas dia a dia</h1>
          <p>Selecciona el modo con el que queres ingresar.</p>

          <div className="menu-actions">
            <button className="menu-button" onClick={() => setMode("view")} type="button">
              Modo visualizacion
            </button>
            <button className="menu-button" onClick={handleOpenEditPassword} type="button">
              Modo edicion
            </button>
          </div>
        </section>

        {isEditPasswordOpen ? (
          <section className="password-gate-modal">
            <div className="password-gate-card">
              <div className="password-gate-top">
                <strong>Acceso a edicion</strong>
                <button className="password-gate-close" onClick={handleCloseEditPassword} type="button">
                  x
                </button>
              </div>

              <p className="password-gate-text">Ingresa la contrasena de 4 digitos para entrar al modo edicion.</p>

              <div className="password-gate-inputs">
                {editPasswordDigits.map((digit, index) => (
                  <input
                    key={index}
                    autoFocus={index === 0}
                    className="password-gate-input"
                    data-password-index={index}
                    inputMode="numeric"
                    maxLength={1}
                    onChange={(event) => handlePasswordDigitChange(index, event)}
                    onKeyDown={(event) => handlePasswordDigitKeyDown(index, event)}
                    type="password"
                    value={digit}
                  />
                ))}
              </div>

              {passwordError ? <div className="password-gate-error">{passwordError}</div> : null}

              <button className="password-gate-button" onClick={handleSubmitEditPassword} type="button">
                Ingresar
              </button>
            </div>
          </section>
        ) : null}

        {error ? <div className="error-toast">{error}</div> : null}
      </main>
    );
  }

  return (
    <main className="experience-shell">
      <button
        className="mode-back-button"
        onClick={() => {
          setMode("menu");
          setIsIconsPanelOpen(false);
          setIsDrawingPanelOpen(false);
          setIsDrawingEnabled(false);
          setEditingPlacement(null);
        }}
        type="button"
      >
        Volver al menu
      </button>

      <div className="mode-badge">{isEditMode ? "Modo edicion" : "Modo visualizacion"}</div>

      <TopTimeline
        activeDayId={activeDayId}
        days={data?.days ?? []}
        isEditable={isEditMode}
        isSavingDay={isSavingDay}
        onAddDay={handleAddDay}
        onDeleteDay={handleDeleteDay}
        onSelectDay={handleSelectDay}
        onUpdateDay={handleUpdateDay}
      />

      <div className="map-scene-wrap">
        <MapCanvas
          activeDay={activeDay}
          animatedPlacementPositions={animatedPlacementPositions}
          drawingLines={activeDrawingLines}
          drawingLineStyle={drawingLineStyle}
          drawingTool={drawingTool}
          dragLibraryIcon={isEditMode ? dragLibraryIcon : null}
          isDrawingEnabled={isDrawingEnabled}
          isEditable={isEditMode}
          isTransitionEditing={Boolean(transitionEditing)}
          onActivatePlacement={isReadOnlyMode ? handleOpenPlacementViewer : undefined}
          onAddTransitionWaypoint={handleAddTransitionWaypoint}
          onCreateDrawingLine={handleCreateDrawingLine}
          onCreatePlacement={handleCreatePlacement}
          onDeletePlacement={handleDeletePlacement}
          onEditPlacement={handleOpenPlacementEditor}
          onEditTransition={handleStartTransitionEdit}
          onMovePlacement={handleMovePlacement}
          onMoveTransitionWaypoint={handleMoveTransitionWaypoint}
          placements={activeMapPlacements}
          previousDrawingLines={dayLayerSnapshot?.drawingLines ?? []}
          previousPlacements={dayLayerSnapshot?.placements ?? []}
          transitionProgress={dayLayerTransitionProgress}
          transitionEditorSourcePlacement={transitionSourcePlacement}
          transitionEditorTargetPlacement={transitionTargetPlacement}
          transitionWaypointPointsPct={transitionEditing?.waypointPointsPct ?? []}
        />
      </div>

      {isEditMode && editingPlacement ? (
        <section className="content-editor-modal">
          <div className="content-editor-card">
            <div className="content-editor-header">
              <strong>Contenido del icono</strong>
              <button className="content-editor-close" onClick={() => setEditingPlacement(null)} type="button">
                x
              </button>
            </div>

            <div className="content-type-row">
              <button
                className={contentType === "texto" ? "content-type-button active" : "content-type-button"}
                onClick={() => handleChangeContentType("texto")}
                type="button"
              >
                Texto
              </button>
              <button
                className={contentType === "imagen" ? "content-type-button active" : "content-type-button"}
                onClick={() => handleChangeContentType("imagen")}
                type="button"
              >
                Imagen
              </button>
              <button
                className={contentType === "video" ? "content-type-button active" : "content-type-button"}
                onClick={() => handleChangeContentType("video")}
                type="button"
              >
                Video
              </button>
            </div>

            <textarea
              className="content-title-input"
              onChange={(event) => setContentTitle(event.target.value)}
              placeholder="Titulo"
              rows={1}
              value={contentTitle}
            />

            <textarea
              className="content-textarea"
              onChange={(event) => setContentText(event.target.value)}
              placeholder="Texto descriptivo"
              value={contentText}
            />

            {contentType !== "texto" ? (
              <div className="content-resource-row">
                <button className="content-resource-button" onClick={() => void handlePickContentResource()} type="button">
                  Cargar {contentType}
                </button>
                <span className="content-resource-name" title={contentResourcePath ?? ""}>
                  {contentResourcePath ? contentResourcePath.split("\\").pop() : "Sin archivo"}
                </span>
              </div>
            ) : null}

            <button className="content-save-button" onClick={() => void handleSavePlacementContent()} type="button">
              Guardar
            </button>
          </div>
        </section>
      ) : null}

      {isEditMode && isIconsPanelOpen ? (
        <aside className="icons-panel">
          <div className="icons-panel-header">
            <strong>Iconos</strong>
            <button className="icons-close" onClick={() => setIsIconsPanelOpen(false)} type="button">
              x
            </button>
          </div>

          <button className="icons-add-button" onClick={() => void handleAddIcon()} type="button">
            Agregar icono
          </button>

          <div className="icons-list">
            {iconsLibrary.map((icon) => (
              <div key={icon.id} className="icon-card">
                <button
                  className="icon-thumb circle draggable"
                  draggable
                  onDragEnd={() => setDragLibraryIcon(null)}
                  onDragStart={() => setDragLibraryIcon(icon)}
                  type="button"
                >
                  {icon.iconoDataUrl ? <img alt={icon.nombre} className="icon-thumb-image" src={icon.iconoDataUrl} /> : null}
                </button>
                <button className="icon-delete" onClick={() => void handleDeleteIcon(icon.id)} type="button">
                  x
                </button>
              </div>
            ))}
          </div>
        </aside>
      ) : null}

      {isEditMode && isDrawingPanelOpen ? (
        <aside className="drawing-panel">
          <div className="drawing-panel-header">
            <strong>Dibujo</strong>
            <button className="drawing-close" onClick={() => setIsDrawingPanelOpen(false)} type="button">
              x
            </button>
          </div>

          <div className="drawing-style-list">
            <button
              className={drawingTool === "freehand" ? "drawing-style-button active" : "drawing-style-button"}
              onClick={() => setDrawingTool("freehand")}
              type="button"
            >
              <span className="drawing-style-preview freehand" />
              Trazo libre
            </button>
            <button
              className={drawingTool === "straight" ? "drawing-style-button active" : "drawing-style-button"}
              onClick={() => setDrawingTool("straight")}
              type="button"
            >
              <span className="drawing-style-preview solid" />
              Punto A-B recta
            </button>
            <button
              className={drawingTool === "curve" ? "drawing-style-button active" : "drawing-style-button"}
              onClick={() => setDrawingTool("curve")}
              type="button"
            >
              <span className="drawing-style-preview curve" />
              Punto A-B curva
            </button>
          </div>

          <div className="drawing-style-list">
            <button
              className={drawingLineStyle === "solid" ? "drawing-style-button active" : "drawing-style-button"}
              onClick={() => setDrawingLineStyle("solid")}
              type="button"
            >
              <span className="drawing-style-preview solid" />
              Lisa
            </button>
            <button
              className={drawingLineStyle === "dashed" ? "drawing-style-button active" : "drawing-style-button"}
              onClick={() => setDrawingLineStyle("dashed")}
              type="button"
            >
              <span className="drawing-style-preview dashed" />
              Punteada
            </button>
            <button
              className={drawingLineStyle === "dotted" ? "drawing-style-button active" : "drawing-style-button"}
              onClick={() => setDrawingLineStyle("dotted")}
              type="button"
            >
              <span className="drawing-style-preview dotted" />
              Puntos
            </button>
          </div>

          {drawingTool === "curve" ? <div className="drawing-hint">Curva: clic en A, clic en B y clic en C para curvar.</div> : null}
          {drawingTool === "straight" ? <div className="drawing-hint">Recta: clic en A y clic en B.</div> : null}

          <button
            className={isDrawingEnabled ? "drawing-action-button active" : "drawing-action-button"}
            onClick={() => setIsDrawingEnabled((current) => !current)}
            type="button"
          >
            {isDrawingEnabled ? "Salir del dibujo" : "Empezar a dibujar"}
          </button>

          <button
            className="drawing-action-button secondary"
            disabled={!activeDrawingLines.length}
            onClick={() => void handleDeleteLastDrawingLine()}
            type="button"
          >
            Deshacer ultima
          </button>
        </aside>
      ) : null}

      {isEditMode && transitionEditing && transitionSourcePlacement && transitionTargetPlacement ? (
        <aside className="transition-panel">
          <div className="transition-panel-header">
            <strong>Transicion al siguiente dia</strong>
            <button className="transition-close" onClick={() => setTransitionEditing(null)} type="button">
              x
            </button>
          </div>

          <div className="transition-summary">
            <span>{days.find((day) => day.id === transitionSourcePlacement.dayId)?.etiquetaFecha ?? "Dia actual"}</span>
            <span className="transition-arrow">→</span>
            <span>{days.find((day) => day.id === transitionTargetPlacement.dayId)?.etiquetaFecha ?? "Dia siguiente"}</span>
          </div>

          <div className="transition-hint">
            Toca el mapa para agregar puntos intermedios al recorrido. Los extremos se toman automaticamente desde la posicion del icono en ambos dias.
          </div>

          <div className="transition-points-count">
            Puntos intermedios: {transitionEditing.waypointPointsPct.length / 2}
          </div>

          <button className="transition-action-button" onClick={handleUndoTransitionWaypoint} type="button">
            Deshacer ultimo punto
          </button>
          <button className="transition-action-button secondary" onClick={handleClearTransitionWaypoint} type="button">
            Limpiar puntos
          </button>
          <button className="transition-action-button save" onClick={() => void handleSaveTransition()} type="button">
            Guardar transicion
          </button>
          <button className="transition-action-button secondary" onClick={() => void handleDeleteTransition()} type="button">
            {transitionEditing.transitionId ? "Borrar transicion" : "Cancelar"}
          </button>
        </aside>
      ) : null}

      {isEditMode ? (
        <>
          <button
            aria-label="Abrir panel de dibujo"
            className="drawing-toggle"
            onClick={() => setIsDrawingPanelOpen((current) => !current)}
            title="Abrir panel de dibujo"
            type="button"
          >
            <span className="drawing-toggle-icon" />
          </button>
          <button
            aria-label="Abrir panel de iconos"
            className="icons-toggle"
            onClick={() => setIsIconsPanelOpen((current) => !current)}
            title="Abrir panel de iconos"
            type="button"
          >
            +
          </button>
        </>
      ) : null}

      {isReadOnlyMode && !activeDay ? <div className="view-empty">No hay dias creados para visualizar.</div> : null}

      {isReadOnlyMode && selectedPlacement ? (
        <section
          className="content-viewer-modal"
          onClick={() => setSelectedPlacement(null)}
        >
          <article
            aria-label={selectedPlacement.tituloContenido ?? selectedPlacement.nombreIcono ?? "Contenido del icono"}
            className="content-viewer-card"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="content-viewer-header">
              <strong>{selectedPlacement.tituloContenido?.trim() || selectedPlacement.nombreIcono || "Contenido del icono"}</strong>
              <button className="content-viewer-close" onClick={() => setSelectedPlacement(null)} type="button">
                x
              </button>
            </div>

            <div className="content-viewer-body">
              {selectedPlacement.tipoContenido === "video" && selectedPlacement.recursoDataUrl ? (
                <div className="content-viewer-media-frame">
                  <video className="content-viewer-media" controls src={selectedPlacement.recursoDataUrl} />
                </div>
              ) : null}

              {selectedPlacement.tipoContenido === "imagen" && selectedPlacement.recursoDataUrl ? (
                <figure className="content-viewer-media-frame">
                  <img
                    alt={selectedPlacement.nombreIcono ?? "Imagen del contenido"}
                    className="content-viewer-media"
                    src={selectedPlacement.recursoDataUrl}
                  />
                </figure>
              ) : null}

              {selectedPlacement.tipoContenido === "texto" || !selectedPlacement.recursoDataUrl ? (
                <div className="content-viewer-text-only" />
              ) : null}

              <div className="content-viewer-text">
                {selectedPlacement.textoDescriptivo?.trim() ? (
                  <p>{selectedPlacement.textoDescriptivo}</p>
                ) : (
                  <p>Este icono no tiene texto descriptivo cargado.</p>
                )}
              </div>
            </div>
          </article>
        </section>
      ) : null}

      {error ? <div className="error-toast">{error}</div> : null}
    </main>
  );
}

const IMAGE_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".bmp",
  ".webp",
  ".svg",
  ".avif",
  ".tif",
  ".tiff",
  ".ico"
]);

const VIDEO_EXTENSIONS = new Set([
  ".mp4",
  ".webm",
  ".mov",
  ".m4v",
  ".avi",
  ".mkv",
  ".wmv",
  ".flv",
  ".mpeg",
  ".mpg",
  ".ts",
  ".mts",
  ".m2ts",
  ".3gp",
  ".ogv"
]);

function getNextDay(days: BootstrapData["days"], dayId: number) {
  const currentIndex = days.findIndex((day) => day.id === dayId);

  if (currentIndex === -1 || currentIndex >= days.length - 1) {
    return null;
  }

  return days[currentIndex + 1] ?? null;
}

function stripTransitionEndpoints(pointsPct: number[]) {
  if (pointsPct.length <= 4) {
    return [];
  }

  return pointsPct.slice(2, -2);
}

function reversePointsPct(pointsPct: number[]) {
  const reversed: number[] = [];

  for (let index = pointsPct.length - 2; index >= 0; index -= 2) {
    reversed.push(pointsPct[index], pointsPct[index + 1]);
  }

  return reversed;
}

function getAdjacentDayDirection(days: BootstrapData["days"], fromDayId: number, toDayId: number) {
  const fromIndex = days.findIndex((day) => day.id === fromDayId);
  const toIndex = days.findIndex((day) => day.id === toDayId);

  if (fromIndex === -1 || toIndex === -1) {
    return 0;
  }

  if (toIndex === fromIndex + 1) {
    return 1;
  }

  if (toIndex === fromIndex - 1) {
    return -1;
  }

  return 0;
}

function getPointAlongPolyline(pointsPct: number[], progress: number) {
  if (pointsPct.length < 4) {
    return null;
  }

  const segments: Array<{ startX: number; startY: number; endX: number; endY: number; length: number }> = [];
  let totalLength = 0;

  for (let index = 0; index < pointsPct.length - 2; index += 2) {
    const startX = pointsPct[index];
    const startY = pointsPct[index + 1];
    const endX = pointsPct[index + 2];
    const endY = pointsPct[index + 3];
    const length = Math.hypot(endX - startX, endY - startY);

    segments.push({ startX, startY, endX, endY, length });
    totalLength += length;
  }

  if (!segments.length || totalLength === 0) {
    return {
      x: pointsPct[0],
      y: pointsPct[1]
    };
  }

  const targetLength = totalLength * progress;
  let traversed = 0;

  for (const segment of segments) {
    const nextTraversed = traversed + segment.length;

    if (targetLength <= nextTraversed) {
      const localProgress = segment.length === 0 ? 0 : (targetLength - traversed) / segment.length;

      return {
        x: segment.startX + (segment.endX - segment.startX) * localProgress,
        y: segment.startY + (segment.endY - segment.startY) * localProgress
      };
    }

    traversed = nextTraversed;
  }

  return {
    x: pointsPct[pointsPct.length - 2],
    y: pointsPct[pointsPct.length - 1]
  };
}

function easeInOutCubic(progress: number) {
  return progress < 0.5 ? 4 * progress * progress * progress : 1 - Math.pow(-2 * progress + 2, 3) / 2;
}

function getFileExtension(filePath: string) {
  const normalizedPath = filePath.toLowerCase();
  const lastDotIndex = normalizedPath.lastIndexOf(".");

  if (lastDotIndex === -1) {
    return "";
  }

  return normalizedPath.slice(lastDotIndex);
}

function isAllowedResource(filePath: string, tipoContenido: MediaContentType) {
  const extension = getFileExtension(filePath);
  const allowedExtensions = tipoContenido === "imagen" ? IMAGE_EXTENSIONS : VIDEO_EXTENSIONS;
  return allowedExtensions.has(extension);
}
