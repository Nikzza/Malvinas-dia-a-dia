export type MalvinasProfile = {
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
