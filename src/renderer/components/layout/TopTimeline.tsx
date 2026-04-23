import { useState } from "react";
import type { Day } from "../../../shared/types/day";

type TopTimelineProps = {
  days: Day[];
  activeDayId: number | null;
  isEditable: boolean;
  onSelectDay: (dayId: number) => void;
  onAddDay: (label: string, rutaImagenFondo: string | null) => Promise<void>;
  onDeleteDay: (dayId: number) => Promise<void>;
  onUpdateDay: (dayId: number, label: string, rutaImagenFondo: string | null) => Promise<void>;
  isSavingDay: boolean;
};

export function TopTimeline({
  days,
  activeDayId,
  isEditable,
  onSelectDay,
  onAddDay,
  onDeleteDay,
  onUpdateDay,
  isSavingDay
}: TopTimelineProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [newDayLabel, setNewDayLabel] = useState("");
  const [newDayImagePath, setNewDayImagePath] = useState<string | null>(null);
  const [editingDayId, setEditingDayId] = useState<number | null>(null);
  const [editingLabel, setEditingLabel] = useState("");
  const [editingImagePath, setEditingImagePath] = useState<string | null>(null);

  async function handleSubmit() {
    const trimmedLabel = newDayLabel.trim();

    if (!trimmedLabel) {
      return;
    }

    await onAddDay(trimmedLabel, newDayImagePath);
    setNewDayLabel("");
    setNewDayImagePath(null);
    setIsAdding(false);
  }

  async function handleUpdateSubmit() {
    const trimmedLabel = editingLabel.trim();

    if (!trimmedLabel || editingDayId === null) {
      return;
    }

    await onUpdateDay(editingDayId, trimmedLabel, editingImagePath);
    setEditingDayId(null);
    setEditingLabel("");
    setEditingImagePath(null);
  }

  async function handlePickImage(target: "new" | "edit") {
    const selectedPath = await window.mapaMalvinas.selectDayBackground();

    if (!selectedPath) {
      return;
    }

    if (target === "edit") {
      setEditingImagePath(selectedPath);
      return;
    }

    setNewDayImagePath(selectedPath);
  }

  return (
    <header className="timeline-shell">
      <div className="timeline-track">
        {days.map((day) =>
          isEditable && editingDayId === day.id ? (
            <div key={day.id} className="timeline-box editing">
              <div className="timeline-input-row">
                <input
                  autoFocus
                  className="timeline-input"
                  maxLength={60}
                  onChange={(event) => setEditingLabel(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      void handleUpdateSubmit();
                    }

                    if (event.key === "Escape") {
                      setEditingDayId(null);
                      setEditingLabel("");
                    }
                  }}
                  type="text"
                  value={editingLabel}
                />
                <button
                  aria-label="Elegir imagen de fondo"
                  className="timeline-icon-button"
                  onClick={() => void handlePickImage("edit")}
                  title="Elegir imagen de fondo"
                  type="button"
                >
                  <span className="folder-icon" aria-hidden="true" />
                </button>
              </div>
              <div className="timeline-edit-actions">
                <button className="timeline-mini-button" onClick={() => void handleUpdateSubmit()} type="button">
                  OK
                </button>
                <button
                  className="timeline-mini-button secondary"
                  onClick={() => {
                    setEditingDayId(null);
                    setEditingLabel("");
                    setEditingImagePath(null);
                  }}
                  type="button"
                >
                  X
                </button>
              </div>
            </div>
          ) : (
            <div key={day.id} className={day.id === activeDayId ? "timeline-box active" : "timeline-box"}>
              <button
                className="timeline-select"
                onClick={() => onSelectDay(day.id)}
                onDoubleClick={
                  isEditable
                    ? () => {
                        setEditingDayId(day.id);
                        setEditingLabel(day.etiquetaFecha);
                        setEditingImagePath(day.rutaImagenFondo);
                      }
                    : undefined
                }
                type="button"
              >
                <span className="timeline-label-text" title={day.etiquetaFecha}>
                  {day.etiquetaFecha}
                </span>
              </button>
              {isEditable ? (
                <button
                  aria-label={`Borrar ${day.etiquetaFecha}`}
                  className="timeline-close"
                  onClick={() => void onDeleteDay(day.id)}
                  type="button"
                >
                  x
                </button>
              ) : null}
            </div>
          )
        )}

        {isEditable && isAdding ? (
          <div className="timeline-box add-box editing">
            <div className="timeline-input-row">
              <input
                autoFocus
                className="timeline-input"
                maxLength={60}
                onChange={(event) => setNewDayLabel(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    void handleSubmit();
                  }

                  if (event.key === "Escape") {
                    setIsAdding(false);
                    setNewDayLabel("");
                  }
                }}
                placeholder="Escribir nombre"
                type="text"
                value={newDayLabel}
              />
              <button
                aria-label="Elegir imagen de fondo"
                className="timeline-icon-button"
                onClick={() => void handlePickImage("new")}
                title="Elegir imagen de fondo"
                type="button"
              >
                <span className="folder-icon" aria-hidden="true" />
              </button>
            </div>

            <div className="timeline-edit-actions">
              <button className="timeline-mini-button" disabled={isSavingDay} onClick={() => void handleSubmit()} type="button">
                OK
              </button>
              <button
                className="timeline-mini-button secondary"
                onClick={() => {
                  setIsAdding(false);
                  setNewDayLabel("");
                  setNewDayImagePath(null);
                }}
                type="button"
              >
                X
              </button>
            </div>
          </div>
        ) : isEditable ? (
          <button className="timeline-box add-box" disabled={isSavingDay} onClick={() => setIsAdding(true)} type="button">
            {isSavingDay ? "Guardando..." : "Agregar dia"}
          </button>
        ) : null}
      </div>
    </header>
  );
}
