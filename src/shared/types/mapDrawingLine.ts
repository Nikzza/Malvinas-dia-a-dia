export type MapDrawingLineStyle = "solid" | "dashed" | "dotted";

export const MAP_DRAWING_LINE_COLORS = ["red", "yellow", "blue", "white", "black"] as const;

export type MapDrawingLineColor = (typeof MAP_DRAWING_LINE_COLORS)[number];

export function isMapDrawingLineColor(value: unknown): value is MapDrawingLineColor {
  return typeof value === "string" && (MAP_DRAWING_LINE_COLORS as readonly string[]).includes(value);
}

export type MapDrawingLine = {
  id: number;
  dayId: number;
  style: MapDrawingLineStyle;
  color: MapDrawingLineColor;
  pointsPct: number[];
  createdAt: string;
  updatedAt: string;
};
