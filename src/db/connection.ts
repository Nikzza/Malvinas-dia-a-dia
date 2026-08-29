import { app } from "electron";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

let database: Database.Database | null = null;

function getDataDirectory() {
  return path.join(app.getPath("documents"), "MapaMalvinas_Data");
}

function getDatabasePath() {
  return path.join(getDataDirectory(), "database", "app.db");
}

function ensureDataDirectories() {
  const dataDirectory = getDataDirectory();
  fs.mkdirSync(path.join(dataDirectory, "database"), { recursive: true });
  fs.mkdirSync(path.join(dataDirectory, "assets", "images"), { recursive: true });
  fs.mkdirSync(path.join(dataDirectory, "assets", "videos"), { recursive: true });
  return dataDirectory;
}

function loadMigrationSql() {
  const migrationPath = path.join(process.cwd(), "src", "db", "migrations", "001_init.sql");
  return fs.readFileSync(migrationPath, "utf-8");
}

function normalizeDefaultSeedData(db: Database.Database) {
  const rows = db.prepare("SELECT id, etiqueta_fecha FROM dias ORDER BY id ASC").all() as Array<{
    id: number;
    etiqueta_fecha: string;
  }>;

  if (
    rows.length === 2 &&
    rows[0]?.etiqueta_fecha === "2 de abril - Madrugada" &&
    rows[1]?.etiqueta_fecha === "2 de abril - Manana"
  ) {
    db.prepare("DELETE FROM eventos").run();
    db.prepare("DELETE FROM dias").run();
  }
}

function ensureColumn(db: Database.Database, tableName: string, columnName: string, definition: string) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
  const hasColumn = columns.some((column) => column.name === columnName);

  if (hasColumn) {
    return false;
  }

  db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  return true;
}

function ensureTrajectoryIdentifiers(db: Database.Database) {
  const wasAdded = ensureColumn(db, "iconos_mapa", "identificador_trayectoria", "INTEGER");
  const placements = db
    .prepare("SELECT id, identificador_trayectoria FROM iconos_mapa ORDER BY id ASC")
    .all() as Array<{ id: number; identificador_trayectoria: number | null }>;

  if (!placements.length) {
    return;
  }

  const identifiers = new Map<number, number>();
  const needsTransitionBackfill =
    wasAdded ||
    placements.every(
      (placement) =>
        !Number.isInteger(placement.identificador_trayectoria) || Number(placement.identificador_trayectoria) <= 0
    );

  if (needsTransitionBackfill) {
    const parent = new Map(placements.map((placement) => [placement.id, placement.id] as const));

    function find(id: number): number {
      const parentId = parent.get(id);

      if (parentId === undefined || parentId === id) {
        return id;
      }

      const root = find(parentId);
      parent.set(id, root);
      return root;
    }

    function union(leftId: number, rightId: number) {
      if (!parent.has(leftId) || !parent.has(rightId)) {
        return;
      }

      const leftRoot = find(leftId);
      const rightRoot = find(rightId);

      if (leftRoot !== rightRoot) {
        parent.set(Math.max(leftRoot, rightRoot), Math.min(leftRoot, rightRoot));
      }
    }

    const transitions = db
      .prepare("SELECT id_colocacion_origen, id_colocacion_destino FROM transiciones_iconos_mapa")
      .all() as Array<{ id_colocacion_origen: number; id_colocacion_destino: number }>;

    for (const transition of transitions) {
      union(transition.id_colocacion_origen, transition.id_colocacion_destino);
    }

    const minimumIdByRoot = new Map<number, number>();

    for (const placement of placements) {
      const root = find(placement.id);
      minimumIdByRoot.set(root, Math.min(minimumIdByRoot.get(root) ?? placement.id, placement.id));
    }

    for (const placement of placements) {
      identifiers.set(placement.id, minimumIdByRoot.get(find(placement.id)) ?? placement.id);
    }
  } else {
    for (const placement of placements) {
      const currentIdentifier = placement.identificador_trayectoria;
      identifiers.set(
        placement.id,
        Number.isInteger(currentIdentifier) && Number(currentIdentifier) > 0 ? Number(currentIdentifier) : placement.id
      );
    }
  }

  const updateIdentifier = db.prepare(
    "UPDATE iconos_mapa SET identificador_trayectoria = ? WHERE id = ?"
  );
  const migrateIdentifiers = db.transaction(() => {
    for (const placement of placements) {
      updateIdentifier.run(identifiers.get(placement.id) ?? placement.id, placement.id);
    }
  });

  migrateIdentifiers();
}

function tableHasCascadeDelete(db: Database.Database, tableName: string, targetTable: string) {
  const foreignKeys = db.prepare(`PRAGMA foreign_key_list(${tableName})`).all() as Array<{
    table: string;
    on_delete: string;
  }>;

  const matchingForeignKeys = foreignKeys.filter((foreignKey) => foreignKey.table === targetTable);

  return (
    matchingForeignKeys.length > 0 &&
    matchingForeignKeys.every((foreignKey) => foreignKey.on_delete.toUpperCase() === "CASCADE")
  );
}

function ensureIconCascadeDelete(db: Database.Database) {
  const iconPlacementsCascade = tableHasCascadeDelete(db, "iconos_mapa", "iconos_dia");
  const iconTransitionsCascade = tableHasCascadeDelete(db, "transiciones_iconos_mapa", "iconos_mapa");

  if (iconPlacementsCascade && iconTransitionsCascade) {
    return;
  }

  db.pragma("foreign_keys = OFF");

  const migrateIconTables = db.transaction(() => {
    db.exec(`
      ALTER TABLE transiciones_iconos_mapa RENAME TO transiciones_iconos_mapa_legacy;

      ALTER TABLE iconos_mapa RENAME TO iconos_mapa_legacy;

      CREATE TABLE iconos_mapa (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        id_dia INTEGER NOT NULL,
        id_icono_biblioteca INTEGER NOT NULL,
        identificador_trayectoria INTEGER,
        pos_x_pct REAL NOT NULL,
        pos_y_pct REAL NOT NULL,
        tipo_pin TEXT NOT NULL DEFAULT 'land',
        tipo_contenido TEXT,
        texto_descriptivo TEXT,
        ruta_recurso_local TEXT,
        ruta_imagen_local TEXT,
        ruta_video_local TEXT,
        titulo_contenido TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (id_dia) REFERENCES dias(id) ON DELETE CASCADE,
        FOREIGN KEY (id_icono_biblioteca) REFERENCES iconos_dia(id) ON DELETE CASCADE
      );

      CREATE TABLE transiciones_iconos_mapa (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        id_colocacion_origen INTEGER NOT NULL,
        id_colocacion_destino INTEGER NOT NULL,
        puntos_pct_json TEXT NOT NULL,
        velocidades_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (id_colocacion_origen) REFERENCES iconos_mapa(id) ON DELETE CASCADE,
        FOREIGN KEY (id_colocacion_destino) REFERENCES iconos_mapa(id) ON DELETE CASCADE
      );
    `);

    db.exec(`
      INSERT INTO iconos_mapa (
        id,
        id_dia,
        id_icono_biblioteca,
        identificador_trayectoria,
        pos_x_pct,
        pos_y_pct,
        tipo_pin,
        tipo_contenido,
        texto_descriptivo,
        ruta_recurso_local,
        ruta_imagen_local,
        ruta_video_local,
        titulo_contenido,
        created_at,
        updated_at
      )
      SELECT
        id,
        id_dia,
        id_icono_biblioteca,
        NULL,
        pos_x_pct,
        pos_y_pct,
        COALESCE(tipo_pin, 'land'),
        tipo_contenido,
        texto_descriptivo,
        ruta_recurso_local,
        ruta_imagen_local,
        ruta_video_local,
        titulo_contenido,
        created_at,
        updated_at
      FROM iconos_mapa_legacy
      WHERE EXISTS (SELECT 1 FROM dias WHERE dias.id = iconos_mapa_legacy.id_dia)
        AND EXISTS (SELECT 1 FROM iconos_dia WHERE iconos_dia.id = iconos_mapa_legacy.id_icono_biblioteca);

      INSERT INTO transiciones_iconos_mapa (
        id,
        id_colocacion_origen,
        id_colocacion_destino,
        puntos_pct_json,
        velocidades_json,
        created_at,
        updated_at
      )
      SELECT
        id,
        id_colocacion_origen,
        id_colocacion_destino,
        puntos_pct_json,
        velocidades_json,
        created_at,
        updated_at
      FROM transiciones_iconos_mapa_legacy
      WHERE EXISTS (SELECT 1 FROM iconos_mapa WHERE iconos_mapa.id = transiciones_iconos_mapa_legacy.id_colocacion_origen)
        AND EXISTS (SELECT 1 FROM iconos_mapa WHERE iconos_mapa.id = transiciones_iconos_mapa_legacy.id_colocacion_destino);

      DROP TABLE transiciones_iconos_mapa_legacy;
      DROP TABLE iconos_mapa_legacy;
    `);
  });

  migrateIconTables();
  db.pragma("foreign_keys = ON");
}

function runCompatibilityMigrations(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS perfiles (
      id TEXT PRIMARY KEY,
      data_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  ensureColumn(db, "dias", "perfil_id", "TEXT");
  ensureColumn(db, "dias", "es_evento_destacado", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "dias", "vista_centro_lng", "REAL");
  ensureColumn(db, "dias", "vista_centro_lat", "REAL");
  ensureColumn(db, "dias", "vista_zoom", "REAL");
  ensureColumn(db, "dias", "vista_velocidad", "INTEGER NOT NULL DEFAULT 100");
  ensureColumn(db, "iconos_mapa", "tipo_pin", "TEXT NOT NULL DEFAULT 'land'");
  ensureColumn(db, "iconos_mapa", "tipo_contenido", "TEXT");
  ensureColumn(db, "iconos_mapa", "texto_descriptivo", "TEXT");
  ensureColumn(db, "iconos_mapa", "ruta_recurso_local", "TEXT");
  ensureColumn(db, "iconos_mapa", "ruta_imagen_local", "TEXT");
  ensureColumn(db, "iconos_mapa", "ruta_video_local", "TEXT");
  ensureColumn(db, "iconos_mapa", "titulo_contenido", "TEXT");
  db.exec(`
    UPDATE iconos_mapa
    SET
      ruta_imagen_local = CASE
        WHEN ruta_imagen_local IS NULL AND tipo_contenido = 'imagen' THEN ruta_recurso_local
        ELSE ruta_imagen_local
      END,
      ruta_video_local = CASE
        WHEN ruta_video_local IS NULL AND tipo_contenido = 'video' THEN ruta_recurso_local
        ELSE ruta_video_local
      END
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS lineas_mapa (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      id_dia INTEGER NOT NULL,
      estilo TEXT NOT NULL DEFAULT 'solid',
      color TEXT NOT NULL DEFAULT 'yellow',
      puntos_pct_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (id_dia) REFERENCES dias(id)
    )
  `);
  ensureColumn(db, "lineas_mapa", "color", "TEXT NOT NULL DEFAULT 'yellow'");
  db.exec(`
    CREATE TABLE IF NOT EXISTS etiquetas_mapa (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      id_dia INTEGER NOT NULL,
      pos_x_pct REAL NOT NULL,
      pos_y_pct REAL NOT NULL,
      estilo TEXT NOT NULL DEFAULT 'gray',
      texto TEXT NOT NULL DEFAULT 'Gris',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (id_dia) REFERENCES dias(id) ON DELETE CASCADE
    )
  `);
  db.prepare(
    "UPDATE etiquetas_mapa SET texto = 'Gris' WHERE estilo = 'gray' AND texto = 'Nueva etiqueta'"
  ).run();
  db.exec(`
    CREATE TABLE IF NOT EXISTS transiciones_iconos_mapa (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      id_colocacion_origen INTEGER NOT NULL,
      id_colocacion_destino INTEGER NOT NULL,
      puntos_pct_json TEXT NOT NULL,
      velocidades_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (id_colocacion_origen) REFERENCES iconos_mapa(id) ON DELETE CASCADE,
      FOREIGN KEY (id_colocacion_destino) REFERENCES iconos_mapa(id) ON DELETE CASCADE
    )
  `);
  ensureColumn(db, "transiciones_iconos_mapa", "velocidades_json", "TEXT NOT NULL DEFAULT '[]'");
  ensureIconCascadeDelete(db);
  ensureTrajectoryIdentifiers(db);
}

export function initDatabase() {
  if (database) {
    return database;
  }

  ensureDataDirectories();
  database = new Database(getDatabasePath());
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");
  database.exec(loadMigrationSql());
  runCompatibilityMigrations(database);
  normalizeDefaultSeedData(database);
  return database;
}

export function getDatabase() {
  if (!database) {
    return initDatabase();
  }

  return database;
}

export function getDatabaseInfo() {
  return {
    dataDirectory: getDataDirectory(),
    databasePath: getDatabasePath()
  };
}
