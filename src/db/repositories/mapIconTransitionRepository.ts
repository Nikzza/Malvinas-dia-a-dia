import { getDatabase } from "../connection";
import type { MapIconTransition } from "../../shared/types/mapIconTransition";

type MapIconTransitionRow = {
  id: number;
  id_colocacion_origen: number;
  id_colocacion_destino: number;
  puntos_pct_json: string;
  created_at: string;
  updated_at: string;
};

function parsePoints(pointsPctJson: string) {
  try {
    const parsed = JSON.parse(pointsPctJson);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((value) => typeof value === "number" && Number.isFinite(value));
  } catch {
    return [];
  }
}

export const mapIconTransitionRepository = {
  listAll: (): MapIconTransition[] => {
    const db = getDatabase();
    const rows = db
      .prepare(
        `
          SELECT id, id_colocacion_origen, id_colocacion_destino, puntos_pct_json, created_at, updated_at
          FROM transiciones_iconos_mapa
          ORDER BY id ASC
        `
      )
      .all() as MapIconTransitionRow[];

    return rows.map((row) => ({
      id: row.id,
      sourcePlacementId: row.id_colocacion_origen,
      targetPlacementId: row.id_colocacion_destino,
      pointsPct: parsePoints(row.puntos_pct_json),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  },
  upsert: (sourcePlacementId: number, targetPlacementId: number, pointsPct: number[]): void => {
    const db = getDatabase();
    const existing = db
      .prepare(
        `
          SELECT id
          FROM transiciones_iconos_mapa
          WHERE id_colocacion_origen = ? AND id_colocacion_destino = ?
        `
      )
      .get(sourcePlacementId, targetPlacementId) as { id: number } | undefined;

    if (existing) {
      db.prepare(
        `
          UPDATE transiciones_iconos_mapa
          SET puntos_pct_json = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `
      ).run(JSON.stringify(pointsPct), existing.id);
      return;
    }

    db.prepare(
      `
        INSERT INTO transiciones_iconos_mapa (id_colocacion_origen, id_colocacion_destino, puntos_pct_json)
        VALUES (?, ?, ?)
      `
    ).run(sourcePlacementId, targetPlacementId, JSON.stringify(pointsPct));
  },
  remove: (transitionId: number): void => {
    const db = getDatabase();
    db.prepare("DELETE FROM transiciones_iconos_mapa WHERE id = ?").run(transitionId);
  },
  removeByPlacement: (placementId: number): void => {
    const db = getDatabase();
    db.prepare(
      `
        DELETE FROM transiciones_iconos_mapa
        WHERE id_colocacion_origen = ? OR id_colocacion_destino = ?
      `
    ).run(placementId, placementId);
  },
  removeByDay: (dayId: number): void => {
    const db = getDatabase();
    db.prepare(
      `
        DELETE FROM transiciones_iconos_mapa
        WHERE id_colocacion_origen IN (
          SELECT id FROM iconos_mapa WHERE id_dia = ?
        )
        OR id_colocacion_destino IN (
          SELECT id FROM iconos_mapa WHERE id_dia = ?
        )
      `
    ).run(dayId, dayId);
  }
};
