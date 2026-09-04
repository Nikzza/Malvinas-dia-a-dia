import { getDatabase } from "../connection";
import type { MapIconPlacement } from "../../shared/types/mapIconPlacement";

type MapIconPlacementRow = {
  id: number;
  id_dia: number;
  id_icono_biblioteca: number;
  identificador_trayectoria: number;
  pos_x_pct: number;
  pos_y_pct: number;
  titulo_contenido: string | null;
  texto_descriptivo: string | null;
  ruta_imagen_local: string | null;
  ruta_video_local: string | null;
  created_at: string;
  updated_at: string;
};

type MapIconPlacementImageRow = {
  id: number;
  id_colocacion_icono: number;
  ruta_imagen_local: string;
  orden: number;
  created_at: string;
  updated_at: string;
};

export const mapIconPlacementRepository = {
  listAll: (): MapIconPlacement[] => {
    const db = getDatabase();
    const rows = db
      .prepare(
        `
          SELECT id, id_dia, id_icono_biblioteca, identificador_trayectoria, pos_x_pct, pos_y_pct, titulo_contenido, texto_descriptivo, ruta_imagen_local, ruta_video_local, created_at, updated_at
          FROM iconos_mapa
          ORDER BY id_dia ASC, id ASC
        `
      )
      .all() as MapIconPlacementRow[];
    const imageRows = db
      .prepare(
        `
          SELECT id, id_colocacion_icono, ruta_imagen_local, orden, created_at, updated_at
          FROM imagenes_iconos_mapa
          ORDER BY id_colocacion_icono ASC, orden ASC, id ASC
        `
      )
      .all() as MapIconPlacementImageRow[];
    const imagesByPlacement = new Map<number, MapIconPlacementImageRow[]>();

    for (const image of imageRows) {
      const placementImages = imagesByPlacement.get(image.id_colocacion_icono) ?? [];
      placementImages.push(image);
      imagesByPlacement.set(image.id_colocacion_icono, placementImages);
    }

    return rows.map((row) => {
      const images = imagesByPlacement.get(row.id) ?? [];

      return {
        id: row.id,
        dayId: row.id_dia,
        libraryIconId: row.id_icono_biblioteca,
        trajectoryIdentifier: row.identificador_trayectoria,
        posXPct: row.pos_x_pct,
        posYPct: row.pos_y_pct,
        tituloContenido: row.titulo_contenido,
        textoDescriptivo: row.texto_descriptivo,
        rutaImagenLocal: images[0]?.ruta_imagen_local ?? row.ruta_imagen_local,
        rutaVideoLocal: row.ruta_video_local,
        imagenes: images.map((image) => ({
          id: image.id,
          placementId: image.id_colocacion_icono,
          order: image.orden,
          rutaImagenLocal: image.ruta_imagen_local,
          createdAt: image.created_at,
          updatedAt: image.updated_at
        })),
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };
    });
  },
  create: (dayId: number, libraryIconId: number, posXPct: number, posYPct: number): void => {
    const db = getDatabase();
    const nextIdentifier = db
      .prepare(
        `
          SELECT COALESCE(MAX(identificador_trayectoria), 0) + 1 AS value
          FROM iconos_mapa
        `
      )
      .get() as { value: number };

    db.prepare(
      `
        INSERT INTO iconos_mapa (id_dia, id_icono_biblioteca, identificador_trayectoria, pos_x_pct, pos_y_pct)
        VALUES (?, ?, ?, ?, ?)
      `
    ).run(dayId, libraryIconId, nextIdentifier.value, posXPct, posYPct);
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
    trajectoryIdentifier: number,
    tituloContenido: string | null,
    textoDescriptivo: string | null,
    rutasImagenesLocales: string[],
    rutaVideoLocal: string | null
  ): void => {
    const db = getDatabase();
    const updateContent = db.transaction(() => {
      db.prepare(
        `
          UPDATE iconos_mapa
          SET identificador_trayectoria = ?, titulo_contenido = ?, texto_descriptivo = ?, ruta_imagen_local = ?, ruta_video_local = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `
      ).run(
        trajectoryIdentifier,
        tituloContenido,
        textoDescriptivo,
        rutasImagenesLocales[0] ?? null,
        rutaVideoLocal,
        placementId
      );
      db.prepare("DELETE FROM imagenes_iconos_mapa WHERE id_colocacion_icono = ?").run(placementId);
      const insertImage = db.prepare(
        `
          INSERT INTO imagenes_iconos_mapa (id_colocacion_icono, ruta_imagen_local, orden)
          VALUES (?, ?, ?)
        `
      );

      rutasImagenesLocales.forEach((rutaImagenLocal, order) => {
        insertImage.run(placementId, rutaImagenLocal, order);
      });
    });

    updateContent();
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
