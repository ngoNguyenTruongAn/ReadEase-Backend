const path = require('path');

// Load env vars for DB + Supabase
require('dotenv').config({
  path: process.env.DOTENV_PATH || path.join(__dirname, '..', '.env'),
});

const { AppDataSource } = require('../src/database/data-source');
const { StorageService } = require('../src/modules/storage/storage.service');
const { SegmentationAdapter } = require('../src/modules/reading/segmentation.adapter');

const STORY = {
  title: 'Cây tre trăm đốt',
  difficulty: 'MEDIUM',
  // Repo convention uses ranges; age 9 maps to 8-10
  age_group: '8-10',
  cover_image_url: null,
  body: `Ngày xưa, có anh Khoai hiền lành đi ở thuê cho lão nhà giàu. Lão hứa nếu anh làm lụng chăm chỉ trong ba năm, lão sẽ gả con gái cho. Anh Khoai tin lời, dốc sức làm giàu cho lão. Đến hạn, lão nhà giàu lật lọng, định gả con gái cho nhà khác. Lão bày mưu bảo anh: "Con vào rừng tìm cho được cây tre trăm đốt mang về đây thì ta mới cho cưới".

Anh Khoai vào rừng tìm mãi không thấy nên ngồi khóc. Bụt hiện lên, bảo anh chặt đủ một trăm đốt tre rồi dạy hai câu thần chú: "Khắc nhập, khắc nhập" để gắn kết và "Khắc xuất, khắc xuất" để tách rời.

Anh Khoai gánh trăm đốt tre về giữa lúc đám cưới đang diễn ra. Thấy lão nhà giàu nhạo báng, anh đọc chú "Khắc nhập" khiến lão và tên con rể tương lai bị dính chặt vào cây tre. Sợ hãi, lão phải van xin và thực hiện lời hứa. Anh Khoai đọc "Khắc xuất" để thả lão ra, sau đó cưới cô con gái và sống hạnh phúc.`,
};

function calculateWordCount(segmentedBody) {
  if (!segmentedBody || !segmentedBody.trim()) return 0;
  return segmentedBody.trim().split(/\s+/).length;
}

async function upsertStory() {
  await AppDataSource.initialize();

  const storageService = new StorageService();
  const segmentationAdapter = new SegmentationAdapter();

  try {
    // Ensure storage bucket exists (no-op if already exists)
    await storageService.ensureBucket();

    const normalizedBody = segmentationAdapter.normalizeText(STORY.body);
    const bodySegmented = await segmentationAdapter.segment(STORY.body);

    const bodyUpload = await storageService.upload(
      Buffer.from(normalizedBody, 'utf-8'),
      'cay-tre-tram-dot.body.txt',
      'text/plain; charset=utf-8',
      'stories',
    );

    const segmentedUpload = await storageService.upload(
      Buffer.from(bodySegmented, 'utf-8'),
      'cay-tre-tram-dot.segmented.txt',
      'text/plain; charset=utf-8',
      'stories',
    );

    const existing = await AppDataSource.query(
      `
        SELECT id, deleted_at
        FROM reading_content
        WHERE LOWER(title) = LOWER($1)
        ORDER BY created_at DESC
        LIMIT 1;
      `,
      [STORY.title],
    );

    const wordCount = calculateWordCount(bodySegmented);

    if (existing && existing.length) {
      const id = existing[0].id;

      await AppDataSource.query(
        `
          UPDATE reading_content
          SET
            title = $2,
            body_url = $3,
            body_segmented_url = $4,
            difficulty = $5,
            age_group = $6,
            word_count = $7,
            cover_image_url = $8,
            deleted_at = NULL,
            updated_at = NOW()
          WHERE id = $1;
        `,
        [
          id,
          STORY.title,
          bodyUpload.url,
          segmentedUpload.url,
          STORY.difficulty,
          STORY.age_group,
          wordCount,
          STORY.cover_image_url,
        ],
      );

      console.log(`Upserted story (updated existing): ${STORY.title}`);
      return;
    }

    await AppDataSource.query(
      `
        INSERT INTO reading_content (
          title,
          body_url,
          body_segmented_url,
          difficulty,
          age_group,
          word_count,
          cover_image_url,
          created_by,
          created_at,
          updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, NULL, NOW(), NOW()
        );
      `,
      [
        STORY.title,
        bodyUpload.url,
        segmentedUpload.url,
        STORY.difficulty,
        STORY.age_group,
        wordCount,
        STORY.cover_image_url,
      ],
    );

    console.log(`Inserted story: ${STORY.title}`);
  } finally {
    await AppDataSource.destroy();
  }
}

if (require.main === module) {
  upsertStory().catch((err) => {
    console.error('Failed to add story:', err?.message || err);
    process.exit(1);
  });
}
