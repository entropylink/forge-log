// Wires Forge Log's Dexie store and Firebase to the (tested) sync engine.
// Forge Log's side: the workshop owns costs, machines, materials, settings,
// recipes, and shares products + tiers with Booth Mode through the same account.
// It has no money event log (Bench is v2), so all its collections are records.

import { db, setApplyingSync, type TombRow } from "./dexie";
import { getFirebase, isConfigured, type User } from "./firebase";
import { syncOnce, type Collection, type EventRecord, type LocalStore, type SyncReport } from "../sync/engine";
import type { Syncable, Tombstone } from "../sync/merge";
// sync/firestore is imported DYNAMICALLY in syncNow (see booth-mode's note):
// it is the only static pull of the firebase SDK, kept lazy so firebase stays
// out of the main bundle.

/**
 * Products and tiers are the SHARED surface with Booth Mode (same collection
 * names, same account → cross-app). The rest are workshop-only definitions.
 * All records — Forge Log has no append-only event log in v1.
 */
export const COLLECTIONS: Collection[] = [
  { name: "products", kind: "records" },
  { name: "tiers", kind: "records" },
  { name: "machines", kind: "records" },
  { name: "materials", kind: "records" },
  { name: "settings", kind: "records" },
  { name: "costings", kind: "records" },
  { name: "recipes", kind: "records" },
];

class DexieStore implements LocalStore {
  async getRecords(name: string): Promise<Syncable[]> {
    const rows = (await db.table(name).toArray()) as (Syncable & { updatedAt?: string })[];
    return rows.map((r) => (r.updatedAt ? r : { ...r, updatedAt: "" }));
  }

  async getTombstones(name: string): Promise<Tombstone[]> {
    const rows = await db.tombstones.where("collection").equals(name).toArray();
    return rows.map((t) => ({ id: t.id, deletedAt: t.deletedAt }));
  }

  async applyRecords(name: string, records: Syncable[]): Promise<void> {
    setApplyingSync(true);
    try {
      await db.table(name).bulkPut(records as never[]);
    } finally {
      setApplyingSync(false);
    }
  }

  async deleteRecords(name: string, ids: string[]): Promise<void> {
    await db.table(name).bulkDelete(ids);
  }

  async addTombstones(name: string, tombs: Tombstone[]): Promise<void> {
    const rows: TombRow[] = tombs.map((t) => ({ collection: name, id: t.id, deletedAt: t.deletedAt }));
    await db.tombstones.bulkPut(rows);
  }

  // Forge Log has no event collections, but the interface requires these.
  async getEvents(name: string): Promise<EventRecord[]> {
    return (await db.table(name).toArray()) as EventRecord[];
  }

  async applyEvents(name: string, events: EventRecord[]): Promise<void> {
    await db.table(name).bulkPut(events as never[]);
  }
}

const store = new DexieStore();

// --- auth (thin wrappers over the lazily-loaded firebase/auth) --------------

export async function signInEmail(email: string, password: string): Promise<void> {
  const { auth } = await getFirebase();
  const { signInWithEmailAndPassword } = await import("firebase/auth");
  await signInWithEmailAndPassword(auth, email, password);
}

export async function signUpEmail(email: string, password: string): Promise<void> {
  const { auth } = await getFirebase();
  const { createUserWithEmailAndPassword } = await import("firebase/auth");
  await createUserWithEmailAndPassword(auth, email, password);
}

export async function signInGoogle(): Promise<void> {
  const { auth } = await getFirebase();
  const { GoogleAuthProvider, signInWithPopup } = await import("firebase/auth");
  await signInWithPopup(auth, new GoogleAuthProvider());
}

export async function signOutUser(): Promise<void> {
  const { auth } = await getFirebase();
  const { signOut } = await import("firebase/auth");
  await signOut(auth);
}

export async function watchAuth(cb: (user: User | null) => void): Promise<() => void> {
  if (!isConfigured()) {
    cb(null);
    return () => {};
  }
  const { auth } = await getFirebase();
  const { onAuthStateChanged } = await import("firebase/auth");
  return onAuthStateChanged(auth, cb);
}

// --- sync -------------------------------------------------------------------

export type SyncOutcome =
  | { ok: true; report: SyncReport }
  | { ok: false; reason: "unconfigured" | "signed-out"; error?: string }
  | { ok: false; reason: "error"; error: string };

export async function syncNow(): Promise<SyncOutcome> {
  if (!isConfigured()) return { ok: false, reason: "unconfigured" };
  try {
    const { auth, db: fdb } = await getFirebase();
    const user = auth.currentUser;
    if (!user) return { ok: false, reason: "signed-out" };
    const { firestoreTransport } = await import("../sync/firestore");
    const transport = firestoreTransport(fdb, user.uid);
    const report = await syncOnce(COLLECTIONS, store, transport);
    localStorage.setItem("forge-log.lastSync", new Date().toISOString());
    return { ok: true, report };
  } catch (e) {
    return { ok: false, reason: "error", error: e instanceof Error ? e.message : String(e) };
  }
}

export function lastSyncAt(): string | null {
  return localStorage.getItem("forge-log.lastSync");
}
