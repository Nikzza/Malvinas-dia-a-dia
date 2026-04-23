import { useState } from "react";
import type { Day } from "../../../shared/types/day";

type SidePanelProps = {
  mode: "public" | "admin";
  onToggleMode: () => void;
  activeDay: Day | null;
  onCreateDay: (label: string) => Promise<void>;
  isSavingDay: boolean;
};

export function SidePanel({
  mode,
  onToggleMode,
  activeDay,
  onCreateDay,
  isSavingDay
}: SidePanelProps) {
  const isAdmin = mode === "admin";
  const [newDayLabel, setNewDayLabel] = useState("");

  async function handleSubmit() {
    if (!newDayLabel.trim()) {
      return;
    }

    await onCreateDay(newDayLabel);
    setNewDayLabel("");
  }

  return (
    <aside className="side-panel">
      <div className="panel-badge">{isAdmin ? "Modo administrador" : "Modo publico"}</div>

      <div className="panel-block">
        <h3>Dia seleccionado</h3>
        <p>{activeDay ? activeDay.etiquetaFecha : "Todavia no hay un dia activo."}</p>
      </div>

      <div className="panel-block">
        <h3>Navegacion superior</h3>
        <p>
          Cada jornada aparece arriba como una tarjeta con previsualizacion. El museo puede ir
          sumando dias y desplazarse libremente entre ellos.
        </p>
      </div>

      {isAdmin ? (
        <div className="panel-block">
          <h3>Agregar nuevo dia</h3>
          <label className="panel-label" htmlFor="new-day-label">
            Nombre visible del dia
          </label>
          <input
            className="panel-input"
            id="new-day-label"
            onChange={(event) => setNewDayLabel(event.target.value)}
            placeholder="Ej: 3 de abril"
            type="text"
            value={newDayLabel}
          />
          <button className="panel-action primary" disabled={isSavingDay} onClick={handleSubmit} type="button">
            {isSavingDay ? "Guardando..." : "Agregar dia"}
          </button>
        </div>
      ) : (
        <div className="panel-block">
          <h3>Modo visita</h3>
          <p>
            En esta vista el publico solo recorre el contenido. La edicion queda reservada para
            el personal del museo.
          </p>
        </div>
      )}

      <button className="panel-action" onClick={onToggleMode} type="button">
        Cambiar a {isAdmin ? "modo publico" : "modo administrador"}
      </button>
    </aside>
  );
}
