import type { Day } from "./day";
import type { DayIcon } from "./dayIcon";
import type { MapDrawingLine, MapDrawingLineColor, MapDrawingLineStyle } from "./mapDrawingLine";
import type { MapIconPlacement } from "./mapIconPlacement";
import type { MapIconTransition } from "./mapIconTransition";
import type { MapLabel, MapLabelStyle } from "./mapLabel";
import type { MalvinasProfile } from "./profile";

export type IpcResponse<T> = {
  ok: boolean;
  data?: T;
  error?: string;
};

export type BootstrapData = {
  appName: string;
  databasePath: string;
  dataDirectory: string;
  days: Day[];
  iconsByDay: Record<number, DayIcon[]>;
  mapDrawingLinesByDay: Record<number, MapDrawingLine[]>;
  mapPlacementsByDay: Record<number, MapIconPlacement[]>;
  mapLabelsByDay: Record<number, MapLabel[]>;
  mapIconTransitions: MapIconTransition[];
};

export type CreateDayPayload = {
  etiquetaFecha: string;
  esEventoDestacado: boolean;
};

export type UpdateDayPayload = {
  id: number;
  etiquetaFecha: string;
  esEventoDestacado: boolean;
};

export type UpdateDayMapViewPayload = {
  dayId: number;
  longitude: number | null;
  latitude: number | null;
  zoom: number | null;
  speed: number;
};

export type MoveDayPayload = {
  dayId: number;
  direction: -1 | 1;
};

export type CreateDayIconPayload = {
  dayId: number;
  nombre: string;
  rutaIconoLocal: string;
};

export type DeleteDayIconPayload = {
  iconId: number;
};

export type CreateMapIconPlacementPayload = {
  dayId: number;
  libraryIconId: number;
  posXPct: number;
  posYPct: number;
};

export type UpdateMapIconPlacementPayload = {
  placementId: number;
  posXPct: number;
  posYPct: number;
};

export type DeleteMapIconPlacementPayload = {
  placementId: number;
};

export type CreateMapLabelPayload = {
  dayId: number;
  posXPct: number;
  posYPct: number;
  style: MapLabelStyle;
};

export type UpdateMapLabelPositionPayload = {
  labelId: number;
  posXPct: number;
  posYPct: number;
};

export type UpdateMapLabelContentPayload = {
  labelId: number;
  text: string;
};

export type DeleteMapLabelPayload = {
  labelId: number;
};

export type CreateMapDrawingLinePayload = {
  dayId: number;
  style: MapDrawingLineStyle;
  color: MapDrawingLineColor;
  pointsPct: number[];
};

export type DeleteMapDrawingLinePayload = {
  lineId: number;
};

export type UpsertMapIconTransitionPayload = {
  sourcePlacementId: number;
  targetPlacementId: number;
  pointsPct: number[];
  pointSpeeds: number[];
};

export type DeleteMapIconTransitionPayload = {
  transitionId: number;
};

export type UpdateMapIconPlacementContentPayload = {
  placementId: number;
  trajectoryIdentifier: number;
  tituloContenido: string | null;
  textoDescriptivo: string | null;
  rutasImagenesLocales: string[];
  rutaVideoLocal: string | null;
};

export type SelectContentResourcePayload = {
  tipoContenido: "imagen" | "video";
};

export type ExportProfilesResult =
  | { canceled: true }
  | { canceled: false; profileCount: number; destinationPath: string };

export type ImportProfilesResult =
  | { canceled: true }
  | { canceled: false; importedCount: number; profiles: MalvinasProfile[] };
