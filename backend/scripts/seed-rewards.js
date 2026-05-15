/**
 * Seed sticker rewards into the local PostgreSQL database.
 *
 * Usage:
 *   npm run seed:rewards
 *
 * The images are expected to already exist in Supabase Storage under:
 *   {SUPABASE_URL}/storage/v1/object/public/{SUPABASE_BUCKET}/avatars/{file}
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

function loadEnv() {
  const envPath = path.resolve(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;

  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex <= 0) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnv();

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET || 'media';

if (!SUPABASE_URL) {
  console.error('Missing SUPABASE_URL. Please set it in backend/.env first.');
  process.exit(1);
}

const publicBaseUrl = `${SUPABASE_URL}/storage/v1/object/public/${SUPABASE_BUCKET}`;

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME || 'readease',
  user: process.env.DB_USER || 'readease_app',
  password: process.env.DB_PASSWORD || 'devpassword',
};

const rewards = [
  { name: 'Chú Ong Bay', file: 'flyingbee.png', cost: 40 },
  { name: 'Quái Vật Thân Thiện', file: 'FriendlyMonster.png', cost: 50 },
  { name: 'Nhân Vật Mua Sắm', file: 'Shopping.png', cost: 50 },
  { name: 'Người Lớn', file: 'nguoilun.png', cost: 50 },
  { name: 'Người Cầm Đuốc', file: 'torch.png', cost: 50 },
  { name: 'Đọc Sách Trên Cỏ', file: 'readinggrass.png', cost: 50 },
  { name: 'Cung Thủ', file: 'archers.png', cost: 60 },
  { name: 'Nhạc Sĩ', file: 'bards.png', cost: 60 },
  { name: 'Lính Cứu Hỏa', file: 'firefighter.png', cost: 60 },
  { name: 'Nhà Du Mục', file: 'nomad.png', cost: 60 },
  { name: 'Y Tá', file: 'nurse.png', cost: 60 },
  { name: 'Nhân Vật Orc', file: 'Orcbs.png', cost: 70 },
  { name: 'Ca Sĩ Nữ', file: 'femalesinger.png', cost: 70 },
  { name: 'Hiệp Sĩ', file: 'knight.png', cost: 70 },
  { name: 'Ca Sĩ Nam', file: 'malesinger.png', cost: 70 },
  { name: 'Phú Ông', file: 'richman.png', cost: 70 },
  { name: 'Nhân Vật Giám Mục', file: 'Bishops.png', cost: 80 },
  { name: 'Phi Hành Gia', file: 'astronaut.png', cost: 80 },
  { name: 'Thần Tiên', file: 'elven.png', cost: 80 },
  { name: 'Quý Tộc', file: 'noble.png', cost: 80 },
  { name: 'Nhân Vật Tiefling', file: 'Tieflings.png', cost: 90 },
  { name: 'Kim Ngưu', file: 'taurus.png', cost: 90 },
  { name: 'Phù Thủy', file: 'witch.png', cost: 90 },
  { name: 'Nhân Vật Dragon', file: 'dragonborn.png', cost: 100 },
];

async function upsertReward(client, reward) {
  const imageUrl = `${publicBaseUrl}/avatars/${encodeURIComponent(reward.file)}`;

  const existing = await client.query(
    `
    SELECT id
    FROM rewards
    WHERE name = $1
    ORDER BY created_at ASC
    LIMIT 1
    `,
    [reward.name],
  );

  if (existing.rowCount > 0) {
    await client.query(
      `
      UPDATE rewards
      SET description = $2,
          cost = $3,
          image_url = $4,
          is_active = true,
          stock = NULL
      WHERE id = $1
      `,
      [
        existing.rows[0].id,
        'Sticker avatar để học sinh đổi bằng token',
        reward.cost,
        imageUrl,
      ],
    );
    return 'updated';
  }

  await client.query(
    `
    INSERT INTO rewards (name, description, cost, image_url, is_active, stock)
    VALUES ($1, $2, $3, $4, true, NULL)
    `,
    [reward.name, 'Sticker avatar để học sinh đổi bằng token', reward.cost, imageUrl],
  );
  return 'inserted';
}

async function main() {
  const client = new Client(dbConfig);
  await client.connect();

  let inserted = 0;
  let updated = 0;

  try {
    await client.query('BEGIN');

    for (const reward of rewards) {
      const result = await upsertReward(client, reward);
      if (result === 'inserted') inserted += 1;
      if (result === 'updated') updated += 1;
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }

  console.log(`Seeded rewards: ${inserted} inserted, ${updated} updated.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
