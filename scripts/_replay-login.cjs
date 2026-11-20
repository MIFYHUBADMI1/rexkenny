const fs = require("fs");
const os = require("os");
const path = require("path");

const fields = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), "rk-fields.json"), "utf8"));
const cut = fields.findIndex(([k], i) => i > 0 && k === "$ACTION_REF_3");
const signInFields = fields.slice(0, cut);

const fd = new FormData();
for (const [k, v] of signInFields) fd.set(k, v);
fd.set("email", "rexkennymusic@gmail.com");
fd.set("password", "rexkenny47");
fd.set("next", "/admin");

(async () => {
  const r = await fetch("https://rexkenny.music.atai.ink/auth/login?next=%2Fadmin", {
    method: "POST",
    body: fd,
    redirect: "manual",
  });
  console.log("status:", r.status, "| location:", r.headers.get("location"));
  const cookies = typeof r.headers.getSetCookie === "function" ? r.headers.getSetCookie() : [];
  console.log("set-cookie count:", cookies.length);
  for (const c of cookies) console.log("  ", c.slice(0, 140));
})();
