import { useEffect, useState } from "react";
import type { BootstrapData } from "../shared/types/ipc";
import type { DayIcon } from "../shared/types/dayIcon";
import type { MapIconPlacement } from "../shared/types/mapIconPlacement";
import { MapCanvas } from "./components/layout/MapCanvas";
import { TopTimeline } from "./components/layout/TopTimeline";

type AppMode = "menu" | "edit" | "view";

export function App() {
  const [data, setData] = useState<BootstrapData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeDayId, setActiveDayId] = useState<number | null>(null);
  const [isSavingDay, setIsSavingDay] = useState(false);
  const [isIconsPanelOpen, setIsIconsPanelOpen] = useState(false);
  const [dragLibraryIcon, setDragLibraryIcon] = useState<DayIcon | null>(null);
  const [editingPlacement, setEditingPlacement] = useState<MapIconPlacement | null>(null);
  const [contentType, setContentType] = useState<"texto" | "imagen" | "video">("texto");
  const [contentText, setContentText] = useState("");
  const [contentResourcePath, setContentResourcePath] = useState<string | null>(null);
  const [mode, setMode] = useState<AppMode>("menu");

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
  const activeMapPlacements = activeDayId ? data?.mapPlacementsByDay[activeDayId] ?? [] : [];
  const isEditMode = mode === "edit";
  const isViewMode = mode === "view";

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
    setContentText(placement.textoDescriptivo ?? "");
    setContentResourcePath(placement.rutaRecursoLocal ?? null);
  }

  async function handlePickContentResource() {
    const selectedPath = await window.mapaMalvinas.selectContentResource();

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
            <button className="menu-button" onClick={() => setMode("edit")} type="button">
              Modo edicion
            </button>
          </div>
        </section>

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
        dragLibraryIcon={isEditMode ? dragLibraryIcon : null}
        isEditable={isEditMode}
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
                onClick={() => setContentType("texto")}
                type="button"
              >
                Texto
              </button>
              <button
                className={contentType === "imagen" ? "content-type-button active" : "content-type-button"}
                onClick={() => setContentType("imagen")}
                type="button"
              >
                Imagen
              </button>
              <button
                className={contentType === "video" ? "content-type-button active" : "content-type-button"}
                onClick={() => setContentType("video")}
                type="button"
              >
                Video
              </button>
            </div>

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

      {isEditMode ? (
        <button
          aria-label="Abrir panel de iconos"
          className="icons-toggle"
          onClick={() => setIsIconsPanelOpen((current) => !current)}
          title="Abrir panel de iconos"
          type="button"
        >
          +
        </button>
      ) : null}

      {isViewMode && !activeDay ? <div className="view-empty">No hay dias creados para visualizar.</div> : null}

      {error ? <div className="error-toast">{error}</div> : null}
    </main>
  );
}
