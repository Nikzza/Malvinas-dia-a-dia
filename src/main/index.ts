import { app, BrowserWindow, dialog, ipcMain } from "electron";
import fs from "node:fs";
import path from "node:path";
import { createMainWindow } from "./window";
import { initDatabase, getDatabaseInfo } from "../db/connection";
import { dayRepository } from "../db/repositories/dayRepository";
import type { Day } from "../shared/types/day";
import type { DayIcon } from "../shared/types/dayIcon";
import type { MapIconPlacement } from "../shared/types/mapIconPlacement";
import { dayIconRepository } from "../db/repositories/dayIconRepository";
import { mapIconPlacementRepository } from "../db/repositories/mapIconPlacementRepository";
import type {
  CreateMapIconPlacementPayload,
  CreateDayIconPayload,
  CreateDayPayload,
  DeleteMapIconPlacementPayload,
  DeleteDayIconPayload,
  SelectContentResourcePayload,
  UpdateMapIconPlacementContentPayload,
  UpdateMapIconPlacementPayload,
  UpdateDayPayload
} from "../shared/types/ipc";

const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "bmp", "webp", "svg", "avif", "tif", "tiff", "ico"];
const VIDEO_EXTENSIONS = ["mp4", "webm", "mov", "m4v", "avi", "mkv", "wmv", "flv", "mpeg", "mpg", "ts", "mts", "m2ts", "3gp", "ogv"];

function getMimeType(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();

  switch (extension) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".bmp":
      return "image/bmp";
    case ".gif":
      return "image/gif";
    case ".svg":
      return "image/svg+xml";
    case ".avif":
      return "image/avif";
    case ".tif":
    case ".tiff":
      return "image/tiff";
    case ".ico":
      return "image/x-icon";
    case ".mp4":
      return "video/mp4";
    case ".webm":
      return "video/webm";
    case ".mov":
      return "video/quicktime";
    case ".m4v":
      return "video/x-m4v";
    case ".avi":
      return "video/x-msvideo";
    case ".mkv":
      return "video/x-matroska";
    case ".wmv":
      return "video/x-ms-wmv";
    case ".flv":
      return "video/x-flv";
    case ".mpeg":
    case ".mpg":
      return "video/mpeg";
    case ".ts":
      return "video/mp2t";
    case ".mts":
    case ".m2ts":
      return "video/mp2t";
    case ".3gp":
      return "video/3gpp";
    case ".ogv":
      return "video/ogg";
    default:
      return "application/octet-stream";
  }
}

function getNormalizedExtension(filePath: string) {
  return path.extname(filePath).toLowerCase().replace(".", "");
}

function isAllowedContentResource(filePath: string, tipoContenido: "imagen" | "video") {
  const extension = getNormalizedExtension(filePath);
  const allowedExtensions = tipoContenido === "imagen" ? IMAGE_EXTENSIONS : VIDEO_EXTENSIONS;
  return allowedExtensions.includes(extension);
}

function getResourceDialogConfig(tipoContenido: "imagen" | "video") {
  if (tipoContenido === "imagen") {
    return {
      title: "Seleccionar imagen",
      filters: [
        {
          name: "Imagenes",
          extensions: IMAGE_EXTENSIONS
        }
      ]
    };
  }

  return {
    title: "Seleccionar video",
    filters: [
      {
        name: "Videos",
        extensions: VIDEO_EXTENSIONS
      }
    ]
  };
}

function toImageDataUrl(filePath: string | null) {
  if (!filePath) {
    return null;
  }

  try {
    const buffer = fs.readFileSync(filePath);
    const mimeType = getMimeType(filePath);
    return `data:${mimeType};base64,${buffer.toString("base64")}`;
  } catch {
    return null;
  }
}

function enrichDays(days: Day[]) {
  return days.map((day) => ({
    ...day,
    imagenFondoDataUrl: toImageDataUrl(day.rutaImagenFondo)
  }));
}

function enrichIconsByDay(icons: DayIcon[]) {
  return icons.reduce<Record<number, DayIcon[]>>((accumulator, icon) => {
    const item = {
      ...icon,
      iconoDataUrl: toImageDataUrl(icon.rutaIconoLocal)
    };

    if (!accumulator[icon.dayId]) {
      accumulator[icon.dayId] = [];
    }

    accumulator[icon.dayId].push(item);
    return accumulator;
  }, {});
}

function enrichMapPlacementsByDay(placements: MapIconPlacement[], icons: DayIcon[]) {
  const iconsById = new Map(icons.map((icon) => [icon.id, icon] as const));

  return placements.reduce<Record<number, MapIconPlacement[]>>((accumulator, placement) => {
    const libraryIcon = iconsById.get(placement.libraryIconId);
    const item = {
      ...placement,
      nombreIcono: libraryIcon?.nombre,
      iconoDataUrl: toImageDataUrl(libraryIcon?.rutaIconoLocal ?? null),
      recursoDataUrl: toImageDataUrl(placement.rutaRecursoLocal ?? null)
    };

    if (!accumulator[placement.dayId]) {
      accumulator[placement.dayId] = [];
    }

    accumulator[placement.dayId].push(item);
    return accumulator;
  }, {});
}

function getBootstrapData() {
  const info = getDatabaseInfo();
  const icons = dayIconRepository.listAll();

  return {
    appName: "Malvinas dia a dia",
    databasePath: info.databasePath,
    dataDirectory: info.dataDirectory,
    days: enrichDays(dayRepository.list()),
    iconsByDay: enrichIconsByDay(icons),
    mapPlacementsByDay: enrichMapPlacementsByDay(mapIconPlacementRepository.listAll(), icons)
  };
}

function registerIpcHandlers() {
  ipcMain.handle("app:get-bootstrap-data", async () => getBootstrapData());
  ipcMain.handle("days:create", async (_event, payload: CreateDayPayload) => {
    const etiquetaFecha = payload.etiquetaFecha.trim();

    if (!etiquetaFecha) {
      throw new Error("El nombre del dia no puede estar vacio.");
    }

    dayRepository.create(etiquetaFecha, payload.rutaImagenFondo);
    return getBootstrapData();
  });
  ipcMain.handle("days:delete", async (_event, dayId: number) => {
    dayRepository.remove(dayId);
    return getBootstrapData();
  });
  ipcMain.handle("days:update", async (_event, payload: UpdateDayPayload) => {
    const etiquetaFecha = payload.etiquetaFecha.trim();

    if (!etiquetaFecha) {
      throw new Error("El nombre del dia no puede estar vacio.");
    }

    dayRepository.update(payload.id, etiquetaFecha, payload.rutaImagenFondo);
    return getBootstrapData();
  });
  ipcMain.handle("days:select-background", async () => {
    const result = await dialog.showOpenDialog({
      title: "Seleccionar imagen de fondo",
      properties: ["openFile"],
      filters: [
        {
          name: "Imagenes",
          extensions: ["png", "jpg", "jpeg", "webp", "bmp"]
        }
      ]
    });

    if (result.canceled) {
      return null;
    }

    return result.filePaths[0] ?? null;
  });
  ipcMain.handle("icons:select-png", async () => {
    const result = await dialog.showOpenDialog({
      title: "Seleccionar icono PNG",
      properties: ["openFile"],
      filters: [
        {
          name: "PNG",
          extensions: ["png"]
        }
      ]
    });

    if (result.canceled) {
      return null;
    }

    return result.filePaths[0] ?? null;
  });
  ipcMain.handle("icons:create", async (_event, payload: CreateDayIconPayload) => {
    if (!payload.dayId) {
      throw new Error("Primero selecciona un dia.");
    }

    if (!payload.nombre.trim()) {
      throw new Error("El icono necesita un nombre.");
    }

    dayIconRepository.create(payload.dayId, payload.nombre, payload.rutaIconoLocal);
    return getBootstrapData();
  });
  ipcMain.handle("icons:delete", async (_event, payload: DeleteDayIconPayload) => {
    dayIconRepository.remove(payload.iconId);
    return getBootstrapData();
  });
  ipcMain.handle("map-icons:create", async (_event, payload: CreateMapIconPlacementPayload) => {
    mapIconPlacementRepository.create(payload.dayId, payload.libraryIconId, payload.posXPct, payload.posYPct);
    return getBootstrapData();
  });
  ipcMain.handle("map-icons:update", async (_event, payload: UpdateMapIconPlacementPayload) => {
    mapIconPlacementRepository.updatePosition(payload.placementId, payload.posXPct, payload.posYPct);
    return getBootstrapData();
  });
  ipcMain.handle("map-icons:delete", async (_event, payload: DeleteMapIconPlacementPayload) => {
    mapIconPlacementRepository.remove(payload.placementId);
    return getBootstrapData();
  });
  ipcMain.handle("map-icons:update-content", async (_event, payload: UpdateMapIconPlacementContentPayload) => {
    if ((payload.tipoContenido === "imagen" || payload.tipoContenido === "video") && payload.rutaRecursoLocal) {
      if (!isAllowedContentResource(payload.rutaRecursoLocal, payload.tipoContenido)) {
        throw new Error(`El archivo seleccionado no es valido para ${payload.tipoContenido}.`);
      }
    }

    mapIconPlacementRepository.updateContent(
      payload.placementId,
      payload.tipoContenido,
      payload.tituloContenido,
      payload.textoDescriptivo,
      payload.rutaRecursoLocal
    );
    return getBootstrapData();
  });
  ipcMain.handle("content:select-resource", async (_event, payload: SelectContentResourcePayload) => {
    const dialogConfig = getResourceDialogConfig(payload.tipoContenido);
    const result = await dialog.showOpenDialog({
      title: dialogConfig.title,
      properties: ["openFile"],
      filters: dialogConfig.filters
    });

    if (result.canceled) {
      return null;
    }

    const selectedPath = result.filePaths[0] ?? null;

    if (!selectedPath) {
      return null;
    }

    if (!isAllowedContentResource(selectedPath, payload.tipoContenido)) {
      throw new Error(`El archivo seleccionado no es valido para ${payload.tipoContenido}.`);
    }

    return selectedPath;
  });
}

async function bootstrap() {
  await app.whenReady();
  initDatabase();
  registerIpcHandlers();
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

bootstrap().catch((error) => {
  console.error("Error al iniciar la aplicacion:", error);
  app.quit();
});
