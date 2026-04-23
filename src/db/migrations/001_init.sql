CREATE TABLE IF NOT EXISTS dias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  etiqueta_fecha TEXT NOT NULL,
  ruta_imagen_fondo TEXT,
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
  pos_x_pct REAL NOT NULL,
  pos_y_pct REAL NOT NULL,
  tipo_contenido TEXT,
  texto_descriptivo TEXT,
  ruta_recurso_local TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (id_dia) REFERENCES dias(id),
  FOREIGN KEY (id_icono_biblioteca) REFERENCES iconos_dia(id)
);
