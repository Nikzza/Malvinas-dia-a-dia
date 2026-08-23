import { getDatabase } from "../connection";
import type { Day } from "../../shared/types/day";

type DayRow = {
  id: number;
  etiqueta_fecha: string;
  es_evento_destacado: number;
  ruta_imagen_fondo: string | null;
  vista_centro_lng: number | null;
  vista_centro_lat: number | null;
  vista_zoom: number | null;
  orden: number;
  created_at: string;
  updated_at: string;
};

export const dayRepository = {
  assignUnowned: (profileId: string): void => {
    const db = getDatabase();
    db.prepare("UPDATE dias SET perfil_id = ? WHERE perfil_id IS NULL OR perfil_id = ''").run(profileId);
  },
  list: (profileId: string): Day[] => {
    const db = getDatabase();
    const rows = db
      .prepare(
        `
          SELECT id, etiqueta_fecha, es_evento_destacado, ruta_imagen_fondo, vista_centro_lng, vista_centro_lat, vista_zoom, orden, created_at, updated_at
          FROM dias
          WHERE perfil_id = ?
          ORDER BY orden ASC, id ASC
        `
      )
      .all(profileId) as DayRow[];

    return rows.map((row) => ({
      id: row.id,
      etiquetaFecha: row.etiqueta_fecha,
      esEventoDestacado: Boolean(row.es_evento_destacado),
      rutaImagenFondo: row.ruta_imagen_fondo,
      initialMapLongitude: row.vista_centro_lng,
      initialMapLatitude: row.vista_centro_lat,
      initialMapZoom: row.vista_zoom,
      orden: row.orden,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  },
  create: (profileId: string, etiquetaFecha: string, esEventoDestacado: boolean): Day => {
    const db = getDatabase();
    const maxOrderRow = db.prepare("SELECT COALESCE(MAX(orden), 0) AS maxOrden FROM dias WHERE perfil_id = ?").get(profileId) as {
      maxOrden: number;
    };

    const insertResult = db
      .prepare(
        `
          INSERT INTO dias (perfil_id, etiqueta_fecha, es_evento_destacado, ruta_imagen_fondo, orden)
          VALUES (?, ?, ?, ?, ?)
        `
      )
      .run(profileId, etiquetaFecha.trim(), esEventoDestacado ? 1 : 0, null, maxOrderRow.maxOrden + 1);

    const created = db
      .prepare(
        `
          SELECT id, etiqueta_fecha, es_evento_destacado, ruta_imagen_fondo, vista_centro_lng, vista_centro_lat, vista_zoom, orden, created_at, updated_at
          FROM dias
          WHERE id = ?
        `
      )
      .get(insertResult.lastInsertRowid) as DayRow;

    return {
      id: created.id,
      etiquetaFecha: created.etiqueta_fecha,
      esEventoDestacado: Boolean(created.es_evento_destacado),
      rutaImagenFondo: created.ruta_imagen_fondo,
      initialMapLongitude: created.vista_centro_lng,
      initialMapLatitude: created.vista_centro_lat,
      initialMapZoom: created.vista_zoom,
      orden: created.orden,
      createdAt: created.created_at,
      updatedAt: created.updated_at
    };
  },
  remove: (id: number): void => {
    const db = getDatabase();
    db.prepare("DELETE FROM lineas_mapa WHERE id_dia = ?").run(id);
    db.prepare("DELETE FROM etiquetas_mapa WHERE id_dia = ?").run(id);
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
    ).run(id, id);
    db.prepare("DELETE FROM iconos_mapa WHERE id_dia = ?").run(id);
    db.prepare("DELETE FROM iconos_dia WHERE id_dia = ?").run(id);
    db.prepare("DELETE FROM eventos WHERE id_dia = ?").run(id);
    db.prepare("DELETE FROM dias WHERE id = ?").run(id);
  },
  removeByProfile: (profileId: string): void => {
    const db = getDatabase();
    const dayIds = db.prepare("SELECT id FROM dias WHERE perfil_id = ?").all(profileId) as Array<{ id: number }>;
    const removeProfileDays = db.transaction(() => {
      for (const day of dayIds) {
        dayRepository.remove(day.id);
      }
    });
    removeProfileDays();
  },
  update: (id: number, etiquetaFecha: string, esEventoDestacado: boolean): void => {
    const db = getDatabase();
    db.prepare(
      `
        UPDATE dias
        SET etiqueta_fecha = ?, es_evento_destacado = ?, ruta_imagen_fondo = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `
    ).run(etiquetaFecha.trim(), esEventoDestacado ? 1 : 0, id);
  },
  updateMapView: (id: number, longitude: number | null, latitude: number | null, zoom: number | null): void => {
    const db = getDatabase();
    db.prepare(
      `
        UPDATE dias
        SET vista_centro_lng = ?, vista_centro_lat = ?, vista_zoom = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `
    ).run(longitude, latitude, zoom, id);
  }
};
