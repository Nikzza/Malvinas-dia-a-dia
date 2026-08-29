const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { app } = require("electron");

async function run() {
  const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), "malvinas-backup-test-"));
  const documentsDirectory = path.join(testRoot, "documents");
  fs.mkdirSync(documentsDirectory, { recursive: true });
  app.setPath("documents", documentsDirectory);
  await app.whenReady();

  const { getDatabase, initDatabase } = require("../dist-electron/db/connection.js");
  const { profileRepository } = require("../dist-electron/db/repositories/profileRepository.js");
  const { storeManagedBuffer } = require("../dist-electron/db/services/managedAssetService.js");
  const {
    exportProfilesBackup,
    importProfilesBackup
  } = require("../dist-electron/db/services/profileBackupService.js");

  initDatabase();
  const db = getDatabase();
  assert.equal(profileRepository.list().length, 0);
  const profile = {
    id: "profile-test",
    name: "Perfil de prueba",
    avatar: "data:image/png;base64,dGVzdA==",
    avatarInitials: "PP",
    avatarColor: "#DBB060",
    createdAt: "2026-01-01T00:00:00.000Z",
    mapState: { startDay: 1, startCenter: [-59.5236, -51.7963], startZoom: 6.25 },
    icons: [],
    drawings: {},
    mapPins: {},
    drawingStyle: { traceType: "trazo-libre", lineStyle: "lisa", color: "#DBB060" }
  };
  profileRepository.upsert(profile);

  const iconPath = await storeManagedBuffer(Buffer.from("icon-resource"), "icon", ".png");
  const imagePath = await storeManagedBuffer(Buffer.from("image-resource"), "image", ".png");
  const videoPath = await storeManagedBuffer(Buffer.from("video-resource"), "video", ".mp4");
  const dayId = Number(
    db.prepare(
      `INSERT INTO dias (
        perfil_id, etiqueta_fecha, es_evento_destacado, vista_centro_lng,
        vista_centro_lat, vista_zoom, vista_velocidad, orden
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(profile.id, "2 de abril", 1, -59.5, -51.7, 7, 65, 1).lastInsertRowid
  );
  const iconId = Number(
    db.prepare("INSERT INTO iconos_dia (id_dia, nombre, ruta_icono_local) VALUES (?, ?, ?)")
      .run(dayId, "Buque", iconPath).lastInsertRowid
  );
  const firstPlacementId = Number(
    db.prepare(
      `INSERT INTO iconos_mapa (
        id_dia, id_icono_biblioteca, identificador_trayectoria, pos_x_pct, pos_y_pct,
        titulo_contenido, texto_descriptivo, ruta_imagen_local, ruta_video_local
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(dayId, iconId, 7, 20, 30, "ARA Test", "Contenido", imagePath, videoPath).lastInsertRowid
  );
  const secondPlacementId = Number(
    db.prepare(
      `INSERT INTO iconos_mapa (
        id_dia, id_icono_biblioteca, identificador_trayectoria, pos_x_pct, pos_y_pct
      ) VALUES (?, ?, ?, ?, ?)`
    ).run(dayId, iconId, 7, 40, 50).lastInsertRowid
  );
  db.prepare(
    `INSERT INTO transiciones_iconos_mapa (
      id_colocacion_origen, id_colocacion_destino, puntos_pct_json, velocidades_json
    ) VALUES (?, ?, ?, ?)`
  ).run(firstPlacementId, secondPlacementId, "[20,30,40,50]", "[50]");
  db.prepare(
    "INSERT INTO lineas_mapa (id_dia, estilo, color, puntos_pct_json) VALUES (?, ?, ?, ?)"
  ).run(dayId, "solid", "yellow", "[1,2,3,4]");
  db.prepare(
    "INSERT INTO etiquetas_mapa (id_dia, pos_x_pct, pos_y_pct, estilo, texto) VALUES (?, ?, ?, ?, ?)"
  ).run(dayId, 60, 70, "gray", "Etiqueta");
  db.prepare(
    `INSERT INTO eventos (
      id_dia, pos_x_pct, pos_y_pct, icono_tipo, tipo_accion, contenido_texto, titulo
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(dayId, 10, 15, "info", "texto", "Evento", "Titulo");

  const packagePath = path.join(testRoot, "profiles.malvinas");
  const exported = await exportProfilesBackup(packagePath, "test");
  assert.equal(exported.profileCount, 1);
  assert.equal(fs.existsSync(packagePath), true);
  await exportProfilesBackup(packagePath, "test-replacement");

  const imported = await importProfilesBackup(packagePath);
  assert.equal(imported.importedCount, 1);
  assert.equal(imported.profiles.length, 2);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM dias").get().count, 2);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM iconos_dia").get().count, 2);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM iconos_mapa").get().count, 4);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM transiciones_iconos_mapa").get().count, 2);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM lineas_mapa").get().count, 2);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM etiquetas_mapa").get().count, 2);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM eventos").get().count, 2);
  assert.equal(db.pragma("integrity_check", { simple: true }), "ok");

  const importedPlacement = db
    .prepare(
      `SELECT ruta_imagen_local, ruta_video_local
       FROM iconos_mapa
       WHERE ruta_imagen_local IS NOT NULL AND ruta_video_local IS NOT NULL
       ORDER BY id DESC LIMIT 1`
    )
    .get();
  const { resolveStoredResourcePath } = require("../dist-electron/db/services/managedAssetService.js");
  assert.equal(fs.existsSync(resolveStoredResourcePath(importedPlacement.ruta_imagen_local)), true);
  assert.equal(fs.existsSync(resolveStoredResourcePath(importedPlacement.ruta_video_local)), true);

  db.close();
  fs.rmSync(testRoot, { recursive: true, force: true });
  app.quit();
}

run().catch((error) => {
  console.error(error);
  app.exit(1);
});
