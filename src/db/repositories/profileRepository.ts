import { getDatabase } from "../connection";
import type { MalvinasProfile } from "../../shared/types/profile";

type ProfileRow = {
  id: string;
  data_json: string;
};

function parseProfile(row: ProfileRow): MalvinasProfile {
  const profile = JSON.parse(row.data_json) as Partial<MalvinasProfile>;

  if (!profile || profile.id !== row.id || typeof profile.name !== "string") {
    throw new Error(`El perfil ${row.id} contiene datos invalidos.`);
  }

  return profile as MalvinasProfile;
}

export const profileRepository = {
  list: (): MalvinasProfile[] => {
    const db = getDatabase();
    const rows = db
      .prepare("SELECT id, data_json FROM perfiles ORDER BY created_at ASC, rowid ASC")
      .all() as ProfileRow[];

    return rows.map(parseProfile);
  },
  insertMissing: (profiles: MalvinasProfile[]): void => {
    const db = getDatabase();
    const insert = db.prepare(
      `
        INSERT INTO perfiles (id, data_json)
        VALUES (?, ?)
        ON CONFLICT(id) DO NOTHING
      `
    );
    const insertProfiles = db.transaction(() => {
      for (const profile of profiles) {
        if (!profile?.id?.trim() || !profile?.name?.trim()) {
          continue;
        }

        insert.run(profile.id, JSON.stringify(profile));
      }
    });

    insertProfiles();
  },
  upsert: (profile: MalvinasProfile): void => {
    if (!profile.id.trim() || !profile.name.trim()) {
      throw new Error("El perfil necesita un nombre valido.");
    }

    const db = getDatabase();
    db.prepare(
      `
        INSERT INTO perfiles (id, data_json)
        VALUES (?, ?)
        ON CONFLICT(id) DO UPDATE SET
          data_json = excluded.data_json,
          updated_at = CURRENT_TIMESTAMP
      `
    ).run(profile.id, JSON.stringify(profile));
  },
  remove: (profileId: string): void => {
    const db = getDatabase();
    db.prepare("DELETE FROM perfiles WHERE id = ?").run(profileId);
  }
};
