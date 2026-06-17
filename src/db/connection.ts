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

  if (!hasColumn) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
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
        pos_x_pct REAL NOT NULL,
        pos_y_pct REAL NOT NULL,
        tipo_pin TEXT NOT NULL DEFAULT 'land',
        tipo_contenido TEXT,
        texto_descriptivo TEXT,
        ruta_recurso_local TEXT,
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
        pos_x_pct,
        pos_y_pct,
        tipo_pin,
        tipo_contenido,
        texto_descriptivo,
        ruta_recurso_local,
        titulo_contenido,
        created_at,
        updated_at
      )
      SELECT
        id,
        id_dia,
        id_icono_biblioteca,
        pos_x_pct,
        pos_y_pct,
        COALESCE(tipo_pin, 'land'),
        tipo_contenido,
        texto_descriptivo,
        ruta_recurso_local,
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
        created_at,
        updated_at
      )
      SELECT
        id,
        id_colocacion_origen,
        id_colocacion_destino,
        puntos_pct_json,
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
  ensureColumn(db, "dias", "es_evento_destacado", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "iconos_mapa", "tipo_pin", "TEXT NOT NULL DEFAULT 'land'");
  ensureColumn(db, "iconos_mapa", "tipo_contenido", "TEXT");
  ensureColumn(db, "iconos_mapa", "texto_descriptivo", "TEXT");
  ensureColumn(db, "iconos_mapa", "ruta_recurso_local", "TEXT");
  ensureColumn(db, "iconos_mapa", "titulo_contenido", "TEXT");
  db.exec(`
    CREATE TABLE IF NOT EXISTS lineas_mapa (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      id_dia INTEGER NOT NULL,
      estilo TEXT NOT NULL DEFAULT 'solid',
      puntos_pct_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (id_dia) REFERENCES dias(id)
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS transiciones_iconos_mapa (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      id_colocacion_origen INTEGER NOT NULL,
      id_colocacion_destino INTEGER NOT NULL,
      puntos_pct_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (id_colocacion_origen) REFERENCES iconos_mapa(id) ON DELETE CASCADE,
      FOREIGN KEY (id_colocacion_destino) REFERENCES iconos_mapa(id) ON DELETE CASCADE
    )
  `);
  ensureIconCascadeDelete(db);
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
