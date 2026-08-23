import { app, BrowserWindow, dialog, ipcMain, nativeImage } from "electron";
import fs from "node:fs";
import path from "node:path";
import { createMainWindow } from "./window";
import { initDatabase, getDatabaseInfo } from "../db/connection";
import { dayRepository } from "../db/repositories/dayRepository";
import type { Day } from "../shared/types/day";
import { isMapDrawingLineColor, type MapDrawingLine } from "../shared/types/mapDrawingLine";
import type { DayIcon } from "../shared/types/dayIcon";
import type { MapIconPlacement } from "../shared/types/mapIconPlacement";
import type { MapIconTransition } from "../shared/types/mapIconTransition";
import { isMapLabelStyle, type MapLabel } from "../shared/types/mapLabel";
import { dayIconRepository } from "../db/repositories/dayIconRepository";
import { mapDrawingLineRepository } from "../db/repositories/mapDrawingLineRepository";
import { mapIconPlacementRepository } from "../db/repositories/mapIconPlacementRepository";
import { mapIconTransitionRepository } from "../db/repositories/mapIconTransitionRepository";
import { mapLabelRepository } from "../db/repositories/mapLabelRepository";
import { moveDayAndReconcileTransitions } from "../db/services/dayOrderService";
import type {
  CreateMapLabelPayload,
  CreateMapIconPlacementPayload,
  CreateMapDrawingLinePayload,
  CreateDayIconPayload,
  CreateDayPayload,
  DeleteMapDrawingLinePayload,
  DeleteMapIconTransitionPayload,
  DeleteMapIconPlacementPayload,
  DeleteMapLabelPayload,
  DeleteDayIconPayload,
  MoveDayPayload,
  UpsertMapIconTransitionPayload,
  SelectContentResourcePayload,
  UpdateMapIconPlacementContentPayload,
  UpdateMapIconPlacementPayload,
  UpdateMapLabelContentPayload,
  UpdateMapLabelPositionPayload,
  UpdateDayMapViewPayload,
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

function toFileDataUrl(filePath: string | null) {
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

function createTransparentIconCopy(sourcePath: string) {
  const image = nativeImage.createFromPath(sourcePath);

  if (image.isEmpty()) {
    throw new Error("No se pudo leer el icono PNG seleccionado.");
  }

  const { width, height } = image.getSize();
  const bitmap = Buffer.from(image.toBitmap());

  for (let offset = 0; offset < bitmap.length; offset += 4) {
    const blue = bitmap[offset];
    const green = bitmap[offset + 1];
    const red = bitmap[offset + 2];
    const alpha = bitmap[offset + 3];

    if (alpha === 0) {
      continue;
    }

    const alphaScale = 255 / alpha;
    const visibleRed = Math.min(255, red * alphaScale);
    const visibleGreen = Math.min(255, green * alphaScale);
    const visibleBlue = Math.min(255, blue * alphaScale);
    const lightestChannel = Math.min(visibleRed, visibleGreen, visibleBlue);
    const channelSpread = Math.max(visibleRed, visibleGreen, visibleBlue) - lightestChannel;

    if (lightestChannel < 220 || channelSpread > 24) {
      continue;
    }

    const remainingOpacity = Math.max(0, Math.min(1, (245 - lightestChannel) / 25));
    const nextAlpha = Math.round(alpha * remainingOpacity);
    const premultipliedScale = alpha === 0 ? 0 : nextAlpha / alpha;

    bitmap[offset] = Math.round(blue * premultipliedScale);
    bitmap[offset + 1] = Math.round(green * premultipliedScale);
    bitmap[offset + 2] = Math.round(red * premultipliedScale);
    bitmap[offset + 3] = nextAlpha;
  }

  const outputDirectory = path.join(
    getDatabaseInfo().dataDirectory,
    "assets",
    "images",
    "imported-icons",
    `${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
  const outputPath = path.join(outputDirectory, path.basename(sourcePath));
  const processedImage = nativeImage.createFromBitmap(bitmap, { width, height, scaleFactor: 1 });

  fs.mkdirSync(outputDirectory, { recursive: true });
  fs.writeFileSync(outputPath, processedImage.toPNG());
  return outputPath;
}

function enrichDays(days: Day[]) {
  return days.map((day) => ({
    ...day,
    imagenFondoDataUrl: null,
    fondoMediaDataUrl: null,
    tipoFondoMedia: null
  }));
}

function enrichIconsByDay(icons: DayIcon[]) {
  return icons.reduce<Record<number, DayIcon[]>>((accumulator, icon) => {
    const item = {
      ...icon,
      iconoDataUrl: toFileDataUrl(icon.rutaIconoLocal)
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
      iconoDataUrl: toFileDataUrl(libraryIcon?.rutaIconoLocal ?? null),
      imagenDataUrl: toFileDataUrl(placement.rutaImagenLocal ?? null),
      videoDataUrl: toFileDataUrl(placement.rutaVideoLocal ?? null)
    };

    if (!accumulator[placement.dayId]) {
      accumulator[placement.dayId] = [];
    }

    accumulator[placement.dayId].push(item);
    return accumulator;
  }, {});
}

function groupMapDrawingLinesByDay(lines: MapDrawingLine[]) {
  return lines.reduce<Record<number, MapDrawingLine[]>>((accumulator, line) => {
    if (!accumulator[line.dayId]) {
      accumulator[line.dayId] = [];
    }

    accumulator[line.dayId].push(line);
    return accumulator;
  }, {});
}

function groupMapLabelsByDay(labels: MapLabel[]) {
  return labels.reduce<Record<number, MapLabel[]>>((accumulator, label) => {
    if (!accumulator[label.dayId]) {
      accumulator[label.dayId] = [];
    }

    accumulator[label.dayId].push(label);
    return accumulator;
  }, {});
}

function getBootstrapData(profileId: string) {
  if (!profileId?.trim()) {
    throw new Error("No hay un perfil activo.");
  }

  dayRepository.assignUnowned(profileId);
  const info = getDatabaseInfo();
  const days = dayRepository.list(profileId);
  const dayIds = new Set(days.map((day) => day.id));
  const icons = dayIconRepository.listAll().filter((icon) => dayIds.has(icon.dayId));
  const drawingLines = mapDrawingLineRepository.listAll().filter((line) => dayIds.has(line.dayId));
  const placements = mapIconPlacementRepository.listAll().filter((placement) => dayIds.has(placement.dayId));
  const labels = mapLabelRepository.listAll().filter((label) => dayIds.has(label.dayId));
  const placementIds = new Set(placements.map((placement) => placement.id));
  const placementsById = new Map(placements.map((placement) => [placement.id, placement] as const));
  const transitions = mapIconTransitionRepository
    .listAll()
    .filter(
      (transition) => {
        if (!placementIds.has(transition.sourcePlacementId) || !placementIds.has(transition.targetPlacementId)) {
          return false;
        }

        const sourcePlacement = placementsById.get(transition.sourcePlacementId);
        const targetPlacement = placementsById.get(transition.targetPlacementId);

        return sourcePlacement?.trajectoryIdentifier === targetPlacement?.trajectoryIdentifier;
      }
    );

  return {
    appName: "Malvinas dia por dia",
    databasePath: info.databasePath,
    dataDirectory: info.dataDirectory,
    days: enrichDays(days),
    iconsByDay: enrichIconsByDay(icons),
    mapDrawingLinesByDay: groupMapDrawingLinesByDay(drawingLines),
    mapPlacementsByDay: enrichMapPlacementsByDay(placements, icons),
    mapLabelsByDay: groupMapLabelsByDay(labels),
    mapIconTransitions: transitions
  };
}

function registerIpcHandlers() {
  ipcMain.handle("app:get-bootstrap-data", async (_event, profileId: string) => getBootstrapData(profileId));
  ipcMain.handle("profiles:delete-data", async (_event, profileId: string) => {
    dayRepository.removeByProfile(profileId);
  });
  ipcMain.handle("days:create", async (_event, payload: CreateDayPayload, profileId: string) => {
    const etiquetaFecha = payload.etiquetaFecha.trim();

    if (!etiquetaFecha) {
      throw new Error("El nombre del dia no puede estar vacio.");
    }

    dayRepository.create(profileId, etiquetaFecha, Boolean(payload.esEventoDestacado));
    return getBootstrapData(profileId);
  });
  ipcMain.handle("days:delete", async (_event, dayId: number, profileId: string) => {
    dayRepository.remove(dayId);
    return getBootstrapData(profileId);
  });
  ipcMain.handle("days:update", async (_event, payload: UpdateDayPayload, profileId: string) => {
    const etiquetaFecha = payload.etiquetaFecha.trim();

    if (!etiquetaFecha) {
      throw new Error("El nombre del dia no puede estar vacio.");
    }

    dayRepository.update(payload.id, etiquetaFecha, Boolean(payload.esEventoDestacado));
    return getBootstrapData(profileId);
  });
  ipcMain.handle("days:move", async (_event, payload: MoveDayPayload, profileId: string) => {
    if (payload.direction !== -1 && payload.direction !== 1) {
      throw new Error("La direccion seleccionada no es valida.");
    }

    moveDayAndReconcileTransitions(profileId, payload.dayId, payload.direction);
    return getBootstrapData(profileId);
  });
  ipcMain.handle("days:update-map-view", async (_event, payload: UpdateDayMapViewPayload, profileId: string) => {
    const values = [payload.longitude, payload.latitude, payload.zoom];
    const shouldReset = values.every((value) => value === null);

    if (!Number.isFinite(payload.speed) || payload.speed < 0 || payload.speed > 100) {
      throw new Error("La velocidad de la vista inicial no es valida.");
    }

    if (!shouldReset && values.some((value) => value === null || !Number.isFinite(value))) {
      throw new Error("La vista inicial del dia no es valida.");
    }

    if (
      !shouldReset &&
      (Number(payload.longitude) < -180 ||
        Number(payload.longitude) > 180 ||
        Number(payload.latitude) < -85.05112878 ||
        Number(payload.latitude) > 85.05112878 ||
        Number(payload.zoom) < 0 ||
        Number(payload.zoom) > 22)
    ) {
      throw new Error("La vista inicial del dia esta fuera de los limites del mapa.");
    }

    dayRepository.updateMapView(
      payload.dayId,
      payload.longitude,
      payload.latitude,
      payload.zoom,
      Math.round(payload.speed)
    );
    return getBootstrapData(profileId);
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

    const selectedPath = result.filePaths[0] ?? null;
    return selectedPath ? createTransparentIconCopy(selectedPath) : null;
  });
  ipcMain.handle("icons:create", async (_event, payload: CreateDayIconPayload, profileId: string) => {
    if (!payload.dayId) {
      throw new Error("Primero selecciona un dia.");
    }

    if (!payload.nombre.trim()) {
      throw new Error("El icono necesita un nombre.");
    }

    dayIconRepository.create(payload.dayId, payload.nombre, payload.rutaIconoLocal);
    return getBootstrapData(profileId);
  });
  ipcMain.handle("icons:delete", async (_event, payload: DeleteDayIconPayload, profileId: string) => {
    dayIconRepository.remove(payload.iconId);
    return getBootstrapData(profileId);
  });
  ipcMain.handle("map-lines:create", async (_event, payload: CreateMapDrawingLinePayload, profileId: string) => {
    if (!payload.dayId) {
      throw new Error("Primero selecciona un dia.");
    }

    if (!Array.isArray(payload.pointsPct) || payload.pointsPct.length < 4) {
      throw new Error("La linea no tiene suficientes puntos.");
    }

    const color = isMapDrawingLineColor(payload.color) ? payload.color : "yellow";
    mapDrawingLineRepository.create(payload.dayId, payload.style, color, payload.pointsPct);
    return getBootstrapData(profileId);
  });
  ipcMain.handle("map-lines:delete", async (_event, payload: DeleteMapDrawingLinePayload, profileId: string) => {
    mapDrawingLineRepository.remove(payload.lineId);
    return getBootstrapData(profileId);
  });
  ipcMain.handle("map-transitions:upsert", async (_event, payload: UpsertMapIconTransitionPayload, profileId: string) => {
    if (!payload.sourcePlacementId || !payload.targetPlacementId) {
      throw new Error("La transicion necesita origen y destino.");
    }

    if (!Array.isArray(payload.pointsPct) || payload.pointsPct.length < 4) {
      throw new Error("La transicion no tiene suficientes puntos.");
    }

    if (!Array.isArray(payload.pointSpeeds)) {
      throw new Error("Las velocidades de la transicion no son validas.");
    }

    const placements = mapIconPlacementRepository.listAll();
    const sourcePlacement = placements.find((placement) => placement.id === payload.sourcePlacementId);
    const targetPlacement = placements.find((placement) => placement.id === payload.targetPlacementId);

    if (!sourcePlacement || !targetPlacement) {
      throw new Error("No se pudo encontrar el origen o destino de la transicion.");
    }

    if (sourcePlacement.trajectoryIdentifier !== targetPlacement.trajectoryIdentifier) {
      throw new Error("Los iconos deben tener el mismo identificador de trayectoria.");
    }

    const pointCount = Math.max(1, payload.pointsPct.length / 2 - 1);
    const pointSpeeds: number[] = [];

    for (let index = 0; index < pointCount; index += 1) {
      const speed = payload.pointSpeeds[index];
      pointSpeeds.push(
        Number.isFinite(speed)
          ? Math.min(100, Math.max(0, speed))
          : pointSpeeds[index - 1] ?? 50
      );
    }

    mapIconTransitionRepository.upsert(
      payload.sourcePlacementId,
      payload.targetPlacementId,
      payload.pointsPct,
      pointSpeeds
    );
    return getBootstrapData(profileId);
  });
  ipcMain.handle("map-transitions:delete", async (_event, payload: DeleteMapIconTransitionPayload, profileId: string) => {
    mapIconTransitionRepository.remove(payload.transitionId);
    return getBootstrapData(profileId);
  });
  ipcMain.handle("map-icons:create", async (_event, payload: CreateMapIconPlacementPayload, profileId: string) => {
    mapIconPlacementRepository.create(payload.dayId, payload.libraryIconId, payload.posXPct, payload.posYPct);
    return getBootstrapData(profileId);
  });
  ipcMain.handle("map-icons:update", async (_event, payload: UpdateMapIconPlacementPayload, profileId: string) => {
    mapIconPlacementRepository.updatePosition(payload.placementId, payload.posXPct, payload.posYPct);
    return getBootstrapData(profileId);
  });
  ipcMain.handle("map-icons:delete", async (_event, payload: DeleteMapIconPlacementPayload, profileId: string) => {
    mapIconPlacementRepository.remove(payload.placementId);
    return getBootstrapData(profileId);
  });
  ipcMain.handle("map-labels:create", async (_event, payload: CreateMapLabelPayload, profileId: string) => {
    if (!payload.dayId || !Number.isFinite(payload.posXPct) || !Number.isFinite(payload.posYPct)) {
      throw new Error("No se pudo determinar la posicion de la etiqueta.");
    }

    mapLabelRepository.create(
      payload.dayId,
      Math.min(100, Math.max(0, payload.posXPct)),
      Math.min(100, Math.max(0, payload.posYPct)),
      isMapLabelStyle(payload.style) ? payload.style : "gray"
    );
    return getBootstrapData(profileId);
  });
  ipcMain.handle("map-labels:update-position", async (_event, payload: UpdateMapLabelPositionPayload, profileId: string) => {
    if (!Number.isFinite(payload.posXPct) || !Number.isFinite(payload.posYPct)) {
      throw new Error("No se pudo determinar la posicion de la etiqueta.");
    }

    mapLabelRepository.updatePosition(
      payload.labelId,
      Math.min(100, Math.max(0, payload.posXPct)),
      Math.min(100, Math.max(0, payload.posYPct))
    );
    return getBootstrapData(profileId);
  });
  ipcMain.handle("map-labels:update-content", async (_event, payload: UpdateMapLabelContentPayload, profileId: string) => {
    const text = payload.text.trim();

    if (!text) {
      throw new Error("La etiqueta necesita un texto.");
    }

    mapLabelRepository.updateContent(payload.labelId, text.slice(0, 120));
    return getBootstrapData(profileId);
  });
  ipcMain.handle("map-labels:delete", async (_event, payload: DeleteMapLabelPayload, profileId: string) => {
    mapLabelRepository.remove(payload.labelId);
    return getBootstrapData(profileId);
  });
  ipcMain.handle("map-icons:update-content", async (_event, payload: UpdateMapIconPlacementContentPayload, profileId: string) => {
    if (payload.rutaImagenLocal && !isAllowedContentResource(payload.rutaImagenLocal, "imagen")) {
      throw new Error("El archivo seleccionado no es una imagen valida.");
    }

    if (payload.rutaVideoLocal && !isAllowedContentResource(payload.rutaVideoLocal, "video")) {
      throw new Error("El archivo seleccionado no es un video valido.");
    }

    if (!Number.isInteger(payload.trajectoryIdentifier) || payload.trajectoryIdentifier <= 0) {
      throw new Error("El identificador de trayectoria debe ser un numero entero mayor a cero.");
    }

    const placements = mapIconPlacementRepository.listAll();
    const currentPlacement = placements.find((placement) => placement.id === payload.placementId);

    if (!currentPlacement) {
      throw new Error("No se encontro el icono que quieres editar.");
    }

    const duplicateInDay = placements.some(
      (placement) =>
        placement.id !== payload.placementId &&
        placement.dayId === currentPlacement.dayId &&
        placement.trajectoryIdentifier === payload.trajectoryIdentifier
    );

    if (duplicateInDay) {
      throw new Error("Ese identificador de trayectoria ya esta siendo usado por otro icono de este dia.");
    }

    mapIconPlacementRepository.updateContent(
      payload.placementId,
      payload.trajectoryIdentifier,
      payload.tituloContenido,
      payload.textoDescriptivo,
      payload.rutaImagenLocal,
      payload.rutaVideoLocal
    );
    return getBootstrapData(profileId);
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
