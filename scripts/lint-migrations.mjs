// scripts/lint-migrations.mjs
//
// No PostgreSQL is available in this environment, so the migrations cannot be
// executed. This linter checks the structural facts that would make them fail to
// apply, using a statement splitter that understands dollar-quoted function
// bodies, single-quoted strings, parentheses and -- comments.
//
// What it verifies, in dependency order:
//   1. every statement is self-contained and parenthesis-balanced
//   2. FKs, indexes, policies, triggers and INSERTs point at real tables/columns
//   3. INSERT column lists match their VALUES arity
//   4. trigger + policy bodies call functions that are actually defined
//   5. every table in public has RLS enabled and at least one policy (or is
//      explicitly exempt, e.g. a view)
//   6. every table with an updated_at column has the set_updated_at trigger
//
// Usage: node scripts/lint-migrations.mjs

import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(root, "supabase", "migrations");
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

/* ---------- helpers ---------- */

function splitStatements(sql) {
  const out = [];
  let buf = "";
  let line = 1;
  let startLine = 1;
  let quote = null;
  let dollarTag = null;
  let depth = 0;

  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    if (c === "\n") line++;

    if (dollarTag) {
      if (sql.startsWith(dollarTag, i)) {
        buf += dollarTag;
        i += dollarTag.length - 1;
        dollarTag = null;
      } else buf += c;
      continue;
    }
    if (quote) {
      buf += c;
      if (c === quote) quote = null;
      continue;
    }
    if (c === "'") { quote = c; buf += c; continue; }
    if (c === "$") {
      const m = /^\$[a-zA-Z0-9_]*\$/.exec(sql.slice(i));
      if (m) { dollarTag = m[0]; buf += m[0]; i += m[0].length - 1; continue; }
    }
    if (c === "-" && sql[i + 1] === "-") {
      while (i < sql.length && sql[i] !== "\n") i++;
      buf += "\n";
      continue;
    }
    if (c === "(") depth++;
    if (c === ")") depth--;
    if (depth < 0) {
      out.push({ text: buf, startLine, unbalanced: true });
      buf = "";
      depth = 0;
      continue;
    }
    if (c === ";" && depth === 0) {
      if (buf.trim()) out.push({ text: buf, startLine, endLine: line });
      buf = "";
      startLine = line + 1;
      continue;
    }
    buf += c;
  }
  if (buf.trim()) out.push({ text: buf, startLine, unterminated: true });
  return out;
}

function splitTopLevel(body) {
  const parts = [];
  let depth = 0, quote = null, cur = "";
  for (const ch of body) {
    if (quote) { cur += ch; if (ch === quote) quote = null; continue; }
    if (ch === "'" || ch === '"') { quote = ch; cur += ch; continue; }
    if (ch === "(" || ch === "[") depth++;
    if (ch === ")" || ch === "]") depth--;
    if (ch === "," && depth === 0) { parts.push(cur); cur = ""; continue; }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  return parts.map((p) => p.replace(/\s+/g, " ").trim()).filter(Boolean);
}

const clean = (t) => t.replace(/--[^\n]*/g, "").replace(/\s+/g, " ").trim();
const CONSTRAINT_WORDS = new Set(["constraint", "primary", "unique", "foreign", "check", "exclude", "like"]);

/* ---------- pass 1: definitions ---------- */

const columns = new Map(); // table -> Set(column)
const tableFiles = new Map(); // table -> file
const views = new Set();
const functions = new Set();
const rlsOn = new Set();
const policyCount = new Map();
const updatedAtTriggers = new Set();
const allTables = new Set();

function note(table, file) {
  if (!columns.has(table)) {
    columns.set(table, new Set());
    tableFiles.set(table, file);
  }
  allTables.add(table);
  return columns.get(table);
}

const parsed = [];

for (const file of files) {
  const sql = readFileSync(join(dir, file), "utf8");
  const stmts = splitStatements(sql).map((s) => ({ ...s, flat: clean(s.text) }));
  parsed.push({ file, stmts });

  for (const s of stmts) {
    const t = s.flat;

    let m = /^create table (?:if not exists )?([a-z_"]+)\.([a-z_][a-z0-9_]*) \((.*)\)$/i.exec(t);
    if (m) {
      const name = m[2];
      const cols = note(name, file);
      for (const part of splitTopLevel(m[3])) {
        const first = (part.split(" ")[0] ?? "").toLowerCase();
        if (!CONSTRAINT_WORDS.has(first) && /^[a-z_][a-z0-9_]*$/.test(first)) cols.add(first);
      }
      continue;
    }

    m = /^create (?:or replace )?view ([a-z_"]+)\.([a-z_][a-z0-9_]*)/i.exec(t);
    if (m) { views.add(m[2]); note(m[2], file); continue; }

    m = /^create or replace function ([a-z_]+\.[a-z_]+)\s*\(/i.exec(t);
    if (m) { functions.add(m[1]); continue; }

    m = /^alter table (?:only )?([a-z_"]+)\.([a-z_][a-z0-9_]*)(.*)$/i.exec(t);
    if (m) {
      const cols = note(m[2], file);
      const addCol = /add column (?:if not exists )?([a-z_][a-z0-9_]*)/i.exec(m[3]);
      if (addCol) cols.add(addCol[1]);
      if (/enable row level security/i.test(m[3])) rlsOn.add(m[2]);
      continue;
    }

    m = /^create policy "[^"]*" on ([a-z_"]+)\.([a-z_][a-z0-9_]*)/i.exec(t);
    if (m) {
      policyCount.set(m[2], (policyCount.get(m[2]) ?? 0) + 1);
      continue;
    }

    m = /^create (?:\w+ )*trigger \w+ (?:before|after)[\s\S]* on ([a-z_"]+)\.([a-z_][a-z0-9_]*)/i.exec(t);
    if (m && /set_updated_at\(\)/i.test(t)) updatedAtTriggers.add(m[2]);
  }
}

/* ---------- pass 2: references ---------- */

const problems = [];
const push = (file, line, msg) => problems.push({ file, line, msg });

for (const { file, stmts } of parsed) {
  for (const s of stmts) {
    const t = s.flat;
    const line = s.startLine;

    if (s.unbalanced) push(file, line, "statement has more ) than ( — check the block above it");
    if (s.unterminated) push(file, line, "statement does not end with ;");

    // FK targets must exist.
    for (const ref of t.matchAll(/references ([a-z_"]+)\.([a-z_][a-z0-9_]*)(?: \(([a-z_][a-z0-9_]*)\))?/gi)) {
      if (ref[1] !== "public" && ref[1] !== "storage" && ref[1] !== "auth") continue;
      if (ref[1] === "auth") continue; // managed by Supabase
      if (!allTables.has(ref[2])) {
        push(file, line, `FK references undefined table ${ref[2]}`);
      } else if (ref[3] && !columns.get(ref[2]).has(ref[3])) {
        push(file, line, `FK references undefined column ${ref[2]}.${ref[3]}`);
      }
    }

    // INSERT column lists and arity.
    let m = /^insert into ([a-z_"]+)\.([a-z_][a-z0-9_]*) \(([^)]*)\)([\s\S]*)$/i.exec(t);
    if (m && m[1] === "storage" && m[2] === "buckets") continue; // storage meta-table
    if (m) {
      const table = m[2];
      if (!allTables.has(table)) {
        push(file, line, `INSERT into undefined table ${table}`);
      } else {
        const cols = columns.get(table);
        const listed = m[3].split(",").map((c) => c.trim()).filter(Boolean);
        for (const c of listed) {
          if (cols.size && !cols.has(c)) push(file, line, `INSERT ${table}.${c}: column not created`);
        }
        const valuesPart = /^values([\s\S]*)$/i.exec(m[4].replace(/^on conflict[\s\S]*$/, "").trim());
        if (valuesPart) {
          const rows = splitTopLevel(valuesPart[1].replace(/\), *\(/g, ")|("));
          for (const row of rows) {
            const inner = /^\(([\s\S]*)\)$/.exec(row);
            if (!inner) continue;
            const n = splitTopLevel(inner[1]).length;
            if (n !== listed.length)
              push(file, line, `INSERT ${table}: ${listed.length} columns vs ${n} values`);
          }
        }
      }
      continue;
    }

    // Index column names.
    m = /^create (?:unique )?index \w+ on ([a-z_"]+)\.([a-z_][a-z0-9_]*) \(([^]*?)\)(?: where| using|$)/i.exec(t);
    if (m && m[1] !== "storage") {
      const table = m[2];
      if (!allTables.has(table)) push(file, line, `INDEX on undefined table ${table}`);
      else {
        const cols = columns.get(table);
        for (const token of splitTopLevel(m[3])) {
          if (/\(/.test(token)) continue; // expression index
          const id = token.split(" ")[0];
          if (/^(desc|asc|nulls|first|last)$/i.test(id)) continue;
          if (cols.size && !cols.has(id)) push(file, line, `INDEX ${table}.${id}: column not created`);
        }
      }
      continue;
    }

    // Policies, triggers, grants on real tables.
    m =
      /^(?:create policy "[^"]*" on\s+|alter table (?:only )?|grant [\s\S]*? on\s+|revoke [\s\S]*? on\s+)([a-z_"]+)\.([a-z_][a-z0-9_]*)/i.exec(
        t,
      );
    if (m && m[1] === "public" && !allTables.has(m[2])) {
      push(file, line, `statement targets undefined public.${m[2]}`);
    }

    m = /execute function ([a-z_]+\.[a-z_]+)\(?/i.exec(t);
    if (m && !functions.has(m[1])) push(file, line, `trigger calls undefined function ${m[1]}()`);

    for (const call of t.matchAll(/public\.((?:record_audit|queue_email_campaign|recount_email_campaign|contact_submission_is_throttled|release_is_public|release_is_editable|bootstrap_super_admin|has_role|is_staff|is_admin|can_edit_content|auth_uid|current_jwt_roles|is_valid_slug|sync_jwt_roles))\s*\(/g)) {
      const fn = `public.${call[1]}`;
      if (!functions.has(fn)) push(file, line, `calls undefined function ${fn}()`);
    }
  }
}

/* ---------- pass 3: coverage ---------- */

const exempt = new Set([...views]);
// Tables whose updated_at is written by the upsert itself rather than a trigger.
const manualUpdatedAt = new Set(["page_views"]);
const warnings = [];

for (const table of [...allTables].sort()) {
  const file = tableFiles.get(table);
  if (exempt.has(table)) continue;
  if (!rlsOn.has(table)) warnings.push(`${file}  table ${table}: RLS is not enabled`);
  if ((policyCount.get(table) ?? 0) === 0)
    warnings.push(`${file}  table ${table}: no policies (invisible to every API role)`);

  const cols = columns.get(table);
  if (cols.has("updated_at") && !updatedAtTriggers.has(table) && !manualUpdatedAt.has(table))
    warnings.push(`${file}  table ${table}: has updated_at but no set_updated_at trigger`);
}

// A trigger that reads the record its operation leaves unassigned aborts at the
// first write. NEW and OLD must be picked per TG_OP.
for (const { file, stmts } of parsed) {
  for (const s of stmts) {
    if (!/^create or replace function/i.test(s.flat)) continue;
    const body = s.text;
    const fnName = /function ([a-z_]+\.[a-z_]+)/i.exec(s.flat)?.[1] ?? "?";
    const usesNew = /\bnew\.[a-z_]+/i.test(body);
    const usesOld = /\bold\.[a-z_]+/i.test(body);
    if (usesNew && usesOld && !/\btg_op\b/i.test(body)) {
      push(file, s.startLine, `${fnName} reads NEW and OLD without branching on TG_OP`);
    }
    // A volatile default in a CHECK constraint is fine; a subquery is not.
    if (/check\s*\(\s*select/i.test(body)) {
      push(file, s.startLine, `${fnName}: CHECK constraint would need a subquery`);
    }
  }
}

/* ---------- report ---------- */

let stmtCount = 0;
for (const { stmts } of parsed) stmtCount += stmts.length;

console.log(`files      : ${files.length}`);
console.log(`statements : ${stmtCount}`);
console.log(`tables     : ${allTables.size} (${views.size} view(s))`);
console.log(`functions  : ${functions.size}`);
console.log("");

if (problems.length) {
  console.log("ERRORS");
  for (const p of problems) console.log(`  ${p.file}:${p.line}  ${p.msg}`);
} else {
  console.log("ERRORS   : none");
}
console.log("");

if (warnings.length) {
  console.log("COVERAGE WARNINGS");
  for (const w of warnings) console.log(`  ${w}`);
} else {
  console.log("WARNINGS : none");
}
console.log("");

if (problems.length) {
  console.log(`FAIL - ${problems.length} structural error(s).`);
  process.exit(1);
}
if (warnings.length) {
  console.log(`PASS with ${warnings.length} coverage warning(s).`);
  process.exit(0);
}
console.log("PASS - migrations are structurally consistent.");
