/// <reference types="vite/client" />

import type {
  BootstrapData,
  CreateMapDrawingLinePayload,
  CreateMapIconPlacementPayload,
  CreateDayIconPayload,
  CreateDayPayload,
  DeleteMapDrawingLinePayload,
  DeleteMapIconPlacementPayload,
  DeleteDayIconPayload,
  SelectContentResourcePayload,
  UpdateMapIconPlacementContentPayload,
  UpdateMapIconPlacementPayload,
  UpdateDayPayload
} from "../shared/types/ipc";

declare global {
  interface Window {
    mapaMalvinas: {
      getBootstrapData: () => Promise<BootstrapData>;
      createDay: (payload: CreateDayPayload) => Promise<BootstrapData>;
      deleteDay: (dayId: number) => Promise<BootstrapData>;
      updateDay: (payload: UpdateDayPayload) => Promise<BootstrapData>;
      selectDayBackground: () => Promise<string | null>;
      selectIconPng: () => Promise<string | null>;
      createDayIcon: (payload: CreateDayIconPayload) => Promise<BootstrapData>;
      deleteDayIcon: (payload: DeleteDayIconPayload) => Promise<BootstrapData>;
      createMapDrawingLine: (payload: CreateMapDrawingLinePayload) => Promise<BootstrapData>;
      deleteMapDrawingLine: (payload: DeleteMapDrawingLinePayload) => Promise<BootstrapData>;
      createMapIconPlacement: (payload: CreateMapIconPlacementPayload) => Promise<BootstrapData>;
      updateMapIconPlacement: (payload: UpdateMapIconPlacementPayload) => Promise<BootstrapData>;
      deleteMapIconPlacement: (payload: DeleteMapIconPlacementPayload) => Promise<BootstrapData>;
      updateMapIconPlacementContent: (payload: UpdateMapIconPlacementContentPayload) => Promise<BootstrapData>;
      selectContentResource: (payload: SelectContentResourcePayload) => Promise<string | null>;
    };
  }
}

export {};
