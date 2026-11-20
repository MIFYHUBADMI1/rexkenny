const fs = require("fs");
const path = require("path");
const dir = "supabase/migrations";
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
  const sql = fs.readFileSync(path.join(dir, f), "utf8");
  const re = /create or replace function\s+([\w.]+)[\s\S]*?language\s+(sql|plpgsql)[\s\S]*?as\s*\$\$([\s\S]*?)\$\$/gi;
  let m;
  while ((m = re.exec(sql))) {
    if (m[2] === "sql") {
      const refs = (m[3].match(/(?:from|into|update|join)\s+[\w.]+/gi) || []).join(", ");
      console.log(f, "::", m[1], "->", refs || "(no table refs)");
    }
  }
}
