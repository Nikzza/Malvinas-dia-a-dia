export const MAP_LABEL_STYLES = ["gray", "white", "lightblue", "red"] as const;

export type MapLabelStyle = (typeof MAP_LABEL_STYLES)[number];

export const MAP_LABEL_STYLE_NAMES: Record<MapLabelStyle, string> = {
  gray: "Gris",
  white: "Blanco",
  lightblue: "Celeste",
  red: "Rojo"
};

export function isMapLabelStyle(value: unknown): value is MapLabelStyle {
  return typeof value === "string" && (MAP_LABEL_STYLES as readonly string[]).includes(value);
}

export type MapLabel = {
  id: number;
  dayId: number;
  posXPct: number;
  posYPct: number;
  style: MapLabelStyle;
  text: string;
  createdAt: string;
  updatedAt: string;
};
