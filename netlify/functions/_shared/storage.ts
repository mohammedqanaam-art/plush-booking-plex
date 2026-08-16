import { getDeployStore, getStore } from "@netlify/blobs";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

type StoreOptions = {
  consistency?: "strong";
};

type EncryptedEnvelope = {
  __resEncrypted: 1;
  alg: "aes-256-gcm";
  iv: string;
  tag: string;
  data: string;
};

const DATA_KEY_ENV = "DATA_ENCRYPTION_KEY";

// Small, sensitive JSON records keep application-layer encryption.
// Large reservation reports deliberately use Netlify Blobs' platform encryption at rest/in transit:
// wrapping multi-megabyte reports in base64 AES envelopes materially increases object size and can
// make otherwise valid UNO/CRO reports fail to save. Existing encrypted booking blobs are migrated
// back to normal JSON lazily on first successful read.
const APP_ENCRYPTED_STORES = new Set([
  "booking-phone-index",
  "complaints",
  "contacts",
  "settings",
  "users",
]);
const LEGACY_ENCRYPTED_PLAINTEXT_STORES = new Set(["bookings"]);

const getRawEnvironmentStore = (name: string, options: StoreOptions = {}) => {
  const deploy = typeof Netlify === "undefined" ? undefined : Netlify.context?.deploy;
  if (deploy?.context === "production") {
    return options.consistency === "strong"
      ? getStore({ name, consistency: "strong" })
      : getStore(name);
  }
  return deploy?.id
    ? getDeployStore({ name, deployID: deploy.id })
    : getDeployStore(name);
};

type RawStore = ReturnType<typeof getRawEnvironmentStore>;

const isEncryptedEnvelope = (value: unknown): value is EncryptedEnvelope => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const envelope = value as Partial<EncryptedEnvelope>;
  return envelope.__resEncrypted === 1
    && envelope.alg === "aes-256-gcm"
    && typeof envelope.iv === "string"
    && typeof envelope.tag === "string"
    && typeof envelope.data === "string";
};

const parseEncryptionKey = (raw: string): Buffer => {
  const value = raw.trim();
  if (/^[a-f0-9]{64}$/iu.test(value)) return Buffer.from(value, "hex");
  const decoded = Buffer.from(value, "base64");
  if (decoded.length === 32) return decoded;
  throw new Error(`${DATA_KEY_ENV} must contain a 32-byte key.`);
};

const getEncryptionKey = () => {
  const raw = typeof Netlify === "undefined" ? "" : (Netlify.env.get(DATA_KEY_ENV) || "");
  if (!raw.trim()) throw new Error(`${DATA_KEY_ENV} is required for sensitive storage.`);
  return parseEncryptionKey(raw);
};

const storageAad = (storeName: string, key: string) => Buffer.from(`res-dashboard:v1:${storeName}:${key}`, "utf8");

export const encryptStoredJson = (value: unknown, storeName: string, key: string, encryptionKey = getEncryptionKey()): EncryptedEnvelope => {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey, iv);
  cipher.setAAD(storageAad(storeName, key));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return {
    __resEncrypted: 1,
    alg: "aes-256-gcm",
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: ciphertext.toString("base64"),
  };
};

export const decryptStoredJson = <T>(envelope: EncryptedEnvelope, storeName: string, key: string, encryptionKey = getEncryptionKey()): T => {
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey, Buffer.from(envelope.iv, "base64"));
  decipher.setAAD(storageAad(storeName, key));
  decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(envelope.data, "base64")),
    decipher.final(),
  ]).toString("utf8");
  return JSON.parse(plaintext) as T;
};

/** Adds application-layer AES-256-GCM protection to small sensitive JSON records. */
export const getEncryptedEnvironmentStore = (name: string, options: StoreOptions = {}) => {
  const base = getRawEnvironmentStore(name, options);
  return {
    async get<T = unknown>(key: string, readOptions: { type?: "json" } = { type: "json" }): Promise<T | null> {
      if (readOptions.type && readOptions.type !== "json") throw new Error("Encrypted stores support JSON reads only.");
      const stored = await base.get(key, { type: "json" }) as unknown;
      if (stored === null || stored === undefined) return null;
      if (isEncryptedEnvelope(stored)) return decryptStoredJson<T>(stored, name, key);
      await base.setJSON(key, encryptStoredJson(stored, name, key));
      return stored as T;
    },
    async setJSON(key: string, value: unknown) {
      return base.setJSON(key, encryptStoredJson(value, name, key));
    },
    async delete(key: string) {
      return base.delete(key);
    },
  };
};

const getLegacyMigrationStore = (name: string, options: StoreOptions = {}) => {
  const base = getRawEnvironmentStore(name, options);
  return {
    async get<T = unknown>(key: string, readOptions: { type?: "json" } = { type: "json" }): Promise<T | null> {
      if (readOptions.type && readOptions.type !== "json") throw new Error("JSON reads only.");
      const stored = await base.get(key, { type: "json" }) as unknown;
      if (stored === null || stored === undefined) return null;
      if (!isEncryptedEnvelope(stored)) return stored as T;

      const decoded = decryptStoredJson<T>(stored, name, key);
      // One-way compatibility migration: preserve the same logical value while removing the
      // size-expanding application envelope for bulk report data.
      await base.setJSON(key, decoded);
      return decoded;
    },
    async setJSON(key: string, value: unknown) {
      return base.setJSON(key, value);
    },
    async delete(key: string) {
      return base.delete(key);
    },
  };
};

export const getEnvironmentStore = (name: string, options: StoreOptions = {}): RawStore => {
  if (APP_ENCRYPTED_STORES.has(name)) {
    return getEncryptedEnvironmentStore(name, options) as unknown as RawStore;
  }
  if (LEGACY_ENCRYPTED_PLAINTEXT_STORES.has(name)) {
    return getLegacyMigrationStore(name, options) as unknown as RawStore;
  }
  return getRawEnvironmentStore(name, options);
};
