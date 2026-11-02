// scripts/check-schema-contract.mjs
//
// There is no Postgres in this environment, so the migrations cannot be
// executed. The failure mode that would actually bite at runtime is a name
// mismatch between what src/lib/content.ts (and the server actions) ask for and
// what the DDL creates. This script parses both sides and reports the diff.
//
// Usage: node scripts/check-schema-contract.mjs

import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/* ---------- 1. read the DDL ---------- */

const migrationsDir = join(root, "supabase", "migrations");
const migrationFiles = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

const columnsByTable = new Map();
const tablesInOrder = [];
/** @type {{file:string,line:number,text:string}[]} */
const ddlProblems = [];

function addTable(name) {
  if (!columnsByTable.has(name)) {
    columnsByTable.set(name, new Set());
    tablesInOrder.push(name);
  }
}

/** Split a column-definition list on top-level commas. */
function splitTopLevel(body) {
  const parts = [];
  let depth = 0;
  let quote = null;
  let current = "";
  for (const ch of body) {
    if (quote) {
      current += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === "(" || ch === "[") depth++;
    if (ch === ")" || ch === "]") depth--;
    if (ch === "," && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) parts.push(current);
  return parts.map((p) => p.trim()).filter(Boolean);
}

const TABLE_RE =
  /create table (?:if not exists )?(?:public|storage)\.([a-z_][a-z0-9_]*)\s*\(([\s\S]*?)\n\)\s*;/g;
const VIEW_RE = /create (?:or replace )?view (?:public|storage)\.([a-z_][a-z0-9_]*)/g;
const ALTER_ADD_RE =
  /alter table (?:public|storage)\.([a-z_][a-z0-9_]*)[\s\S]*?add column (?:if not exists )?([a-z_][a-z0-9_]*)/g;
const CONSTRAINT_KEYWORDS = new Set([
  "constraint",
  "primary",
  "unique",
  "foreign",
  "check",
  "exclude",
  "like",
]);

/** child -> parent foreign key multiplicity, e.g. "tracks->releases" => 1 */
const fks = new Map();

for (const file of migrationFiles) {
  const rawSql = readFileSync(join(migrationsDir, file), "utf8");
  // Strip -- line comments before parsing: several tables carry explanatory
  // comments between column definitions, and they otherwise glue onto the
  // column they document and hide it.
  const sql = rawSql
    .split(/\r?\n/)
    .map((line) => {
      const idx = line.indexOf("--");
      return idx === -1 ? line : line.slice(0, idx);
    })
    .join("\n");
  const lines = rawSql.split(/\r?\n/);

  for (const m of sql.matchAll(TABLE_RE)) {
    const table = m[1];
    addTable(table);
    const cols = columnsByTable.get(table);
    for (const part of splitTopLevel(m[2])) {
      // Record child -> parent foreign keys; embedding depends on these.
      for (const ref of part.matchAll(/references (?:public|storage)\.([a-z_][a-z0-9_]*)/g)) {
        const key = `${table}->${ref[1]}`;
        fks.set(key, (fks.get(key) ?? 0) + 1);
      }
      const first = part.split(/\s+/)[0].toLowerCase();
      if (CONSTRAINT_KEYWORDS.has(first)) {
        // CHECK constraints may not contain subqueries in PostgreSQL.
        if (first === "check" && /\(\s*select\b/i.test(part)) {
          const line = sql.slice(0, m.index + part.indexOf("(select")).split("\n").length;
          ddlProblems.push({
            file,
            line,
            text: "subquery inside a CHECK constraint (PostgreSQL rejects this)",
          });
        }
        continue;
      }
      if (/^[a-z_][a-z0-9_]*$/.test(first)) cols.add(first);
    }
  }

  for (const m of sql.matchAll(VIEW_RE)) {
    addTable(m[1]);
  }

  for (const m of sql.matchAll(ALTER_ADD_RE)) {
    addTable(m[1]);
    columnsByTable.get(m[1]).add(m[2]);
  }

  // FKs added after the fact, e.g. beats.master_asset_id -> audio_assets.
  for (const m of sql.matchAll(
    /alter table (?:public|storage)\.([a-z_][a-z0-9_]*)[\s\S]{0,160}?foreign key[\s\S]{0,80}?references (?:public|storage)\.([a-z_][a-z0-9_]*)/g,
  )) {
    const key = `${m[1]}->${m[2]}`;
    fks.set(key, (fks.get(key) ?? 0) + 1);
  }

  // Triggers must not read the record their operation leaves unassigned.
  const fnRe =
    /create or replace function ([a-z_]+\.[a-z_]+)\([\s\S]*?\$\$\s*begin([\s\S]*?)\bend\b\s*;\s*\$\$/g;
  for (const m of sql.matchAll(fnRe)) {
    const body = m[2];
    const fnName = m[1];
    const usesNew = /\bnew\./.test(body);
    const usesOld = /\bold\./.test(body);
    // Find triggers bound to functions in this file to know the operations.
    if (usesOld && usesNew && !/\btg_op\b/i.test(body)) {
      const line = sql.slice(0, m.index).split("\n").length;
      ddlProblems.push({
        file,
        line,
        text: `${fnName} reads both NEW and OLD without branching on TG_OP`,
      });
    }
  }

  for (const [i, text] of lines.entries()) {
    if (/with check\s*\(\s*true\s*\)/.test(text)) continue;
    if (/\bpayload\s*<>\s*'\{\}'::jsonb\s+or\s+true\b/.test(text)) {
      ddlProblems.push({
        file,
        line: i + 1,
        text: "tautological policy check (always true)",
      });
    }
  }
}

/* ---------- 2. read what TypeScript asks for ---------- */

const TS_FILES = [
  "src/lib/content.ts",
  "src/actions/contact.ts",
  "src/actions/newsletter.ts",
  "src/lib/auth/session.ts",
  "src/app/admin/(dashboard)/page.tsx",
];

/** Properties that belong to JavaScript objects, not to a row. */
const JS_MEMBERS = new Set([
  "map", "filter", "length", "trim", "find", "some", "every", "includes", "slice",
  "split", "replace", "push", "toString", "toISOString", "constructor",
  "array", "boolean", "number", "string",
]);

/** Columns PostgREST uses that are not table columns. */
const SQL_PSEUDO = new Set(["count", "*"]);

/** @type {{file:string,parent:string,child:string}[]} */
const embeddings = [];
/** @type {{file:string,table:string,column:string,note:string}[]} */
const missing = [];
/** @type {{file:string,table:string}[]} */
const unknownTables = [];

function check(table, column, file, note) {
  if (SQL_PSEUDO.has(column)) return;
  if (!columnsByTable.has(table)) {
    if (!unknownTables.some((u) => u.table === table && u.file === file))
      unknownTables.push({ table, file });
    return;
  }
  if (!columnsByTable.get(table).has(column)) {
    missing.push({ file, table, column, note });
  }
}

for (const rel of TS_FILES) {
  const src = readFileSync(join(root, rel), "utf8");

  // Pair each .from("table") with the select() that follows it before the next
  // .from() — a wider window would let one query's select list bleed into the
  // next query's filters.
  const fromCalls = [...src.matchAll(/from\(\s*"([a-z_][a-z0-9_]*)"\s*\)/g)];
  for (let i = 0; i < fromCalls.length; i++) {
    const table = fromCalls[i][1];
    const start = fromCalls[i].index + fromCalls[i][0].length;
    const end = i + 1 < fromCalls.length ? fromCalls[i + 1].index : src.length;
    const slice = src.slice(start, end);

    for (const sel of slice.matchAll(/\.select\(\s*"([^"]*)"/g)) {
      for (const token of splitTopLevel(sel[1])) {
        const t = token.replace(/`/g, "").trim();
        if (!t || t === "*") continue;
        const embed = /^([a-z_][a-z0-9_]*)\(/.exec(t);
        if (embed) {
          if (!columnsByTable.has(embed[1])) {
            unknownTables.push({ table: embed[1], file: rel });
            continue;
          }
          embeddings.push({ file: rel, parent: table, child: embed[1] });
          const inner = t.slice(t.indexOf("(") + 1).replace(/\)+$/, "");
          for (const c of splitTopLevel(inner)) {
            if (c && c !== "*") check(embed[1], c, rel, "embedded select");
          }
          continue;
        }
        check(table, t.replace(/::.*$/, "").trim(), rel, "select list");
      }
    }
  }

  for (const op of [
    "eq",
    "neq",
    "gt",
    "gte",
    "lt",
    "lte",
    "like",
    "ilike",
    "is",
    "contains",
  ]) {
    for (const m of src.matchAll(
      new RegExp(`\\.${op}\\(\\s*"([a-z_][a-z0-9_]*)"`, "g"),
    )) {
      // Attribute to the nearest preceding .from()
      const before = src.slice(0, m.index);
      const froms = [...before.matchAll(/from\(\s*"([a-z_][a-z0-9_]*)"\s*\)/g)];
      if (!froms.length) continue;
      const table = froms[froms.length - 1][1];
      check(table, m[1], rel, `${op} filter`);
    }
  }

  for (const m of src.matchAll(/\.order\(\s*"([a-z_][a-z0-9_]*)"/g)) {
    const before = src.slice(0, m.index);
    const froms = [...before.matchAll(/from\(\s*"([a-z_][a-z0-9_]*)"\s*\)/g)];
    if (!froms.length) continue;
    check(froms[froms.length - 1][1], m[1], rel, "order");
  }

  // .insert({ a: 1, b: 2 })
  for (const m of src.matchAll(
    /from\(\s*"([a-z_][a-z0-9_]*)"\s*\)\s*\.insert\(\s*\{([\s\S]*?)\}\s*\)/g,
  )) {
    for (const key of m[2].matchAll(/(?:^|,)\s*([a-z_][a-z0-9_]*):/g)) {
      check(m[1], key[1], rel, "insert payload");
    }
  }

  // Row mappers only. Scanning the whole file would treat domain objects
  // (r.credits, t.lyrics on a Release) as if they were database rows.
  const mapperBlocks = [
    ...src.matchAll(/function map\w+[\s\S]*?\n\}/g),
    ...src.matchAll(/export async function getBeats[\s\S]*?\n\}/g),
  ].map((m) => m[0]);

  for (const block of mapperBlocks) {
    // Every snake_case property read off a row variable must exist somewhere.
    for (const m of block.matchAll(/\b[rtlxib]\.([a-z][a-z0-9_]*)\b/g)) {
      const column = m[1];
      if (JS_MEMBERS.has(column)) continue;
      // r.tracks / r.streaming_links are embedded relations resolved through the
      // FK, not columns of the parent row.
      if (columnsByTable.has(column)) continue;
      if (!anyTableHas(column)) {
        missing.push({
          file: rel,
          table: "<mapper row>",
          column,
          note: "row property read but not created by any table",
        });
      }
    }
  }
}

function anyTableHas(column) {
  for (const cols of columnsByTable.values()) if (cols.has(column)) return true;
  return false;
}

/* ---------- 3. report ---------- */

/** PostgREST resolves an embed through exactly one FK path between two tables. */
const embedProblems = [];
for (const e of embeddings) {
  const childToOne = (fks.get(`${e.child}->${e.parent}`) ?? 0) > 0; // many-to-one
  const parentToMany = (fks.get(`${e.parent}->${e.child}`) ?? 0) > 0; // one-to-many
  const nChild = fks.get(`${e.child}->${e.parent}`) ?? 0;
  const nParent = fks.get(`${e.parent}->${e.child}`) ?? 0;

  if (!childToOne && !parentToMany) {
    embedProblems.push(`${e.file}  ${e.parent}.${e.child}  no foreign key between them`);
    continue;
  }
  if (childToOne && parentToMany) {
    embedProblems.push(
      `${e.file}  ${e.parent}.${e.child}  FKs in both directions; embedding is ambiguous`,
    );
    continue;
  }
  if ((childToOne ? nChild : nParent) > 1) {
    embedProblems.push(
      `${e.file}  ${e.parent}.${e.child}  multiple FKs; needs an explicit embed hint`,
    );
  }
}

console.log(`migrations parsed : ${migrationFiles.length}`);
console.log(`tables + views    : ${tablesInOrder.length}`);
console.log(
  `columns total     : ${[...columnsByTable.values()].reduce((a, c) => a + c.size, 0)}`,
);
console.log("");

if (ddlProblems.length) {
  console.log("DDL PROBLEMS");
  for (const p of ddlProblems) console.log(`  ${p.file}:${p.line}  ${p.text}`);
  console.log("");
} else {
  console.log("DDL PROBLEMS   : none found");
}

if (unknownTables.length) {
  console.log("TABLES REFERENCED BY TS WITH NO DDL");
  for (const u of unknownTables) console.log(`  ${u.file} -> ${u.table}`);
  console.log("");
} else {
  console.log("UNKNOWN TABLES : none");
}

if (embedProblems.length) {
  console.log("EMBEDDING PROBLEMS (PostgREST cannot resolve these selects)");
  for (const p of embedProblems) console.log(`  ${p}`);
  console.log("");
} else {
  console.log(`EMBEDDINGS      : ${embeddings.length} resolvable through a single FK`);
}

if (missing.length) {
  console.log("COLUMN MISMATCHES");
  for (const m of missing)
    console.log(`  ${m.file}  ${m.table}.${m.column}  (${m.note})`);
  console.log("");
  console.log(`FAIL - ${missing.length} column(s) the app asks for do not exist.`);
  process.exit(1);
} else if (embedProblems.length) {
  console.log(`FAIL - ${embedProblems.length} embedding(s) are not resolvable.`);
  process.exit(1);
} else {
  console.log("COLUMN MISMATCHES : none");
  console.log("");
  console.log("PASS - every column and every embed the TypeScript layer reads exists in the DDL.");
}
