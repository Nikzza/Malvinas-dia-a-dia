import { getDatabase } from "../connection";
import {
  isMapDrawingLineColor,
  type MapDrawingLine,
  type MapDrawingLineColor,
  type MapDrawingLineStyle
} from "../../shared/types/mapDrawingLine";

type MapDrawingLineRow = {
  id: number;
  id_dia: number;
  estilo: MapDrawingLineStyle;
  color: string;
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

export const mapDrawingLineRepository = {
  listAll: (): MapDrawingLine[] => {
    const db = getDatabase();
    const rows = db
      .prepare(
        `
          SELECT id, id_dia, estilo, color, puntos_pct_json, created_at, updated_at
          FROM lineas_mapa
          ORDER BY id_dia ASC, id ASC
        `
      )
      .all() as MapDrawingLineRow[];

    return rows.map((row) => ({
      id: row.id,
      dayId: row.id_dia,
      style: row.estilo,
      color: isMapDrawingLineColor(row.color) ? row.color : "yellow",
      pointsPct: parsePoints(row.puntos_pct_json),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  },
  create: (dayId: number, style: MapDrawingLineStyle, color: MapDrawingLineColor, pointsPct: number[]): void => {
    const db = getDatabase();
    db.prepare(
      `
        INSERT INTO lineas_mapa (id_dia, estilo, color, puntos_pct_json)
        VALUES (?, ?, ?, ?)
      `
    ).run(dayId, style, color, JSON.stringify(pointsPct));
  },
  remove: (lineId: number): void => {
    const db = getDatabase();
    db.prepare("DELETE FROM lineas_mapa WHERE id = ?").run(lineId);
  }
};
