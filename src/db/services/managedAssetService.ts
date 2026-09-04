import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { getDatabase, getDatabaseInfo } from "../connection";

export type ManagedAssetKind = "icon" | "image" | "video" | "resource";

const DIRECTORY_BY_KIND: Record<ManagedAssetKind, string[]> = {
  icon: ["assets", "images", "icons"],
  image: ["assets", "images", "content"],
  video: ["assets", "videos", "content"],
  resource: ["assets", "resources"]
};

function isPathInside(parentPath: string, candidatePath: string) {
  const relativePath = path.relative(path.resolve(parentPath), path.resolve(candidatePath));
  return relativePath !== "" && !relativePath.startsWith("..") && !path.isAbsolute(relativePath);
}

function normalizeRelativePath(filePath: string) {
  return filePath.split(path.sep).join("/");
}

function getSafeExtension(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();
  return /^\.[a-z0-9]{1,10}$/.test(extension) ? extension : ".bin";
}

async function hashFile(filePath: string) {
  const hash = crypto.createHash("sha256");
  const input = fs.createReadStream(filePath);

  for await (const chunk of input) {
    hash.update(chunk as Buffer);
  }

  return hash.digest("hex");
}

export function resolveStoredResourcePath(storedPath: string | null | undefined) {
  if (!storedPath) {
    return null;
  }

  if (path.isAbsolute(storedPath)) {
    return path.normalize(storedPath);
  }

  const dataDirectory = getDatabaseInfo().dataDirectory;
  const absolutePath = path.resolve(dataDirectory, storedPath);

  if (!isPathInside(dataDirectory, absolutePath)) {
    return null;
  }

  return absolutePath;
}

export function toManagedRelativePath(absolutePath: string) {
  const dataDirectory = getDatabaseInfo().dataDirectory;

  if (!isPathInside(dataDirectory, absolutePath)) {
    throw new Error("El recurso no pertenece al almacenamiento administrado.");
  }

  return normalizeRelativePath(path.relative(dataDirectory, absolutePath));
}

export async function importManagedResource(sourcePath: string, kind: ManagedAssetKind) {
  const sourceAbsolutePath = resolveStoredResourcePath(sourcePath);

  if (!sourceAbsolutePath) {
    throw new Error("La ruta del recurso no es valida.");
  }

  const sourceStats = await fs.promises.stat(sourceAbsolutePath).catch(() => null);

  if (!sourceStats?.isFile()) {
    throw new Error(`No se pudo encontrar el recurso ${path.basename(sourcePath)}.`);
  }

  const dataDirectory = getDatabaseInfo().dataDirectory;

  if (isPathInside(dataDirectory, sourceAbsolutePath)) {
    return toManagedRelativePath(sourceAbsolutePath);
  }

  const outputDirectory = path.join(dataDirectory, ...DIRECTORY_BY_KIND[kind]);
  const temporaryPath = path.join(outputDirectory, `.import-${crypto.randomUUID()}.tmp`);
  const hash = crypto.createHash("sha256");
  const hashTransform = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      hash.update(chunk);
      callback(null, chunk);
    }
  });

  await fs.promises.mkdir(outputDirectory, { recursive: true });

  try {
    await pipeline(
      fs.createReadStream(sourceAbsolutePath),
      hashTransform,
      fs.createWriteStream(temporaryPath, { flags: "wx" })
    );

    const digest = hash.digest("hex");
    const outputPath = path.join(outputDirectory, `${digest}${getSafeExtension(sourceAbsolutePath)}`);
    const existingStats = await fs.promises.stat(outputPath).catch(() => null);

    if (existingStats?.isFile()) {
      const existingHash = await hashFile(outputPath);

      if (existingHash === digest && existingStats.size === sourceStats.size) {
        await fs.promises.unlink(temporaryPath);
        return toManagedRelativePath(outputPath);
      }

      const corruptPath = `${outputPath}.corrupt-${crypto.randomUUID()}`;
      await fs.promises.rename(outputPath, corruptPath);
      await fs.promises.rename(temporaryPath, outputPath);
      await fs.promises.unlink(corruptPath).catch(() => undefined);
      return toManagedRelativePath(outputPath);
    }

    await fs.promises.rename(temporaryPath, outputPath);
    return toManagedRelativePath(outputPath);
  } catch (error) {
    await fs.promises.unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
}

export async function storeManagedBuffer(buffer: Buffer, kind: ManagedAssetKind, extension: string) {
  const dataDirectory = getDatabaseInfo().dataDirectory;
  const outputDirectory = path.join(dataDirectory, ...DIRECTORY_BY_KIND[kind]);
  const normalizedExtension = /^\.[a-z0-9]{1,10}$/i.test(extension) ? extension.toLowerCase() : ".bin";
  const digest = crypto.createHash("sha256").update(buffer).digest("hex");
  const outputPath = path.join(outputDirectory, `${digest}${normalizedExtension}`);

  await fs.promises.mkdir(outputDirectory, { recursive: true });

  try {
    await fs.promises.writeFile(outputPath, buffer, { flag: "wx" });
  } catch (error) {
    const code = error instanceof Error && "code" in error ? error.code : null;

    if (code !== "EEXIST") {
      throw error;
    }

    const integrity = await calculateFileIntegrity(outputPath);

    if (integrity.sha256 !== digest || integrity.size !== buffer.length) {
      throw new Error(`El recurso administrado ${path.basename(outputPath)} esta danado.`);
    }
  }

  return toManagedRelativePath(outputPath);
}

export function getManagedResourceUrl(storedPath: string | null | undefined) {
  const absolutePath = resolveStoredResourcePath(storedPath);

  if (!absolutePath || !fs.existsSync(absolutePath)) {
    return null;
  }

  const dataDirectory = getDatabaseInfo().dataDirectory;

  if (!isPathInside(dataDirectory, absolutePath)) {
    return null;
  }

  const relativePath = normalizeRelativePath(path.relative(dataDirectory, absolutePath));
  const encodedPath = relativePath.split("/").map(encodeURIComponent).join("/");
  return `malvinas-media://asset/${encodedPath}`;
}

export function getManagedResourceStatus(storedPath: string | null | undefined) {
  if (!storedPath) {
    return "empty" as const;
  }

  const absolutePath = resolveStoredResourcePath(storedPath);

  if (!absolutePath || !fs.existsSync(absolutePath)) {
    return "missing" as const;
  }

  try {
    return fs.statSync(absolutePath).isFile() ? ("available" as const) : ("missing" as const);
  } catch {
    return "unreadable" as const;
  }
}

function inferResourceKind(filePath: string, fallback: ManagedAssetKind): ManagedAssetKind {
  const extension = path.extname(filePath).toLowerCase();

  if ([".mp4", ".webm", ".mov", ".m4v", ".avi", ".mkv", ".wmv", ".mpeg", ".mpg", ".ogv"].includes(extension)) {
    return "video";
  }

  if ([".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp", ".svg", ".avif", ".tif", ".tiff", ".ico"].includes(extension)) {
    return fallback === "icon" ? "icon" : "image";
  }

  return fallback;
}

export async function migrateLegacyResources() {
  const db = getDatabase();
  const migrations: Array<{
    table: string;
    id: number;
    column: string;
    storedPath: string;
    kind: ManagedAssetKind;
  }> = [];

  const collect = (table: string, column: string, kind: ManagedAssetKind) => {
    const rows = db.prepare(`SELECT id, ${column} AS stored_path FROM ${table} WHERE ${column} IS NOT NULL AND ${column} <> ''`).all() as Array<{
      id: number;
      stored_path: string;
    }>;

    for (const row of rows) {
      migrations.push({ table, id: row.id, column, storedPath: row.stored_path, kind });
    }
  };

  collect("dias", "ruta_imagen_fondo", "image");
  collect("eventos", "ruta_recurso_local", "resource");
  collect("iconos_dia", "ruta_icono_local", "icon");
  collect("iconos_mapa", "ruta_imagen_local", "image");
  collect("imagenes_iconos_mapa", "ruta_imagen_local", "image");
  collect("iconos_mapa", "ruta_video_local", "video");

  const importedPaths = new Map<string, string>();
  const updates: Array<{ table: string; id: number; column: string; managedPath: string }> = [];
  const unavailable: string[] = [];

  for (const migration of migrations) {
    const cacheKey = `${migration.kind}:${migration.storedPath}`;

    try {
      let managedPath = importedPaths.get(cacheKey);

      if (!managedPath) {
        managedPath = await importManagedResource(
          migration.storedPath,
          inferResourceKind(migration.storedPath, migration.kind)
        );
        importedPaths.set(cacheKey, managedPath);
      }

      if (managedPath !== migration.storedPath) {
        updates.push({ ...migration, managedPath });
      }
    } catch {
      unavailable.push(migration.storedPath);
    }
  }

  const updateResources = db.transaction(() => {
    for (const update of updates) {
      db.prepare(`UPDATE ${update.table} SET ${update.column} = ? WHERE id = ?`).run(update.managedPath, update.id);
    }
  });
  updateResources();

  return {
    migratedCount: updates.length,
    unavailablePaths: [...new Set(unavailable)]
  };
}

export async function calculateFileIntegrity(filePath: string) {
  const stats = await fs.promises.stat(filePath);
  return {
    size: stats.size,
    sha256: await hashFile(filePath)
  };
}
