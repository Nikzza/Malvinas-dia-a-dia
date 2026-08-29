import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import type { BootstrapData } from "../shared/types/ipc";
import type {
  MapDrawingLine,
  MapDrawingLineColor,
  MapDrawingLineStyle
} from "../shared/types/mapDrawingLine";
import type { DayIcon } from "../shared/types/dayIcon";
import type { MapIconPlacement } from "../shared/types/mapIconPlacement";
import type { MapIconTransition } from "../shared/types/mapIconTransition";
import type { MalvinasProfile } from "../shared/types/profile";
import {
  MAP_LABEL_STYLES,
  MAP_LABEL_STYLE_NAMES,
  type MapLabel,
  type MapLabelStyle
} from "../shared/types/mapLabel";
import { EventDrawer } from "./components/layout/EventDrawer";
import type { MapDrawingTool } from "./components/layout/MapDrawingLayer";
import { MapCanvas, type MapCanvasHandle, type MapViewState } from "./components/layout/MapCanvas";
import { TopTimeline } from "./components/layout/TopTimeline";

type AppMode = "profiles" | "profile-admin" | "menu" | "edit" | "view";
type MediaContentType = "imagen" | "video";
type PasswordGateMode = "verify" | "create" | "change";
type PasswordGateScope = "edit" | "profiles";
const TRANSITION_ANIMATION_MS = 1800;
const DEFAULT_WAYPOINT_SPEED = 50;
const DEFAULT_MAP_VIEW_SPEED = 100;
const DAY_LAYER_TRANSITION_MS = 900;
const PROFILES_STORAGE_KEY = "malvinas_profiles";
const ACTIVE_PROFILE_STORAGE_KEY = "malvinas_active_profile";
const EDIT_PASSWORD_STORAGE_KEY = "malvinas_edit_password";
const PROFILES_PASSWORD_STORAGE_KEY = "malvinas_profiles_password";
const DEFAULT_PROFILES_PASSWORD = "1111";
const PROFILE_BORDER_GOLD = "#DBB060";
const DEFAULT_PROFILE_CENTER: [number, number] = [-59.5236, -51.7963];
const DEFAULT_PROFILE_ZOOM = 6.25;
const EMPTY_DAYS: BootstrapData["days"] = [];
const EMPTY_MAP_TRANSITIONS: MapIconTransition[] = [];
const DRAWING_COLOR_OPTIONS: Array<{ value: MapDrawingLineColor; label: string; hex: string }> = [
  { value: "red", label: "Rojo", hex: "#E65050" },
  { value: "yellow", label: "Amarillo", hex: "#DBB060" },
  { value: "blue", label: "Azul", hex: "#3B82F6" },
  { value: "white", label: "Blanco", hex: "#F7F7F2" },
  { value: "black", label: "Negro", hex: "#11151B" }
];

type TransitionEditingState = {
  transitionId: number | null;
  sourcePlacementId: number;
  targetPlacementId: number;
  waypointPointsPct: number[];
  pointSpeeds: number[];
};

type DayLayerSnapshot = {
  drawingLines: MapDrawingLine[];
  placements: MapIconPlacement[];
  labels: MapLabel[];
};

type ProfileFormState = {
  name: string;
  avatar: string | null;
};

function canUseLocalStorage() {
  try {
    const testKey = "__malvinas_storage_test__";
    window.localStorage.setItem(testKey, "1");
    window.localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

function createId(prefix: string) {
  const randomId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  return `${prefix}-${randomId}`;
}

function getProfileInitials(name: string) {
  const words = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!words.length) {
    return "VI";
  }

  return words
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

function createDefaultProfile(name = "Visitante"): MalvinasProfile {
  return {
    id: createId("profile"),
    name,
    avatar: null,
    avatarInitials: getProfileInitials(name),
    avatarColor: PROFILE_BORDER_GOLD,
    createdAt: new Date().toISOString(),
    mapState: {
      startDay: 1,
      startCenter: [...DEFAULT_PROFILE_CENTER],
      startZoom: DEFAULT_PROFILE_ZOOM
    },
    icons: [],
    drawings: {},
    mapPins: {},
    drawingStyle: {
      traceType: "trazo-libre",
      lineStyle: "lisa",
      color: PROFILE_BORDER_GOLD
    }
  };
}

function getEmptyProfileForm(): ProfileFormState {
  return {
    name: "",
    avatar: null
  };
}

function getProfileForm(profile: MalvinasProfile): ProfileFormState {
  return {
    name: profile.name,
    avatar: profile.avatar
  };
}

function profileFromForm(form: ProfileFormState, existingProfile?: MalvinasProfile): MalvinasProfile {
  const name = form.name.trim() || "Visitante";

  return {
    ...(existingProfile ?? createDefaultProfile(name)),
    name,
    avatar: form.avatar,
    avatarInitials: getProfileInitials(name),
    avatarColor: PROFILE_BORDER_GOLD,
    mapState: {
      startDay: 1,
      startCenter: [...DEFAULT_PROFILE_CENTER],
      startZoom: DEFAULT_PROFILE_ZOOM
    }
  };
}

export function App() {
  const [data, setData] = useState<BootstrapData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<MalvinasProfile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [storageWarning, setStorageWarning] = useState<string | null>(null);
  const [profileModalMode, setProfileModalMode] = useState<"create" | "edit" | null>(null);
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [profileForm, setProfileForm] = useState<ProfileFormState>(() => getEmptyProfileForm());
  const [profileFormError, setProfileFormError] = useState<string | null>(null);
  const [profileTransferMessage, setProfileTransferMessage] = useState<string | null>(null);
  const [profileTransferError, setProfileTransferError] = useState<string | null>(null);
  const [isProfileTransferRunning, setIsProfileTransferRunning] = useState(false);
  const [passwordGateMode, setPasswordGateMode] = useState<PasswordGateMode | null>(null);
  const [passwordGateScope, setPasswordGateScope] = useState<PasswordGateScope>("edit");
  const [isProfileAccessGranted, setIsProfileAccessGranted] = useState(false);
  const [passwordValue, setPasswordValue] = useState("");
  const [newPasswordValue, setNewPasswordValue] = useState("");
  const [confirmPasswordValue, setConfirmPasswordValue] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [shouldShakePassword, setShouldShakePassword] = useState(false);
  const [activeDayId, setActiveDayId] = useState<number | null>(null);
  const [isSavingDay, setIsSavingDay] = useState(false);
  const [isCreatingDay, setIsCreatingDay] = useState(false);
  const [mapViewSpeed, setMapViewSpeed] = useState(DEFAULT_MAP_VIEW_SPEED);
  const [isIconsPanelOpen, setIsIconsPanelOpen] = useState(false);
  const [dragLibraryIcon, setDragLibraryIcon] = useState<DayIcon | null>(null);
  const [isLabelsPanelOpen, setIsLabelsPanelOpen] = useState(false);
  const [isMapViewPanelOpen, setIsMapViewPanelOpen] = useState(false);
  const [dragLabelStyle, setDragLabelStyle] = useState<MapLabelStyle | null>(null);
  const [editingMapLabel, setEditingMapLabel] = useState<MapLabel | null>(null);
  const [mapLabelText, setMapLabelText] = useState("");
  const [editingPlacement, setEditingPlacement] = useState<MapIconPlacement | null>(null);
  const [contentTrajectoryIdentifier, setContentTrajectoryIdentifier] = useState("");
  const [contentTitle, setContentTitle] = useState("");
  const [contentText, setContentText] = useState("");
  const [contentImagePath, setContentImagePath] = useState<string | null>(null);
  const [contentVideoPath, setContentVideoPath] = useState<string | null>(null);
  const [isDrawingPanelOpen, setIsDrawingPanelOpen] = useState(false);
  const [isDrawingEnabled, setIsDrawingEnabled] = useState(false);
  const [selectedDrawingLineId, setSelectedDrawingLineId] = useState<number | null>(null);
  const [drawingLineStyle, setDrawingLineStyle] = useState<MapDrawingLineStyle>("solid");
  const [drawingLineColor, setDrawingLineColor] = useState<MapDrawingLineColor>("yellow");
  const [drawingTool, setDrawingTool] = useState<MapDrawingTool>("freehand");
  const [mode, setMode] = useState<AppMode>("profiles");
  const [selectedPlacement, setSelectedPlacement] = useState<MapIconPlacement | null>(null);
  const [transitionEditing, setTransitionEditing] = useState<TransitionEditingState | null>(null);
  const [animatedPlacementPositions, setAnimatedPlacementPositions] = useState<Record<number, { x: number; y: number }>>({});
  const [isDayTransitionRunning, setIsDayTransitionRunning] = useState(false);
  const [dayLayerSnapshot, setDayLayerSnapshot] = useState<DayLayerSnapshot | null>(null);
  const [dayLayerTransitionProgress, setDayLayerTransitionProgress] = useState(1);
  const drawingPanelRef = useRef<HTMLElement | null>(null);
  const mapCanvasRef = useRef<MapCanvasHandle | null>(null);
  const profileNameInputRef = useRef<HTMLInputElement | null>(null);
  const [drawingPanelHeight, setDrawingPanelHeight] = useState(0);

  useEffect(() => {
    let isCancelled = false;

    async function loadProfiles() {
      const hasLocalStorage = canUseLocalStorage();
      let legacyProfiles: MalvinasProfile[] = [];

      if (hasLocalStorage) {
        try {
          const storedProfiles = window.localStorage.getItem(PROFILES_STORAGE_KEY);
          const parsedProfiles = storedProfiles ? (JSON.parse(storedProfiles) as MalvinasProfile[]) : [];
          legacyProfiles = Array.isArray(parsedProfiles)
            ? parsedProfiles.map((profile) => ({
                ...profile,
                avatarColor: PROFILE_BORDER_GOLD,
                mapState: {
                  startDay: 1,
                  startCenter: [...DEFAULT_PROFILE_CENTER],
                  startZoom: DEFAULT_PROFILE_ZOOM
                }
              }))
            : [];
        } catch {
          legacyProfiles = [];
        }
      }

      try {
        const loadedProfiles = await window.mapaMalvinas.initializeProfiles(legacyProfiles);

        if (isCancelled) {
          return;
        }

        const storedActiveProfileId = hasLocalStorage
          ? window.localStorage.getItem(ACTIVE_PROFILE_STORAGE_KEY)
          : null;
        const nextActiveProfileId =
          storedActiveProfileId && loadedProfiles.some((profile) => profile.id === storedActiveProfileId)
            ? storedActiveProfileId
            : null;

        if (hasLocalStorage) {
          window.localStorage.removeItem(PROFILES_STORAGE_KEY);

          if (!window.localStorage.getItem(PROFILES_PASSWORD_STORAGE_KEY)) {
            window.localStorage.setItem(PROFILES_PASSWORD_STORAGE_KEY, DEFAULT_PROFILES_PASSWORD);
          }
        } else {
          setStorageWarning("El perfil activo no podra recordarse al cerrar la aplicacion");
        }

        setProfiles(loadedProfiles);
        setActiveProfileId(nextActiveProfileId);
        setMode(nextActiveProfileId ? "view" : "profiles");
        setPasswordGateScope("profiles");
        setPasswordGateMode(nextActiveProfileId ? null : "verify");
      } catch (cause: unknown) {
        if (isCancelled) {
          return;
        }

        const message = cause instanceof Error ? cause.message : "No se pudieron cargar los perfiles.";
        setError(message);
        setProfiles([]);
        setActiveProfileId(null);
        setIsProfileAccessGranted(true);
        setMode("profiles");
      }
    }

    void loadProfiles();
    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!activeProfileId) {
      setData(null);
      setActiveDayId(null);
      return;
    }

    setData(null);
    setActiveDayId(null);
    let isCancelled = false;
    window.mapaMalvinas
      .getBootstrapData(activeProfileId)
      .then((nextData) => {
        if (!isCancelled) {
          setData(nextData);
        }
      })
      .catch((cause: unknown) => {
        if (isCancelled) {
          return;
        }

        const message = cause instanceof Error ? cause.message : "No se pudo iniciar la aplicacion.";
        setError(message);
      });

    return () => {
      isCancelled = true;
    };
  }, [activeProfileId]);

  useEffect(() => {
    if (!data?.days.length) {
      return;
    }

    const activeProfile = profiles.find((profile) => profile.id === activeProfileId) ?? null;
    const preferredDay = activeProfile ? data.days[activeProfile.mapState.startDay - 1] : null;
    setActiveDayId((current) => current ?? preferredDay?.id ?? data.days[0].id);
  }, [activeProfileId, data, profiles]);

  const activeDay = data?.days.find((day) => day.id === activeDayId) ?? null;
  const days = data?.days ?? EMPTY_DAYS;
  const activeProfile = profiles.find((profile) => profile.id === activeProfileId) ?? null;
  const iconsLibrary = Object.values(data?.iconsByDay ?? {}).flat();
  const activeDrawingLines = activeDayId ? data?.mapDrawingLinesByDay[activeDayId] ?? [] : [];
  const activeMapPlacements = activeDayId ? data?.mapPlacementsByDay[activeDayId] ?? [] : [];
  const activeMapLabels = activeDayId ? data?.mapLabelsByDay[activeDayId] ?? [] : [];
  const allMapPlacements = useMemo(() => Object.values(data?.mapPlacementsByDay ?? {}).flat(), [data?.mapPlacementsByDay]);
  const placementById = useMemo(() => new Map(allMapPlacements.map((placement) => [placement.id, placement] as const)), [allMapPlacements]);
  const transitions = data?.mapIconTransitions ?? EMPTY_MAP_TRANSITIONS;
  const isEditMode = mode === "edit";
  const isViewMode = mode === "view";
  const isReadOnlyMode = isViewMode;
  const activeDaySavedView: MapViewState | null =
    activeDay &&
    activeDay.initialMapLongitude !== null &&
    activeDay.initialMapLatitude !== null &&
    activeDay.initialMapZoom !== null
      ? {
          longitude: activeDay.initialMapLongitude,
          latitude: activeDay.initialMapLatitude,
          zoom: activeDay.initialMapZoom
        }
      : null;
  const previousActiveDayIdRef = useRef<number | null>(null);
  const transitionSourcePlacement = transitionEditing ? placementById.get(transitionEditing.sourcePlacementId) ?? null : null;
  const transitionTargetPlacement = transitionEditing ? placementById.get(transitionEditing.targetPlacementId) ?? null : null;

  useEffect(() => {
    setMapViewSpeed(activeDay?.initialMapSpeed ?? DEFAULT_MAP_VIEW_SPEED);
  }, [activeDay?.id, activeDay?.initialMapSpeed]);

  useLayoutEffect(() => {
    const panel = drawingPanelRef.current;

    if (!panel || !isDrawingPanelOpen) {
      setDrawingPanelHeight(0);
      return;
    }

    const updateHeight = () => setDrawingPanelHeight(panel.offsetHeight);
    updateHeight();

    const observer = new ResizeObserver(updateHeight);
    observer.observe(panel);

    return () => observer.disconnect();
  }, [isDrawingPanelOpen, drawingTool, drawingLineStyle, activeDrawingLines.length]);

  useEffect(() => {
    setSelectedPlacement(null);
    setEditingMapLabel(null);
    setDragLabelStyle(null);
    setIsDrawingEnabled(false);
    setSelectedDrawingLineId(null);
    setTransitionEditing(null);
    setAnimatedPlacementPositions({});
  }, [activeDayId, mode]);

  useEffect(() => {
    if (!isDrawingPanelOpen) {
      setSelectedDrawingLineId(null);
    }
  }, [isDrawingPanelOpen]);

  useEffect(() => {
    if (mode !== "edit") {
      setIsMapViewPanelOpen(false);
    }
  }, [mode]);

  useEffect(() => {
    if (!selectedPlacement) {
      return;
    }

    const nextPlacement = activeMapPlacements.find((placement) => placement.id === selectedPlacement.id) ?? null;
    setSelectedPlacement(nextPlacement);
  }, [activeMapPlacements, selectedPlacement]);

  useEffect(() => {
    if (!selectedPlacement) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSelectedPlacement(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedPlacement]);

  useEffect(() => {
    if (!profileModalMode && !passwordGateMode) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }

      handleCloseProfileModal();
      handleClosePasswordGate();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [passwordGateMode, profileModalMode]);

  useEffect(() => {
    if (!profileModalMode) {
      return;
    }

    const animationFrame = window.requestAnimationFrame(() => {
      profileNameInputRef.current?.focus();

      if (profileModalMode === "edit") {
        profileNameInputRef.current?.select();
      }
    });

    return () => window.cancelAnimationFrame(animationFrame);
  }, [profileModalMode]);

  useEffect(() => {
    if (!transitionEditing) {
      return;
    }

    const sourcePlacement = placementById.get(transitionEditing.sourcePlacementId);
    const targetPlacement = placementById.get(transitionEditing.targetPlacementId);

    if (!sourcePlacement || !targetPlacement) {
      setTransitionEditing(null);
      return;
    }
  }, [placementById, transitionEditing]);

  useEffect(() => {
    const previousDayId = previousActiveDayIdRef.current;
    previousActiveDayIdRef.current = activeDayId;

    if (mode !== "view" || !activeDayId || !previousDayId || previousDayId === activeDayId) {
      setAnimatedPlacementPositions({});
      return;
    }

    const direction = getAdjacentDayDirection(days, previousDayId, activeDayId);

    if (direction === 0) {
      setAnimatedPlacementPositions({});
      return;
    }

    const relevantTransitions = transitions.filter((transition) => {
      const sourcePlacement = placementById.get(transition.sourcePlacementId);
      const targetPlacement = placementById.get(transition.targetPlacementId);

      if (!sourcePlacement || !targetPlacement) {
        return false;
      }

      if (direction > 0) {
        return sourcePlacement.dayId === previousDayId && targetPlacement.dayId === activeDayId;
      }

      return sourcePlacement.dayId === activeDayId && targetPlacement.dayId === previousDayId;
    });

    if (!relevantTransitions.length) {
      setAnimatedPlacementPositions({});
      return;
    }

    const animatedTransitions = relevantTransitions.map((transition) => ({
      placementId: direction > 0 ? transition.targetPlacementId : transition.sourcePlacementId,
      path: createTimedTransitionPath(transition.pointsPct, transition.pointSpeeds, direction < 0)
    }));
    let animationFrame = 0;
    const startTime = performance.now();

    const runFrame = (now: number) => {
      const elapsedMs = now - startTime;
      const nextPositions: Record<number, { x: number; y: number }> = {};
      let hasRunningTransition = false;

      for (const transition of animatedTransitions) {
        const state = getTimedTransitionState(transition.path, elapsedMs);

        if (state.point) {
          nextPositions[transition.placementId] = state.point;
        }

        if (!state.isComplete) {
          hasRunningTransition = true;
        }
      }

      setAnimatedPlacementPositions(nextPositions);

      if (hasRunningTransition) {
        animationFrame = window.requestAnimationFrame(runFrame);
        return;
      }

      setAnimatedPlacementPositions({});
    };

    animationFrame = window.requestAnimationFrame(runFrame);

    return () => {
      window.cancelAnimationFrame(animationFrame);
    };
  }, [activeDayId, days, mode, placementById, transitions]);

  async function handleCreateDay(label: string, esEventoDestacado: boolean) {
    setIsSavingDay(true);
    setIsCreatingDay(true);
    setError(null);

    try {
      const nextData = await window.mapaMalvinas.createDay({
        etiquetaFecha: label,
        esEventoDestacado
      });
      setData(nextData);
      setActiveDayId(nextData.days[nextData.days.length - 1]?.id ?? null);
    } catch (cause: unknown) {
      const message = cause instanceof Error ? cause.message : "No se pudo crear el dia.";
      setError(message);
    } finally {
      setIsCreatingDay(false);
      setIsSavingDay(false);
    }
  }

  async function handleAddDay(label: string, esEventoDestacado: boolean) {
    await handleCreateDay(label, esEventoDestacado);
  }

  async function handleDeleteDay(dayId: number) {
    setError(null);

    try {
      const nextData = await window.mapaMalvinas.deleteDay(dayId);
      setData(nextData);
      setActiveDayId((current) => {
        if (current !== dayId) {
          return current;
        }

        return nextData.days[0]?.id ?? null;
      });
    } catch (cause: unknown) {
      const message = cause instanceof Error ? cause.message : "No se pudo borrar el dia.";
      setError(message);
    }
  }

  async function handleUpdateDay(dayId: number, label: string, esEventoDestacado: boolean) {
    setError(null);

    try {
      const nextData = await window.mapaMalvinas.updateDay({
        id: dayId,
        etiquetaFecha: label,
        esEventoDestacado
      });
      setData(nextData);
    } catch (cause: unknown) {
      const message = cause instanceof Error ? cause.message : "No se pudo editar el dia.";
      setError(message);
    }
  }

  async function handleMoveDay(dayId: number, direction: -1 | 1) {
    if (isSavingDay) {
      return;
    }

    setIsSavingDay(true);
    setError(null);

    try {
      const nextData = await window.mapaMalvinas.moveDay({ dayId, direction });
      setData(nextData);
    } catch (cause: unknown) {
      const message = cause instanceof Error ? cause.message : "No se pudo cambiar la posicion del dia.";
      setError(message);
    } finally {
      setIsSavingDay(false);
    }
  }

  async function handleSaveCurrentDayView() {
    if (!activeDayId) {
      setError("Primero selecciona un dia.");
      return;
    }

    const currentView = mapCanvasRef.current?.getCurrentView() ?? null;

    if (!currentView) {
      setError("El mapa todavia no esta listo para guardar la vista.");
      return;
    }

    try {
      const nextData = await window.mapaMalvinas.updateDayMapView({
        dayId: activeDayId,
        longitude: currentView.longitude,
        latitude: currentView.latitude,
        zoom: currentView.zoom,
        speed: mapViewSpeed
      });
      setData(nextData);
      setError(null);
    } catch (cause: unknown) {
      const message = cause instanceof Error ? cause.message : "No se pudo guardar la vista inicial.";
      setError(message);
    }
  }

  function handleGoToSavedDayView() {
    if (!activeDaySavedView) {
      setError("Este dia no tiene una vista inicial guardada.");
      return;
    }

    mapCanvasRef.current?.goToView(activeDaySavedView, mapViewSpeed);
    setError(null);
  }

  async function handleResetDayView() {
    if (!activeDayId) {
      return;
    }

    try {
      const nextData = await window.mapaMalvinas.updateDayMapView({
        dayId: activeDayId,
        longitude: null,
        latitude: null,
        zoom: null,
        speed: mapViewSpeed
      });
      setData(nextData);
      setError(null);
    } catch (cause: unknown) {
      const message = cause instanceof Error ? cause.message : "No se pudo restablecer la vista inicial.";
      setError(message);
    }
  }

  async function handleMapViewSpeedCommit(speed: number) {
    if (!activeDay) {
      return;
    }

    const normalizedSpeed = Math.min(100, Math.max(0, Math.round(speed)));

    if (normalizedSpeed === activeDay.initialMapSpeed) {
      return;
    }

    try {
      const nextData = await window.mapaMalvinas.updateDayMapView({
        dayId: activeDay.id,
        longitude: activeDay.initialMapLongitude,
        latitude: activeDay.initialMapLatitude,
        zoom: activeDay.initialMapZoom,
        speed: normalizedSpeed
      });
      setData(nextData);
      setError(null);
    } catch (cause: unknown) {
      setMapViewSpeed(activeDay.initialMapSpeed);
      const message = cause instanceof Error ? cause.message : "No se pudo guardar la velocidad de la vista inicial.";
      setError(message);
    }
  }

  async function handleAddIcon() {
    if (!activeDayId) {
      setError("Primero selecciona un dia para agregar iconos.");
      return;
    }

    try {
      const selectedPath = await window.mapaMalvinas.selectIconPng();

      if (!selectedPath) {
        return;
      }

      const fileName = selectedPath.split("\\").pop() ?? "Icono";
      const nextData = await window.mapaMalvinas.createDayIcon({
        dayId: activeDayId,
        nombre: fileName.replace(/\.png$/i, ""),
        rutaIconoLocal: selectedPath
      });
      setData(nextData);
      setError(null);
      setIsDrawingPanelOpen(false);
      setIsLabelsPanelOpen(false);
      setDragLabelStyle(null);
      setIsIconsPanelOpen(true);
    } catch (cause: unknown) {
      const message = cause instanceof Error ? cause.message : "No se pudo guardar el icono.";
      setError(message);
    }
  }

  function handleToggleDrawingPanel() {
    setIsDrawingPanelOpen((current) => !current);
    setSelectedDrawingLineId(null);
    setIsIconsPanelOpen(false);
    setIsLabelsPanelOpen(false);
    setIsMapViewPanelOpen(false);
    setDragLabelStyle(null);
  }

  function handleToggleIconsPanel() {
    setIsIconsPanelOpen((current) => !current);
    setIsDrawingPanelOpen(false);
    setIsDrawingEnabled(false);
    setIsLabelsPanelOpen(false);
    setIsMapViewPanelOpen(false);
    setDragLabelStyle(null);
  }

  function handleToggleLabelsPanel() {
    setIsLabelsPanelOpen((current) => !current);
    setIsDrawingPanelOpen(false);
    setIsDrawingEnabled(false);
    setIsIconsPanelOpen(false);
    setIsMapViewPanelOpen(false);
    setDragLibraryIcon(null);
  }

  function handleToggleMapViewPanel() {
    setIsMapViewPanelOpen((current) => !current);
    setIsDrawingPanelOpen(false);
    setIsDrawingEnabled(false);
    setSelectedDrawingLineId(null);
    setIsIconsPanelOpen(false);
    setIsLabelsPanelOpen(false);
    setDragLibraryIcon(null);
    setDragLabelStyle(null);
    setTransitionEditing(null);
  }

  async function handleDeleteIcon(iconId: number) {
    try {
      const nextData = await window.mapaMalvinas.deleteDayIcon({ iconId });
      setData(nextData);
      setError(null);
    } catch (cause: unknown) {
      const message = cause instanceof Error ? cause.message : "No se pudo borrar el icono.";
      setError(message);
    }
  }

  async function handleCreatePlacement(libraryIconId: number, posXPct: number, posYPct: number) {
    if (!activeDayId) {
      setError("Primero selecciona un dia.");
      return;
    }

    try {
      const nextData = await window.mapaMalvinas.createMapIconPlacement({
        dayId: activeDayId,
        libraryIconId,
        posXPct,
        posYPct
      });
      setData(nextData);
      setError(null);
    } catch (cause: unknown) {
      const message = cause instanceof Error ? cause.message : "No se pudo colocar el icono.";
      setError(message);
    }
  }

  async function handleMovePlacement(placementId: number, posXPct: number, posYPct: number) {
    try {
      const nextData = await window.mapaMalvinas.updateMapIconPlacement({
        placementId,
        posXPct,
        posYPct
      });
      setData(nextData);
      setError(null);
    } catch (cause: unknown) {
      const message = cause instanceof Error ? cause.message : "No se pudo mover el icono.";
      setError(message);
    }
  }

  async function handleDeletePlacement(placementId: number) {
    try {
      const nextData = await window.mapaMalvinas.deleteMapIconPlacement({ placementId });
      setData(nextData);
      setError(null);
    } catch (cause: unknown) {
      const message = cause instanceof Error ? cause.message : "No se pudo borrar el icono colocado.";
      setError(message);
    }
  }

  function handleOpenPlacementEditor(placement: MapIconPlacement) {
    setEditingPlacement(placement);
    setContentTrajectoryIdentifier(String(placement.trajectoryIdentifier));
    setContentTitle(placement.tituloContenido ?? "");
    setContentText(placement.textoDescriptivo ?? "");
    setContentImagePath(placement.rutaImagenLocal ?? null);
    setContentVideoPath(placement.rutaVideoLocal ?? null);
  }

  async function handleCreateMapLabel(style: MapLabelStyle, posXPct: number, posYPct: number) {
    if (!activeDayId) {
      setError("Primero selecciona un dia para agregar etiquetas.");
      return;
    }

    const currentLabelIds = new Set(activeMapLabels.map((label) => label.id));

    try {
      const nextData = await window.mapaMalvinas.createMapLabel({
        dayId: activeDayId,
        posXPct,
        posYPct,
        style
      });
      const createdLabel = (nextData.mapLabelsByDay[activeDayId] ?? []).find(
        (label) => !currentLabelIds.has(label.id)
      );

      setData(nextData);
      setDragLabelStyle(null);
      setError(null);

      if (createdLabel) {
        setEditingMapLabel(createdLabel);
        setMapLabelText(createdLabel.text);
      }
    } catch (cause: unknown) {
      const message = cause instanceof Error ? cause.message : "No se pudo colocar la etiqueta.";
      setError(message);
    }
  }

  async function handleMoveMapLabel(labelId: number, posXPct: number, posYPct: number) {
    try {
      const nextData = await window.mapaMalvinas.updateMapLabelPosition({ labelId, posXPct, posYPct });
      setData(nextData);
      setError(null);
    } catch (cause: unknown) {
      const message = cause instanceof Error ? cause.message : "No se pudo mover la etiqueta.";
      setError(message);
    }
  }

  function handleOpenMapLabelEditor(label: MapLabel) {
    setEditingMapLabel(label);
    setMapLabelText(label.text);
  }

  async function handleSaveMapLabel() {
    if (!editingMapLabel) {
      return;
    }

    const text = mapLabelText.trim();

    if (!text) {
      setError("La etiqueta necesita un texto.");
      return;
    }

    try {
      const nextData = await window.mapaMalvinas.updateMapLabelContent({
        labelId: editingMapLabel.id,
        text
      });
      setData(nextData);
      setEditingMapLabel(null);
      setError(null);
    } catch (cause: unknown) {
      const message = cause instanceof Error ? cause.message : "No se pudo guardar la etiqueta.";
      setError(message);
    }
  }

  async function handleDeleteMapLabel(labelId: number) {
    try {
      const nextData = await window.mapaMalvinas.deleteMapLabel({ labelId });
      setData(nextData);
      setEditingMapLabel((current) => (current?.id === labelId ? null : current));
      setError(null);
    } catch (cause: unknown) {
      const message = cause instanceof Error ? cause.message : "No se pudo borrar la etiqueta.";
      setError(message);
    }
  }

  async function handlePickContentResource(tipoContenido: MediaContentType) {
    try {
      const selectedPath = await window.mapaMalvinas.selectContentResource({
        tipoContenido
      });

      if (!selectedPath) {
        return;
      }

      if (tipoContenido === "imagen") {
        setContentImagePath(selectedPath);
      } else {
        setContentVideoPath(selectedPath);
      }
      setError(null);
    } catch (cause: unknown) {
      const message = cause instanceof Error ? cause.message : "No se pudo leer el recurso seleccionado.";
      setError(message);
    }
  }

  async function handleSavePlacementContent() {
    if (!editingPlacement) {
      return;
    }

    const trajectoryIdentifier = Number(contentTrajectoryIdentifier);

    if (!Number.isInteger(trajectoryIdentifier) || trajectoryIdentifier <= 0) {
      setError("El identificador de trayectoria debe ser un numero entero mayor a cero.");
      return;
    }

    try {
      const nextData = await window.mapaMalvinas.updateMapIconPlacementContent({
        placementId: editingPlacement.id,
        trajectoryIdentifier,
        tituloContenido: contentTitle.trim() || null,
        textoDescriptivo: contentText || null,
        rutaImagenLocal: contentImagePath,
        rutaVideoLocal: contentVideoPath
      });
      setData(nextData);
      setEditingPlacement(null);
      setError(null);
    } catch (cause: unknown) {
      const message = cause instanceof Error ? cause.message : "No se pudo guardar el contenido del icono.";
      setError(message);
    }
  }

  function handleSelectDay(nextDayId: number) {
    if (nextDayId === activeDayId) {
      return;
    }

    if (isDayTransitionRunning) {
      return;
    }

    if (!activeDayId) {
      setActiveDayId(nextDayId);
      return;
    }

    setDayLayerSnapshot({
      drawingLines: activeDrawingLines,
      placements: activeMapPlacements,
      labels: activeMapLabels
    });
    setDayLayerTransitionProgress(0);
    setIsDayTransitionRunning(true);
    setActiveDayId(nextDayId);

    const startTime = performance.now();
    let animationFrame = 0;

    const runFrame = (now: number) => {
      const progress = Math.min(1, (now - startTime) / DAY_LAYER_TRANSITION_MS);
      const easedProgress = easeInOutCubic(progress);

      setDayLayerTransitionProgress(easedProgress);

      if (progress < 1) {
        animationFrame = window.requestAnimationFrame(runFrame);
        return;
      }

      setDayLayerSnapshot(null);
      setDayLayerTransitionProgress(1);
      setIsDayTransitionRunning(false);
    };

    animationFrame = window.requestAnimationFrame(runFrame);
  }

  function handleStartTransitionEdit(sourcePlacement: MapIconPlacement) {
    const nextDay = getNextDay(days, sourcePlacement.dayId);

    if (!nextDay) {
      setError("Ese icono no tiene un dia siguiente para crear transicion.");
      return;
    }

    const targetPlacement =
      (data?.mapPlacementsByDay[nextDay.id] ?? []).find(
        (placement) => placement.trajectoryIdentifier === sourcePlacement.trajectoryIdentifier
      ) ?? null;

    if (!targetPlacement) {
      setError("No existe un icono con el mismo identificador de trayectoria en el dia siguiente.");
      return;
    }

    const existingTransition =
      transitions.find(
        (transition) =>
          transition.sourcePlacementId === sourcePlacement.id && transition.targetPlacementId === targetPlacement.id
      ) ?? null;

    setTransitionEditing({
      transitionId: existingTransition?.id ?? null,
      sourcePlacementId: sourcePlacement.id,
      targetPlacementId: targetPlacement.id,
      waypointPointsPct: stripTransitionEndpoints(existingTransition?.pointsPct ?? []),
      pointSpeeds: normalizePointSpeeds(
        existingTransition?.pointSpeeds ?? [],
        Math.max(1, (existingTransition?.pointsPct.length ?? 4) / 2 - 1)
      )
    });
    setIsDrawingPanelOpen(false);
    setIsLabelsPanelOpen(false);
    setIsMapViewPanelOpen(false);
    setDragLabelStyle(null);
    setIsDrawingEnabled(false);
    setError(null);
  }

  function handleAddTransitionWaypoint(posXPct: number, posYPct: number) {
    setTransitionEditing((current) => {
      if (!current) {
        return current;
      }

      const finalPointSpeed = current.pointSpeeds[current.pointSpeeds.length - 1] ?? DEFAULT_WAYPOINT_SPEED;

      return {
        ...current,
        waypointPointsPct: [...current.waypointPointsPct, posXPct, posYPct],
        pointSpeeds: [
          ...current.pointSpeeds.slice(0, -1),
          DEFAULT_WAYPOINT_SPEED,
          finalPointSpeed
        ]
      };
    });
  }

  function handleMoveTransitionWaypoint(index: number, posXPct: number, posYPct: number) {
    setTransitionEditing((current) => {
      if (!current) {
        return current;
      }

      const nextWaypoints = [...current.waypointPointsPct];
      nextWaypoints[index * 2] = posXPct;
      nextWaypoints[index * 2 + 1] = posYPct;

      return {
        ...current,
        waypointPointsPct: nextWaypoints
      };
    });
  }

  function handleUndoTransitionWaypoint() {
    setTransitionEditing((current) => {
      if (!current || current.waypointPointsPct.length < 2) {
        return current;
      }

      const finalPointSpeed = current.pointSpeeds[current.pointSpeeds.length - 1] ?? DEFAULT_WAYPOINT_SPEED;

      return {
        ...current,
        waypointPointsPct: current.waypointPointsPct.slice(0, -2),
        pointSpeeds: [...current.pointSpeeds.slice(0, -2), finalPointSpeed]
      };
    });
  }

  function handleClearTransitionWaypoint() {
    setTransitionEditing((current) => {
      if (!current) {
        return current;
      }

      const finalPointSpeed = current.pointSpeeds[current.pointSpeeds.length - 1] ?? DEFAULT_WAYPOINT_SPEED;

      return {
        ...current,
        waypointPointsPct: [],
        pointSpeeds: [finalPointSpeed]
      };
    });
  }

  function handleTransitionSpeedChange(index: number, speed: number) {
    setTransitionEditing((current) => {
      if (!current) {
        return current;
      }

      const nextSpeeds = normalizePointSpeeds(current.pointSpeeds, current.waypointPointsPct.length / 2 + 1);
      nextSpeeds[index] = Math.min(100, Math.max(0, speed));

      return {
        ...current,
        pointSpeeds: nextSpeeds
      };
    });
  }

  async function handleSaveTransition() {
    if (!transitionEditing) {
      return;
    }

    const sourcePlacement = placementById.get(transitionEditing.sourcePlacementId);
    const targetPlacement = placementById.get(transitionEditing.targetPlacementId);

    if (!sourcePlacement || !targetPlacement) {
      setError("No se pudo resolver el origen o destino de la transicion.");
      return;
    }

    const fullPointsPct = [
      sourcePlacement.posXPct,
      sourcePlacement.posYPct,
      ...transitionEditing.waypointPointsPct,
      targetPlacement.posXPct,
      targetPlacement.posYPct
    ];

    try {
      const nextData = await window.mapaMalvinas.upsertMapIconTransition({
        sourcePlacementId: sourcePlacement.id,
        targetPlacementId: targetPlacement.id,
        pointsPct: fullPointsPct,
        pointSpeeds: transitionEditing.pointSpeeds
      });
      setData(nextData);
      setTransitionEditing(null);
      setError(null);
    } catch (cause: unknown) {
      const message = cause instanceof Error ? cause.message : "No se pudo guardar la transicion.";
      setError(message);
    }
  }

  async function handleDeleteTransition() {
    if (!transitionEditing?.transitionId) {
      setTransitionEditing(null);
      return;
    }

    try {
      const nextData = await window.mapaMalvinas.deleteMapIconTransition({
        transitionId: transitionEditing.transitionId
      });
      setData(nextData);
      setTransitionEditing(null);
      setError(null);
    } catch (cause: unknown) {
      const message = cause instanceof Error ? cause.message : "No se pudo borrar la transicion.";
      setError(message);
    }
  }

  async function handleCreateDrawingLine(
    pointsPct: number[],
    style: MapDrawingLineStyle,
    color: MapDrawingLineColor
  ) {
    if (!activeDayId) {
      setError("Primero selecciona un dia.");
      return;
    }

    try {
      const nextData = await window.mapaMalvinas.createMapDrawingLine({
        dayId: activeDayId,
        style,
        color,
        pointsPct
      });
      setData(nextData);
      setError(null);
    } catch (cause: unknown) {
      const message = cause instanceof Error ? cause.message : "No se pudo guardar la linea.";
      setError(message);
    }
  }

  async function handleDeleteSelectedDrawingLine() {
    if (selectedDrawingLineId === null) {
      return;
    }

    try {
      const nextData = await window.mapaMalvinas.deleteMapDrawingLine({ lineId: selectedDrawingLineId });
      setData(nextData);
      setSelectedDrawingLineId(null);
      setError(null);
    } catch (cause: unknown) {
      const message = cause instanceof Error ? cause.message : "No se pudo borrar la linea seleccionada.";
      setError(message);
    }
  }

  function handleOpenPlacementViewer(placement: MapIconPlacement) {
    const hasTitle = Boolean(placement.tituloContenido?.trim());
    const hasText = Boolean(placement.textoDescriptivo?.trim());
    const hasResource = Boolean(placement.imagenDataUrl || placement.videoDataUrl);

    if (!hasTitle && !hasText && !hasResource) {
      return;
    }

    setSelectedPlacement(placement);
  }

  function persistActiveProfile(profileId: string | null) {
    setActiveProfileId(profileId);

    if (!canUseLocalStorage()) {
      setStorageWarning("Activa el almacenamiento local para guardar los perfiles");
      return;
    }

    if (profileId) {
      window.localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, profileId);
      return;
    }

    window.localStorage.removeItem(ACTIVE_PROFILE_STORAGE_KEY);
  }

  function handleSelectProfile(profileId: string) {
    const profile = profiles.find((item) => item.id === profileId);

    if (!profile) {
      return;
    }

    persistActiveProfile(profileId);
    setIsProfileAccessGranted(false);
    setMode("menu");
    setActiveDayId(data?.days[profile.mapState.startDay - 1]?.id ?? data?.days[0]?.id ?? null);
    setError(null);
  }

  function handleOpenCreateProfile() {
    setProfileModalMode("create");
    setEditingProfileId(null);
    setProfileForm(getEmptyProfileForm());
    setProfileFormError(null);
  }

  function handleOpenEditProfile(profile: MalvinasProfile) {
    setProfileModalMode("edit");
    setEditingProfileId(profile.id);
    setProfileForm(getProfileForm(profile));
    setProfileFormError(null);
  }

  function handleCloseProfileModal() {
    setProfileModalMode(null);
    setEditingProfileId(null);
    setProfileForm(getEmptyProfileForm());
    setProfileFormError(null);
  }

  async function handleSaveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!profileForm.name.trim()) {
      setProfileFormError("Ingresa un nombre para el perfil.");
      return;
    }

    if (profileModalMode === "edit" && editingProfileId) {
      const currentProfile = profiles.find((profile) => profile.id === editingProfileId);

      if (!currentProfile) {
        setProfileFormError("No se encontro el perfil que quieres editar.");
        return;
      }

      try {
        const nextProfiles = await window.mapaMalvinas.saveProfile(profileFromForm(profileForm, currentProfile));
        setProfiles(nextProfiles);
        handleCloseProfileModal();
      } catch (cause: unknown) {
        const message = cause instanceof Error ? cause.message : "No se pudo guardar el perfil.";
        setProfileFormError(message);
      }
      return;
    }

    const nextProfile = profileFromForm(profileForm);

    try {
      const nextProfiles = await window.mapaMalvinas.saveProfile(nextProfile);
      setProfiles(nextProfiles);
      persistActiveProfile(nextProfile.id);
      setIsProfileAccessGranted(false);
      handleCloseProfileModal();
      setMode("menu");
    } catch (cause: unknown) {
      const message = cause instanceof Error ? cause.message : "No se pudo crear el perfil.";
      setProfileFormError(message);
    }
  }

  async function handleDeleteEditingProfile() {
    if (!editingProfileId) {
      return;
    }

    const confirmed = window.confirm("Eliminar este perfil? Se perderan todos sus trazados e iconos.");

    if (!confirmed) {
      return;
    }

    try {
      await window.mapaMalvinas.deleteProfileData(editingProfileId);
      const remainingProfiles = profiles.filter((profile) => profile.id !== editingProfileId);
      const nextActiveProfileId =
        activeProfileId && remainingProfiles.some((profile) => profile.id === activeProfileId)
          ? activeProfileId
          : remainingProfiles[0]?.id ?? null;

      setProfiles(remainingProfiles);
      persistActiveProfile(nextActiveProfileId);
      handleCloseProfileModal();
    } catch (cause: unknown) {
      const message = cause instanceof Error ? cause.message : "No se pudo eliminar el perfil.";
      setProfileFormError(message);
    }
  }

  async function handleExportProfiles() {
    setIsProfileTransferRunning(true);
    setProfileTransferMessage(null);
    setProfileTransferError(null);

    try {
      const result = await window.mapaMalvinas.exportProfiles();

      if (!result.canceled) {
        setProfileTransferMessage(
          `${result.profileCount} ${result.profileCount === 1 ? "perfil exportado" : "perfiles exportados"} correctamente.`
        );
      }
    } catch (cause: unknown) {
      const message = cause instanceof Error ? cause.message : "No se pudieron exportar los perfiles.";
      setProfileTransferError(message);
    } finally {
      setIsProfileTransferRunning(false);
    }
  }

  async function handleImportProfiles() {
    setIsProfileTransferRunning(true);
    setProfileTransferMessage(null);
    setProfileTransferError(null);

    try {
      const result = await window.mapaMalvinas.importProfiles();

      if (!result.canceled) {
        setProfiles(result.profiles);
        setProfileTransferMessage(
          `${result.importedCount} ${result.importedCount === 1 ? "perfil agregado" : "perfiles agregados"} correctamente.`
        );
      }
    } catch (cause: unknown) {
      const message = cause instanceof Error ? cause.message : "No se pudieron importar los perfiles.";
      setProfileTransferError(message);
    } finally {
      setIsProfileTransferRunning(false);
    }
  }

  function handleAvatarFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setProfileFormError("El avatar debe ser PNG, JPG o WebP.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setProfileForm((current) => ({
        ...current,
        avatar: typeof reader.result === "string" ? reader.result : current.avatar
      }));
      setProfileFormError(null);
    };
    reader.readAsDataURL(file);
  }

  function handleOpenEditPassword() {
    setPasswordGateScope("edit");
    const hasPassword = Boolean(canUseLocalStorage() && window.localStorage.getItem(EDIT_PASSWORD_STORAGE_KEY));
    setPasswordGateMode(hasPassword ? "verify" : "create");
    setPasswordValue("");
    setNewPasswordValue("");
    setConfirmPasswordValue("");
    setPasswordError(null);
    setShouldShakePassword(false);
  }

  function handleOpenChangePassword() {
    setPasswordGateScope("edit");
    setPasswordGateMode("change");
    setPasswordValue("");
    setNewPasswordValue("");
    setConfirmPasswordValue("");
    setPasswordError(null);
    setShouldShakePassword(false);
  }

  function handleOpenProfileAccess() {
    setPasswordGateScope("profiles");
    setPasswordGateMode("verify");
    setPasswordValue("");
    setNewPasswordValue("");
    setConfirmPasswordValue("");
    setPasswordError(null);
    setShouldShakePassword(false);
  }

  function handleOpenChangeProfilesPassword() {
    setPasswordGateScope("profiles");
    setPasswordGateMode("change");
    setPasswordValue("");
    setNewPasswordValue("");
    setConfirmPasswordValue("");
    setPasswordError(null);
    setShouldShakePassword(false);
  }

  function resetPasswordGate() {
    setPasswordGateMode(null);
    setPasswordValue("");
    setNewPasswordValue("");
    setConfirmPasswordValue("");
    setPasswordError(null);
    setShouldShakePassword(false);
  }

  function handleClosePasswordGate() {
    if (passwordGateScope === "profiles" && mode === "profiles" && !isProfileAccessGranted && !activeProfileId) {
      return;
    }

    resetPasswordGate();
  }

  function triggerPasswordError(message: string) {
    setPasswordError(message);
    setShouldShakePassword(false);
    window.requestAnimationFrame(() => setShouldShakePassword(true));
  }

  function handleSubmitPasswordGate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canUseLocalStorage()) {
      triggerPasswordError("Activa el almacenamiento local.");
      return;
    }

    const storageKey = passwordGateScope === "profiles" ? PROFILES_PASSWORD_STORAGE_KEY : EDIT_PASSWORD_STORAGE_KEY;
    const storedPassword = window.localStorage.getItem(storageKey);

    if (passwordGateMode === "verify") {
      if (passwordValue === storedPassword) {
        if (passwordGateScope === "profiles") {
          setIsProfileAccessGranted(true);
          setMode("profiles");
        } else {
          setMode("edit");
        }
        resetPasswordGate();
        return;
      }

      triggerPasswordError("Contrasena incorrecta");
      setPasswordValue("");
      return;
    }

    if (passwordGateMode === "create") {
      if (!newPasswordValue || newPasswordValue !== confirmPasswordValue) {
        triggerPasswordError("Las contrasenas no coinciden");
        return;
      }

      window.localStorage.setItem(storageKey, newPasswordValue);
      if (passwordGateScope === "profiles") {
        setIsProfileAccessGranted(true);
        setMode("profiles");
      } else {
        setMode("edit");
      }
      resetPasswordGate();
      return;
    }

    if (passwordGateMode === "change") {
      if (passwordValue !== storedPassword) {
        triggerPasswordError("Contrasena incorrecta");
        setPasswordValue("");
        return;
      }

      if (!newPasswordValue || newPasswordValue !== confirmPasswordValue) {
        triggerPasswordError("Las contrasenas no coinciden");
        return;
      }

      window.localStorage.setItem(storageKey, newPasswordValue);
      resetPasswordGate();
    }
  }

  function handleReturnToProfiles() {
    setIsProfileAccessGranted(false);
    handleOpenProfileAccess();
    setIsIconsPanelOpen(false);
    setIsDrawingPanelOpen(false);
    setIsLabelsPanelOpen(false);
    setDragLabelStyle(null);
    setIsDrawingEnabled(false);
    setEditingPlacement(null);
    setEditingMapLabel(null);
    setSelectedPlacement(null);
    setTransitionEditing(null);
  }

  function renderProfileAvatar(profile: MalvinasProfile, className = "profile-avatar") {
    return (
      <span
        className={className}
        style={{
          backgroundColor: profile.avatar ? undefined : profile.avatarColor
        }}
      >
        {profile.avatar ? <img alt={profile.name} src={profile.avatar} /> : profile.avatarInitials}
      </span>
    );
  }

  function renderProfileModal() {
    if (!profileModalMode) {
      return null;
    }

    const isEditing = profileModalMode === "edit";

    return (
      <section className="profile-modal-backdrop" onClick={handleCloseProfileModal}>
        <form className="profile-edit-card" onClick={(event) => event.stopPropagation()} onSubmit={handleSaveProfile}>
          <div className="content-editor-header">
            <strong>{isEditing ? "Editar perfil" : "Crear perfil"}</strong>
            <button className="content-editor-close" onClick={handleCloseProfileModal} type="button">
              x
            </button>
          </div>

          <div className="profile-edit-avatar-preview">
            {profileForm.avatar ? (
              <img alt="Avatar seleccionado" src={profileForm.avatar} />
            ) : (
              <span style={{ backgroundColor: PROFILE_BORDER_GOLD }}>{getProfileInitials(profileForm.name)}</span>
            )}
          </div>

          <label className="profile-field">
            <span>Nombre del perfil</span>
            <input
              onChange={(event) => setProfileForm((current) => ({ ...current, name: event.target.value }))}
              placeholder="Nombre del perfil"
              ref={profileNameInputRef}
              type="text"
              value={profileForm.name}
            />
          </label>

          <label className="profile-file-button">
            Cambiar foto
            <input accept="image/png,image/jpeg,image/webp" onChange={handleAvatarFileChange} type="file" />
          </label>

          {profileFormError ? <div className="password-gate-error">{profileFormError}</div> : null}

          <button className="content-save-button" type="submit">
            {isEditing ? "Guardar cambios" : "Crear perfil"}
          </button>

          {isEditing ? (
            <button className="profile-delete-button" onClick={handleDeleteEditingProfile} type="button">
              Eliminar perfil
            </button>
          ) : null}
        </form>
      </section>
    );
  }

  function renderPasswordGate() {
    if (!passwordGateMode) {
      return null;
    }

    const isCreate = passwordGateMode === "create";
    const isChange = passwordGateMode === "change";
    const isProfilesPassword = passwordGateScope === "profiles";

    return (
      <section className="password-gate-modal" onClick={handleClosePasswordGate}>
        <form className="password-gate-card restricted" onClick={(event) => event.stopPropagation()} onSubmit={handleSubmitPasswordGate}>
          <span className="menu-corner top-left" />
          <span className="menu-corner top-right" />
          <span className="menu-corner bottom-left" />
          <span className="menu-corner bottom-right" />
          <div className="password-gate-eyebrow">Acceso restringido</div>
          <h2>
            {isChange
              ? isProfilesPassword
                ? "Cambiar contrasena de perfiles"
                : "Cambiar contrasena de edicion"
              : isProfilesPassword
                ? "Acceso a perfiles"
                : "Modo Edicion"}
          </h2>
          <div className="password-gate-divider" />

          {!isCreate ? (
            <label className="password-field">
              <span>{isChange ? "Contrasena actual" : "Contrasena"}</span>
              <input
                autoFocus
                className={shouldShakePassword ? "shake" : ""}
                onChange={(event) => {
                  setPasswordValue(event.target.value);
                  setPasswordError(null);
                }}
                type="password"
                value={passwordValue}
              />
            </label>
          ) : null}

          {isCreate || isChange ? (
            <>
              <label className="password-field">
                <span>{isCreate ? "Nueva contrasena" : "Nueva"}</span>
                <input
                  autoFocus={isCreate}
                  onChange={(event) => {
                    setNewPasswordValue(event.target.value);
                    setPasswordError(null);
                  }}
                  type="password"
                  value={newPasswordValue}
                />
              </label>
              <label className="password-field">
                <span>{isCreate ? "Confirmar" : "Confirmar nueva"}</span>
                <input
                  onChange={(event) => {
                    setConfirmPasswordValue(event.target.value);
                    setPasswordError(null);
                  }}
                  type="password"
                  value={confirmPasswordValue}
                />
              </label>
            </>
          ) : null}

          {passwordError ? <div className="password-gate-error">{passwordError}</div> : null}

          <button className="password-gate-button" type="submit">
            {isCreate ? "Crear contrasena" : isChange ? "Cambiar contrasena" : "Ingresar"}
          </button>
          <button className="content-resource-button password-cancel-button" onClick={handleClosePasswordGate} type="button">
            Cancelar
          </button>
        </form>
      </section>
    );
  }

  if (mode === "profiles") {
    return (
      <main className="profile-shell">
        <section className="profile-picker">
          <div className="profile-eyebrow">MUSEO MALVINAS &middot; AYAS</div>
          <h1>Seleccione perfil</h1>
          <div className="profile-divider" />

          <div className="profiles-grid">
            {profiles.map((profile) => (
              <button className="profile-card" key={profile.id} onClick={() => handleSelectProfile(profile.id)} type="button">
                {renderProfileAvatar(profile)}
                <span>{profile.name}</span>
              </button>
            ))}

            <button className="profile-card add-profile-card" onClick={handleOpenCreateProfile} type="button">
              <span className="add-profile-avatar">+</span>
              <span>Agregar perfil</span>
            </button>
          </div>

          <div className="profile-main-actions">
            <button className="manage-profiles-button" onClick={() => setMode("profile-admin")} type="button">
              Administrar perfiles
            </button>
            <button
              className="manage-profiles-button"
              disabled={isProfileTransferRunning || profiles.length === 0}
              onClick={handleExportProfiles}
              type="button"
            >
              Exportar Perfiles
            </button>
            <button
              className="manage-profiles-button"
              disabled={isProfileTransferRunning}
              onClick={handleImportProfiles}
              type="button"
            >
              Importar Perfiles
            </button>
          </div>
        </section>

        {storageWarning ? <div className="error-toast">{storageWarning}</div> : null}
        {profileTransferMessage ? <div className="profile-transfer-toast">{profileTransferMessage}</div> : null}
        {profileTransferError ? <div className="error-toast">{profileTransferError}</div> : null}
        {renderProfileModal()}
        {renderPasswordGate()}
      </main>
    );
  }

  if (mode === "profile-admin") {
    return (
      <main className="profile-shell">
        <button className="profile-back-button" onClick={() => setMode("profiles")} type="button">
          &lsaquo; Regresar
        </button>

        <section className="profile-picker admin">
          <div className="profile-eyebrow">MUSEO MALVINAS &middot; AYAS</div>
          <h1>Administrar perfiles</h1>
          <p>Selecciona un perfil para editarlo</p>
          <div className="profile-divider" />

          <div className="profiles-grid">
            {profiles.map((profile) => (
              <button className="profile-card admin-card" key={profile.id} onClick={() => handleOpenEditProfile(profile)} type="button">
                <span className="admin-avatar-wrap">
                  {renderProfileAvatar(profile)}
                  <span className="admin-edit-icon">Editar</span>
                </span>
                <span>{profile.name}</span>
              </button>
            ))}

            <button className="profile-card add-profile-card" onClick={handleOpenCreateProfile} type="button">
              <span className="add-profile-avatar">+</span>
              <span>Agregar perfil</span>
            </button>
          </div>

          <div className="profile-password-actions">
            <button className="manage-profiles-button" onClick={handleOpenChangePassword} type="button">
              Cambiar contrasena de edicion
            </button>
            <button className="manage-profiles-button" onClick={handleOpenChangeProfilesPassword} type="button">
              Cambiar contrasena de perfiles
            </button>
          </div>
        </section>

        {storageWarning ? <div className="error-toast">{storageWarning}</div> : null}
        {renderProfileModal()}
        {renderPasswordGate()}
      </main>
    );
  }

  if (mode === "menu") {
    return (
      <main className="menu-shell">
        <div className="menu-institutional">Memorial Heroes de Malvinas</div>
        <section className="menu-card">
          <span className="menu-corner top-left" />
          <span className="menu-corner top-right" />
          <span className="menu-corner bottom-left" />
          <span className="menu-corner bottom-right" />
          <div className="menu-eyebrow">MUSEO MALVINAS &middot; AYAS</div>
          <h1>Malvinas<br />Dia X Dia</h1>
          <div className="menu-divider" />
          <p>{activeProfile ? `Perfil activo: ${activeProfile.name}` : "Selecciona el modo de ingreso"}</p>

          <div className="menu-actions">
            <button className="menu-button primary" onClick={() => setMode("view")} type="button">
              Modo Visualizacion
            </button>
            <button className="menu-button secondary" onClick={handleOpenEditPassword} type="button">
              Modo Edicion
            </button>
            <button className="menu-button secondary" onClick={handleReturnToProfiles} type="button">
              Perfiles
            </button>
          </div>
        </section>
        <div className="menu-location">Bariloche &middot; Argentina</div>

        {renderPasswordGate()}

        {error ? <div className="error-toast">{error}</div> : null}
      </main>
    );
  }

  return (
    <main className="experience-shell">
      <div className="profile-topbar-left">
        {activeProfile ? (
          <div
            aria-label={`Perfil activo: ${activeProfile.name}`}
            className="active-profile-chip"
          >
            {renderProfileAvatar(activeProfile, "active-profile-avatar")}
            <span>{activeProfile.name}</span>
          </div>
        ) : null}
      </div>

      <TopTimeline
        activeDayId={activeDayId}
        days={data?.days ?? []}
        isCreatingDay={isCreatingDay}
        isEditable={isEditMode}
        isSavingDay={isSavingDay}
        onAddDay={handleAddDay}
        onDeleteDay={handleDeleteDay}
        onMoveDay={handleMoveDay}
        onSelectDay={handleSelectDay}
        onUpdateDay={handleUpdateDay}
      />
      <EventDrawer
        activeDayId={activeDayId}
        days={data?.days ?? []}
        isEditable={isEditMode}
        onSelectDay={handleSelectDay}
      />
      <div className="topbar-actions">
        {isEditMode ? (
          <button
            className="topbar-button ghost"
            onClick={() => {
              setMode("view");
              setIsIconsPanelOpen(false);
              setIsDrawingPanelOpen(false);
              setIsLabelsPanelOpen(false);
              setDragLabelStyle(null);
              setIsDrawingEnabled(false);
              setEditingMapLabel(null);
            }}
            type="button"
          >
            Visualizacion
          </button>
        ) : null}
        <button
          className="topbar-button solid"
          onClick={() => {
            setMode("menu");
            setIsIconsPanelOpen(false);
            setIsDrawingPanelOpen(false);
            setIsLabelsPanelOpen(false);
            setDragLabelStyle(null);
            setIsDrawingEnabled(false);
            setEditingPlacement(null);
            setEditingMapLabel(null);
          }}
          type="button"
        >
          Menu
        </button>
      </div>

      <div className="map-scene-wrap">
        <MapCanvas
          activeDay={activeDay}
          animatedPlacementPositions={animatedPlacementPositions}
          drawingLines={activeDrawingLines}
          drawingLineColor={drawingLineColor}
          drawingLineStyle={drawingLineStyle}
          drawingTool={drawingTool}
          dragLibraryIcon={isEditMode ? dragLibraryIcon : null}
          dragLabelStyle={isEditMode ? dragLabelStyle : null}
          isDrawingEnabled={isDrawingEnabled}
          isDrawingLineSelectionEnabled={isEditMode && isDrawingPanelOpen && !isDrawingEnabled}
          isEditable={isEditMode}
          isTransitionEditing={Boolean(transitionEditing)}
          onActivatePlacement={isReadOnlyMode ? handleOpenPlacementViewer : undefined}
          onAddTransitionWaypoint={handleAddTransitionWaypoint}
          onCreateDrawingLine={handleCreateDrawingLine}
          onCreateMapLabel={handleCreateMapLabel}
          onCreatePlacement={handleCreatePlacement}
          onDeleteMapLabel={handleDeleteMapLabel}
          onDeletePlacement={handleDeletePlacement}
          onEditMapLabel={handleOpenMapLabelEditor}
          onEditPlacement={handleOpenPlacementEditor}
          onEditTransition={handleStartTransitionEdit}
          onMoveMapLabel={handleMoveMapLabel}
          onMovePlacement={handleMovePlacement}
          onMoveTransitionWaypoint={handleMoveTransitionWaypoint}
          onSelectDrawingLine={setSelectedDrawingLineId}
          placements={activeMapPlacements}
          labels={activeMapLabels}
          previousDrawingLines={dayLayerSnapshot?.drawingLines ?? []}
          previousLabels={dayLayerSnapshot?.labels ?? []}
          previousPlacements={dayLayerSnapshot?.placements ?? []}
          ref={mapCanvasRef}
          selectedDrawingLineId={selectedDrawingLineId}
          transitionProgress={dayLayerTransitionProgress}
          transitionEditorSourcePlacement={transitionSourcePlacement}
          transitionEditorTargetPlacement={transitionTargetPlacement}
          transitionWaypointPointsPct={transitionEditing?.waypointPointsPct ?? []}
        />
      </div>

      <section className="date-chip">
        <strong>{activeDay?.etiquetaFecha ?? "Sin dia activo"}</strong>
      </section>

      {isEditMode && editingPlacement ? (
        <section className="content-editor-modal">
          <div className="content-editor-card">
            <div className="content-editor-header">
              <strong>Contenido del icono</strong>
              <button className="content-editor-close" onClick={() => setEditingPlacement(null)} type="button">
                x
              </button>
            </div>

            <label className="content-trajectory-field">
              <span>Identificador Trayectoria</span>
              <input
                aria-label="Identificador Trayectoria"
                className="content-trajectory-input"
                min={1}
                onChange={(event) => setContentTrajectoryIdentifier(event.target.value)}
                placeholder="Identificador Trayectoria"
                step={1}
                type="number"
                value={contentTrajectoryIdentifier}
              />
            </label>

            <textarea
              className="content-title-input"
              onChange={(event) => setContentTitle(event.target.value)}
              placeholder="Titulo"
              rows={1}
              value={contentTitle}
            />

            <textarea
              className="content-textarea"
              onChange={(event) => setContentText(event.target.value)}
              placeholder="Texto descriptivo"
              value={contentText}
            />

            <div className="content-resource-row">
              <button
                className="content-resource-button"
                onClick={() => void handlePickContentResource("imagen")}
                type="button"
              >
                Cargar imagen
              </button>
              <span className="content-resource-name" title={contentImagePath ?? ""}>
                {contentImagePath
                  ? `${contentImagePath.split(/[\\/]/).pop()}${
                      contentImagePath === editingPlacement.rutaImagenLocal &&
                      editingPlacement.imagenEstado !== "available"
                        ? " - NO DISPONIBLE"
                        : ""
                    }`
                  : "Sin archivo"}
              </span>
            </div>

            <div className="content-resource-row">
              <button
                className="content-resource-button"
                onClick={() => void handlePickContentResource("video")}
                type="button"
              >
                Cargar video
              </button>
              <span className="content-resource-name" title={contentVideoPath ?? ""}>
                {contentVideoPath
                  ? `${contentVideoPath.split(/[\\/]/).pop()}${
                      contentVideoPath === editingPlacement.rutaVideoLocal &&
                      editingPlacement.videoEstado !== "available"
                        ? " - NO DISPONIBLE"
                        : ""
                    }`
                  : "Sin archivo"}
              </span>
            </div>

            <button className="content-save-button" onClick={() => void handleSavePlacementContent()} type="button">
              Guardar
            </button>
          </div>
        </section>
      ) : null}

      {isEditMode && editingMapLabel ? (
        <section className="content-editor-modal">
          <div className="content-editor-card map-label-editor-card">
            <div className="content-editor-header">
              <strong>Editar etiqueta</strong>
              <button className="content-editor-close" onClick={() => setEditingMapLabel(null)} type="button">
                x
              </button>
            </div>

            <textarea
              autoFocus
              className="map-label-textarea"
              maxLength={120}
              onChange={(event) => setMapLabelText(event.target.value)}
              onKeyDown={(event) => {
                if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                  void handleSaveMapLabel();
                }
              }}
              placeholder="Texto de la etiqueta"
              value={mapLabelText}
            />

            <span className="map-label-character-count">{mapLabelText.length}/120</span>
            <button className="content-save-button" onClick={() => void handleSaveMapLabel()} type="button">
              Guardar etiqueta
            </button>
          </div>
        </section>
      ) : null}

      {isEditMode && isIconsPanelOpen ? (
        <aside
          className="icons-panel"
          style={{
            top: isDrawingPanelOpen ? `${66 + drawingPanelHeight + 16}px` : "66px"
          }}
        >
          <div className="icons-panel-header">
            <strong>ICONOS</strong>
            <button className="icons-close" onClick={() => setIsIconsPanelOpen(false)} type="button">
              x
            </button>
          </div>

          <button className="icons-add-button" onClick={() => void handleAddIcon()} type="button">
            Agregar Icono
          </button>

          <div className="icons-list">
            {iconsLibrary.map((icon) => (
              <div key={icon.id} className="icon-card">
                <button
                  className="icon-thumb circle draggable"
                  draggable
                  onDragEnd={() => setDragLibraryIcon(null)}
                  onDragStart={() => setDragLibraryIcon(icon)}
                  type="button"
                >
                  {icon.iconoDataUrl ? <img alt={icon.nombre} className="icon-thumb-image" src={icon.iconoDataUrl} /> : null}
                </button>
                <button className="icon-delete" onClick={() => void handleDeleteIcon(icon.id)} type="button">
                  x
                </button>
              </div>
            ))}
            <button className="icon-add-tile" onClick={() => void handleAddIcon()} type="button">
              +
            </button>
          </div>
        </aside>
      ) : null}

      {isEditMode && isLabelsPanelOpen ? (
        <aside className="labels-panel">
          <div className="labels-panel-header">
            <strong>ETIQUETAS</strong>
            <button
              className="labels-close"
              onClick={() => {
                setIsLabelsPanelOpen(false);
                setDragLabelStyle(null);
              }}
              type="button"
            >
              x
            </button>
          </div>

          <div className="label-template-list">
            {MAP_LABEL_STYLES.map((style) => (
              <button
                aria-label={`Etiqueta ${MAP_LABEL_STYLE_NAMES[style]}`}
                aria-pressed={dragLabelStyle === style}
                className={dragLabelStyle === style ? "label-template-card active" : "label-template-card"}
                draggable
                key={style}
                onClick={() => setDragLabelStyle((current) => (current === style ? null : style))}
                onDragEnd={() => setDragLabelStyle(null)}
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = "copy";
                  event.dataTransfer.setData("text/plain", `map-label-${style}`);
                  setDragLabelStyle(style);
                }}
                type="button"
              >
                <span className={`map-label-shell ${style} label-template-preview`}>
                  <span className="map-label-face">{MAP_LABEL_STYLE_NAMES[style]}</span>
                </span>
              </button>
            ))}
          </div>

          <p className="labels-panel-hint">
            {dragLabelStyle
              ? "Haz clic en el mapa para colocarla."
              : "Selecciona o arrastra la etiqueta hacia el mapa."}
          </p>
        </aside>
      ) : null}

      {isEditMode && isMapViewPanelOpen ? (
        <aside className="map-view-panel">
          <div className="map-view-panel-header">
            <strong>VISTA INICIAL</strong>
            <button className="map-view-close" onClick={() => setIsMapViewPanelOpen(false)} type="button">
              x
            </button>
          </div>

          <div className={activeDaySavedView ? "map-view-status saved" : "map-view-status"}>
            <span>{activeDay?.etiquetaFecha ?? "Sin dia activo"}</span>
            <strong>{activeDaySavedView ? "Vista guardada" : "Sin vista guardada"}</strong>
          </div>

          <button
            className="map-view-action-button primary"
            disabled={!activeDay}
            onClick={() => void handleSaveCurrentDayView()}
            type="button"
          >
            Guardar vista actual
          </button>
          <button
            className="map-view-action-button"
            disabled={!activeDaySavedView}
            onClick={handleGoToSavedDayView}
            type="button"
          >
            Ir a vista guardada
          </button>
          <button
            className="map-view-action-button"
            disabled={!activeDaySavedView}
            onClick={() => void handleResetDayView()}
            type="button"
          >
            Restablecer vista
          </button>

          <div className="transition-speed-item map-view-speed-control">
            <div className="transition-speed-title">
              <span>Velocidad del zoom</span>
              <small>{mapViewSpeed}%</small>
            </div>
            <input
              aria-label="Velocidad del zoom de la vista inicial"
              disabled={!activeDay}
              max="100"
              min="0"
              onChange={(event) => setMapViewSpeed(Number(event.target.value))}
              onKeyUp={(event) => void handleMapViewSpeedCommit(Number(event.currentTarget.value))}
              onPointerUp={(event) => void handleMapViewSpeedCommit(Number(event.currentTarget.value))}
              step="1"
              type="range"
              value={mapViewSpeed}
            />
            <div className="transition-speed-extremes">
              <span>Lento</span>
              <span>Rapido</span>
            </div>
          </div>
        </aside>
      ) : null}

      {isEditMode && isDrawingPanelOpen ? (
        <aside ref={drawingPanelRef} className="drawing-panel">
          <div className="drawing-panel-header">
            <strong>DIBUJO</strong>
            <button
              className="drawing-close"
              onClick={() => {
                setIsDrawingPanelOpen(false);
                setIsDrawingEnabled(false);
                setSelectedDrawingLineId(null);
              }}
              type="button"
            >
              x
            </button>
          </div>

          <div className="drawing-color-label">Color del trazo</div>
          <div aria-label="Color del trazo" className="drawing-color-list" role="group">
            {DRAWING_COLOR_OPTIONS.map((option) => (
              <button
                aria-label={option.label}
                aria-pressed={drawingLineColor === option.value}
                className={drawingLineColor === option.value ? "drawing-color-button active" : "drawing-color-button"}
                key={option.value}
                onClick={() => setDrawingLineColor(option.value)}
                title={option.label}
                type="button"
              >
                <span className="drawing-color-swatch" style={{ backgroundColor: option.hex }} />
              </button>
            ))}
          </div>

          <div className="drawing-style-list">
            <button
              className={drawingTool === "freehand" ? "drawing-style-button active" : "drawing-style-button"}
              onClick={() => setDrawingTool("freehand")}
              type="button"
            >
              <span className="drawing-style-symbol">---</span>
              Trazo libre
            </button>
            <button
              className={drawingTool === "straight" ? "drawing-style-button active" : "drawing-style-button"}
              onClick={() => setDrawingTool("straight")}
              type="button"
            >
              <span className="drawing-style-symbol">--</span>
              Punto A-B recta
            </button>
            <button
              className={drawingTool === "curve" ? "drawing-style-button active" : "drawing-style-button"}
              onClick={() => setDrawingTool("curve")}
              type="button"
            >
              <span className="drawing-style-symbol">&#8978;</span>
              Punto A-B curva
            </button>
          </div>

          <div className="panel-section-label">Estilo de linea</div>
          <div className="drawing-style-list">
            <button
              className={drawingLineStyle === "solid" ? "drawing-style-button active" : "drawing-style-button"}
              onClick={() => setDrawingLineStyle("solid")}
              type="button"
            >
              <span className="drawing-style-symbol">--</span>
              Lisa
            </button>
            <button
              className={drawingLineStyle === "dashed" ? "drawing-style-button active" : "drawing-style-button"}
              onClick={() => setDrawingLineStyle("dashed")}
              type="button"
            >
              <span className="drawing-style-symbol">---</span>
              Punteada
            </button>
            <button
              className={drawingLineStyle === "dotted" ? "drawing-style-button active" : "drawing-style-button"}
              onClick={() => setDrawingLineStyle("dotted")}
              type="button"
            >
              <span className="drawing-style-symbol">...</span>
              Puntos
            </button>
          </div>

          <button
            className={isDrawingEnabled ? "drawing-action-button active" : "drawing-action-button"}
            onClick={() => {
              setSelectedDrawingLineId(null);
              setIsDrawingEnabled((current) => !current);
            }}
            type="button"
          >
            {isDrawingEnabled ? "Salir del dibujo" : "Empezar a dibujar"}
          </button>

          <button
            className="drawing-action-button secondary"
            disabled={selectedDrawingLineId === null}
            onClick={() => void handleDeleteSelectedDrawingLine()}
            type="button"
          >
            Deshacer linea
          </button>
        </aside>
      ) : null}

      {isEditMode && transitionEditing && transitionSourcePlacement && transitionTargetPlacement ? (
        <aside className="transition-panel">
          <div className="transition-panel-header">
            <strong>Transicion al siguiente dia</strong>
            <button className="transition-close" onClick={() => setTransitionEditing(null)} type="button">
              x
            </button>
          </div>

          <div className="transition-summary">
            <span>{days.find((day) => day.id === transitionSourcePlacement.dayId)?.etiquetaFecha ?? "Dia actual"}</span>
            <span className="transition-arrow">-&gt;</span>
            <span>{days.find((day) => day.id === transitionTargetPlacement.dayId)?.etiquetaFecha ?? "Dia siguiente"}</span>
          </div>

          <div className="transition-hint">
            Toca el mapa para agregar puntos intermedios al recorrido. Los extremos se toman automaticamente desde la posicion del icono en ambos dias.
          </div>

          <div className="transition-points-count">
            Puntos de trayectoria: {transitionEditing.waypointPointsPct.length / 2 + 1}
          </div>

          <div className="transition-speed-list">
            {Array.from({ length: transitionEditing.waypointPointsPct.length / 2 + 1 }, (_, index) => (
              <label className="transition-speed-item" key={`transition-speed-${index}`}>
                <span className="transition-speed-title">
                  Punto {String(index + 1).padStart(2, "0")}
                  {index === transitionEditing.waypointPointsPct.length / 2 ? <small>Final</small> : null}
                </span>
                <input
                  aria-label={`Velocidad del punto ${index + 1}`}
                  max={100}
                  min={0}
                  onChange={(event) => handleTransitionSpeedChange(index, Number(event.target.value))}
                  step={5}
                  type="range"
                  value={transitionEditing.pointSpeeds[index] ?? DEFAULT_WAYPOINT_SPEED}
                />
                <span className="transition-speed-extremes">
                  <span>Lento</span>
                  <span>Rapido</span>
                </span>
              </label>
            ))}
          </div>

          <button className="transition-action-button" onClick={handleUndoTransitionWaypoint} type="button">
            Deshacer ultimo punto
          </button>
          <button className="transition-action-button secondary" onClick={handleClearTransitionWaypoint} type="button">
            Limpiar puntos
          </button>
          <button className="transition-action-button save" onClick={() => void handleSaveTransition()} type="button">
            Guardar transicion
          </button>
          <button className="transition-action-button secondary" onClick={() => void handleDeleteTransition()} type="button">
            {transitionEditing.transitionId ? "Borrar transicion" : "Cancelar"}
          </button>
        </aside>
      ) : null}

      {isEditMode ? (
        <>
          <button
            aria-label="Abrir panel de dibujo"
            className={isDrawingPanelOpen ? "drawing-toggle active" : "drawing-toggle"}
            onClick={handleToggleDrawingPanel}
            title="Abrir panel de dibujo"
            type="button"
          >
            &#9998;
          </button>
          <button
            aria-label="Abrir panel de iconos"
            className={isIconsPanelOpen ? "icons-toggle active" : "icons-toggle"}
            onClick={handleToggleIconsPanel}
            title="Abrir panel de iconos"
            type="button"
          >
            &#9639;
          </button>
          <button
            aria-label="Abrir panel de etiquetas"
            className={isLabelsPanelOpen ? "labels-toggle active" : "labels-toggle"}
            onClick={handleToggleLabelsPanel}
            title="Abrir panel de etiquetas"
            type="button"
          >
            <span className="labels-toggle-symbol">A</span>
          </button>
          <button
            aria-label="Abrir herramienta de vista inicial"
            className={isMapViewPanelOpen ? "map-view-toggle active" : "map-view-toggle"}
            onClick={handleToggleMapViewPanel}
            title="Vista inicial del dia"
            type="button"
          >
            <span aria-hidden="true" className="map-view-pin-icon" />
          </button>
        </>
      ) : null}

      {isReadOnlyMode && selectedPlacement ? (
        <section
          className="content-viewer-modal"
          onClick={() => setSelectedPlacement(null)}
        >
          <article
            aria-label={selectedPlacement.tituloContenido ?? selectedPlacement.nombreIcono ?? "Contenido del icono"}
            className="content-viewer-card"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="content-viewer-header">
              <strong>{selectedPlacement.tituloContenido?.trim() || selectedPlacement.nombreIcono || "Contenido del icono"}</strong>
              <button className="content-viewer-close" onClick={() => setSelectedPlacement(null)} type="button">
                x
              </button>
            </div>

            <div
              className={
                selectedPlacement.imagenDataUrl || selectedPlacement.videoDataUrl
                  ? "content-viewer-body"
                  : "content-viewer-body text-only"
              }
            >
              {selectedPlacement.imagenDataUrl || selectedPlacement.videoDataUrl ? (
                <div className="content-viewer-media-column">
                  {selectedPlacement.imagenDataUrl ? (
                    <figure className="content-viewer-media-frame">
                      <img
                        alt={selectedPlacement.nombreIcono ?? "Imagen del contenido"}
                        className="content-viewer-media"
                        onError={() => setError("No se pudo leer la imagen de este icono.")}
                        src={selectedPlacement.imagenDataUrl}
                      />
                    </figure>
                  ) : null}

                  {selectedPlacement.videoDataUrl ? (
                    <div className="content-viewer-media-frame">
                      <video
                        className="content-viewer-media"
                        controls
                        onError={() => setError("No se pudo reproducir el video de este icono.")}
                        src={selectedPlacement.videoDataUrl}
                      />
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="content-viewer-text">
                {selectedPlacement.textoDescriptivo?.trim() ? (
                  <p>{selectedPlacement.textoDescriptivo}</p>
                ) : (
                  <p>Este icono no tiene texto descriptivo cargado.</p>
                )}
              </div>
            </div>
          </article>
        </section>
      ) : null}

      {error ? <div className="error-toast">{error}</div> : null}
    </main>
  );
}

function getNextDay(days: BootstrapData["days"], dayId: number) {
  const currentIndex = days.findIndex((day) => day.id === dayId);

  if (currentIndex === -1 || currentIndex >= days.length - 1) {
    return null;
  }

  return days[currentIndex + 1] ?? null;
}

function stripTransitionEndpoints(pointsPct: number[]) {
  if (pointsPct.length <= 4) {
    return [];
  }

  return pointsPct.slice(2, -2);
}

function normalizePointSpeeds(speeds: number[], pointCount: number) {
  const normalizedSpeeds: number[] = [];

  for (let index = 0; index < pointCount; index += 1) {
    const speed = speeds[index];
    normalizedSpeeds.push(
      Number.isFinite(speed)
        ? Math.min(100, Math.max(0, speed))
        : normalizedSpeeds[index - 1] ?? DEFAULT_WAYPOINT_SPEED
    );
  }

  return normalizedSpeeds;
}

function getAdjacentDayDirection(days: BootstrapData["days"], fromDayId: number, toDayId: number) {
  const fromIndex = days.findIndex((day) => day.id === fromDayId);
  const toIndex = days.findIndex((day) => day.id === toDayId);

  if (fromIndex === -1 || toIndex === -1) {
    return 0;
  }

  if (toIndex === fromIndex + 1) {
    return 1;
  }

  if (toIndex === fromIndex - 1) {
    return -1;
  }

  return 0;
}

type TimedTransitionSegment = {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  durationMs: number;
};

type TimedTransitionPath = {
  segments: TimedTransitionSegment[];
  totalDurationMs: number;
  finalPoint: { x: number; y: number } | null;
};

function getSpeedDurationMultiplier(speed: number) {
  const normalizedSpeed = Math.min(100, Math.max(0, speed));

  if (normalizedSpeed <= 50) {
    return 3 - 2 * (normalizedSpeed / 50);
  }

  return 1 - 0.55 * ((normalizedSpeed - 50) / 50);
}

function createTimedTransitionPath(pointsPct: number[], pointSpeeds: number[], shouldReverse: boolean): TimedTransitionPath {
  if (pointsPct.length < 4) {
    return { segments: [], totalDurationMs: 0, finalPoint: null };
  }

  const points = Array.from({ length: pointsPct.length / 2 }, (_, index) => ({
    x: pointsPct[index * 2],
    y: pointsPct[index * 2 + 1]
  }));
  const segmentSpeeds = normalizePointSpeeds(pointSpeeds, points.length - 1);

  if (shouldReverse) {
    points.reverse();
    segmentSpeeds.reverse();
  }

  const segmentLengths = points.slice(0, -1).map((point, index) =>
    Math.hypot(points[index + 1].x - point.x, points[index + 1].y - point.y)
  );
  let totalLength = 0;
  segmentLengths.forEach((length) => {
    totalLength += length;
  });

  const segments = points.slice(0, -1).map((point, index) => {
    const lengthShare = totalLength > 0 ? segmentLengths[index] / totalLength : 1 / (points.length - 1);
    const durationMs = Math.max(
      40,
      TRANSITION_ANIMATION_MS * lengthShare * getSpeedDurationMultiplier(segmentSpeeds[index])
    );

    return {
      startX: point.x,
      startY: point.y,
      endX: points[index + 1].x,
      endY: points[index + 1].y,
      durationMs
    };
  });

  return {
    segments,
    totalDurationMs: segments.reduce((total, segment) => total + segment.durationMs, 0),
    finalPoint: points.length ? points[points.length - 1] : null
  };
}

function getTimedTransitionState(path: TimedTransitionPath, elapsedMs: number) {
  if (!path.segments.length || !path.finalPoint) {
    return { point: path.finalPoint, isComplete: true };
  }

  let elapsedBeforeSegment = 0;

  for (const segment of path.segments) {
    const segmentEndTime = elapsedBeforeSegment + segment.durationMs;

    if (elapsedMs < segmentEndTime) {
      const progress = Math.min(1, Math.max(0, (elapsedMs - elapsedBeforeSegment) / segment.durationMs));
      return {
        point: {
          x: segment.startX + (segment.endX - segment.startX) * progress,
          y: segment.startY + (segment.endY - segment.startY) * progress
        },
        isComplete: false
      };
    }

    elapsedBeforeSegment = segmentEndTime;
  }

  return { point: path.finalPoint, isComplete: elapsedMs >= path.totalDurationMs };
}

function easeInOutCubic(progress: number) {
  return progress < 0.5 ? 4 * progress * progress * progress : 1 - Math.pow(-2 * progress + 2, 3) / 2;
}
