const BASE = process.env.BASE_URL || "http://localhost:3000";

async function getFields() {
  const r = await fetch(BASE + "/auth/login?next=%2Fadmin");
  const html = await r.text();
  const re = /<input type="hidden" name="([^"]+)"(?: value="([^"]*)")?\/>/g;
  let m;
  const fields = [];
  while ((m = re.exec(html))) {
    fields.push([m[1], (m[2] || "").replace(/&quot;/g, '"').replace(/&amp;/g, "&")]);
  }
  // first form only: up to second $ACTION_REF
  const cut = fields.findIndex(([k], i) => i > 0 && k.startsWith("$ACTION_REF_"));
  // actually there are two forms; find index of second $ACTION_REF
  const refs = fields.map(([k], i) => [k, i]).filter(([k]) => k.startsWith("$ACTION_REF_"));
  const end = refs.length > 1 ? refs[1][1] : fields.length;
  return fields.slice(0, end);
}

(async () => {
  const fields = await getFields();
  console.log("fields:", fields.map(([k]) => k).join(", "));
  const fd = new FormData();
  for (const [k, v] of fields) fd.set(k, v);
  fd.set("email", "rexkennymusic@gmail.com");
  fd.set("password", "rexkenny47");
  fd.set("next", "/admin");

  const r = await fetch(BASE + "/auth/login?next=%2Fadmin", {
    method: "POST",
    body: fd,
    redirect: "manual",
  });
  console.log("status:", r.status, "| location:", r.headers.get("location"));
  const cookies = typeof r.headers.getSetCookie === "function" ? r.headers.getSetCookie() : [];
  console.log("set-cookie count:", cookies.length);
  for (const c of cookies) console.log("  ", c.slice(0, 120));
})();
