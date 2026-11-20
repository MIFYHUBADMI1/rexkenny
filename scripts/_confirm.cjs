const fs = require("fs");
const env = {};
for (const l of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = l.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, "");
}
const { createClient } = require("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

(async () => {
  const uid = "f5029e21-b090-4188-9998-03f5507c9610";
  const { data, error } = await sb.auth.admin.getUserById(uid);
  if (error) { console.log("getUser ERR", error.message); return; }
  const u = data.user;
  console.log("email_confirmed_at:", u.email_confirmed_at, "| banned:", u.banned_until, "| providers:", JSON.stringify(u.app_metadata?.providers));
  const r = await sb.auth.admin.updateUserById(uid, {
    email_confirm: true,
    password: "rexkenny47",
  });
  console.log("update:", r.error ? r.error.message : "ok, confirmed + password set");
})();
