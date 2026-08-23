CREATE TABLE IF NOT EXISTS dias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  perfil_id TEXT,
  etiqueta_fecha TEXT NOT NULL,
  es_evento_destacado INTEGER NOT NULL DEFAULT 0,
  ruta_imagen_fondo TEXT,
  vista_centro_lng REAL,
  vista_centro_lat REAL,
  vista_zoom REAL,
  vista_velocidad INTEGER NOT NULL DEFAULT 100,
  orden INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS eventos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  id_dia INTEGER NOT NULL,
  pos_x_pct REAL NOT NULL,
  pos_y_pct REAL NOT NULL,
  icono_tipo TEXT NOT NULL,
  tipo_accion TEXT NOT NULL,
  contenido_texto TEXT,
  ruta_recurso_local TEXT,
  titulo TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (id_dia) REFERENCES dias(id)
);

CREATE TABLE IF NOT EXISTS iconos_dia (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  id_dia INTEGER NOT NULL,
  nombre TEXT NOT NULL,
  ruta_icono_local TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (id_dia) REFERENCES dias(id)
);

CREATE TABLE IF NOT EXISTS iconos_mapa (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  id_dia INTEGER NOT NULL,
  id_icono_biblioteca INTEGER NOT NULL,
  identificador_trayectoria INTEGER,
  pos_x_pct REAL NOT NULL,
  pos_y_pct REAL NOT NULL,
  tipo_pin TEXT NOT NULL DEFAULT 'land',
  tipo_contenido TEXT,
  texto_descriptivo TEXT,
  ruta_recurso_local TEXT,
  ruta_imagen_local TEXT,
  ruta_video_local TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (id_dia) REFERENCES dias(id) ON DELETE CASCADE,
  FOREIGN KEY (id_icono_biblioteca) REFERENCES iconos_dia(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS lineas_mapa (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  id_dia INTEGER NOT NULL,
  estilo TEXT NOT NULL DEFAULT 'solid',
  color TEXT NOT NULL DEFAULT 'yellow',
  puntos_pct_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (id_dia) REFERENCES dias(id)
);

CREATE TABLE IF NOT EXISTS etiquetas_mapa (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  id_dia INTEGER NOT NULL,
  pos_x_pct REAL NOT NULL,
  pos_y_pct REAL NOT NULL,
  estilo TEXT NOT NULL DEFAULT 'gray',
  texto TEXT NOT NULL DEFAULT 'Gris',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (id_dia) REFERENCES dias(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS transiciones_iconos_mapa (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  id_colocacion_origen INTEGER NOT NULL,
  id_colocacion_destino INTEGER NOT NULL,
  puntos_pct_json TEXT NOT NULL,
  velocidades_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (id_colocacion_origen) REFERENCES iconos_mapa(id) ON DELETE CASCADE,
  FOREIGN KEY (id_colocacion_destino) REFERENCES iconos_mapa(id) ON DELETE CASCADE
);
