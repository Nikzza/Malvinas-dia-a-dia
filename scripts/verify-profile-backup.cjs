const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const Database = require("better-sqlite3");
const tar = require("tar");
const { app } = require("electron");

app.disableHardwareAcceleration();

async function run() {
  const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), "malvinas-backup-test-"));
  const documentsDirectory = path.join(testRoot, "documents");
  fs.mkdirSync(documentsDirectory, { recursive: true });
  app.setPath("documents", documentsDirectory);
  await app.whenReady();

  const { getDatabase, initDatabase } = require("../dist-electron/db/connection.js");
  const { profileRepository } = require("../dist-electron/db/repositories/profileRepository.js");
  const { dayRepository } = require("../dist-electron/db/repositories/dayRepository.js");
  const { mapIconPlacementRepository } = require("../dist-electron/db/repositories/mapIconPlacementRepository.js");
  const { storeManagedBuffer } = require("../dist-electron/db/services/managedAssetService.js");
  const {
    exportProfilesBackup,
    importProfilesBackup
  } = require("../dist-electron/db/services/profileBackupService.js");

  const legacyDatabaseDirectory = path.join(documentsDirectory, "MapaMalvinas_Data", "database");
  fs.mkdirSync(legacyDatabaseDirectory, { recursive: true });
  const legacyDb = new Database(path.join(legacyDatabaseDirectory, "app.db"));
  const initialSchema = fs.readFileSync(path.join(__dirname, "../src/db/migrations/001_init.sql"), "utf8");
  legacyDb.exec(initialSchema.replace("  titulo_destacado TEXT,", ""));
  assert.equal(legacyDb.pragma("table_info(dias)").some((column) => column.name === "titulo_destacado"), false);
  legacyDb.close();
  initDatabase();
  const db = getDatabase();
  assert.equal(db.pragma("table_info(dias)").some((column) => column.name === "titulo_destacado"), true);
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
  const secondImagePath = await storeManagedBuffer(Buffer.from("second-image-resource"), "image", ".jpg");
  const videoPath = await storeManagedBuffer(Buffer.from("video-resource"), "video", ".mp4");
  const dayId = Number(
    db.prepare(
      `INSERT INTO dias (
        perfil_id, etiqueta_fecha, es_evento_destacado, vista_centro_lng,
        vista_centro_lat, vista_zoom, vista_velocidad, orden
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(profile.id, "2 de abril", 1, -59.5, -51.7, 7, 65, 1).lastInsertRowid
  );
  assert.equal(dayRepository.list(profile.id)[0].tituloDestacado, null);
  assert.throws(() => dayRepository.updateFeaturedTitle(profile.id, dayId, "   "));
  assert.throws(() => dayRepository.updateFeaturedTitle("otro-perfil", dayId, "Otro titulo"));
  dayRepository.updateFeaturedTitle(profile.id, dayId, "  Desembarco  ");
  assert.equal(dayRepository.list(profile.id)[0].tituloDestacado, "Desembarco");
  assert.equal(dayRepository.list(profile.id)[0].etiquetaFecha, "2 de abril");
  dayRepository.update(dayId, "2 de abril de 1982", false);
  assert.throws(() => dayRepository.updateFeaturedTitle(profile.id, dayId, "No destacado"));
  dayRepository.update(dayId, "2 de abril", true);
  assert.equal(dayRepository.list(profile.id)[0].tituloDestacado, "Desembarco");
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
  mapIconPlacementRepository.updateContent(
    firstPlacementId,
    7,
    "ARA Test",
    "Contenido",
    [imagePath, secondImagePath],
    videoPath
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

  const packagePath = path.join(testRoot, "profiles.mape");
  const exported = await exportProfilesBackup(packagePath, "test");
  assert.equal(exported.profileCount, 1);
  assert.equal(fs.existsSync(packagePath), true);
  await exportProfilesBackup(packagePath, "test-replacement");

  const imported = await importProfilesBackup(packagePath);
  assert.equal(imported.importedCount, 1);
  assert.equal(imported.profiles.length, 2);
  const importedProfile = imported.profiles.find((item) => item.id !== profile.id);
  assert.equal(dayRepository.list(importedProfile.id)[0].tituloDestacado, "Desembarco");
  assert.equal(dayRepository.list(importedProfile.id)[0].etiquetaFecha, "2 de abril");
  assert.equal(dayRepository.list(profile.id)[0].tituloDestacado, "Desembarco");
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM dias").get().count, 2);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM iconos_dia").get().count, 2);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM iconos_mapa").get().count, 4);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM imagenes_iconos_mapa").get().count, 4);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM transiciones_iconos_mapa").get().count, 2);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM lineas_mapa").get().count, 2);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM etiquetas_mapa").get().count, 2);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM eventos").get().count, 2);
  assert.equal(db.pragma("integrity_check", { simple: true }), "ok");

  const importedPlacement = db
    .prepare(
      `SELECT id, ruta_imagen_local, ruta_video_local
       FROM iconos_mapa
       WHERE ruta_imagen_local IS NOT NULL AND ruta_video_local IS NOT NULL
       ORDER BY id DESC LIMIT 1`
    )
    .get();
  const { resolveStoredResourcePath } = require("../dist-electron/db/services/managedAssetService.js");
  assert.equal(fs.existsSync(resolveStoredResourcePath(importedPlacement.ruta_imagen_local)), true);
  assert.equal(fs.existsSync(resolveStoredResourcePath(importedPlacement.ruta_video_local)), true);
  const importedImages = db
    .prepare(
      `SELECT ruta_imagen_local, orden
       FROM imagenes_iconos_mapa
       WHERE id_colocacion_icono = ?
       ORDER BY orden ASC, id ASC`
    )
    .all(importedPlacement.id);
  assert.equal(importedImages.length, 2);
  assert.deepEqual(importedImages.map((image) => image.orden), [0, 1]);
  assert.equal(importedImages.every((image) => fs.existsSync(resolveStoredResourcePath(image.ruta_imagen_local))), true);

  // A package from the previous version has no custom-title column.
  const legacyStage = path.join(testRoot, "legacy-package");
  fs.mkdirSync(legacyStage);
  await tar.x({ file: packagePath, cwd: legacyStage });
  const snapshotPath = path.join(legacyStage, "database", "app.db");
  const snapshotDb = new Database(snapshotPath);
  snapshotDb.exec("ALTER TABLE dias DROP COLUMN titulo_destacado");
  snapshotDb.close();
  const manifestPath = path.join(legacyStage, "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const databaseEntry = manifest.files.find((file) => file.path === "database/app.db");
  const databaseBytes = fs.readFileSync(snapshotPath);
  databaseEntry.size = databaseBytes.length;
  databaseEntry.sha256 = crypto.createHash("sha256").update(databaseBytes).digest("hex");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));
  const legacyPackagePath = path.join(testRoot, "legacy.mape");
  await tar.c({ file: legacyPackagePath, cwd: legacyStage }, ["manifest.json", "database", "assets"]);
  const previousIds = new Set(profileRepository.list().map((item) => item.id));
  const legacyImport = await importProfilesBackup(legacyPackagePath);
  const legacyProfile = legacyImport.profiles.find((item) => !previousIds.has(item.id));
  assert.equal(legacyImport.importedCount, 1);
  assert.equal(dayRepository.list(legacyProfile.id)[0].tituloDestacado, null);
  assert.equal(dayRepository.list(legacyProfile.id)[0].etiquetaFecha, "2 de abril");
  assert.equal(db.pragma("integrity_check", { simple: true }), "ok");
  console.log("Profile backup, featured titles, migration and legacy import checks passed.");
  db.close();
  fs.rmSync(testRoot, { recursive: true, force: true });
  app.quit();
}

run().catch((error) => {
  console.error(error);
  app.exit(1);
});
