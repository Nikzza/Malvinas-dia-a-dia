import { contextBridge, ipcRenderer } from "electron";
import type {
  BootstrapData,
  CreateMapDrawingLinePayload,
  CreateMapIconPlacementPayload,
  CreateDayIconPayload,
  CreateDayPayload,
  DeleteMapDrawingLinePayload,
  DeleteMapIconTransitionPayload,
  DeleteMapIconPlacementPayload,
  DeleteDayIconPayload,
  SelectContentResourcePayload,
  UpsertMapIconTransitionPayload,
  UpdateMapIconPlacementContentPayload,
  UpdateMapIconPlacementPayload,
  UpdateDayPayload
} from "../shared/types/ipc";

const api = {
  getBootstrapData: () => ipcRenderer.invoke("app:get-bootstrap-data") as Promise<BootstrapData>,
  createDay: (payload: CreateDayPayload) => ipcRenderer.invoke("days:create", payload),
  deleteDay: (dayId: number) => ipcRenderer.invoke("days:delete", dayId) as Promise<BootstrapData>,
  updateDay: (payload: UpdateDayPayload) => ipcRenderer.invoke("days:update", payload) as Promise<BootstrapData>,
  selectDayBackground: () => ipcRenderer.invoke("days:select-background") as Promise<string | null>,
  selectIconPng: () => ipcRenderer.invoke("icons:select-png") as Promise<string | null>,
  createDayIcon: (payload: CreateDayIconPayload) => ipcRenderer.invoke("icons:create", payload) as Promise<BootstrapData>,
  deleteDayIcon: (payload: DeleteDayIconPayload) => ipcRenderer.invoke("icons:delete", payload) as Promise<BootstrapData>,
  createMapDrawingLine: (payload: CreateMapDrawingLinePayload) =>
    ipcRenderer.invoke("map-lines:create", payload) as Promise<BootstrapData>,
  deleteMapDrawingLine: (payload: DeleteMapDrawingLinePayload) =>
    ipcRenderer.invoke("map-lines:delete", payload) as Promise<BootstrapData>,
  upsertMapIconTransition: (payload: UpsertMapIconTransitionPayload) =>
    ipcRenderer.invoke("map-transitions:upsert", payload) as Promise<BootstrapData>,
  deleteMapIconTransition: (payload: DeleteMapIconTransitionPayload) =>
    ipcRenderer.invoke("map-transitions:delete", payload) as Promise<BootstrapData>,
  createMapIconPlacement: (payload: CreateMapIconPlacementPayload) =>
    ipcRenderer.invoke("map-icons:create", payload) as Promise<BootstrapData>,
  updateMapIconPlacement: (payload: UpdateMapIconPlacementPayload) =>
    ipcRenderer.invoke("map-icons:update", payload) as Promise<BootstrapData>,
  deleteMapIconPlacement: (payload: DeleteMapIconPlacementPayload) =>
    ipcRenderer.invoke("map-icons:delete", payload) as Promise<BootstrapData>,
  updateMapIconPlacementContent: (payload: UpdateMapIconPlacementContentPayload) =>
    ipcRenderer.invoke("map-icons:update-content", payload) as Promise<BootstrapData>,
  selectContentResource: (payload: SelectContentResourcePayload) =>
    ipcRenderer.invoke("content:select-resource", payload) as Promise<string | null>
};

contextBridge.exposeInMainWorld("mapaMalvinas", api);
