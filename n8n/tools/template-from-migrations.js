// Finds a prompt_templates body in ../../supabase/migrations so the tool tests run against the SQL that ships, not a copy.
// Two insert shapes exist in the repo:
//   plain:  ('slug', N, $tag$...$tag$, ...)  or  select 'slug', N, $tag$...$tag$   (20260924_* use $body$, studio_21 style_sheet uses $sheet$)
//   jsonb:  insert into public.prompt_templates select (jsonb_populate_record(... 'version', N, ... 'body', $tag$...$tag$ ...)).*
//           from public.prompt_templates t where t.slug = 'slug' ...   (studio_18 / studio_21; per-template tags such as $profiler$)
// The dollar tag is captured and matched by backreference, so any tag works. Returns { body, file } or null.
const fs = require('fs');
const path = require('path');

const migrationsDir = path.resolve(__dirname, '..', '..', 'supabase', 'migrations');
const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function templateFromSql(sql, slug, version) {
  const plain = sql.match(new RegExp("'" + esc(slug) + "',\\s*" + Number(version) + ",\\s*\\$(\\w+)\\$([\\s\\S]*?)\\$\\1\\$"));
  if (plain) return plain[2];
  for (const chunk of sql.split(/(?=insert\s+into\s+public\.prompt_templates)/i)) {
    if (!new RegExp("'version',\\s*" + Number(version) + "\\b").test(chunk) || !new RegExp("\\bslug\\s*=\\s*'" + esc(slug) + "'").test(chunk)) continue;
    const m = chunk.match(/'body',\s*\$(\w+)\$([\s\S]*?)\$\1\$/);
    if (m) return m[2];
  }
  return null;
}

function templateFromMigrations(slug, version) {
  if (!fs.existsSync(migrationsDir)) return null;
  for (const f of fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()) {
    const body = templateFromSql(fs.readFileSync(path.join(migrationsDir, f), 'utf8'), slug, version);
    if (body !== null) return { body, file: f };
  }
  return null;
}

module.exports = { templateFromMigrations, templateFromSql, migrationsDir };

if (require.main === module) {
  const [slug, version] = process.argv.slice(2);
  if (!slug || !version) { console.error('usage: node template-from-migrations.js <slug> <version>'); process.exit(2); }
  const r = templateFromMigrations(slug, version);
  if (!r) { console.error('not found'); process.exit(1); }
  console.error(r.file);
  process.stdout.write(r.body);
}
