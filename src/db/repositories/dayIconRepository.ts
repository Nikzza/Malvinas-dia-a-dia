import { getDatabase } from "../connection";
import type { DayIcon } from "../../shared/types/dayIcon";

type DayIconRow = {
  id: number;
  id_dia: number;
  nombre: string;
  ruta_icono_local: string;
  created_at: string;
};

export const dayIconRepository = {
  listAll: (): DayIcon[] => {
    const db = getDatabase();
    const rows = db
      .prepare(
        `
          SELECT id, id_dia, nombre, ruta_icono_local, created_at
          FROM iconos_dia
          ORDER BY id_dia ASC, id ASC
        `
      )
      .all() as DayIconRow[];

    return rows.map((row) => ({
      id: row.id,
      dayId: row.id_dia,
      nombre: row.nombre,
      rutaIconoLocal: row.ruta_icono_local,
      createdAt: row.created_at
    }));
  },
  create: (dayId: number, nombre: string, rutaIconoLocal: string): void => {
    const db = getDatabase();
    db.prepare(
      `
        INSERT INTO iconos_dia (id_dia, nombre, ruta_icono_local)
        VALUES (?, ?, ?)
      `
    ).run(dayId, nombre.trim(), rutaIconoLocal);
  },
  remove: (iconId: number): void => {
    const db = getDatabase();
    db.prepare("DELETE FROM iconos_dia WHERE id = ?").run(iconId);
  }
};
