/**
 * scripts/storage-seed.js
 *
 * All-in-one script:
 *   Step 1 — Delete all files in avatars/ and general/ on Supabase
 *   Step 2 — Upload sticker/ → avatars/, bia/ → general/covers/
 *   Step 3 — Print SQL to update DB (run separately)
 *
 * Usage:
 *   node scripts/storage-seed.js
 *
 * Required env vars (add to .env or set inline):
 *   SUPABASE_URL=https://xxxx.supabase.co
 *   SUPABASE_SERVICE_KEY=eyJ...
 *   SUPABASE_BUCKET=media
 */

// Load .env manually (no dotenv needed — uses only built-in modules for loading)
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', 'backend', '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const m = line.match(/^([^#=\s]+)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  });
}

const { createClient } = require('@supabase/supabase-js');

// ── Config ──────────────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const BUCKET = process.env.SUPABASE_BUCKET || 'media';

const BIA_DIR = path.join('D:', 'WorkSpace', 'CAP2', 'readEase', 'readEase', 'b\u00eca');
const STICKER_DIR = path.join('D:', 'WorkSpace', 'CAP2', 'readEase', 'readEase', 'sticker');

// Mapping sticker filename → { supabaseName, rewardName, cost }
const STICKER_MAP = [
  { file: 'Bishops.png',                                       name: 'Bishops.png',        rewardName: 'Nh\u00e2n V\u1eadt Gi\u00e1m M\u1ee5c',      cost: 80  },
  { file: 'Friendly monster waving a flag.png',                name: 'FriendlyMonster.png', rewardName: 'Qu\u00e1i V\u1eadt Th\u00e2n Thi\u1ec7n',    cost: 50  },
  { file: 'Orcbs.png',                                         name: 'Orcbs.png',          rewardName: 'Nh\u00e2n V\u1eadt Orc',           cost: 70  },
  { file: 'Shopping.png',                                      name: 'Shopping.png',       rewardName: 'Nh\u00e2n V\u1eadt Mua S\u1eafm',       cost: 50  },
  { file: 'Tieflings.png',                                     name: 'Tieflings.png',      rewardName: 'Nh\u00e2n V\u1eadt Tiefling',       cost: 90  },
  { file: 'archers.png',                                       name: 'archers.png',        rewardName: 'Cung Th\u1ee7',                cost: 60  },
  { file: 'astronaut.png',                                     name: 'astronaut.png',      rewardName: 'Phi H\u00e0nh Gia \ud83d\ude80',         cost: 80  },
  { file: 'bards.png',                                         name: 'bards.png',          rewardName: 'Nh\u1ea1c S\u0129',                cost: 60  },
  { file: 'dragonborn.png',                                    name: 'dragonborn.png',     rewardName: 'Nh\u00e2n V\u1eadt Dragon \ud83d\udc09',     cost: 100 },
  { file: 'elven.png',                                         name: 'elven.png',          rewardName: 'Th\u1ea7n Ti\u00ean \u2728',            cost: 80  },
  { file: 'femalesinger.png',                                  name: 'femalesinger.png',   rewardName: 'Ca S\u0129 N\u1eef \ud83c\udfa4',          cost: 70  },
  { file: 'firefighter.png',                                   name: 'firefighter.png',    rewardName: 'L\u00ednh C\u1ee9u H\u1ecfa \ud83d\ude92',        cost: 60  },
  { file: 'flying bee.png',                                    name: 'flyingbee.png',      rewardName: 'Ch\u00fa Ong Bay \ud83d\udc1d',          cost: 40  },
  { file: 'knight.png',                                        name: 'knight.png',         rewardName: 'Hi\u1ec7p S\u0129 \u2694\ufe0f',            cost: 70  },
  { file: 'malesinger.png',                                    name: 'malesinger.png',     rewardName: 'Ca S\u0129 Nam \ud83c\udfb5',            cost: 70  },
  { file: 'nguoilun.png',                                      name: 'nguoilun.png',       rewardName: 'Ng\u01b0\u1eddi L\u1edbn',              cost: 50  },
  { file: 'noble.png',                                         name: 'noble.png',          rewardName: 'Qu\u00fd T\u1ed9c \ud83d\udc51',            cost: 80  },
  { file: 'nomad.png',                                         name: 'nomad.png',          rewardName: 'Nh\u00e0 Du M\u1ee5c',              cost: 60  },
  { file: 'raising fire torch.png',                            name: 'torch.png',          rewardName: 'Ng\u01b0\u1eddi C\u1ea7m \u0110u\u1ed1c \ud83d\udd25',       cost: 50  },
  { file: 'reading book and sitting on the grass.png',         name: 'readinggrass.png',   rewardName: '\u0110\u1ecdc S\u00e1ch Tr\u00ean C\u1ecf \ud83d\udcda',      cost: 50  },
  { file: 'richman.png',                                       name: 'richman.png',        rewardName: 'Ph\u00fa \u00d4ng \ud83d\udcb0',             cost: 70  },
  { file: 'taurus.png',                                        name: 'taurus.png',         rewardName: 'Kim Ng\u01b0u \u2649',             cost: 90  },
  { file: 'wearing nurse kit and using stethoscope.png',       name: 'nurse.png',          rewardName: 'Y T\u00e1 \ud83d\udc69\u200d\u2695\ufe0f',             cost: 60  },
  { file: 'witch.png',                                         name: 'witch.png',          rewardName: 'Ph\u00f9 Th\u1ee7y \ud83e\uddd9',           cost: 90  },
];

// Mapping bia filename → { supabaseName, bookTitle }
const BIA_MAP = [
  { file: 'sttt.jpg',       name: 'sttt.jpg',       bookTitle: 'S\u1ef1 t\u00edch c\u00e2y Kh\u1ebf'  },
  { file: 'thanhgiong.jpg', name: 'thanhgiong.jpg', bookTitle: 'Th\u00e1nh Gi\u00f3ng'         },
  { file: 'dua-hau.jpg',    name: 'dua-hau.jpg',    bookTitle: 'S\u1ef1 t\u00edch D\u01b0a H\u1ea5u'   },
  { file: 'bcbg.jpg',       name: 'bcbg.jpg',       bookTitle: 'B\u1ea1ch C\u1ea7m B\u1ea1ch Gi\u1ecfi'   },
  { file: '01.png',         name: '01.png',         bookTitle: null                  }, // placeholder
  { file: 'anh-mo-ta.png',  name: 'anh-mo-ta.png',  bookTitle: null                  }, // placeholder
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function getContentType(filename) {
  const ext = path.extname(filename).toLowerCase();
  const map = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
  return map[ext] || 'application/octet-stream';
}

async function deleteFolder(supabase, folder) {
  console.log(`\n[CLEANUP] Listing files in ${folder}/...`);
  const { data, error } = await supabase.storage.from(BUCKET).list(folder, { limit: 1000 });
  if (error) { console.error(`  ERROR listing: ${error.message}`); return; }
  if (!data || data.length === 0) { console.log(`  (empty)`); return; }

  const paths = data.map(f => `${folder}/${f.name}`);
  console.log(`  Found ${paths.length} files. Deleting...`);
  const { error: delErr } = await supabase.storage.from(BUCKET).remove(paths);
  if (delErr) { console.error(`  ERROR deleting: ${delErr.message}`); }
  else { console.log(`  Deleted ${paths.length} files.`); }
}

async function uploadFile(supabase, localPath, storagePath) {
  const buffer = fs.readFileSync(localPath);
  const contentType = getContentType(localPath);
  const { error } = await supabase.storage.from(BUCKET).upload(storagePath, buffer, {
    contentType,
    upsert: true,
  });
  if (error) {
    console.error(`  [FAIL] ${storagePath}: ${error.message}`);
    return null;
  }
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
  console.log(`  [OK]   ${storagePath}`);
  return data.publicUrl;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('ERROR: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env');
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  console.log(`Connected to Supabase: ${SUPABASE_URL}`);
  console.log(`Bucket: ${BUCKET}`);

  // ── STEP 1: Cleanup ────────────────────────────────────────────────────────
  console.log('\n========== STEP 1: CLEANUP ==========');
  await deleteFolder(supabase, 'avatars');
  await deleteFolder(supabase, 'general');

  // ── STEP 2a: Upload stickers → avatars/ ───────────────────────────────────
  console.log('\n========== STEP 2a: UPLOAD STICKERS → avatars/ ==========');
  const stickerUrls = {};
  for (const item of STICKER_MAP) {
    const localPath = path.join(STICKER_DIR, item.file);
    if (!fs.existsSync(localPath)) { console.warn(`  [SKIP] File not found: ${localPath}`); continue; }
    const url = await uploadFile(supabase, localPath, `avatars/${item.name}`);
    if (url) stickerUrls[item.name] = url;
  }

  // ── STEP 2b: Upload covers → general/covers/ ──────────────────────────────
  console.log('\n========== STEP 2b: UPLOAD COVERS → general/covers/ ==========');
  const coverUrls = {};
  for (const item of BIA_MAP) {
    const localPath = path.join(BIA_DIR, item.file);
    if (!fs.existsSync(localPath)) { console.warn(`  [SKIP] File not found: ${localPath}`); continue; }
    const url = await uploadFile(supabase, localPath, `general/covers/${item.name}`);
    if (url) coverUrls[item.name] = url;
  }

  // ── STEP 3: Print SQL ──────────────────────────────────────────────────────
  console.log('\n========== STEP 3: SQL TO RUN ==========');
  console.log('-- Copy and run this SQL in: docker exec -i readease_db psql -U readease_app -d readease\n');

  // 3a. Delete fake rewards
  console.log(`-- Delete fake rewards (dicebear URLs)`);
  console.log(`DELETE FROM rewards WHERE image_url LIKE '%dicebear%';`);
  console.log('');

  // 3b. Insert real rewards
  console.log(`-- Insert 24 real sticker rewards`);
  for (const item of STICKER_MAP) {
    const url = stickerUrls[item.name] || '';
    const name = item.rewardName.replace(/'/g, "''");
    console.log(`INSERT INTO rewards (name, description, cost, image_url, is_active) VALUES ('${name}', 'Nh\u00e2n v\u1eadt avatar \u0111\u1eb7c bi\u1ec7t', ${item.cost}, '${url}', true);`);
  }
  console.log('');

  // 3c. Update cover for "Sự tích cây Khế" (existing)
  const kheUrl = coverUrls['sttt.jpg'] || '';
  console.log(`-- Update cover for existing book "S\u1ef1 t\u00edch c\u00e2y Kh\u1ebf"`);
  console.log(`UPDATE reading_content SET cover_image_url = '${kheUrl}' WHERE title ILIKE '%kh\u1ebf%';`);
  console.log('');

  // 3d. Insert new books (if cover exists)
  const newBooks = [
    { file: 'thanhgiong.jpg', title: 'Th\u00e1nh Gi\u00f3ng', difficulty: 'MEDIUM', age_group: '6-9', word_count: 320 },
    { file: 'dua-hau.jpg',    title: 'S\u1ef1 t\u00edch D\u01b0a H\u1ea5u', difficulty: 'EASY',   age_group: '5-8', word_count: 210 },
    { file: 'bcbg.jpg',       title: 'B\u1ea1ch C\u1ea7m B\u1ea1ch Gi\u1ecfi',   difficulty: 'EASY',   age_group: '5-8', word_count: 180 },
  ];
  console.log(`-- Insert new books with covers`);
  for (const book of newBooks) {
    const url = coverUrls[book.file] || '';
    if (!url) { console.log(`-- SKIP: no URL for ${book.file}`); continue; }
    const t = book.title.replace(/'/g, "''");
    console.log(`INSERT INTO reading_content (title, difficulty, age_group, word_count, cover_image_url) VALUES ('${t}', '${book.difficulty}', '${book.age_group}', ${book.word_count}, '${url}') ON CONFLICT DO NOTHING;`);
  }

  console.log('\n========== DONE ==========');
  console.log('Run the SQL above against your PostgreSQL database.');
}

main().catch(err => { console.error(err); process.exit(1); });
