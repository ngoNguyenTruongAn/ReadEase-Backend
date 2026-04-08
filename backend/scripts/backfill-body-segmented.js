#!/usr/bin/env node

/**
 * Backfill Script — body_segmented
 *
 * Reads all reading_content rows where body_segmented IS NULL,
 * calls the ML service /segment endpoint, and updates the column.
 *
 * Usage:
 *   node scripts/backfill-segmentation.js
 *
 * Env vars:
 *   ML_SERVICE_URL  (default: http://localhost:8000)
 *   DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD
 *
 * Features:
 *   - Processes in batches of 10
 *   - Idempotent (safe to re-run)
 *   - Logs progress and failures
 *   - Continues on per-row failure
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const axios = require('axios');
const { Client } = require('pg');

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000';
const BATCH_SIZE = 10;
const TIMEOUT_MS = 10000;

async function segmentText(text) {
  try {
    const response = await axios.post(
      `${ML_SERVICE_URL}/segment`,
      { text },
      { timeout: TIMEOUT_MS },
    );
    return response.data.segmented;
  } catch (error) {
    return null;
  }
}

async function main() {
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 5432,
    database: process.env.DB_NAME || 'readease',
    user: process.env.DB_USER || 'readease_app',
    password: process.env.DB_PASSWORD || 'devpassword',
  });

  await client.connect();
  console.log('Connected to database');

  try {
    // Count rows needing backfill
    const countResult = await client.query(
      'SELECT COUNT(*)::int AS count FROM reading_content WHERE body_segmented IS NULL AND deleted_at IS NULL',
    );
    const totalRows = countResult.rows[0].count;

    if (totalRows === 0) {
      console.log('No rows need backfill. All reading_content already have body_segmented.');
      return;
    }

    console.log(`Found ${totalRows} rows to backfill\n`);

    let processed = 0;
    let succeeded = 0;
    let failed = 0;

    while (true) {
      const batch = await client.query(
        `SELECT id, title, body FROM reading_content
         WHERE body_segmented IS NULL AND deleted_at IS NULL
         ORDER BY created_at ASC
         LIMIT $1`,
        [BATCH_SIZE],
      );

      if (batch.rows.length === 0) break;

      for (const row of batch.rows) {
        processed++;
        const segmented = await segmentText(row.body);

        if (segmented !== null) {
          const wordCount = segmented.trim() ? segmented.trim().split(/\s+/).length : 0;
          await client.query(
            'UPDATE reading_content SET body_segmented = $1, word_count = $2 WHERE id = $3',
            [segmented, wordCount, row.id],
          );
          succeeded++;
          console.log(`  [${processed}/${totalRows}] ✓ "${row.title}"`);
        } else {
          failed++;
          console.log(`  [${processed}/${totalRows}] ✗ "${row.title}" — segmentation failed, skipped`);
        }
      }
    }

    console.log(`\nBackfill complete: ${succeeded} succeeded, ${failed} failed out of ${totalRows}`);
  } finally {
    await client.end();
    console.log('Database connection closed');
  }
}

main().catch((error) => {
  console.error('Backfill failed:', error.message);
  process.exit(1);
});
