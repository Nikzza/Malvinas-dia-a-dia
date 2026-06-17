import { useMemo, useState } from "react";
import type { Day } from "../../../shared/types/day";

type EventDrawerProps = {
  days: Day[];
  activeDayId: number | null;
  isEditable: boolean;
  onSelectDay: (dayId: number) => void;
};

export function EventDrawer({ days, activeDayId, isEditable, onSelectDay }: EventDrawerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const featuredDays = useMemo(() => days.filter((day) => day.esEventoDestacado), [days]);

  function handleSelect(dayId: number) {
    onSelectDay(dayId);
    setIsOpen(false);
  }

  return (
    <div className="event-drawer-shell">
      <div className={isOpen ? "event-drawer-rail open" : "event-drawer-rail"}>
        <aside className="event-drawer-panel" aria-label="Eventos destacados">
          {featuredDays.length ? (
            <div className="event-drawer-list">
              {featuredDays.map((day, index) => (
                <button
                  key={day.id}
                  className={day.id === activeDayId ? "event-drawer-item active" : "event-drawer-item"}
                  onClick={() => handleSelect(day.id)}
                  type="button"
                >
                  <span className="event-drawer-index">Evento {String(index + 1).padStart(2, "0")}</span>
                  <strong>{day.etiquetaFecha}</strong>
                </button>
              ))}
            </div>
          ) : (
            <p className="event-drawer-empty">
              {isEditable
                ? "Marca un dia con la estrella en la barra superior para agregarlo a este panel."
                : "No hay eventos destacados cargados."}
            </p>
          )}
        </aside>

        <button
          aria-expanded={isOpen}
          aria-label={isOpen ? "Cerrar menu de eventos" : "Abrir menu de eventos"}
          className={isOpen ? "event-drawer-handle open" : "event-drawer-handle"}
          onClick={() => setIsOpen((current) => !current)}
          type="button"
        >
          <span className="event-drawer-handle-arrow" aria-hidden="true">
            {isOpen ? "<" : ">"}
          </span>
          <span className="event-drawer-handle-text">Eventos</span>
        </button>
      </div>
    </div>
  );
}
