export type EventItem = {
  id: number;
  idDia: number;
  posXPct: number;
  posYPct: number;
  iconoTipo: string;
  tipoAccion: "texto" | "imagen" | "video";
  contenidoTexto: string | null;
  rutaRecursoLocal: string | null;
};
