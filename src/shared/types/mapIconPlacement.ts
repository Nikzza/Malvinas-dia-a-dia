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
  imagenDataUrl?: string | null;
  videoDataUrl?: string | null;
  createdAt: string;
  updatedAt: string;
  nombreIcono?: string;
  iconoDataUrl?: string | null;
};
