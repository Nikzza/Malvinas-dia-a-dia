import { contextBridge, ipcRenderer } from "electron";
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

let activeProfileId: string | null = null;

function requireActiveProfileId() {
  if (!activeProfileId) {
    throw new Error("No hay un perfil activo.");
  }

  return activeProfileId;
}

const api = {
  initializeProfiles: (legacyProfiles: MalvinasProfile[]) =>
    ipcRenderer.invoke("profiles:initialize", legacyProfiles) as Promise<MalvinasProfile[]>,
  saveProfile: (profile: MalvinasProfile) =>
    ipcRenderer.invoke("profiles:save", profile) as Promise<MalvinasProfile[]>,
  exportProfiles: () => ipcRenderer.invoke("profiles:export") as Promise<ExportProfilesResult>,
  importProfiles: () => ipcRenderer.invoke("profiles:import") as Promise<ImportProfilesResult>,
  getBootstrapData: (profileId: string) => {
    activeProfileId = profileId;
    return ipcRenderer.invoke("app:get-bootstrap-data", profileId) as Promise<BootstrapData>;
  },
  deleteProfileData: (profileId: string) => ipcRenderer.invoke("profiles:delete-data", profileId) as Promise<void>,
  createDay: (payload: CreateDayPayload) => ipcRenderer.invoke("days:create", payload, requireActiveProfileId()),
  deleteDay: (dayId: number) => ipcRenderer.invoke("days:delete", dayId, requireActiveProfileId()) as Promise<BootstrapData>,
  updateDay: (payload: UpdateDayPayload) => ipcRenderer.invoke("days:update", payload, requireActiveProfileId()) as Promise<BootstrapData>,
  moveDay: (payload: MoveDayPayload) =>
    ipcRenderer.invoke("days:move", payload, requireActiveProfileId()) as Promise<BootstrapData>,
  updateDayMapView: (payload: UpdateDayMapViewPayload) =>
    ipcRenderer.invoke("days:update-map-view", payload, requireActiveProfileId()) as Promise<BootstrapData>,
  selectIconPng: () => ipcRenderer.invoke("icons:select-png") as Promise<string | null>,
  createDayIcon: (payload: CreateDayIconPayload) => ipcRenderer.invoke("icons:create", payload, requireActiveProfileId()) as Promise<BootstrapData>,
  deleteDayIcon: (payload: DeleteDayIconPayload) => ipcRenderer.invoke("icons:delete", payload, requireActiveProfileId()) as Promise<BootstrapData>,
  createMapDrawingLine: (payload: CreateMapDrawingLinePayload) =>
    ipcRenderer.invoke("map-lines:create", payload, requireActiveProfileId()) as Promise<BootstrapData>,
  deleteMapDrawingLine: (payload: DeleteMapDrawingLinePayload) =>
    ipcRenderer.invoke("map-lines:delete", payload, requireActiveProfileId()) as Promise<BootstrapData>,
  upsertMapIconTransition: (payload: UpsertMapIconTransitionPayload) =>
    ipcRenderer.invoke("map-transitions:upsert", payload, requireActiveProfileId()) as Promise<BootstrapData>,
  deleteMapIconTransition: (payload: DeleteMapIconTransitionPayload) =>
    ipcRenderer.invoke("map-transitions:delete", payload, requireActiveProfileId()) as Promise<BootstrapData>,
  createMapIconPlacement: (payload: CreateMapIconPlacementPayload) =>
    ipcRenderer.invoke("map-icons:create", payload, requireActiveProfileId()) as Promise<BootstrapData>,
  updateMapIconPlacement: (payload: UpdateMapIconPlacementPayload) =>
    ipcRenderer.invoke("map-icons:update", payload, requireActiveProfileId()) as Promise<BootstrapData>,
  deleteMapIconPlacement: (payload: DeleteMapIconPlacementPayload) =>
    ipcRenderer.invoke("map-icons:delete", payload, requireActiveProfileId()) as Promise<BootstrapData>,
  createMapLabel: (payload: CreateMapLabelPayload) =>
    ipcRenderer.invoke("map-labels:create", payload, requireActiveProfileId()) as Promise<BootstrapData>,
  updateMapLabelPosition: (payload: UpdateMapLabelPositionPayload) =>
    ipcRenderer.invoke("map-labels:update-position", payload, requireActiveProfileId()) as Promise<BootstrapData>,
  updateMapLabelContent: (payload: UpdateMapLabelContentPayload) =>
    ipcRenderer.invoke("map-labels:update-content", payload, requireActiveProfileId()) as Promise<BootstrapData>,
  deleteMapLabel: (payload: DeleteMapLabelPayload) =>
    ipcRenderer.invoke("map-labels:delete", payload, requireActiveProfileId()) as Promise<BootstrapData>,
  updateMapIconPlacementContent: (payload: UpdateMapIconPlacementContentPayload) =>
    ipcRenderer.invoke("map-icons:update-content", payload, requireActiveProfileId()) as Promise<BootstrapData>,
  selectContentResource: (payload: SelectContentResourcePayload) =>
    ipcRenderer.invoke("content:select-resource", payload) as Promise<string[]>
};

contextBridge.exposeInMainWorld("mapaMalvinas", api);
