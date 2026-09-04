/// <reference types="vite/client" />

import type {
  BootstrapData,
  CreateMapLabelPayload,
  CreateMapDrawingLinePayload,
  CreateMapIconPlacementPayload,
  CreateDayIconPayload,
  CreateDayPayload,
  DeleteMapDrawingLinePayload,
  DeleteMapIconTransitionPayload,
  DeleteMapIconPlacementPayload,
  DeleteMapLabelPayload,
  DeleteDayIconPayload,
  ExportProfilesResult,
  ImportProfilesResult,
  MoveDayPayload,
  SelectContentResourcePayload,
  UpsertMapIconTransitionPayload,
  UpdateMapIconPlacementContentPayload,
  UpdateMapIconPlacementPayload,
  UpdateMapLabelContentPayload,
  UpdateMapLabelPositionPayload,
  UpdateDayMapViewPayload,
  UpdateDayPayload
} from "../shared/types/ipc";
import type { MalvinasProfile } from "../shared/types/profile";

declare global {
  interface Window {
    mapaMalvinas: {
      initializeProfiles: (legacyProfiles: MalvinasProfile[]) => Promise<MalvinasProfile[]>;
      saveProfile: (profile: MalvinasProfile) => Promise<MalvinasProfile[]>;
      exportProfiles: () => Promise<ExportProfilesResult>;
      importProfiles: () => Promise<ImportProfilesResult>;
      getBootstrapData: (profileId: string) => Promise<BootstrapData>;
      deleteProfileData: (profileId: string) => Promise<void>;
      createDay: (payload: CreateDayPayload) => Promise<BootstrapData>;
      deleteDay: (dayId: number) => Promise<BootstrapData>;
      updateDay: (payload: UpdateDayPayload) => Promise<BootstrapData>;
      moveDay: (payload: MoveDayPayload) => Promise<BootstrapData>;
      updateDayMapView: (payload: UpdateDayMapViewPayload) => Promise<BootstrapData>;
      selectIconPng: () => Promise<string | null>;
      createDayIcon: (payload: CreateDayIconPayload) => Promise<BootstrapData>;
      deleteDayIcon: (payload: DeleteDayIconPayload) => Promise<BootstrapData>;
      createMapDrawingLine: (payload: CreateMapDrawingLinePayload) => Promise<BootstrapData>;
      deleteMapDrawingLine: (payload: DeleteMapDrawingLinePayload) => Promise<BootstrapData>;
      upsertMapIconTransition: (payload: UpsertMapIconTransitionPayload) => Promise<BootstrapData>;
      deleteMapIconTransition: (payload: DeleteMapIconTransitionPayload) => Promise<BootstrapData>;
      createMapIconPlacement: (payload: CreateMapIconPlacementPayload) => Promise<BootstrapData>;
      updateMapIconPlacement: (payload: UpdateMapIconPlacementPayload) => Promise<BootstrapData>;
      deleteMapIconPlacement: (payload: DeleteMapIconPlacementPayload) => Promise<BootstrapData>;
      createMapLabel: (payload: CreateMapLabelPayload) => Promise<BootstrapData>;
      updateMapLabelPosition: (payload: UpdateMapLabelPositionPayload) => Promise<BootstrapData>;
      updateMapLabelContent: (payload: UpdateMapLabelContentPayload) => Promise<BootstrapData>;
      deleteMapLabel: (payload: DeleteMapLabelPayload) => Promise<BootstrapData>;
      updateMapIconPlacementContent: (payload: UpdateMapIconPlacementContentPayload) => Promise<BootstrapData>;
      selectContentResource: (payload: SelectContentResourcePayload) => Promise<string[]>;
    };
  }
}

export {};
