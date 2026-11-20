const ids = [
  "00bf1a663607110aa50b96b5b0563013bb755d24b0",
  "60366388512f91a4ae54f37966087b5bf5ecf2c89d",
  "60bffe96f74d821d29b87aab68bd0085b721272327",
  "60c9eb6ff8b1321b35787903393a673f654eb9151d",
];
const url = "https://rexkenny.music.atai.ink/auth/login?next=%2Fadmin";

(async () => {
  for (const id of ids) {
    const fd = new FormData();
    fd.set("email", "rexkennymusic@gmail.com");
    fd.set("password", "rexkenny47");
    fd.set("next", "/admin");
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Next-Action": id },
        body: fd,
        redirect: "manual",
      });
      const text = await r.text();
      console.log("=== ID", id.slice(0, 12), "status", r.status);
      for (const h of ["x-action-redirect", "x-action-revalidated", "content-type"]) {
        const v = r.headers.get(h);
        if (v) console.log("   ", h, "=", v.slice(0, 200));
      }
      console.log("    body:", text.slice(0, 300).replace(/\n/g, " "));
    } catch (e) {
      console.log("=== ID", id.slice(0, 12), "fetch error", e.message);
    }
  }
})();
