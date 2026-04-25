import { useEffect, useState } from "react";
import type { ChangeEvent, KeyboardEvent as ReactKeyboardEvent } from "react";
import type { BootstrapData } from "../shared/types/ipc";
import type { MapDrawingLineStyle } from "../shared/types/mapDrawingLine";
import type { DayIcon } from "../shared/types/dayIcon";
import type { MapIconPlacement } from "../shared/types/mapIconPlacement";
import type { MapDrawingTool } from "./components/layout/MapDrawingLayer";
import { MapCanvas } from "./components/layout/MapCanvas";
import { TopTimeline } from "./components/layout/TopTimeline";

type AppMode = "menu" | "edit" | "view";
type MediaContentType = "imagen" | "video";
const EDIT_PASSWORD = "1111";

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
  const [isEditPasswordOpen, setIsEditPasswordOpen] = useState(false);
  const [editPasswordDigits, setEditPasswordDigits] = useState(["", "", "", ""]);
  const [passwordError, setPasswordError] = useState<string | null>(null);

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
  const iconsLibrary = Object.values(data?.iconsByDay ?? {}).flat();
  const activeDrawingLines = activeDayId ? data?.mapDrawingLinesByDay[activeDayId] ?? [] : [];
  const activeMapPlacements = activeDayId ? data?.mapPlacementsByDay[activeDayId] ?? [] : [];
  const isEditMode = mode === "edit";
  const isViewMode = mode === "view";

  useEffect(() => {
    setSelectedPlacement(null);
    setIsDrawingEnabled(false);
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

  async function handleCreateDay(label: string, rutaImagenFondo: string | null) {
    setIsSavingDay(true);
    setError(null);

    try {
      const nextData = await window.mapaMalvinas.createDay({
        etiquetaFecha: label,
        rutaImagenFondo
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

  async function handleAddDay(label: string, rutaImagenFondo: string | null) {
    await handleCreateDay(label, rutaImagenFondo);
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

  async function handleUpdateDay(dayId: number, label: string, rutaImagenFondo: string | null) {
    setError(null);

    try {
      const nextData = await window.mapaMalvinas.updateDay({
        id: dayId,
        etiquetaFecha: label,
        rutaImagenFondo
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
        onSelectDay={setActiveDayId}
        onUpdateDay={handleUpdateDay}
      />

      <MapCanvas
        activeDay={activeDay}
        drawingLines={activeDrawingLines}
        drawingLineStyle={drawingLineStyle}
        drawingTool={drawingTool}
        dragLibraryIcon={isEditMode ? dragLibraryIcon : null}
        isDrawingEnabled={isDrawingEnabled}
        isEditable={isEditMode}
        onActivatePlacement={isViewMode ? handleOpenPlacementViewer : undefined}
        onCreateDrawingLine={handleCreateDrawingLine}
        onCreatePlacement={handleCreatePlacement}
        onDeletePlacement={handleDeletePlacement}
        onEditPlacement={handleOpenPlacementEditor}
        onMovePlacement={handleMovePlacement}
        placements={activeMapPlacements}
      />

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

      {isViewMode && !activeDay ? <div className="view-empty">No hay dias creados para visualizar.</div> : null}

      {isViewMode && selectedPlacement ? (
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
