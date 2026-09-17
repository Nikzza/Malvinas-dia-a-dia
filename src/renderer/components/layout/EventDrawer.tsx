import { useMemo, useState, type FormEvent } from "react";
import type { Day } from "../../../shared/types/day";

type EventDrawerProps = {
  days: Day[];
  activeDayId: number | null;
  isEditable: boolean;
  onSelectDay: (dayId: number) => void;
  onUpdateFeaturedTitle: (dayId: number, title: string) => Promise<void>;
};

function FeaturedDayItem({ day, isActive, isEditable, onSelectDay, onUpdateFeaturedTitle }: {
  day: Day;
  isActive: boolean;
  isEditable: boolean;
  onSelectDay: EventDrawerProps["onSelectDay"];
  onUpdateFeaturedTitle: EventDrawerProps["onUpdateFeaturedTitle"];
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const displayTitle = day.tituloDestacado ?? day.etiquetaFecha;

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim() || isSaving) return;

    setIsSaving(true);
    setError(null);
    try {
      await onUpdateFeaturedTitle(day.id, title.trim());
      setIsEditing(false);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "No se pudo guardar el titulo.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className={isActive ? "event-drawer-item active" : "event-drawer-item"}>
      {isEditable && isEditing ? (
        <form className="event-drawer-editor" onSubmit={handleSave}>
          <label>
            <span className="event-drawer-index">{day.etiquetaFecha}</span>
            <input
              aria-label={`Titulo del destacado ${day.etiquetaFecha}`}
              autoFocus
              disabled={isSaving}
              onChange={(event) => setTitle(event.target.value)}
              onFocus={(event) => event.target.select()}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.stopPropagation();
                  if (!isSaving) setIsEditing(false);
                }
              }}
              type="text"
              value={title}
            />
          </label>
          <div className="event-drawer-editor-actions">
            <button disabled={isSaving || !title.trim()} type="submit">{isSaving ? "Guardando..." : "Guardar"}</button>
            <button disabled={isSaving} onClick={() => setIsEditing(false)} type="button">Cancelar</button>
          </div>
          {error ? <p className="event-drawer-editor-error" role="alert">{error}</p> : null}
        </form>
      ) : (
        <>
          <button className="event-drawer-select" onClick={() => onSelectDay(day.id)} type="button">
            <span className="event-drawer-index">{day.etiquetaFecha}</span>
            <strong>{displayTitle}</strong>
          </button>
          {isEditable ? (
            <button
              aria-label={`Editar titulo de ${day.etiquetaFecha}`}
              className="event-drawer-edit"
              onClick={() => {
                setTitle(displayTitle);
                setError(null);
                setIsEditing(true);
              }}
              title="Editar titulo del destacado"
              type="button"
            >
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 5l5 5M4 20l5-1L20 8a2 2 0 0 0-5-5L4 14z" />
              </svg>
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}

export function EventDrawer({ days, activeDayId, isEditable, onSelectDay, onUpdateFeaturedTitle }: EventDrawerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const featuredDays = useMemo(() => days.filter((day) => day.esEventoDestacado), [days]);

  function handleSelect(dayId: number) {
    onSelectDay(dayId);
    setIsOpen(false);
  }

  return (
    <div className="event-drawer-shell">
      <div className={isOpen ? "event-drawer-rail open" : "event-drawer-rail"}>
        <aside className="event-drawer-panel" aria-label="Destacados">
          {featuredDays.length ? (
            <div className="event-drawer-list">
              {featuredDays.map((day) => (
                <FeaturedDayItem
                  key={`${day.id}-${isEditable}`}
                  day={day}
                  isActive={day.id === activeDayId}
                  isEditable={isEditable}
                  onSelectDay={handleSelect}
                  onUpdateFeaturedTitle={onUpdateFeaturedTitle}
                />
              ))}
            </div>
          ) : (
            <p className="event-drawer-empty">
              {isEditable
                ? "Marca un evento con la estrella en la barra inferior para agregarlo a este panel."
                : "No hay eventos destacados cargados."}
            </p>
          )}
        </aside>

        <button
          aria-expanded={isOpen}
          aria-label={isOpen ? "Cerrar menu de destacados" : "Abrir menu de destacados"}
          className={isOpen ? "event-drawer-handle open" : "event-drawer-handle"}
          onClick={() => setIsOpen((current) => !current)}
          type="button"
        >
          <span className="event-drawer-handle-arrow" aria-hidden="true">
            {isOpen ? "<" : ">"}
          </span>
          <span className="event-drawer-handle-text">Destacados</span>
        </button>
      </div>
    </div>
  );
}
