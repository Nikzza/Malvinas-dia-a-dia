import { getDatabase } from "../connection";
import type { Day } from "../../shared/types/day";

type DayRow = {
  id: number;
  etiqueta_fecha: string;
  ruta_imagen_fondo: string | null;
  orden: number;
  created_at: string;
  updated_at: string;
};

export const dayRepository = {
  list: (): Day[] => {
    const db = getDatabase();
    const rows = db
      .prepare(
        `
          SELECT id, etiqueta_fecha, ruta_imagen_fondo, orden, created_at, updated_at
          FROM dias
          ORDER BY orden ASC, id ASC
        `
      )
      .all() as DayRow[];

    return rows.map((row) => ({
      id: row.id,
      etiquetaFecha: row.etiqueta_fecha,
      rutaImagenFondo: row.ruta_imagen_fondo,
      orden: row.orden,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  },
  create: (etiquetaFecha: string, rutaImagenFondo: string | null): Day => {
    const db = getDatabase();
    const maxOrderRow = db.prepare("SELECT COALESCE(MAX(orden), 0) AS maxOrden FROM dias").get() as {
      maxOrden: number;
    };

    const insertResult = db
      .prepare(
        `
          INSERT INTO dias (etiqueta_fecha, ruta_imagen_fondo, orden)
          VALUES (?, ?, ?)
        `
      )
      .run(etiquetaFecha.trim(), rutaImagenFondo, maxOrderRow.maxOrden + 1);

    const created = db
      .prepare(
        `
          SELECT id, etiqueta_fecha, ruta_imagen_fondo, orden, created_at, updated_at
          FROM dias
          WHERE id = ?
        `
      )
      .get(insertResult.lastInsertRowid) as DayRow;

    return {
      id: created.id,
      etiquetaFecha: created.etiqueta_fecha,
      rutaImagenFondo: created.ruta_imagen_fondo,
      orden: created.orden,
      createdAt: created.created_at,
      updatedAt: created.updated_at
    };
  },
  remove: (id: number): void => {
    const db = getDatabase();
    db.prepare("DELETE FROM lineas_mapa WHERE id_dia = ?").run(id);
    db.prepare("DELETE FROM iconos_mapa WHERE id_dia = ?").run(id);
    db.prepare("DELETE FROM iconos_dia WHERE id_dia = ?").run(id);
    db.prepare("DELETE FROM eventos WHERE id_dia = ?").run(id);
    db.prepare("DELETE FROM dias WHERE id = ?").run(id);
  },
  update: (id: number, etiquetaFecha: string, rutaImagenFondo: string | null): void => {
    const db = getDatabase();
    db.prepare(
      `
        UPDATE dias
        SET etiqueta_fecha = ?, ruta_imagen_fondo = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `
    ).run(etiquetaFecha.trim(), rutaImagenFondo, id);
  }
};
