import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import type { BootstrapData } from "../shared/types/ipc";
import type { MapDrawingLine, MapDrawingLineStyle } from "../shared/types/mapDrawingLine";
import type { DayIcon } from "../shared/types/dayIcon";
import type { MapIconPlacement, MapPinKind } from "../shared/types/mapIconPlacement";
import type { MapIconTransition } from "../shared/types/mapIconTransition";
import type { MapDrawingTool } from "./components/layout/MapDrawingLayer";
import { MapCanvas } from "./components/layout/MapCanvas";
import { TopTimeline } from "./components/layout/TopTimeline";

type AppMode = "profiles" | "profile-admin" | "menu" | "edit" | "view";
type MediaContentType = "imagen" | "video";
type PasswordGateMode = "verify" | "create" | "change";
const TRANSITION_ANIMATION_MS = 1800;
const DAY_LAYER_TRANSITION_MS = 900;
const PROFILES_STORAGE_KEY = "malvinas_profiles";
const ACTIVE_PROFILE_STORAGE_KEY = "malvinas_active_profile";
const EDIT_PASSWORD_STORAGE_KEY = "malvinas_edit_password";
const DEFAULT_PROFILE_COLOR = "#163A61";
const PROFILE_BORDER_GOLD = "#DBB060";
const PROFILE_BORDER_BLUE = "#81D2F7";

type TransitionEditingState = {
  transitionId: number | null;
  sourcePlacementId: number;
  targetPlacementId: number;
  waypointPointsPct: number[];
};

type DayLayerSnapshot = {
  drawingLines: MapDrawingLine[];
  placements: MapIconPlacement[];
};

type MalvinasProfile = {
  id: string;
  name: string;
  avatar: string | null;
  avatarInitials: string;
  avatarColor: string;
  createdAt: string;
  mapState: {
    startDay: number;
    startCenter: [number, number];
    startZoom: number;
  };
  icons: Array<{
    id: string;
    name: string;
    imageUrl: string;
    type: "terrestre" | "naval";
    borderColor: string;
  }>;
  drawings: Record<string, unknown[]>;
  mapPins: Record<string, unknown[]>;
  drawingStyle: {
    traceType: "trazo-libre" | "a-b-recta" | "a-b-curva";
    lineStyle: "lisa" | "punteada" | "puntos";
    color: string;
  };
};

type ProfileFormState = {
  name: string;
  avatar: string | null;
  avatarColor: string;
  startDay: number;
  startLng: string;
  startLat: string;
  startZoom: string;
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
    avatarColor: DEFAULT_PROFILE_COLOR,
    createdAt: new Date().toISOString(),
    mapState: {
      startDay: 1,
      startCenter: [-59.5, -51.7],
      startZoom: 6.25
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
    avatar: null,
    avatarColor: PROFILE_BORDER_GOLD,
    startDay: 1,
    startLng: "-59.5",
    startLat: "-51.7",
    startZoom: "6.25"
  };
}

function getProfileForm(profile: MalvinasProfile): ProfileFormState {
  return {
    name: profile.name,
    avatar: profile.avatar,
    avatarColor: profile.avatarColor,
    startDay: profile.mapState.startDay,
    startLng: String(profile.mapState.startCenter[0]),
    startLat: String(profile.mapState.startCenter[1]),
    startZoom: String(profile.mapState.startZoom)
  };
}

function profileFromForm(form: ProfileFormState, existingProfile?: MalvinasProfile): MalvinasProfile {
  const name = form.name.trim() || "Visitante";
  const startLng = Number(form.startLng);
  const startLat = Number(form.startLat);
  const startZoom = Number(form.startZoom);

  return {
    ...(existingProfile ?? createDefaultProfile(name)),
    name,
    avatar: form.avatar,
    avatarInitials: getProfileInitials(name),
    avatarColor: form.avatarColor,
    mapState: {
      startDay: Math.min(Math.max(Number(form.startDay) || 1, 1), 9),
      startCenter: [
        Number.isFinite(startLng) ? startLng : -59.5,
        Number.isFinite(startLat) ? startLat : -51.7
      ],
      startZoom: Number.isFinite(startZoom) ? startZoom : 6.25
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
  const [passwordGateMode, setPasswordGateMode] = useState<PasswordGateMode | null>(null);
  const [passwordValue, setPasswordValue] = useState("");
  const [newPasswordValue, setNewPasswordValue] = useState("");
  const [confirmPasswordValue, setConfirmPasswordValue] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [shouldShakePassword, setShouldShakePassword] = useState(false);
  const [activeDayId, setActiveDayId] = useState<number | null>(null);
  const [isSavingDay, setIsSavingDay] = useState(false);
  const [isIconsPanelOpen, setIsIconsPanelOpen] = useState(false);
  const [dragLibraryIcon, setDragLibraryIcon] = useState<DayIcon | null>(null);
  const [editingPlacement, setEditingPlacement] = useState<MapIconPlacement | null>(null);
  const [contentType, setContentType] = useState<"texto" | "imagen" | "video">("texto");
  const [contentPinKind, setContentPinKind] = useState<MapPinKind>("land");
  const [contentTitle, setContentTitle] = useState("");
  const [contentText, setContentText] = useState("");
  const [contentResourcePath, setContentResourcePath] = useState<string | null>(null);
  const [isDrawingPanelOpen, setIsDrawingPanelOpen] = useState(false);
  const [isDrawingEnabled, setIsDrawingEnabled] = useState(false);
  const [drawingLineStyle, setDrawingLineStyle] = useState<MapDrawingLineStyle>("solid");
  const [drawingTool, setDrawingTool] = useState<MapDrawingTool>("freehand");
  const [mode, setMode] = useState<AppMode>("profiles");
  const [selectedPlacement, setSelectedPlacement] = useState<MapIconPlacement | null>(null);
  const [transitionEditing, setTransitionEditing] = useState<TransitionEditingState | null>(null);
  const [animatedPlacementPositions, setAnimatedPlacementPositions] = useState<Record<number, { x: number; y: number }>>({});
  const [isDayTransitionRunning, setIsDayTransitionRunning] = useState(false);
  const [dayLayerSnapshot, setDayLayerSnapshot] = useState<DayLayerSnapshot | null>(null);
  const [dayLayerTransitionProgress, setDayLayerTransitionProgress] = useState(1);
  const drawingPanelRef = useRef<HTMLElement | null>(null);
  const [drawingPanelHeight, setDrawingPanelHeight] = useState(0);

  useEffect(() => {
    if (!canUseLocalStorage()) {
      const defaultProfile = createDefaultProfile();
      setProfiles([defaultProfile]);
      setActiveProfileId(defaultProfile.id);
      setStorageWarning("Activa el almacenamiento local para guardar los perfiles");
      setMode("profiles");
      return;
    }

    try {
      const storedProfiles = window.localStorage.getItem(PROFILES_STORAGE_KEY);
      const parsedProfiles = storedProfiles ? (JSON.parse(storedProfiles) as MalvinasProfile[]) : [];
      const nextProfiles = Array.isArray(parsedProfiles) && parsedProfiles.length ? parsedProfiles : [createDefaultProfile()];
      const storedActiveProfileId = window.localStorage.getItem(ACTIVE_PROFILE_STORAGE_KEY);
      const nextActiveProfileId =
        storedActiveProfileId && nextProfiles.some((profile) => profile.id === storedActiveProfileId)
          ? storedActiveProfileId
          : null;

      if (!storedProfiles || !Array.isArray(parsedProfiles) || !parsedProfiles.length) {
        window.localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify(nextProfiles));
      }

      setProfiles(nextProfiles);
      setActiveProfileId(nextActiveProfileId);
      setMode(nextActiveProfileId ? "view" : "profiles");
    } catch {
      const defaultProfile = createDefaultProfile();
      setProfiles([defaultProfile]);
      setActiveProfileId(defaultProfile.id);
      setStorageWarning("Activa el almacenamiento local para guardar los perfiles");
      setMode("profiles");
    }
  }, []);

  useEffect(() => {
    window.mapaMalvinas
      .getBootstrapData()
      .then(setData)
      .catch((cause: unknown) => {
        const message = cause instanceof Error ? cause.message : "No se pudo iniciar la aplicacion.";
        setError(message);
      });
  }, []);

  useEffect(() => {
    if (!data?.days.length) {
      return;
    }

    const activeProfile = profiles.find((profile) => profile.id === activeProfileId) ?? null;
    const preferredDay = activeProfile ? data.days[activeProfile.mapState.startDay - 1] : null;
    setActiveDayId((current) => current ?? preferredDay?.id ?? data.days[0].id);
  }, [activeProfileId, data, profiles]);

  const activeDay = data?.days.find((day) => day.id === activeDayId) ?? null;
  const days = data?.days ?? [];
  const activeProfile = profiles.find((profile) => profile.id === activeProfileId) ?? null;
  const iconsLibrary = Object.values(data?.iconsByDay ?? {}).flat();
  const activeDrawingLines = activeDayId ? data?.mapDrawingLinesByDay[activeDayId] ?? [] : [];
  const activeMapPlacements = activeDayId ? data?.mapPlacementsByDay[activeDayId] ?? [] : [];
  const allMapPlacements = useMemo(() => Object.values(data?.mapPlacementsByDay ?? {}).flat(), [data?.mapPlacementsByDay]);
  const placementById = useMemo(() => new Map(allMapPlacements.map((placement) => [placement.id, placement] as const)), [allMapPlacements]);
  const transitions = data?.mapIconTransitions ?? [];
  const isEditMode = mode === "edit";
  const isViewMode = mode === "view";
  const isReadOnlyMode = isViewMode;
  const activeDayIndex = days.findIndex((day) => day.id === activeDayId);
  const activeDayNumber = activeDayIndex >= 0 ? activeDayIndex + 1 : 0;
  const previousActiveDayIdRef = useRef<number | null>(null);
  const transitionSourcePlacement = transitionEditing ? placementById.get(transitionEditing.sourcePlacementId) ?? null : null;
  const transitionTargetPlacement = transitionEditing ? placementById.get(transitionEditing.targetPlacementId) ?? null : null;
  const featuredPlacement =
    activeMapPlacements.find((placement) => placement.tituloContenido?.trim() || placement.textoDescriptivo?.trim()) ??
    activeMapPlacements[0] ??
    null;
  const timelineItems = activeMapPlacements.slice(0, 3);

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
    setIsDrawingEnabled(false);
    setTransitionEditing(null);
    setAnimatedPlacementPositions({});
  }, [activeDayId, mode]);

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

    let animationFrame = 0;
    const startTime = performance.now();

    const runFrame = (now: number) => {
      const progress = Math.min(1, (now - startTime) / TRANSITION_ANIMATION_MS);
      const nextPositions: Record<number, { x: number; y: number }> = {};

      for (const transition of relevantTransitions) {
        const placementId = direction > 0 ? transition.targetPlacementId : transition.sourcePlacementId;
        const pointsPct = direction > 0 ? transition.pointsPct : reversePointsPct(transition.pointsPct);
        const point = getPointAlongPolyline(pointsPct, progress);

        if (point) {
          nextPositions[placementId] = point;
        }
      }

      setAnimatedPlacementPositions(nextPositions);

      if (progress < 1) {
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

  async function handleCreateDay(label: string) {
    setIsSavingDay(true);
    setError(null);

    try {
      const nextData = await window.mapaMalvinas.createDay({
        etiquetaFecha: label
      });
      setData(nextData);
      setActiveDayId(nextData.days[nextData.days.length - 1]?.id ?? null);
    } catch (cause: unknown) {
      const message = cause instanceof Error ? cause.message : "No se pudo crear el dia.";
      setError(message);
    } finally {
      setIsSavingDay(false);
    }
  }

  async function handleAddDay(label: string) {
    await handleCreateDay(label);
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

  async function handleUpdateDay(dayId: number, label: string) {
    setError(null);

    try {
      const nextData = await window.mapaMalvinas.updateDay({
        id: dayId,
        etiquetaFecha: label
      });
      setData(nextData);
    } catch (cause: unknown) {
      const message = cause instanceof Error ? cause.message : "No se pudo editar el dia.";
      setError(message);
    }
  }

  async function handleAddIcon() {
    if (!activeDayId) {
      setError("Primero selecciona un dia para agregar iconos.");
      return;
    }

    const selectedPath = await window.mapaMalvinas.selectIconPng();

    if (!selectedPath) {
      return;
    }

    const fileName = selectedPath.split("\\").pop() ?? "Icono";

    try {
      const nextData = await window.mapaMalvinas.createDayIcon({
        dayId: activeDayId,
        nombre: fileName.replace(/\.png$/i, ""),
        rutaIconoLocal: selectedPath
      });
      setData(nextData);
      setError(null);
      setIsDrawingPanelOpen(false);
      setIsIconsPanelOpen(true);
    } catch (cause: unknown) {
      const message = cause instanceof Error ? cause.message : "No se pudo guardar el icono.";
      setError(message);
    }
  }

  function handleToggleDrawingPanel() {
    setIsDrawingPanelOpen((current) => !current);
  }

  function handleToggleIconsPanel() {
    setIsIconsPanelOpen((current) => !current);
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
    setContentPinKind(placement.pinKind ?? (isNavalPlacement(placement) ? "naval" : "land"));
    setContentType((placement.tipoContenido as "texto" | "imagen" | "video" | null) ?? "texto");
    setContentTitle(placement.tituloContenido ?? "");
    setContentText(placement.textoDescriptivo ?? "");
    setContentResourcePath(placement.rutaRecursoLocal ?? null);
  }

  async function handlePickContentResource() {
    if (contentType === "texto") {
      return;
    }

    const selectedPath = await window.mapaMalvinas.selectContentResource({
      tipoContenido: contentType
    });

    if (!selectedPath) {
      return;
    }

    setContentResourcePath(selectedPath);
  }

  async function handleSavePlacementContent() {
    if (!editingPlacement) {
      return;
    }

    try {
      const nextData = await window.mapaMalvinas.updateMapIconPlacementContent({
        placementId: editingPlacement.id,
        pinKind: contentPinKind,
        tipoContenido: contentType,
        tituloContenido: contentTitle.trim() || null,
        textoDescriptivo: contentText || null,
        rutaRecursoLocal: contentType === "texto" ? null : contentResourcePath
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
      placements: activeMapPlacements
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
        (placement) => placement.libraryIconId === sourcePlacement.libraryIconId
      ) ?? null;

    if (!targetPlacement) {
      setError("No existe el mismo icono en el dia siguiente para crear la transicion.");
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
      waypointPointsPct: stripTransitionEndpoints(existingTransition?.pointsPct ?? [])
    });
    setIsDrawingPanelOpen(false);
    setIsDrawingEnabled(false);
    setError(null);
  }

  function handleAddTransitionWaypoint(posXPct: number, posYPct: number) {
    setTransitionEditing((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        waypointPointsPct: [...current.waypointPointsPct, posXPct, posYPct]
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

      return {
        ...current,
        waypointPointsPct: current.waypointPointsPct.slice(0, -2)
      };
    });
  }

  function handleClearTransitionWaypoint() {
    setTransitionEditing((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        waypointPointsPct: []
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
        pointsPct: fullPointsPct
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

  async function handleCreateDrawingLine(pointsPct: number[], style: MapDrawingLineStyle) {
    if (!activeDayId) {
      setError("Primero selecciona un dia.");
      return;
    }

    try {
      const nextData = await window.mapaMalvinas.createMapDrawingLine({
        dayId: activeDayId,
        style,
        pointsPct
      });
      setData(nextData);
      setError(null);
    } catch (cause: unknown) {
      const message = cause instanceof Error ? cause.message : "No se pudo guardar la linea.";
      setError(message);
    }
  }

  async function handleDeleteLastDrawingLine() {
    const lastLine = activeDrawingLines[activeDrawingLines.length - 1];

    if (!lastLine) {
      return;
    }

    try {
      const nextData = await window.mapaMalvinas.deleteMapDrawingLine({ lineId: lastLine.id });
      setData(nextData);
      setError(null);
    } catch (cause: unknown) {
      const message = cause instanceof Error ? cause.message : "No se pudo borrar la ultima linea.";
      setError(message);
    }
  }

  function handleChangeContentType(nextType: "texto" | "imagen" | "video") {
    setContentType(nextType);

    if (nextType === "texto") {
      setContentResourcePath(null);
      return;
    }

    if (!contentResourcePath || isAllowedResource(contentResourcePath, nextType)) {
      return;
    }

    setContentResourcePath(null);
  }

  function handleOpenPlacementViewer(placement: MapIconPlacement) {
    const hasText = Boolean(placement.textoDescriptivo?.trim());
    const hasResource = Boolean(placement.recursoDataUrl);

    if (!hasText && !hasResource) {
      return;
    }

    setSelectedPlacement(placement);
  }

  function persistProfiles(nextProfiles: MalvinasProfile[]) {
    setProfiles(nextProfiles);

    if (!canUseLocalStorage()) {
      setStorageWarning("Activa el almacenamiento local para guardar los perfiles");
      return;
    }

    window.localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify(nextProfiles));
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

  function handleSaveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!profileForm.name.trim()) {
      setProfileFormError("Ingresa un nombre para el perfil.");
      return;
    }

    if (profileModalMode === "edit" && editingProfileId) {
      const nextProfiles = profiles.map((profile) =>
        profile.id === editingProfileId ? profileFromForm(profileForm, profile) : profile
      );
      persistProfiles(nextProfiles);
      handleCloseProfileModal();
      return;
    }

    const nextProfile = profileFromForm(profileForm);
    const nextProfiles = [...profiles, nextProfile];
    persistProfiles(nextProfiles);
    persistActiveProfile(nextProfile.id);
    handleCloseProfileModal();
    setMode("menu");
  }

  function handleDeleteEditingProfile() {
    if (!editingProfileId) {
      return;
    }

    const confirmed = window.confirm("Eliminar este perfil? Se perderan todos sus trazados e iconos.");

    if (!confirmed) {
      return;
    }

    const remainingProfiles = profiles.filter((profile) => profile.id !== editingProfileId);
    const nextProfiles = remainingProfiles.length ? remainingProfiles : [createDefaultProfile()];
    const nextActiveProfileId =
      activeProfileId && nextProfiles.some((profile) => profile.id === activeProfileId)
        ? activeProfileId
        : nextProfiles[0]?.id ?? null;

    persistProfiles(nextProfiles);
    persistActiveProfile(nextActiveProfileId);
    handleCloseProfileModal();
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
    const hasPassword = Boolean(canUseLocalStorage() && window.localStorage.getItem(EDIT_PASSWORD_STORAGE_KEY));
    setPasswordGateMode(hasPassword ? "verify" : "create");
    setPasswordValue("");
    setNewPasswordValue("");
    setConfirmPasswordValue("");
    setPasswordError(null);
    setShouldShakePassword(false);
  }

  function handleOpenChangePassword() {
    setPasswordGateMode("change");
    setPasswordValue("");
    setNewPasswordValue("");
    setConfirmPasswordValue("");
    setPasswordError(null);
    setShouldShakePassword(false);
  }

  function handleClosePasswordGate() {
    setPasswordGateMode(null);
    setPasswordValue("");
    setNewPasswordValue("");
    setConfirmPasswordValue("");
    setPasswordError(null);
    setShouldShakePassword(false);
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

    const storedPassword = window.localStorage.getItem(EDIT_PASSWORD_STORAGE_KEY);

    if (passwordGateMode === "verify") {
      if (passwordValue === storedPassword) {
        setMode("edit");
        handleClosePasswordGate();
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

      window.localStorage.setItem(EDIT_PASSWORD_STORAGE_KEY, newPasswordValue);
      setMode("edit");
      handleClosePasswordGate();
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

      window.localStorage.setItem(EDIT_PASSWORD_STORAGE_KEY, newPasswordValue);
      handleClosePasswordGate();
    }
  }

  function handleReturnToProfiles() {
    setMode("profiles");
    setIsIconsPanelOpen(false);
    setIsDrawingPanelOpen(false);
    setIsDrawingEnabled(false);
    setEditingPlacement(null);
    setSelectedPlacement(null);
    setTransitionEditing(null);
    handleClosePasswordGate();
  }

  function renderProfileAvatar(profile: MalvinasProfile, className = "profile-avatar") {
    const shouldShowProfileBorder = className.includes("active-profile-avatar");

    return (
      <span
        className={className}
        style={{
          backgroundColor: profile.avatar ? undefined : profile.avatarColor,
          borderColor: shouldShowProfileBorder ? profile.avatarColor : undefined
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
              <span style={{ backgroundColor: DEFAULT_PROFILE_COLOR }}>{getProfileInitials(profileForm.name)}</span>
            )}
          </div>

          <label className="profile-field">
            <span>Nombre del perfil</span>
            <input
              onChange={(event) => setProfileForm((current) => ({ ...current, name: event.target.value }))}
              placeholder="Nombre del perfil"
              type="text"
              value={profileForm.name}
            />
          </label>

          <label className="profile-file-button">
            Cambiar foto
            <input accept="image/png,image/jpeg,image/webp" onChange={handleAvatarFileChange} type="file" />
          </label>

          <label className="profile-field">
            <span>Dia de inicio</span>
            <input
              max={9}
              min={1}
              onChange={(event) =>
                setProfileForm((current) => ({ ...current, startDay: Number(event.target.value) || 1 }))
              }
              type="number"
              value={profileForm.startDay}
            />
          </label>

          <div className="profile-field-grid">
            <label className="profile-field">
              <span>Longitud</span>
              <input
                onChange={(event) => setProfileForm((current) => ({ ...current, startLng: event.target.value }))}
                type="number"
                value={profileForm.startLng}
              />
            </label>
            <label className="profile-field">
              <span>Latitud</span>
              <input
                onChange={(event) => setProfileForm((current) => ({ ...current, startLat: event.target.value }))}
                type="number"
                value={profileForm.startLat}
              />
            </label>
          </div>

          <label className="profile-field">
            <span>Zoom inicial</span>
            <input
              onChange={(event) => setProfileForm((current) => ({ ...current, startZoom: event.target.value }))}
              step="0.1"
              type="number"
              value={profileForm.startZoom}
            />
          </label>

          <div className="profile-color-row">
            <span>Color de borde</span>
            {[PROFILE_BORDER_GOLD, PROFILE_BORDER_BLUE].map((color) => (
              <button
                key={color}
                aria-label={`Usar color ${color}`}
                className={profileForm.avatarColor === color ? "profile-color-swatch active" : "profile-color-swatch"}
                onClick={() => setProfileForm((current) => ({ ...current, avatarColor: color }))}
                style={{ backgroundColor: color }}
                type="button"
              />
            ))}
          </div>

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

    return (
      <section className="password-gate-modal" onClick={handleClosePasswordGate}>
        <form className="password-gate-card restricted" onClick={(event) => event.stopPropagation()} onSubmit={handleSubmitPasswordGate}>
          <span className="menu-corner top-left" />
          <span className="menu-corner top-right" />
          <span className="menu-corner bottom-left" />
          <span className="menu-corner bottom-right" />
          <div className="password-gate-eyebrow">Acceso restringido</div>
          <h2>{isChange ? "Cambiar contrasena" : "Modo Edicion"}</h2>
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

          <button className="manage-profiles-button" onClick={() => setMode("profile-admin")} type="button">
            Administrar perfiles
          </button>
        </section>

        {storageWarning ? <div className="error-toast">{storageWarning}</div> : null}
        {renderProfileModal()}
      </main>
    );
  }

  if (mode === "profile-admin") {
    return (
      <main className="profile-shell">
        <button className="profile-back-button" onClick={() => setMode("profiles")} type="button">
          &lt;
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

          <button className="manage-profiles-button" onClick={handleOpenChangePassword} type="button">
            Cambiar contrasena de edicion
          </button>
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
        <button className="profiles-return-button" onClick={handleReturnToProfiles} type="button">
          Perfiles
        </button>
        <div className="menu-institutional">Memorial Heroes de Malvinas</div>
        <section className="menu-card">
          <span className="menu-corner top-left" />
          <span className="menu-corner top-right" />
          <span className="menu-corner bottom-left" />
          <span className="menu-corner bottom-right" />
          <div className="menu-eyebrow">MUSEO MALVINAS &middot; AYAS</div>
          <h1>Malvinas<br />Dia a Dia</h1>
          <div className="menu-divider" />
          <p>{activeProfile ? `Perfil activo: ${activeProfile.name}` : "Selecciona el modo de ingreso"}</p>

          <div className="menu-actions">
            <button className="menu-button primary" onClick={() => setMode("view")} type="button">
              Modo Visualizacion
            </button>
            <button className="menu-button secondary" onClick={handleOpenEditPassword} type="button">
              Modo Edicion
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
        <button className="profiles-return-button map" onClick={handleReturnToProfiles} type="button">
          Perfiles
        </button>

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
        isEditable={isEditMode}
        isSavingDay={isSavingDay}
        onAddDay={handleAddDay}
        onDeleteDay={handleDeleteDay}
        onSelectDay={handleSelectDay}
        onUpdateDay={handleUpdateDay}
      />
      <div className="topbar-actions">
        {isEditMode ? (
          <button
            className="topbar-button ghost"
            onClick={() => {
              setMode("view");
              setIsIconsPanelOpen(false);
              setIsDrawingPanelOpen(false);
              setIsDrawingEnabled(false);
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
            setIsDrawingEnabled(false);
            setEditingPlacement(null);
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
          drawingLineStyle={drawingLineStyle}
          drawingTool={drawingTool}
          dragLibraryIcon={isEditMode ? dragLibraryIcon : null}
          isDrawingEnabled={isDrawingEnabled}
          isEditable={isEditMode}
          isTransitionEditing={Boolean(transitionEditing)}
          onActivatePlacement={isReadOnlyMode ? handleOpenPlacementViewer : undefined}
          onAddTransitionWaypoint={handleAddTransitionWaypoint}
          onCreateDrawingLine={handleCreateDrawingLine}
          onCreatePlacement={handleCreatePlacement}
          onDeletePlacement={handleDeletePlacement}
          onEditPlacement={handleOpenPlacementEditor}
          onEditTransition={handleStartTransitionEdit}
          onMovePlacement={handleMovePlacement}
          onMoveTransitionWaypoint={handleMoveTransitionWaypoint}
          placements={activeMapPlacements}
          previousDrawingLines={dayLayerSnapshot?.drawingLines ?? []}
          previousPlacements={dayLayerSnapshot?.placements ?? []}
          transitionProgress={dayLayerTransitionProgress}
          transitionEditorSourcePlacement={transitionSourcePlacement}
          transitionEditorTargetPlacement={transitionTargetPlacement}
          transitionWaypointPointsPct={transitionEditing?.waypointPointsPct ?? []}
        />
      </div>

      <section className="date-chip">
        <span>{isEditMode ? `Modo Edicion - Dia ${activeDayNumber || "-"}` : `Dia ${activeDayNumber || "-"}`}</span>
        <strong>{activeDay?.etiquetaFecha ?? "Sin dia activo"}</strong>
      </section>

      {isViewMode ? (
        <aside className="event-info-stack">
          <section className="event-info-panel">
            <div className="event-eyebrow">Evento del dia</div>
            <h2>{featuredPlacement?.tituloContenido?.trim() || featuredPlacement?.nombreIcono || activeDay?.etiquetaFecha || "Mapa historico"}</h2>
            <p>
              {featuredPlacement?.textoDescriptivo?.trim() ||
                "Selecciona un punto del mapa para consultar el material historico asociado a esta jornada."}
            </p>
            <div className="event-divider" />
            <footer>Fuente &middot; Archivo MMAAS</footer>
          </section>

          <section className="event-timeline-panel">
            <header>Cronologia &middot; Dia {activeDayNumber || "-"}</header>
            <div className="event-timeline-list">
              {(timelineItems.length ? timelineItems : [featuredPlacement]).map((placement, index) =>
                placement ? (
                  <div key={placement.id} className="event-timeline-item">
                    <span className={isNavalPlacement(placement) ? "timeline-dot naval" : "timeline-dot land"} />
                    <div>
                      <time>{["08:00 hs", "11:30 hs", "18:45 hs"][index] ?? "20:00 hs"}</time>
                      <p>{placement.tituloContenido?.trim() || placement.nombreIcono || "Registro historico"}</p>
                    </div>
                  </div>
                ) : (
                  <div key="empty-timeline" className="event-timeline-item">
                    <span className="timeline-dot land" />
                    <div>
                      <time>08:00 hs</time>
                      <p>Sin registros cargados para este dia</p>
                    </div>
                  </div>
                )
              )}
            </div>
          </section>
        </aside>
      ) : null}

      <div className="map-brand-badge">
        <strong>Museo Malvinas</strong>
        <span>Mapa historico &middot; 1982</span>
      </div>

      {isViewMode ? (
        <div className="map-legend">
          <strong>Leyenda</strong>
          <span><i className="legend-avatar land" aria-hidden="true" /> Posicion terrestre / AR</span>
          <span><i className="legend-avatar naval" aria-hidden="true" /> Posicion naval / UK</span>
        </div>
      ) : null}

      {isEditMode && editingPlacement ? (
        <section className="content-editor-modal">
          <div className="content-editor-card">
            <div className="content-editor-header">
              <strong>Contenido del icono</strong>
              <button className="content-editor-close" onClick={() => setEditingPlacement(null)} type="button">
                x
              </button>
            </div>

            <div className="content-type-row">
              <button
                className={contentType === "texto" ? "content-type-button active" : "content-type-button"}
                onClick={() => handleChangeContentType("texto")}
                type="button"
              >
                Texto
              </button>
              <button
                className={contentType === "imagen" ? "content-type-button active" : "content-type-button"}
                onClick={() => handleChangeContentType("imagen")}
                type="button"
              >
                Imagen
              </button>
              <button
                className={contentType === "video" ? "content-type-button active" : "content-type-button"}
                onClick={() => handleChangeContentType("video")}
                type="button"
              >
                Video
              </button>
            </div>

            <div className="content-type-row pin-kind-row">
              <button
                className={contentPinKind === "land" ? "content-type-button active" : "content-type-button"}
                onClick={() => setContentPinKind("land")}
                type="button"
              >
                Terrestre / AR
              </button>
              <button
                className={contentPinKind === "naval" ? "content-type-button active" : "content-type-button"}
                onClick={() => setContentPinKind("naval")}
                type="button"
              >
                Naval / UK
              </button>
            </div>

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

            {contentType !== "texto" ? (
              <div className="content-resource-row">
                <button className="content-resource-button" onClick={() => void handlePickContentResource()} type="button">
                  Cargar {contentType}
                </button>
                <span className="content-resource-name" title={contentResourcePath ?? ""}>
                  {contentResourcePath ? contentResourcePath.split("\\").pop() : "Sin archivo"}
                </span>
              </div>
            ) : null}

            <button className="content-save-button" onClick={() => void handleSavePlacementContent()} type="button">
              Guardar
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

      {isEditMode && isDrawingPanelOpen ? (
        <aside ref={drawingPanelRef} className="drawing-panel">
          <div className="drawing-panel-header">
            <strong>DIBUJO</strong>
            <button className="drawing-close" onClick={() => setIsDrawingPanelOpen(false)} type="button">
              x
            </button>
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
            onClick={() => setIsDrawingEnabled((current) => !current)}
            type="button"
          >
            {isDrawingEnabled ? "Salir del dibujo" : "Empezar a dibujar"}
          </button>

          <button
            className="drawing-action-button secondary"
            disabled={!activeDrawingLines.length}
            onClick={() => void handleDeleteLastDrawingLine()}
            type="button"
          >
            Deshacer ultima
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
            Puntos intermedios: {transitionEditing.waypointPointsPct.length / 2}
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
        </>
      ) : null}

      {isReadOnlyMode && !activeDay ? <div className="view-empty">No hay dias creados para visualizar.</div> : null}

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

            <div className="content-viewer-body">
              {selectedPlacement.tipoContenido === "video" && selectedPlacement.recursoDataUrl ? (
                <div className="content-viewer-media-frame">
                  <video className="content-viewer-media" controls src={selectedPlacement.recursoDataUrl} />
                </div>
              ) : null}

              {selectedPlacement.tipoContenido === "imagen" && selectedPlacement.recursoDataUrl ? (
                <figure className="content-viewer-media-frame">
                  <img
                    alt={selectedPlacement.nombreIcono ?? "Imagen del contenido"}
                    className="content-viewer-media"
                    src={selectedPlacement.recursoDataUrl}
                  />
                </figure>
              ) : null}

              {selectedPlacement.tipoContenido === "texto" || !selectedPlacement.recursoDataUrl ? (
                <div className="content-viewer-text-only" />
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

const IMAGE_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".bmp",
  ".webp",
  ".svg",
  ".avif",
  ".tif",
  ".tiff",
  ".ico"
]);

const VIDEO_EXTENSIONS = new Set([
  ".mp4",
  ".webm",
  ".mov",
  ".m4v",
  ".avi",
  ".mkv",
  ".wmv",
  ".flv",
  ".mpeg",
  ".mpg",
  ".ts",
  ".mts",
  ".m2ts",
  ".3gp",
  ".ogv"
]);

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

function reversePointsPct(pointsPct: number[]) {
  const reversed: number[] = [];

  for (let index = pointsPct.length - 2; index >= 0; index -= 2) {
    reversed.push(pointsPct[index], pointsPct[index + 1]);
  }

  return reversed;
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

function getPointAlongPolyline(pointsPct: number[], progress: number) {
  if (pointsPct.length < 4) {
    return null;
  }

  const segments: Array<{ startX: number; startY: number; endX: number; endY: number; length: number }> = [];
  let totalLength = 0;

  for (let index = 0; index < pointsPct.length - 2; index += 2) {
    const startX = pointsPct[index];
    const startY = pointsPct[index + 1];
    const endX = pointsPct[index + 2];
    const endY = pointsPct[index + 3];
    const length = Math.hypot(endX - startX, endY - startY);

    segments.push({ startX, startY, endX, endY, length });
    totalLength += length;
  }

  if (!segments.length || totalLength === 0) {
    return {
      x: pointsPct[0],
      y: pointsPct[1]
    };
  }

  const targetLength = totalLength * progress;
  let traversed = 0;

  for (const segment of segments) {
    const nextTraversed = traversed + segment.length;

    if (targetLength <= nextTraversed) {
      const localProgress = segment.length === 0 ? 0 : (targetLength - traversed) / segment.length;

      return {
        x: segment.startX + (segment.endX - segment.startX) * localProgress,
        y: segment.startY + (segment.endY - segment.startY) * localProgress
      };
    }

    traversed = nextTraversed;
  }

  return {
    x: pointsPct[pointsPct.length - 2],
    y: pointsPct[pointsPct.length - 1]
  };
}

function easeInOutCubic(progress: number) {
  return progress < 0.5 ? 4 * progress * progress * progress : 1 - Math.pow(-2 * progress + 2, 3) / 2;
}

function getFileExtension(filePath: string) {
  const normalizedPath = filePath.toLowerCase();
  const lastDotIndex = normalizedPath.lastIndexOf(".");

  if (lastDotIndex === -1) {
    return "";
  }

  return normalizedPath.slice(lastDotIndex);
}

function isAllowedResource(filePath: string, tipoContenido: MediaContentType) {
  const extension = getFileExtension(filePath);
  const allowedExtensions = tipoContenido === "imagen" ? IMAGE_EXTENSIONS : VIDEO_EXTENSIONS;
  return allowedExtensions.has(extension);
}

function isNavalPlacement(placement: MapIconPlacement) {
  if (placement.pinKind) {
    return placement.pinKind === "naval";
  }

  const text = `${placement.nombreIcono ?? ""} ${placement.tituloContenido ?? ""} ${placement.textoDescriptivo ?? ""}`.toLowerCase();
  return ["ara", "naval", "buque", "barco", "crucero", "submarino", "fragata"].some((keyword) => text.includes(keyword));
}
