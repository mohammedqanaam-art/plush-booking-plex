import { createHash, pbkdf2Sync, randomBytes, randomUUID } from "node:crypto";
import { getEncryptedEnvironmentStore } from "./storage";

export const VALID_ROLES = ["superadmin", "admin", "editor", "viewer"] as const;
export type UserRole = (typeof VALID_ROLES)[number];

export type StoredUser = {
  id: string;
  username: string;
  role: UserRole;
  authVersion: number;
  generation: string;
  credentialSource?: "environment" | "local";
  passwordHash?: string;
};

type LegacyUser = Partial<StoredUser> & { username?: string; password?: string };

type AccountGeneration = {
  username: string;
  generation: string;
  status: "active" | "deleted";
  updatedAt: string;
};

const store = () => getEncryptedEnvironmentStore("users", { consistency: "strong" });
const MIGRATION_MARKER = "migration/accounts-v3";
const PASSWORD_ITERATIONS = 600_000;
const VALID_GENERATION = /^[a-f0-9-]{20,80}$/i;

export const canonicalUsername = (value: unknown) => String(value || "")
  .normalize("NFKC")
  .trim()
  .replace(/\s+/g, " ")
  .toLocaleLowerCase("en");

export const normalizeRole = (role: unknown): UserRole => (
  VALID_ROLES.includes(role as UserRole) ? role as UserRole : "viewer"
);

const accountHash = (username: unknown) => {
  const canonical = canonicalUsername(username);
  if (!canonical) throw new Error("INVALID_USERNAME");
  return createHash("sha256").update(canonical).digest("hex");
};

const legacyAccountKey = (username: unknown) => `accounts/${accountHash(username)}`;
const generationKey = (username: unknown) => `generations/${accountHash(username)}`;
const legacyGenerationKey = (username: unknown) => `legacy-generations/${accountHash(username)}`;
const tombstoneKey = (username: unknown) => `tombstones/${accountHash(username)}`;
const versionedAccountKey = (username: unknown, generation: string) => {
  if (!VALID_GENERATION.test(generation)) throw new Error("INVALID_USER_GENERATION");
  return `${legacyAccountKey(username)}/${generation}`;
};

const hashLegacyPassword = (password: string) => {
  const salt = randomBytes(16).toString("hex");
  const key = pbkdf2Sync(password, salt, PASSWORD_ITERATIONS, 32, "sha256").toString("hex");
  return `pbkdf2_sha256$${PASSWORD_ITERATIONS}$${salt}$${key}`;
};

const normalizeRecord = (value: LegacyUser, forcedGeneration?: string): StoredUser | null => {
  const username = String(value.username || "").trim().replace(/\s+/g, " ").slice(0, 120);
  if (!username) return null;
  const authVersion = Number(value.authVersion || 1);
  const suppliedGeneration = forcedGeneration || String(value.generation || "");
  return {
    id: String(value.id || randomUUID()),
    username,
    role: normalizeRole(value.role),
    authVersion: Number.isSafeInteger(authVersion) && authVersion > 0 ? authVersion : 1,
    generation: VALID_GENERATION.test(suppliedGeneration) ? suppliedGeneration : randomUUID(),
    ...(value.credentialSource === "environment" || value.credentialSource === "local"
      ? { credentialSource: value.credentialSource }
      : {}),
    ...(typeof value.passwordHash === "string" && value.passwordHash
      ? { passwordHash: value.passwordHash }
      : typeof value.password === "string" && value.password
        ? { passwordHash: hashLegacyPassword(value.password) }
        : {}),
  };
};

export const isEnvironmentManagedUser = (user: Pick<StoredUser, "role" | "credentialSource">) => (
  user.credentialSource === "environment"
  || (user.role === "superadmin" && user.credentialSource !== "local")
);

const activeGeneration = (username: string, generation: string): AccountGeneration => ({
  username,
  generation,
  status: "active",
  updatedAt: new Date().toISOString(),
});

const readGeneration = async (username: unknown) => (
  store().get<AccountGeneration>(generationKey(username), { type: "json" })
);

const readLegacyGeneration = async (username: unknown) => (
  store().get<AccountGeneration>(legacyGenerationKey(username), { type: "json" })
);

const readEffectiveGeneration = async (username: unknown) => (
  (await readGeneration(username)) || readLegacyGeneration(username)
);

async function publishLegacyRecord(candidate: LegacyUser): Promise<boolean> {
  const record = normalizeRecord(candidate);
  if (!record) return false;
  const directory = store();
  const deletedKey = tombstoneKey(record.username);
  if (await directory.get(deletedKey, { type: "json" })) return false;

  const modernMarker = await readGeneration(record.username);
  if (modernMarker) return false;
  const marker = await readLegacyGeneration(record.username);
  if (marker?.status === "active" && VALID_GENERATION.test(marker.generation)) {
    const existing = await directory.get<StoredUser>(
      versionedAccountKey(record.username, marker.generation),
      { type: "json" },
    );
    if (!existing) {
      const migrated = normalizeRecord(record, marker.generation);
      if (migrated) await directory.setJSON(versionedAccountKey(record.username, marker.generation), migrated);
    }
    return false;
  }

  await directory.setJSON(versionedAccountKey(record.username, record.generation), record);
  if (await directory.get(deletedKey, { type: "json" })) {
    await directory.delete(versionedAccountKey(record.username, record.generation)).catch(() => undefined);
    return false;
  }
  await directory.setJSON(legacyGenerationKey(record.username), activeGeneration(record.username, record.generation));
  const published = await readLegacyGeneration(record.username);
  const modernAfterPublish = await readGeneration(record.username);
  const wasDeleted = await directory.get(deletedKey, { type: "json" });
  if (modernAfterPublish || wasDeleted || published?.status !== "active" || published.generation !== record.generation) {
    await directory.delete(versionedAccountKey(record.username, record.generation)).catch(() => undefined);
    return false;
  }
  await directory.delete(legacyAccountKey(record.username)).catch(() => undefined);
  return true;
}

async function migrateLegacyUsers() {
  const directory = store();
  if (await directory.get<{ completed?: boolean }>(MIGRATION_MARKER, { type: "json" })) return;
  const legacy = await directory.get<LegacyUser[]>("all", { type: "json" });
  if (!Array.isArray(legacy)) {
    await directory.setJSON(MIGRATION_MARKER, {
      completed: true,
      completedAt: new Date().toISOString(),
      records: 0,
    });
    return;
  }
  let records = 0;
  for (const candidate of legacy) {
    if (await publishLegacyRecord(candidate)) records += 1;
  }
  await directory.delete("all");
  await directory.setJSON(MIGRATION_MARKER, {
    completed: true,
    completedAt: new Date().toISOString(),
    records,
  });
}

export async function getStoredUserByUsername(username: unknown): Promise<StoredUser | null> {
  await migrateLegacyUsers();
  const directory = store();
  if (await directory.get(tombstoneKey(username), { type: "json" })) return null;

  const modernMarker = await readGeneration(username);
  const marker = modernMarker || await readLegacyGeneration(username);
  if (marker?.status === "deleted") return null;
  if (marker?.status === "active" && VALID_GENERATION.test(marker.generation)) {
    const existing = await directory.get<StoredUser>(
      versionedAccountKey(username, marker.generation),
      { type: "json" },
    );
    const record = existing ? normalizeRecord(existing, marker.generation) : null;
    return record && canonicalUsername(record.username) === canonicalUsername(username) ? record : null;
  }

  const legacy = await directory.get<LegacyUser>(legacyAccountKey(username), { type: "json" });
  if (!legacy) return null;
  await publishLegacyRecord(legacy);
  const migratedMarker = (await readGeneration(username)) || await readLegacyGeneration(username);
  if (migratedMarker?.status !== "active" || !VALID_GENERATION.test(migratedMarker.generation)) return null;
  if (await directory.get(tombstoneKey(username), { type: "json" })) return null;
  const migrated = await directory.get<StoredUser>(
    versionedAccountKey(username, migratedMarker.generation),
    { type: "json" },
  );
  const record = migrated ? normalizeRecord(migrated, migratedMarker.generation) : null;
  return record && canonicalUsername(record.username) === canonicalUsername(username) ? record : null;
}

export async function listStoredUsers(): Promise<StoredUser[]> {
  await migrateLegacyUsers();
  const directory = store();
  const users = new Map<string, StoredUser>();
  for (const prefix of ["generations/", "legacy-generations/"]) {
    for await (const page of directory.listPages({ prefix })) {
      for (let index = 0; index < page.blobs.length; index += 20) {
        const batch = await Promise.all(page.blobs.slice(index, index + 20).map((blob) => (
          directory.get<AccountGeneration>(blob.key, { type: "json" }).catch(() => null)
        )));
        for (const marker of batch) {
          if (!marker || marker.status !== "active" || !marker.username) continue;
          const record = await getStoredUserByUsername(marker.username);
          if (record) users.set(canonicalUsername(record.username), record);
        }
      }
    }
  }
  return [...users.values()].sort((left, right) => left.username.localeCompare(right.username, "ar"));
}

export async function saveStoredUser(
  value: LegacyUser,
  options: { allowRecreate?: boolean; expectedGeneration?: string; expectedAuthVersion?: number } = {},
): Promise<StoredUser> {
  const normalized = normalizeRecord(value);
  if (!normalized) throw new Error("INVALID_USERNAME");
  const directory = store();
  const deletedKey = tombstoneKey(normalized.username);

  if (options.allowRecreate) {
    const record = normalizeRecord(normalized, randomUUID());
    if (!record) throw new Error("INVALID_USERNAME");
    const key = versionedAccountKey(record.username, record.generation);
    await directory.setJSON(key, record);
    await directory.setJSON(generationKey(record.username), activeGeneration(record.username, record.generation));
    await directory.delete(deletedKey).catch(() => undefined);
    const marker = await readGeneration(record.username);
    const tombstone = await directory.get(deletedKey, { type: "json" });
    if (tombstone || marker?.status !== "active" || marker.generation !== record.generation) {
      await directory.delete(key).catch(() => undefined);
      throw new Error("USER_WRITE_CONFLICT");
    }
    await directory.delete(legacyAccountKey(record.username)).catch(() => undefined);
    await directory.delete(legacyGenerationKey(record.username)).catch(() => undefined);
    return record;
  }

  if (!options.expectedGeneration || options.expectedGeneration !== normalized.generation) {
    throw new Error("USER_WRITE_CONFLICT");
  }
  if (await directory.get(deletedKey, { type: "json" })) throw new Error("USER_DELETED");
  const before = await readEffectiveGeneration(normalized.username);
  if (before?.status !== "active" || before.generation !== options.expectedGeneration) {
    throw new Error("USER_WRITE_CONFLICT");
  }
  const key = versionedAccountKey(normalized.username, normalized.generation);
  const current = await directory.get<StoredUser>(key, { type: "json" });
  const expectedAuthVersion = Number(options.expectedAuthVersion);
  if (!current || !Number.isSafeInteger(expectedAuthVersion) || current.authVersion !== expectedAuthVersion) {
    throw new Error("USER_WRITE_CONFLICT");
  }
  await directory.setJSON(key, normalized);
  const after = await readEffectiveGeneration(normalized.username);
  const tombstone = await directory.get(deletedKey, { type: "json" });
  if (tombstone || after?.status !== "active" || after.generation !== options.expectedGeneration) {
    if (after?.status !== "active" || after.generation !== normalized.generation) {
      await directory.delete(key).catch(() => undefined);
    }
    throw new Error(tombstone ? "USER_DELETED" : "USER_WRITE_CONFLICT");
  }
  return normalized;
}

export async function deleteStoredUser(username: unknown) {
  await migrateLegacyUsers();
  const directory = store();
  const current = await readEffectiveGeneration(username);
  const deletedGeneration = randomUUID();
  await directory.setJSON(generationKey(username), {
    username: "",
    generation: deletedGeneration,
    status: "deleted",
    updatedAt: new Date().toISOString(),
  } satisfies AccountGeneration);
  await directory.setJSON(tombstoneKey(username), {
    deletedAt: new Date().toISOString(),
    generation: deletedGeneration,
  });
  await directory.delete(legacyAccountKey(username)).catch(() => undefined);
  await directory.delete(legacyGenerationKey(username)).catch(() => undefined);
  if (current?.status === "active" && VALID_GENERATION.test(current.generation)) {
    await directory.delete(versionedAccountKey(username, current.generation)).catch(() => undefined);
  }
}
