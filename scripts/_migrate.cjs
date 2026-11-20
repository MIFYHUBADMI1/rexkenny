const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const host = "aws-1-eu-west-1.pooler.supabase.com";
const user = "postgres.wachifqnivqadwsthfiz";
const dbpass = process.env.DB_PASS;
if (!dbpass) { console.log("DB_PASS env required"); process.exit(1); }

(async () => {
  const c = new Client({
    host, port: 5432, user, password: dbpass, database: "postgres",
    ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000,
  });
  await c.connect();
  console.log("connected");

  await c.query(fs.readFileSync("supabase/reset-public-schema.sql", "utf8"));
  console.log("reset ok");

  const dir = "supabase/migrations";
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  for (const f of files) {
    try {
      await c.query(fs.readFileSync(path.join(dir, f), "utf8"));
      console.log("OK  ", f);
    } catch (e) {
      console.log("FAIL", f, "->", e.message);
      process.exitCode = 1;
      break;
    }
  }
  await c.end();
})();
