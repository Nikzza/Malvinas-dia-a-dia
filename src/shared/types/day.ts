export type DayBackgroundMediaType = "imagen" | "video";

export type Day = {
  id: number;
  etiquetaFecha: string;
  esEventoDestacado: boolean;
  rutaImagenFondo: string | null;
  initialMapLongitude: number | null;
  initialMapLatitude: number | null;
  initialMapZoom: number | null;
  imagenFondoDataUrl?: string | null;
  fondoMediaDataUrl?: string | null;
  tipoFondoMedia?: DayBackgroundMediaType | null;
  orden: number;
  createdAt: string;
  updatedAt: string;
};
