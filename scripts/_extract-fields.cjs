const fs = require("fs");
const os = require("os");
const path = require("path");
const html = fs.readFileSync(path.join(os.tmpdir(), "rk-login.html"), "utf8");
const re = /<input type="hidden" name="([^"]+)"(?: value="([^"]*)")?\/>/g;
let m;
const fields = [];
while ((m = re.exec(html))) {
  fields.push([m[1], (m[2] || "").replace(/&quot;/g, '"').replace(/&amp;/g, "&")]);
}
for (const [k, v] of fields) console.log(k, "=", v.slice(0, 160));
fs.writeFileSync(path.join(os.tmpdir(), "rk-fields.json"), JSON.stringify(fields));
