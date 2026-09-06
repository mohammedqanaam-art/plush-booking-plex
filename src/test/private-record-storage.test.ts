import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { data, globalStore, deployStore } = vi.hoisted(() => {
  const data = new Map<string, unknown>();
  const base = { get: vi.fn(async (key: string) => data.get(key) ?? null), setJSON: vi.fn(async (key: string, value: unknown) => { data.set(key, value); }), list: vi.fn(async () => ({ blobs: [] })), delete: vi.fn() };
  return { data, globalStore: vi.fn(() => base), deployStore: vi.fn(() => base) };
});
vi.mock("@netlify/blobs", () => ({ getStore: globalStore, getDeployStore: deployStore }));
import { encryptStoredJson, getPrivateRecordStore } from "../../netlify/functions/_shared/storage";
describe("private workflow storage compatibility", () => {
  beforeEach(() => { data.clear(); vi.clearAllMocks(); vi.stubGlobal("Netlify", { context: { deploy: { context: "deploy-preview", id: "preview-id" } }, env: { get: () => "" } }); });
  afterEach(() => vi.unstubAllGlobals());
  it("saves new private records without an optional AES key and isolates preview writes", async () => {
    const store = getPrivateRecordStore("account-requests");
    await store.setJSON("account/test", { passwordHash: "derived-hash", status: "pending" });
    expect(await store.get("account/test")).toEqual({ passwordHash: "derived-hash", status: "pending" });
    expect(deployStore).toHaveBeenCalledWith({ name: "account-requests", deployID: "preview-id" });
    expect(globalStore).not.toHaveBeenCalled();
  });
  it("preserves an existing encrypted record when the key is unavailable", async () => {
    const envelope = encryptStoredJson({ status: "approved" }, "account-requests", "account/test", Buffer.alloc(32, 7));
    data.set("account/test", envelope);
    const store = getPrivateRecordStore("account-requests");
    await expect(store.get("account/test")).rejects.toThrow("DATA_ENCRYPTION_KEY");
    await expect(store.setJSON("account/test", { status: "pending" })).rejects.toThrow("DATA_ENCRYPTION_KEY");
    expect(data.get("account/test")).toEqual(envelope);
  });
  it("uses AES when configured and retains production storage across deploys", async () => {
    vi.stubGlobal("Netlify", { context: { deploy: { context: "production", id: "prod-id" } }, env: { get: () => Buffer.alloc(32, 7).toString("hex") } });
    const store = getPrivateRecordStore("account-requests", { consistency: "strong" });
    await store.setJSON("account/test", { status: "pending" });
    expect(data.get("account/test")).toMatchObject({ __resEncrypted: 1 });
    expect(await store.get("account/test")).toEqual({ status: "pending" });
    expect(globalStore).toHaveBeenCalledWith({ name: "account-requests", consistency: "strong" });
  });
  it("does not overwrite an envelope encrypted with a different key", async () => {
    const envelope = encryptStoredJson({ status: "approved" }, "account-requests", "account/test", Buffer.alloc(32, 7));
    data.set("account/test", envelope);
    vi.stubGlobal("Netlify", { context: { deploy: { context: "production" } }, env: { get: () => Buffer.alloc(32, 9).toString("hex") } });
    await expect(getPrivateRecordStore("account-requests").setJSON("account/test", { status: "pending" })).rejects.toThrow();
    expect(data.get("account/test")).toEqual(envelope);
  });
});
