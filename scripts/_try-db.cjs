const { Client } = require("pg");

const host = "aws-1-eu-west-1.pooler.supabase.com";
const user = "postgres.wachifqnivqadwsthfiz";
const candidates = ["@rexkenny47", "rexkenny47@", "RexKenny47", "rexkenny47"];

function tryConnect(pw) {
  return new Promise((resolve) => {
    const c = new Client({
      host, port: 5432, user, password: pw, database: "postgres",
      connectionTimeoutMillis: 8000,
      ssl: { rejectUnauthorized: false },
    });
    c.connect()
      .then(() => c.query("select 1").then(() => { c.end(); resolve(true); }))
      .catch((e) => { c.end().catch(() => {}); resolve(e.message.slice(0, 100)); });
  });
}

(async () => {
  for (const pw of candidates) {
    const r = await tryConnect(pw);
    if (r === true) {
      console.log("SUCCESS password:", JSON.stringify(pw));
      return;
    }
    console.log("fail", JSON.stringify(pw), "->", r);
  }
  console.log("none worked");
})();
