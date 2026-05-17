/**
 * Seed the current Vietnamese demo stories.
 *
 * Usage:
 *   npm run seed:stories
 *
 * The seed is idempotent. It upserts the 7 stories currently used for the
 * ReadEase demo and does not delete any other reading_content rows.
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

function getDbConfig() {
  const configuredHost = process.env.DB_HOST || 'localhost';
  const runningInDocker = fs.existsSync('/.dockerenv');
  const host = configuredHost === 'postgres' && !runningInDocker ? 'localhost' : configuredHost;

  return {
    host,
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME || process.env.POSTGRES_DB || 'readease',
    user: process.env.DB_USER || process.env.POSTGRES_USER || 'readease_app',
    password: process.env.DB_PASSWORD || process.env.POSTGRES_PASSWORD || 'devpassword',
  };
}

const stories = [
  {
    id: '63230074-f783-4c4d-8ff0-7b5f79b94ee6',
    title: 'Bánh Chưng Bánh Giày',
    difficulty: 'EASY',
    ageGroup: '6-9',
    wordCount: 84,
    coverImageUrl:
      'https://udncpujookwiwcuqahfg.supabase.co/storage/v1/object/public/media/test-stories/covers/1778762742188-banh-chung-banh-giay-cover.png',
    bodyUrl:
      'https://udncpujookwiwcuqahfg.supabase.co/storage/v1/object/public/media/demo-stories/banh-chung-banh-giay/body.txt',
    bodySegmentedUrl:
      'https://udncpujookwiwcuqahfg.supabase.co/storage/v1/object/public/media/demo-stories/banh-chung-banh-giay/segmented.txt',
  },
  {
    id: '1a5878e4-1a78-4c46-a673-8e650b4a18d4',
    title: 'Chú Cuội',
    difficulty: 'EASY',
    ageGroup: '6-9',
    wordCount: 84,
    coverImageUrl:
      'https://udncpujookwiwcuqahfg.supabase.co/storage/v1/object/public/media/test-stories/covers/1778762743917-chu-cuoi-cover.png',
    bodyUrl:
      'https://udncpujookwiwcuqahfg.supabase.co/storage/v1/object/public/media/demo-stories/chu-cuoi/body.txt',
    bodySegmentedUrl:
      'https://udncpujookwiwcuqahfg.supabase.co/storage/v1/object/public/media/demo-stories/chu-cuoi/segmented.txt',
  },
  {
    id: '3b530ece-eec4-49b7-b266-c4d5dcf4a5e4',
    title: 'Cây Tre Trăm Đốt',
    difficulty: 'MEDIUM',
    ageGroup: '7-10',
    wordCount: 92,
    coverImageUrl:
      'https://udncpujookwiwcuqahfg.supabase.co/storage/v1/object/public/media/test-stories/covers/1778762744748-cay-tre-tram-dot-cover.png',
    bodyUrl:
      'https://udncpujookwiwcuqahfg.supabase.co/storage/v1/object/public/media/demo-stories/cay-tre-tram-dot/body.txt',
    bodySegmentedUrl:
      'https://udncpujookwiwcuqahfg.supabase.co/storage/v1/object/public/media/demo-stories/cay-tre-tram-dot/segmented.txt',
  },
  {
    id: '1c2475d2-1ad6-46b7-876f-ad27cd241c65',
    title: 'Sơn Tinh Thủy Tinh',
    difficulty: 'MEDIUM',
    ageGroup: '7-10',
    wordCount: 82,
    coverImageUrl:
      'https://udncpujookwiwcuqahfg.supabase.co/storage/v1/object/public/media/test-stories/covers/1778762743297-son-tinh-thuy-tinh-cover.png',
    bodyUrl:
      'https://udncpujookwiwcuqahfg.supabase.co/storage/v1/object/public/media/demo-stories/son-tinh-thuy-tinh/body.txt',
    bodySegmentedUrl:
      'https://udncpujookwiwcuqahfg.supabase.co/storage/v1/object/public/media/demo-stories/son-tinh-thuy-tinh/segmented.txt',
  },
  {
    id: '53ce7af3-6d97-4a08-bbb1-63b6fca8ad1b',
    title: 'Sự Tích Dưa Hấu',
    difficulty: 'EASY',
    ageGroup: '6-9',
    wordCount: 86,
    coverImageUrl:
      'https://udncpujookwiwcuqahfg.supabase.co/storage/v1/object/public/media/test-stories/covers/1778762742687-su-tich-dua-hau-cover.png',
    bodyUrl:
      'https://udncpujookwiwcuqahfg.supabase.co/storage/v1/object/public/media/demo-stories/su-tich-dua-hau/body.txt',
    bodySegmentedUrl:
      'https://udncpujookwiwcuqahfg.supabase.co/storage/v1/object/public/media/demo-stories/su-tich-dua-hau/segmented.txt',
  },
  {
    id: '7b321f67-4ad1-425d-b6a3-dc91f81be31d',
    title: 'Thánh Gióng',
    difficulty: 'MEDIUM',
    ageGroup: '7-10',
    wordCount: 81,
    coverImageUrl:
      'https://udncpujookwiwcuqahfg.supabase.co/storage/v1/object/public/media/test-stories/covers/1778762740744-thanh-giong-cover.png',
    bodyUrl:
      'https://udncpujookwiwcuqahfg.supabase.co/storage/v1/object/public/media/demo-stories/thanh-giong/body.txt',
    bodySegmentedUrl:
      'https://udncpujookwiwcuqahfg.supabase.co/storage/v1/object/public/media/demo-stories/thanh-giong/segmented.txt',
  },
  {
    id: 'bd7c3535-3243-4871-bde2-41689b138ae9',
    title: 'Thỏ Và Rùa',
    difficulty: 'EASY',
    ageGroup: '5-8',
    wordCount: 79,
    coverImageUrl:
      'https://udncpujookwiwcuqahfg.supabase.co/storage/v1/object/public/media/test-stories/covers/1778762744365-tho-va-rua-cover.png',
    bodyUrl:
      'https://udncpujookwiwcuqahfg.supabase.co/storage/v1/object/public/media/demo-stories/tho-va-rua/body.txt',
    bodySegmentedUrl:
      'https://udncpujookwiwcuqahfg.supabase.co/storage/v1/object/public/media/demo-stories/tho-va-rua/segmented.txt',
  },
];

async function upsertStory(client, story) {
  const existing = await client.query('SELECT id FROM reading_content WHERE id = $1', [story.id]);

  await client.query(
    `
    INSERT INTO reading_content (
      id,
      title,
      difficulty,
      age_group,
      word_count,
      cover_image_url,
      body_url,
      body_segmented_url,
      deleted_at,
      created_at,
      updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULL, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE
    SET title = EXCLUDED.title,
        difficulty = EXCLUDED.difficulty,
        age_group = EXCLUDED.age_group,
        word_count = EXCLUDED.word_count,
        cover_image_url = EXCLUDED.cover_image_url,
        body_url = EXCLUDED.body_url,
        body_segmented_url = EXCLUDED.body_segmented_url,
        deleted_at = NULL,
        updated_at = NOW()
    `,
    [
      story.id,
      story.title,
      story.difficulty,
      story.ageGroup,
      story.wordCount,
      story.coverImageUrl,
      story.bodyUrl,
      story.bodySegmentedUrl,
    ],
  );

  return existing.rowCount > 0 ? 'updated' : 'inserted';
}

async function main() {
  const client = new Client(getDbConfig());
  await client.connect();

  let inserted = 0;
  let updated = 0;

  try {
    await client.query('BEGIN');

    for (const story of stories) {
      const result = await upsertStory(client, story);
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

  console.log(`Seeded current stories: ${inserted} inserted, ${updated} updated.`);
}

main().catch((error) => {
  console.error('Seed current stories failed:', error);
  process.exit(1);
});
