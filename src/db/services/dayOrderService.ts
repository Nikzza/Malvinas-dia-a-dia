import { getDatabase } from "../connection";

type DayOrderRow = {
  id: number;
  orden: number;
};

type PlacementRow = {
  id: number;
  id_dia: number;
  identificador_trayectoria: number;
  pos_x_pct: number;
  pos_y_pct: number;
};

type TransitionRow = {
  id: number;
  id_colocacion_origen: number;
  id_colocacion_destino: number;
  puntos_pct_json: string;
};

function parsePoints(pointsJson: string) {
  try {
    const parsed = JSON.parse(pointsJson);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((value) => typeof value === "number" && Number.isFinite(value));
  } catch {
    return [];
  }
}

export function moveDayAndReconcileTransitions(profileId: string, dayId: number, direction: -1 | 1) {
  const db = getDatabase();
  const moveDay = db.transaction(() => {
    const days = db
      .prepare(
        `
          SELECT id, orden
          FROM dias
          WHERE perfil_id = ?
          ORDER BY orden ASC, id ASC
        `
      )
      .all(profileId) as DayOrderRow[];
    const currentIndex = days.findIndex((day) => day.id === dayId);
    const targetIndex = currentIndex + direction;

    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= days.length) {
      return false;
    }

    const placements = db
      .prepare(
        `
          SELECT
            iconos_mapa.id,
            iconos_mapa.id_dia,
            iconos_mapa.identificador_trayectoria,
            iconos_mapa.pos_x_pct,
            iconos_mapa.pos_y_pct
          FROM iconos_mapa
          INNER JOIN dias ON dias.id = iconos_mapa.id_dia
          WHERE dias.perfil_id = ?
          ORDER BY iconos_mapa.id ASC
        `
      )
      .all(profileId) as PlacementRow[];
    const transitions = db
      .prepare(
        `
          SELECT
            transiciones_iconos_mapa.id,
            transiciones_iconos_mapa.id_colocacion_origen,
            transiciones_iconos_mapa.id_colocacion_destino,
            transiciones_iconos_mapa.puntos_pct_json
          FROM transiciones_iconos_mapa
          INNER JOIN iconos_mapa AS origen
            ON origen.id = transiciones_iconos_mapa.id_colocacion_origen
          INNER JOIN dias ON dias.id = origen.id_dia
          WHERE dias.perfil_id = ?
          ORDER BY transiciones_iconos_mapa.updated_at DESC, transiciones_iconos_mapa.id DESC
        `
      )
      .all(profileId) as TransitionRow[];
    const placementById = new Map(placements.map((placement) => [placement.id, placement] as const));
    const placementsByDayAndIdentifier = new Map<string, PlacementRow>();

    for (const placement of placements) {
      placementsByDayAndIdentifier.set(
        `${placement.id_dia}:${placement.identificador_trayectoria}`,
        placement
      );
    }

    const transitionsBySource = new Map<number, TransitionRow[]>();

    for (const transition of transitions) {
      const sourceTransitions = transitionsBySource.get(transition.id_colocacion_origen) ?? [];
      sourceTransitions.push(transition);
      transitionsBySource.set(transition.id_colocacion_origen, sourceTransitions);
    }

    const oldDayIndexById = new Map(days.map((day, index) => [day.id, index] as const));
    const transitionTemplateBySource = new Map<number, TransitionRow>();

    for (const [sourcePlacementId, sourceTransitions] of transitionsBySource) {
      const sourcePlacement = placementById.get(sourcePlacementId);

      if (!sourcePlacement) {
        continue;
      }

      const sourceDayIndex = oldDayIndexById.get(sourcePlacement.id_dia);
      const oldNextDay = sourceDayIndex === undefined ? null : days[sourceDayIndex + 1] ?? null;
      const activeTransition = oldNextDay
        ? sourceTransitions.find((transition) => {
            const targetPlacement = placementById.get(transition.id_colocacion_destino);
            return (
              targetPlacement?.id_dia === oldNextDay.id &&
              targetPlacement.identificador_trayectoria === sourcePlacement.identificador_trayectoria
            );
          })
        : null;

      transitionTemplateBySource.set(sourcePlacementId, activeTransition ?? sourceTransitions[0]);
    }

    const reorderedDays = [...days];
    [reorderedDays[currentIndex], reorderedDays[targetIndex]] = [
      reorderedDays[targetIndex],
      reorderedDays[currentIndex]
    ];
    const updateOrder = db.prepare(
      "UPDATE dias SET orden = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    );

    reorderedDays.forEach((day, index) => updateOrder.run(index + 1, day.id));

    const newDayIndexById = new Map(reorderedDays.map((day, index) => [day.id, index] as const));
    const updateTransition = db.prepare(
      `
        UPDATE transiciones_iconos_mapa
        SET id_colocacion_destino = ?, puntos_pct_json = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `
    );
    const removeDuplicate = db.prepare(
      `
        DELETE FROM transiciones_iconos_mapa
        WHERE id_colocacion_origen = ? AND id_colocacion_destino = ? AND id <> ?
      `
    );

    for (const [sourcePlacementId, transition] of transitionTemplateBySource) {
      const sourcePlacement = placementById.get(sourcePlacementId);

      if (!sourcePlacement) {
        continue;
      }

      const sourceDayIndex = newDayIndexById.get(sourcePlacement.id_dia);
      const newNextDay = sourceDayIndex === undefined ? null : reorderedDays[sourceDayIndex + 1] ?? null;

      if (!newNextDay) {
        continue;
      }

      const targetPlacement = placementsByDayAndIdentifier.get(
        `${newNextDay.id}:${sourcePlacement.identificador_trayectoria}`
      );

      if (!targetPlacement) {
        continue;
      }

      const storedPoints = parsePoints(transition.puntos_pct_json);
      const intermediatePoints = storedPoints.length >= 4 ? storedPoints.slice(2, -2) : [];
      const updatedPoints = [
        sourcePlacement.pos_x_pct,
        sourcePlacement.pos_y_pct,
        ...intermediatePoints,
        targetPlacement.pos_x_pct,
        targetPlacement.pos_y_pct
      ];

      removeDuplicate.run(sourcePlacementId, targetPlacement.id, transition.id);
      updateTransition.run(targetPlacement.id, JSON.stringify(updatedPoints), transition.id);
    }

    return true;
  });

  return moveDay();
}
