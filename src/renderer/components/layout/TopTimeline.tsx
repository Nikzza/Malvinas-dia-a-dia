import { useEffect, useRef, useState } from "react";
import type { WheelEvent as ReactWheelEvent } from "react";
import type { Day } from "../../../shared/types/day";

type TopTimelineProps = {
  days: Day[];
  activeDayId: number | null;
  isEditable: boolean;
  onSelectDay: (dayId: number) => void;
  onAddDay: (label: string) => Promise<void>;
  onDeleteDay: (dayId: number) => Promise<void>;
  onUpdateDay: (dayId: number, label: string) => Promise<void>;
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
  const trackRef = useRef<HTMLDivElement | null>(null);
  const activeDayRef = useRef<HTMLDivElement | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [newDayLabel, setNewDayLabel] = useState("");
  const [editingDayId, setEditingDayId] = useState<number | null>(null);
  const [editingLabel, setEditingLabel] = useState("");
  const activeDayIndex = days.findIndex((day) => day.id === activeDayId);
  const hasPreviousDay = activeDayIndex > 0;
  const hasNextDay = activeDayIndex >= 0 && activeDayIndex < days.length - 1;

  useEffect(() => {
    activeDayRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center"
    });
  }, [activeDayId, days.length]);

  async function handleSubmit() {
    const trimmedLabel = newDayLabel.trim();

    if (!trimmedLabel) {
      return;
    }

    await onAddDay(trimmedLabel);
    setNewDayLabel("");
    setIsAdding(false);
  }

  async function handleUpdateSubmit() {
    const trimmedLabel = editingLabel.trim();

    if (!trimmedLabel || editingDayId === null) {
      return;
    }

    await onUpdateDay(editingDayId, trimmedLabel);
    setEditingDayId(null);
    setEditingLabel("");
  }

  function handleTimelineWheel(event: ReactWheelEvent<HTMLDivElement>) {
    const track = trackRef.current;

    if (!track) {
      return;
    }

    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    track.scrollBy({
      left: event.deltaY,
      behavior: "smooth"
    });
  }

  function handleScrollTimeline(direction: -1 | 1) {
    const track = trackRef.current;

    if (!track) {
      return;
    }

    track.scrollBy({
      left: direction * Math.max(220, track.clientWidth * 0.72),
      behavior: "smooth"
    });
  }

  function handleNavigate(direction: -1 | 1) {
    if (!isEditable) {
      const nextDay = days[activeDayIndex + direction];

      if (nextDay) {
        onSelectDay(nextDay.id);
      }

      return;
    }

    handleScrollTimeline(direction);
  }

  return (
    <header className="timeline-shell">
      <button
        aria-label="Ver dias anteriores"
        className="timeline-nav-button"
        disabled={!isEditable && !hasPreviousDay}
        onClick={() => handleNavigate(-1)}
        type="button"
      >
        &lsaquo;
      </button>

      <div ref={trackRef} className="timeline-track" onWheel={handleTimelineWheel}>
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
                  }}
                  type="button"
                >
                  X
                </button>
              </div>
            </div>
          ) : (
            <div
              key={day.id}
              ref={day.id === activeDayId ? activeDayRef : undefined}
              className={day.id === activeDayId ? "timeline-box active" : "timeline-box"}
            >
              <button
                className="timeline-select"
                onClick={() => onSelectDay(day.id)}
                onDoubleClick={
                  isEditable
                    ? () => {
                        setEditingDayId(day.id);
                        setEditingLabel(day.etiquetaFecha);
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
                }}
                type="button"
              >
                X
              </button>
            </div>
          </div>
        ) : isEditable ? (
          <button className="timeline-box add-box" disabled={isSavingDay} onClick={() => setIsAdding(true)} type="button">
            <span className="timeline-add-symbol">+</span>
            <span>{isSavingDay ? "Guardando..." : "Agregar dia"}</span>
          </button>
        ) : null}
      </div>

      <button
        aria-label="Ver dias siguientes"
        className="timeline-nav-button"
        disabled={!isEditable && !hasNextDay}
        onClick={() => handleNavigate(1)}
        type="button"
      >
        &rsaquo;
      </button>
    </header>
  );
}
