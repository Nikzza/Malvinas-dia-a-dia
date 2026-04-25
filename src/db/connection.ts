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

function runCompatibilityMigrations(db: Database.Database) {
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
}

export function initDatabase() {
  if (database) {
    return database;
  }

  ensureDataDirectories();
  database = new Database(getDatabasePath());
  database.pragma("journal_mode = WAL");
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
