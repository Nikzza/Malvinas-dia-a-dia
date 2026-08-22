import { getDatabase } from "../connection";
import {
  isMapLabelStyle,
  MAP_LABEL_STYLE_NAMES,
  type MapLabel,
  type MapLabelStyle
} from "../../shared/types/mapLabel";

type MapLabelRow = {
  id: number;
  id_dia: number;
  pos_x_pct: number;
  pos_y_pct: number;
  estilo: string;
  texto: string;
  created_at: string;
  updated_at: string;
};

export const mapLabelRepository = {
  listAll: (): MapLabel[] => {
    const db = getDatabase();
    const rows = db
      .prepare(
        `
          SELECT id, id_dia, pos_x_pct, pos_y_pct, estilo, texto, created_at, updated_at
          FROM etiquetas_mapa
          ORDER BY id_dia ASC, id ASC
        `
      )
      .all() as MapLabelRow[];

    return rows.map((row) => ({
      id: row.id,
      dayId: row.id_dia,
      posXPct: row.pos_x_pct,
      posYPct: row.pos_y_pct,
      style: isMapLabelStyle(row.estilo) ? row.estilo : "gray",
      text: row.texto,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  },
  create: (dayId: number, posXPct: number, posYPct: number, style: MapLabelStyle): void => {
    const db = getDatabase();
    db.prepare(
      `
        INSERT INTO etiquetas_mapa (id_dia, pos_x_pct, pos_y_pct, estilo, texto)
        VALUES (?, ?, ?, ?, ?)
      `
    ).run(dayId, posXPct, posYPct, style, MAP_LABEL_STYLE_NAMES[style]);
  },
  updatePosition: (labelId: number, posXPct: number, posYPct: number): void => {
    const db = getDatabase();
    db.prepare(
      `
        UPDATE etiquetas_mapa
        SET pos_x_pct = ?, pos_y_pct = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `
    ).run(posXPct, posYPct, labelId);
  },
  updateContent: (labelId: number, text: string): void => {
    const db = getDatabase();
    db.prepare(
      `
        UPDATE etiquetas_mapa
        SET texto = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `
    ).run(text, labelId);
  },
  remove: (labelId: number): void => {
    const db = getDatabase();
    db.prepare("DELETE FROM etiquetas_mapa WHERE id = ?").run(labelId);
  }
};
