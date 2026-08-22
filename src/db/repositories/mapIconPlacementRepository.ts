import { getDatabase } from "../connection";
import type { MapIconPlacement } from "../../shared/types/mapIconPlacement";

type MapIconPlacementRow = {
  id: number;
  id_dia: number;
  id_icono_biblioteca: number;
  pos_x_pct: number;
  pos_y_pct: number;
  titulo_contenido: string | null;
  texto_descriptivo: string | null;
  ruta_imagen_local: string | null;
  ruta_video_local: string | null;
  created_at: string;
  updated_at: string;
};

export const mapIconPlacementRepository = {
  listAll: (): MapIconPlacement[] => {
    const db = getDatabase();
    const rows = db
      .prepare(
        `
          SELECT id, id_dia, id_icono_biblioteca, pos_x_pct, pos_y_pct, titulo_contenido, texto_descriptivo, ruta_imagen_local, ruta_video_local, created_at, updated_at
          FROM iconos_mapa
          ORDER BY id_dia ASC, id ASC
        `
      )
      .all() as MapIconPlacementRow[];

    return rows.map((row) => ({
      id: row.id,
      dayId: row.id_dia,
      libraryIconId: row.id_icono_biblioteca,
      posXPct: row.pos_x_pct,
      posYPct: row.pos_y_pct,
      tituloContenido: row.titulo_contenido,
      textoDescriptivo: row.texto_descriptivo,
      rutaImagenLocal: row.ruta_imagen_local,
      rutaVideoLocal: row.ruta_video_local,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  },
  create: (dayId: number, libraryIconId: number, posXPct: number, posYPct: number): void => {
    const db = getDatabase();
    db.prepare(
      `
        INSERT INTO iconos_mapa (id_dia, id_icono_biblioteca, pos_x_pct, pos_y_pct)
        VALUES (?, ?, ?, ?)
      `
    ).run(dayId, libraryIconId, posXPct, posYPct);
  },
  updatePosition: (placementId: number, posXPct: number, posYPct: number): void => {
    const db = getDatabase();
    db.prepare(
      `
        UPDATE iconos_mapa
        SET pos_x_pct = ?, pos_y_pct = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `
    ).run(posXPct, posYPct, placementId);
  },
  updateContent: (
    placementId: number,
    tituloContenido: string | null,
    textoDescriptivo: string | null,
    rutaImagenLocal: string | null,
    rutaVideoLocal: string | null
  ): void => {
    const db = getDatabase();
    db.prepare(
      `
        UPDATE iconos_mapa
        SET titulo_contenido = ?, texto_descriptivo = ?, ruta_imagen_local = ?, ruta_video_local = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `
    ).run(tituloContenido, textoDescriptivo, rutaImagenLocal, rutaVideoLocal, placementId);
  },
  remove: (placementId: number): void => {
    const db = getDatabase();
    db.prepare(
      `
        DELETE FROM transiciones_iconos_mapa
        WHERE id_colocacion_origen = ? OR id_colocacion_destino = ?
      `
    ).run(placementId, placementId);
    db.prepare("DELETE FROM iconos_mapa WHERE id = ?").run(placementId);
  }
};
