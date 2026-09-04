export type MapIconPlacementImage = {
  id: number;
  placementId: number;
  order: number;
  rutaImagenLocal: string;
  imagenDataUrl?: string | null;
  imagenEstado?: "empty" | "available" | "missing" | "unreadable";
  createdAt: string;
  updatedAt: string;
};

export type MapIconPlacement = {
  id: number;
  dayId: number;
  libraryIconId: number;
  trajectoryIdentifier: number;
  posXPct: number;
  posYPct: number;
  tituloContenido?: string | null;
  textoDescriptivo?: string | null;
  rutaImagenLocal?: string | null;
  rutaVideoLocal?: string | null;
  imagenes: MapIconPlacementImage[];
  imagenDataUrl?: string | null;
  videoDataUrl?: string | null;
  imagenEstado?: "empty" | "available" | "missing" | "unreadable";
  videoEstado?: "empty" | "available" | "missing" | "unreadable";
  createdAt: string;
  updatedAt: string;
  nombreIcono?: string;
  iconoDataUrl?: string | null;
};
