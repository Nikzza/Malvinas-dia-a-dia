import type { Day } from "./day";
import type { DayIcon } from "./dayIcon";
import type { MapDrawingLine, MapDrawingLineStyle } from "./mapDrawingLine";
import type { MapIconPlacement, MapPinKind } from "./mapIconPlacement";
import type { MapIconTransition } from "./mapIconTransition";

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
  mapIconTransitions: MapIconTransition[];
};

export type CreateDayPayload = {
  etiquetaFecha: string;
};

export type UpdateDayPayload = {
  id: number;
  etiquetaFecha: string;
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

export type CreateMapDrawingLinePayload = {
  dayId: number;
  style: MapDrawingLineStyle;
  pointsPct: number[];
};

export type DeleteMapDrawingLinePayload = {
  lineId: number;
};

export type UpsertMapIconTransitionPayload = {
  sourcePlacementId: number;
  targetPlacementId: number;
  pointsPct: number[];
};

export type DeleteMapIconTransitionPayload = {
  transitionId: number;
};

export type UpdateMapIconPlacementContentPayload = {
  placementId: number;
  pinKind: MapPinKind;
  tipoContenido: "texto" | "imagen" | "video" | null;
  tituloContenido: string | null;
  textoDescriptivo: string | null;
  rutaRecursoLocal: string | null;
};

export type SelectContentResourcePayload = {
  tipoContenido: "imagen" | "video";
};
