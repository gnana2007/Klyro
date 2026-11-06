import { describe, it, expect } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { MIGRATIONS } from "../src/server/schema";

// These tests exercise the migration runner directly against in-memory
// databases. They verify the two states that matter in production: a brand new
// database, and a database created by the previous HSCAN build.

function applyAll(handle: DatabaseSync) {
  handle.exec(
    "CREATE TABLE IF NOT EXISTS migrations(version INTEGER PRIMARY KEY, name TEXT, applied_at TEXT)",
  );
  const applied =
    (handle.prepare("SELECT MAX(version) AS v FROM migrations").get() as {
      v: number | null;
    })?.v ?? 0;
  for (const m of MIGRATIONS) {
    if (m.version <= applied) continue;
    handle.exec(m.sql);
    handle
      .prepare(
        "INSERT OR REPLACE INTO migrations(version,name,applied_at) VALUES(?,?,?)",
      )
      .run(m.version, m.name, new Date().toISOString());
  }
}

const tables = (db: DatabaseSync) =>
  (
    db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all() as { name: string }[]
  ).map((r) => r.name);

describe("schema migrations", () => {
  it("creates the full relational core on a new database", () => {
    const db = new DatabaseSync(":memory:");
    applyAll(db);
    const present = tables(db);
    for (const name of [
      "jobs",
      "snapshots",
      "ai_requests",
      "passports",
      "executions",
      "hooks",
      "activities",
      "participants",
      "graph_nodes",
      "graph_edges",
      "scan_index_state",
    ])
      expect(present).toContain(name);
    expect((db.prepare("SELECT MAX(version) AS v FROM migrations").get() as { v: number }).v).toBe(2);
    db.close();
  });

  it("keeps an existing version-1 database and only adds new tables", () => {
    const db = new DatabaseSync(":memory:");
    // Simulate the previous HSCAN build: only the version column, only v1 tables.
    db.exec("CREATE TABLE migrations(version INTEGER PRIMARY KEY)");
    db.exec(MIGRATIONS[0].sql);
    db.exec("INSERT INTO migrations VALUES(1)");
    db.exec(
      "INSERT INTO jobs VALUES('job-1',1,'0xabc','complete','done',NULL,'2026-11-06T00:00:00Z')",
    );
    db.exec(
      "INSERT INTO snapshots VALUES('job-1',1,'0xabc','1','2026-11-06T00:00:00Z','{}')",
    );
    db.exec("ALTER TABLE migrations ADD COLUMN name TEXT");
    db.exec("ALTER TABLE migrations ADD COLUMN applied_at TEXT");

    applyAll(db);

    // Pre-existing rows survive untouched.
    expect(
      (db.prepare("SELECT COUNT(*) AS c FROM snapshots").get() as { c: number })
        .c,
    ).toBe(1);
    expect(
      (db.prepare("SELECT status FROM jobs WHERE id='job-1'").get() as {
        status: string;
      }).status,
    ).toBe("complete");
    // New tables exist.
    expect(tables(db)).toContain("hooks");
    expect(
      (db.prepare("SELECT MAX(version) AS v FROM migrations").get() as { v: number }).v,
    ).toBe(2);
    db.close();
  });

  it("is idempotent when applied twice", () => {
    const db = new DatabaseSync(":memory:");
    applyAll(db);
    expect(() => applyAll(db)).not.toThrow();
    expect(
      (db.prepare("SELECT COUNT(*) AS c FROM migrations").get() as { c: number })
        .c,
    ).toBe(2);
    db.close();
  });

  it("prevents duplicate activity identities on the same chain", () => {
    const db = new DatabaseSync(":memory:");
    applyAll(db);
    const insert = db.prepare(
      `INSERT INTO activities(id,chain_id,hook_address,tx_hash,log_index,block_number,kind,data,source,status,created_at)
       VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
    );
    const row = (id: string, logIndex: number) => [
      id,
      1,
      "0xh",
      "0xtx",
      logIndex,
      "10",
      "swap",
      "{}",
      "rpc",
      "OBSERVED",
      "2026-11-06T00:00:00Z",
    ];
    insert.run(...row("a", 1));
    expect(() => insert.run(...row("b", 1))).toThrow();
    // The same log index on a different chain is a different activity.
    expect(() =>
      insert.run("c", 8453, "0xh", "0xtx", 1, "10", "swap", "{}", "rpc", "OBSERVED", "t"),
    ).not.toThrow();
    expect(
      (db.prepare("SELECT COUNT(*) AS c FROM activities").get() as { c: number })
        .c,
    ).toBe(2);
    db.close();
  });
});
