import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { c as createTar, x as extractTar } from "tar";
import { getDatabase, getDatabaseInfo } from "../connection";
import { profileRepository } from "../repositories/profileRepository";
import type { MalvinasProfile } from "../../shared/types/profile";
import {
  calculateFileIntegrity,
  importManagedResource,
  resolveStoredResourcePath,
  toManagedRelativePath,
  type ManagedAssetKind
} from "./managedAssetService";

const BACKUP_FORMAT = "malvinas-profiles";
const BACKUP_VERSION = 1;
const BACKUP_DATABASE_PATH = "database/app.db";

type BackupFile = {
  path: string;
  size: number;
  sha256: string;
};

type BackupManifest = {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  createdAt: string;
  applicationVersion: string;
  profileCount: number;
  files: BackupFile[];
};

type DatabaseRow = Record<string, string | number | null>;

function normalizeArchivePath(filePath: string) {
  return filePath.split(path.sep).join("/");
}

function isSafeRelativePath(filePath: string) {
  if (!filePath || path.isAbsolute(filePath)) {
    return false;
  }

  const normalized = path.posix.normalize(filePath.replaceAll("\\", "/"));
  return normalized !== ".." && !normalized.startsWith("../") && !normalized.startsWith("/");
}

function resolveInside(directory: string, relativePath: string) {
  if (!isSafeRelativePath(relativePath)) {
    throw new Error("La copia contiene una ruta de archivo no valida.");
  }

  const absolutePath = path.resolve(directory, relativePath);
  const relative = path.relative(path.resolve(directory), absolutePath);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("La copia contiene una ruta fuera del paquete.");
  }

  return absolutePath;
}

function getReferencedResources(db: Database.Database) {
  const resources = new Set<string>();
  const collect = (sql: string) => {
    const rows = db.prepare(sql).all() as Array<{ stored_path: string | null }>;

    for (const row of rows) {
      if (row.stored_path) {
        resources.add(row.stored_path);
      }
    }
  };

  const profileDays = "SELECT id FROM dias WHERE perfil_id IN (SELECT id FROM perfiles)";
  collect(`SELECT ruta_imagen_fondo AS stored_path FROM dias WHERE id IN (${profileDays})`);
  collect(`SELECT ruta_recurso_local AS stored_path FROM eventos WHERE id_dia IN (${profileDays})`);
  collect(`SELECT ruta_icono_local AS stored_path FROM iconos_dia WHERE id_dia IN (${profileDays})`);
  collect(`SELECT ruta_imagen_local AS stored_path FROM iconos_mapa WHERE id_dia IN (${profileDays})`);
  collect(`
    SELECT imagenes_iconos_mapa.ruta_imagen_local AS stored_path
    FROM imagenes_iconos_mapa
    INNER JOIN iconos_mapa ON iconos_mapa.id = imagenes_iconos_mapa.id_colocacion_icono
    WHERE iconos_mapa.id_dia IN (${profileDays})
  `);
  collect(`SELECT ruta_video_local AS stored_path FROM iconos_mapa WHERE id_dia IN (${profileDays})`);
  return [...resources];
}

async function copyReferencedResources(stageDirectory: string, storedPaths: string[]) {
  const copiedPaths: string[] = [];

  for (const storedPath of storedPaths) {
    const sourcePath = resolveStoredResourcePath(storedPath);

    if (!sourcePath) {
      throw new Error(`La ruta del recurso ${storedPath} no es valida.`);
    }

    const sourceStats = await fs.promises.stat(sourcePath).catch(() => null);

    if (!sourceStats?.isFile()) {
      throw new Error(`Falta el recurso ${path.basename(storedPath)}. Vuelve a cargarlo antes de exportar.`);
    }

    let relativePath: string;

    try {
      relativePath = toManagedRelativePath(sourcePath);
    } catch {
      throw new Error(`El recurso ${path.basename(storedPath)} aun no pertenece al almacenamiento administrado.`);
    }

    const destinationPath = resolveInside(stageDirectory, relativePath);
    await fs.promises.mkdir(path.dirname(destinationPath), { recursive: true });
    await fs.promises.copyFile(sourcePath, destinationPath);
    copiedPaths.push(relativePath);
  }

  return copiedPaths;
}

async function createFileManifest(stageDirectory: string, relativePaths: string[]) {
  const files: BackupFile[] = [];

  for (const relativePath of relativePaths) {
    const filePath = resolveInside(stageDirectory, relativePath);
    const integrity = await calculateFileIntegrity(filePath);
    files.push({ path: normalizeArchivePath(relativePath), ...integrity });
  }

  return files.sort((left, right) => left.path.localeCompare(right.path));
}

async function replaceFileAtomically(temporaryPath: string, destinationPath: string) {
  const existingStats = await fs.promises.stat(destinationPath).catch(() => null);
  const previousPath = `${destinationPath}.previous-${crypto.randomUUID()}`;

  if (existingStats) {
    await fs.promises.rename(destinationPath, previousPath);
  }

  try {
    await fs.promises.rename(temporaryPath, destinationPath);

    if (existingStats) {
      await fs.promises.unlink(previousPath).catch(() => undefined);
    }
  } catch (error) {
    if (existingStats) {
      await fs.promises.rename(previousPath, destinationPath).catch(() => undefined);
    }

    throw error;
  }
}

export async function exportProfilesBackup(destinationPath: string, applicationVersion: string) {
  const db = getDatabase();
  const profileCount = profileRepository.list().length;

  if (!profileCount) {
    throw new Error("No hay perfiles para exportar.");
  }

  const stageDirectory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "malvinas-export-"));
  const temporaryDestinationPath = `${destinationPath}.partial-${crypto.randomUUID()}`;

  try {
    const snapshotPath = resolveInside(stageDirectory, BACKUP_DATABASE_PATH);
    await fs.promises.mkdir(path.dirname(snapshotPath), { recursive: true });
    await fs.promises.mkdir(path.join(stageDirectory, "assets"), { recursive: true });
    await db.backup(snapshotPath);

    const resourcePaths = await copyReferencedResources(stageDirectory, getReferencedResources(db));
    const files = await createFileManifest(stageDirectory, [BACKUP_DATABASE_PATH, ...resourcePaths]);
    const manifest: BackupManifest = {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      createdAt: new Date().toISOString(),
      applicationVersion,
      profileCount,
      files
    };

    await fs.promises.writeFile(
      path.join(stageDirectory, "manifest.json"),
      JSON.stringify(manifest, null, 2),
      "utf8"
    );
    await fs.promises.mkdir(path.dirname(destinationPath), { recursive: true });
    await createTar(
      {
        cwd: stageDirectory,
        file: temporaryDestinationPath,
        portable: true,
        strict: true
      },
      ["manifest.json", "database", "assets"]
    );
    await replaceFileAtomically(temporaryDestinationPath, destinationPath);

    return { profileCount, destinationPath };
  } finally {
    await fs.promises.unlink(temporaryDestinationPath).catch(() => undefined);
    await fs.promises.rm(stageDirectory, { recursive: true, force: true });
  }
}

function parseManifest(value: string): BackupManifest {
  const manifest = JSON.parse(value) as Partial<BackupManifest>;

  if (
    manifest.format !== BACKUP_FORMAT ||
    manifest.version !== BACKUP_VERSION ||
    !Array.isArray(manifest.files) ||
    !Number.isInteger(manifest.profileCount)
  ) {
    throw new Error("El archivo no es una copia de perfiles compatible.");
  }

  for (const file of manifest.files) {
    if (
      !file ||
      !isSafeRelativePath(file.path) ||
      !Number.isFinite(file.size) ||
      typeof file.sha256 !== "string" ||
      !/^[a-f0-9]{64}$/.test(file.sha256)
    ) {
      throw new Error("El manifiesto de la copia contiene datos invalidos.");
    }
  }

  if (!manifest.files.some((file) => file.path === BACKUP_DATABASE_PATH)) {
    throw new Error("La copia no contiene su base de datos.");
  }

  return manifest as BackupManifest;
}

async function verifyBackupFiles(stageDirectory: string, manifest: BackupManifest) {
  for (const expectedFile of manifest.files) {
    const filePath = resolveInside(stageDirectory, expectedFile.path);
    const stats = await fs.promises.stat(filePath).catch(() => null);

    if (!stats?.isFile()) {
      throw new Error(`La copia esta incompleta: falta ${path.basename(expectedFile.path)}.`);
    }

    const integrity = await calculateFileIntegrity(filePath);

    if (integrity.size !== expectedFile.size || integrity.sha256 !== expectedFile.sha256) {
      throw new Error(`El recurso ${path.basename(expectedFile.path)} no supera la verificacion de integridad.`);
    }
  }
}

function readRows(db: Database.Database, tableName: string, whereClause = "", parameters: unknown[] = []) {
  return db.prepare(`SELECT * FROM ${tableName} ${whereClause}`).all(...parameters) as DatabaseRow[];
}

function tableExists(db: Database.Database, tableName: string) {
  return Boolean(
    db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName)
  );
}

function toNumber(value: string | number | null) {
  return Number(value);
}

function parseImportedProfile(row: DatabaseRow, newId: string): MalvinasProfile {
  const rawJson = row.data_json;

  if (typeof rawJson !== "string") {
    throw new Error("La copia contiene un perfil sin informacion.");
  }

  const parsed = JSON.parse(rawJson) as Partial<MalvinasProfile>;

  if (!parsed || typeof parsed.name !== "string" || !parsed.name.trim()) {
    throw new Error("La copia contiene un perfil invalido.");
  }

  return {
    ...(parsed as MalvinasProfile),
    id: newId
  };
}

function inferImportedKind(storedPath: string, fallback: ManagedAssetKind): ManagedAssetKind {
  const extension = path.extname(storedPath).toLowerCase();

  if ([".mp4", ".webm", ".mov", ".m4v", ".avi", ".mkv", ".wmv", ".mpeg", ".mpg", ".ogv"].includes(extension)) {
    return "video";
  }

  if ([".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp", ".svg", ".avif", ".tif", ".tiff", ".ico"].includes(extension)) {
    return fallback === "icon" ? "icon" : "image";
  }

  return fallback;
}

async function importResourcePath(
  stageDirectory: string,
  storedPath: string | number | null,
  kind: ManagedAssetKind,
  cache: Map<string, string>,
  verifiedFiles: Set<string>
) {
  if (typeof storedPath !== "string" || !storedPath) {
    return null;
  }

  const cachedPath = cache.get(storedPath);

  if (cachedPath) {
    return cachedPath;
  }

  const normalizedStoredPath = normalizeArchivePath(storedPath);

  if (!verifiedFiles.has(normalizedStoredPath)) {
    throw new Error(`El recurso ${path.basename(storedPath)} no figura en el manifiesto verificado.`);
  }

  const sourcePath = resolveInside(stageDirectory, storedPath);
  const managedPath = await importManagedResource(sourcePath, inferImportedKind(storedPath, kind));
  cache.set(storedPath, managedPath);
  return managedPath;
}

async function prepareImportedRows(
  sourceDb: Database.Database,
  stageDirectory: string,
  verifiedFiles: Set<string>
) {
  const profileRows = readRows(sourceDb, "perfiles");

  if (!profileRows.length) {
    throw new Error("La copia no contiene perfiles.");
  }

  const sourceProfileIds = profileRows.map((row) => String(row.id));
  const placeholders = sourceProfileIds.map(() => "?").join(", ");
  const days = readRows(sourceDb, "dias", `WHERE perfil_id IN (${placeholders}) ORDER BY orden ASC, id ASC`, sourceProfileIds);
  const sourceDayIds = days.map((row) => toNumber(row.id));
  const dayPlaceholders = sourceDayIds.map(() => "?").join(", ");
  const byDays = (tableName: string) =>
    sourceDayIds.length ? readRows(sourceDb, tableName, `WHERE id_dia IN (${dayPlaceholders})`, sourceDayIds) : [];
  const events = byDays("eventos");
  const dayIcons = byDays("iconos_dia");
  const placements = byDays("iconos_mapa");
  const drawingLines = byDays("lineas_mapa");
  const labels = byDays("etiquetas_mapa");
  const placementIds = placements.map((row) => toNumber(row.id));
  const placementPlaceholders = placementIds.map(() => "?").join(", ");
  const placementImages =
    placementIds.length && tableExists(sourceDb, "imagenes_iconos_mapa")
      ? readRows(
          sourceDb,
          "imagenes_iconos_mapa",
          `WHERE id_colocacion_icono IN (${placementPlaceholders}) ORDER BY orden ASC, id ASC`,
          placementIds
        )
      : [];
  const placementsWithImages = new Set(
    placementImages.map((image) => toNumber(image.id_colocacion_icono))
  );

  for (const placement of placements) {
    if (placement.ruta_imagen_local && !placementsWithImages.has(toNumber(placement.id))) {
      placementImages.push({
        id: -toNumber(placement.id),
        id_colocacion_icono: toNumber(placement.id),
        ruta_imagen_local: placement.ruta_imagen_local,
        orden: 0,
        created_at: placement.created_at,
        updated_at: placement.updated_at
      });
    }
  }
  const transitions = placementIds.length
    ? readRows(
        sourceDb,
        "transiciones_iconos_mapa",
        `WHERE id_colocacion_origen IN (${placementPlaceholders}) AND id_colocacion_destino IN (${placementPlaceholders})`,
        [...placementIds, ...placementIds]
      )
    : [];
  const resourceCache = new Map<string, string>();

  for (const day of days) {
    day.ruta_imagen_fondo = await importResourcePath(
      stageDirectory,
      day.ruta_imagen_fondo,
      "image",
      resourceCache,
      verifiedFiles
    );
  }

  for (const event of events) {
    event.ruta_recurso_local = await importResourcePath(
      stageDirectory,
      event.ruta_recurso_local,
      "resource",
      resourceCache,
      verifiedFiles
    );
  }

  for (const icon of dayIcons) {
    icon.ruta_icono_local = await importResourcePath(
      stageDirectory,
      icon.ruta_icono_local,
      "icon",
      resourceCache,
      verifiedFiles
    );
  }

  for (const placement of placements) {
    placement.ruta_imagen_local = await importResourcePath(
      stageDirectory,
      placement.ruta_imagen_local,
      "image",
      resourceCache,
      verifiedFiles
    );
    placement.ruta_video_local = await importResourcePath(
      stageDirectory,
      placement.ruta_video_local,
      "video",
      resourceCache,
      verifiedFiles
    );
  }

  for (const image of placementImages) {
    image.ruta_imagen_local = await importResourcePath(
      stageDirectory,
      image.ruta_imagen_local,
      "image",
      resourceCache,
      verifiedFiles
    );
  }

  return { profileRows, days, events, dayIcons, placements, placementImages, drawingLines, labels, transitions };
}

function insertImportedRows(rows: Awaited<ReturnType<typeof prepareImportedRows>>) {
  const db = getDatabase();
  const profileIdMap = new Map<string, string>();
  const dayIdMap = new Map<number, number>();
  const iconIdMap = new Map<number, number>();
  const placementIdMap = new Map<number, number>();

  const importTransaction = db.transaction(() => {
    for (const row of rows.profileRows) {
      const sourceId = String(row.id);
      const newId = `profile-${crypto.randomUUID()}`;
      const profile = parseImportedProfile(row, newId);
      profileIdMap.set(sourceId, newId);
      db.prepare(
        "INSERT INTO perfiles (id, data_json, created_at, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
      ).run(newId, JSON.stringify(profile));
    }

    const insertDay = db.prepare(`
      INSERT INTO dias (
        perfil_id, etiqueta_fecha, es_evento_destacado, ruta_imagen_fondo,
        vista_centro_lng, vista_centro_lat, vista_zoom, vista_velocidad, orden, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const row of rows.days) {
      const result = insertDay.run(
        profileIdMap.get(String(row.perfil_id)),
        row.etiqueta_fecha,
        row.es_evento_destacado,
        row.ruta_imagen_fondo,
        row.vista_centro_lng,
        row.vista_centro_lat,
        row.vista_zoom,
        row.vista_velocidad,
        row.orden,
        row.created_at,
        row.updated_at
      );
      dayIdMap.set(toNumber(row.id), Number(result.lastInsertRowid));
    }

    const insertEvent = db.prepare(`
      INSERT INTO eventos (
        id_dia, pos_x_pct, pos_y_pct, icono_tipo, tipo_accion, contenido_texto,
        ruta_recurso_local, titulo, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const row of rows.events) {
      insertEvent.run(
        dayIdMap.get(toNumber(row.id_dia)), row.pos_x_pct, row.pos_y_pct, row.icono_tipo,
        row.tipo_accion, row.contenido_texto, row.ruta_recurso_local, row.titulo, row.created_at, row.updated_at
      );
    }

    const insertIcon = db.prepare(
      "INSERT INTO iconos_dia (id_dia, nombre, ruta_icono_local, created_at) VALUES (?, ?, ?, ?)"
    );
    for (const row of rows.dayIcons) {
      const result = insertIcon.run(
        dayIdMap.get(toNumber(row.id_dia)), row.nombre, row.ruta_icono_local, row.created_at
      );
      iconIdMap.set(toNumber(row.id), Number(result.lastInsertRowid));
    }

    const insertPlacement = db.prepare(`
      INSERT INTO iconos_mapa (
        id_dia, id_icono_biblioteca, identificador_trayectoria, pos_x_pct, pos_y_pct,
        tipo_pin, tipo_contenido, texto_descriptivo, ruta_recurso_local,
        ruta_imagen_local, ruta_video_local, titulo_contenido, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const row of rows.placements) {
      const result = insertPlacement.run(
        dayIdMap.get(toNumber(row.id_dia)),
        iconIdMap.get(toNumber(row.id_icono_biblioteca)),
        row.identificador_trayectoria,
        row.pos_x_pct,
        row.pos_y_pct,
        row.tipo_pin,
        row.tipo_contenido,
        row.texto_descriptivo,
        row.ruta_recurso_local,
        row.ruta_imagen_local,
        row.ruta_video_local,
        row.titulo_contenido,
        row.created_at,
        row.updated_at
      );
      placementIdMap.set(toNumber(row.id), Number(result.lastInsertRowid));
    }

    const insertPlacementImage = db.prepare(`
      INSERT INTO imagenes_iconos_mapa (
        id_colocacion_icono, ruta_imagen_local, orden, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?)
    `);
    for (const row of rows.placementImages) {
      insertPlacementImage.run(
        placementIdMap.get(toNumber(row.id_colocacion_icono)),
        row.ruta_imagen_local,
        row.orden,
        row.created_at,
        row.updated_at
      );
    }

    const insertLine = db.prepare(
      "INSERT INTO lineas_mapa (id_dia, estilo, color, puntos_pct_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
    );
    for (const row of rows.drawingLines) {
      insertLine.run(
        dayIdMap.get(toNumber(row.id_dia)), row.estilo, row.color, row.puntos_pct_json, row.created_at, row.updated_at
      );
    }

    const insertLabel = db.prepare(`
      INSERT INTO etiquetas_mapa (id_dia, pos_x_pct, pos_y_pct, estilo, texto, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const row of rows.labels) {
      insertLabel.run(
        dayIdMap.get(toNumber(row.id_dia)), row.pos_x_pct, row.pos_y_pct, row.estilo,
        row.texto, row.created_at, row.updated_at
      );
    }

    const insertTransition = db.prepare(`
      INSERT INTO transiciones_iconos_mapa (
        id_colocacion_origen, id_colocacion_destino, puntos_pct_json,
        velocidades_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);
    for (const row of rows.transitions) {
      insertTransition.run(
        placementIdMap.get(toNumber(row.id_colocacion_origen)),
        placementIdMap.get(toNumber(row.id_colocacion_destino)),
        row.puntos_pct_json,
        row.velocidades_json,
        row.created_at,
        row.updated_at
      );
    }
  });

  importTransaction();
  return profileIdMap.size;
}

export async function importProfilesBackup(sourcePath: string) {
  const stageDirectory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "malvinas-import-"));

  try {
    await extractTar({
      cwd: stageDirectory,
      file: sourcePath,
      preservePaths: false,
      strict: true,
      filter: (entryPath) =>
        isSafeRelativePath(entryPath) &&
        ["manifest.json", "database/", "assets/"].some((prefix) => entryPath === prefix.replace(/\/$/, "") || entryPath.startsWith(prefix))
    });

    const manifestPath = path.join(stageDirectory, "manifest.json");
    const manifest = parseManifest(await fs.promises.readFile(manifestPath, "utf8"));
    await verifyBackupFiles(stageDirectory, manifest);

    const sourceDatabasePath = resolveInside(stageDirectory, BACKUP_DATABASE_PATH);
    const sourceDb = new Database(sourceDatabasePath, { readonly: true, fileMustExist: true });

    try {
      const integrity = sourceDb.pragma("integrity_check", { simple: true });

      if (integrity !== "ok") {
        throw new Error("La base de datos de la copia no supera la verificacion de integridad.");
      }

      const rows = await prepareImportedRows(
        sourceDb,
        stageDirectory,
        new Set(manifest.files.map((file) => file.path))
      );

      if (rows.profileRows.length !== manifest.profileCount) {
        throw new Error("La cantidad de perfiles de la copia no coincide con el manifiesto.");
      }

      const importedCount = insertImportedRows(rows);

      return {
        importedCount,
        profiles: profileRepository.list()
      };
    } finally {
      sourceDb.close();
    }
  } finally {
    await fs.promises.rm(stageDirectory, { recursive: true, force: true });
  }
}
