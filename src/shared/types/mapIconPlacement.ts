export type MapPinKind = "land" | "naval";

export type MapIconPlacement = {
  id: number;
  dayId: number;
  libraryIconId: number;
  posXPct: number;
  posYPct: number;
  pinKind?: MapPinKind;
  tipoContenido?: "texto" | "imagen" | "video" | null;
  tituloContenido?: string | null;
  textoDescriptivo?: string | null;
  rutaRecursoLocal?: string | null;
  recursoDataUrl?: string | null;
  createdAt: string;
  updatedAt: string;
  nombreIcono?: string;
  iconoDataUrl?: string | null;
};
