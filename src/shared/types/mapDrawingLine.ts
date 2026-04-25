export type MapDrawingLineStyle = "solid" | "dashed" | "dotted";

export type MapDrawingLine = {
  id: number;
  dayId: number;
  style: MapDrawingLineStyle;
  pointsPct: number[];
  createdAt: string;
  updatedAt: string;
};
