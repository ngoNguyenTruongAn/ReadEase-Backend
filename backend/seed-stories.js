/**
 * Seed 7 stories: upload body text to Supabase Storage, then insert rows into reading_content.
 * Usage: node seed-stories.js
 *
 * Reads config from backend/.env (auto-loaded) or environment variables.
 */
const { createClient } = require('@supabase/supabase-js');
const { Client } = require('pg');
const { randomUUID } = require('crypto');
const fs = require('fs');
const path = require('path');

// ── Load .env manually (no dotenv dependency) ──
const envPath = path.resolve(__dirname, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const BUCKET = process.env.SUPABASE_BUCKET || 'media';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env');
  process.exit(1);
}

const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'readease',
  user: process.env.DB_USER || 'readease_app',
  password: process.env.DB_PASSWORD || 'devpassword',
};

const CLINICIAN_ID = process.env.SEED_CLINICIAN_ID || '8cd87d50-b2a1-4cda-9f39-50a154a78021';

const stories = [
  {
    title: "Thánh Gióng",
    difficulty: "MEDIUM",
    age_group: "7-10",
    cover_image_url: "https://udncpujookwiwcuqahfg.supabase.co/storage/v1/object/public/media/test-stories/covers/1778762740744-thanh-giong-cover.png",
    body: "Ngày xưa, ở làng Phù Đổng có một cậu bé lên ba vẫn chưa biết nói. Khi giặc đến xâm lược, cậu bỗng cất tiếng xin vua cho ngựa sắt, roi sắt và áo giáp sắt. Cậu ăn rất khỏe, lớn nhanh như thổi, rồi cưỡi ngựa sắt ra trận. Roi sắt gãy, Gióng nhổ tre bên đường đánh giặc. Sau khi thắng trận, Gióng bay về trời, để lại bài học về lòng yêu nước và sức mạnh đoàn kết."
  },
  {
    title: "Bánh Chưng Bánh Giày",
    difficulty: "EASY",
    age_group: "6-9",
    cover_image_url: "https://udncpujookwiwcuqahfg.supabase.co/storage/v1/object/public/media/test-stories/covers/1778762742188-banh-chung-banh-giay-cover.png",
    body: "Vua Hùng muốn chọn người nối ngôi nên bảo các con tìm món ăn quý dâng lên tổ tiên. Lang Liêu nghèo, chỉ có gạo nếp, đậu xanh và thịt lợn. Chàng nghĩ đất trời nuôi sống con người, nên gói bánh chưng vuông tượng trưng cho đất và làm bánh giày tròn tượng trưng cho trời. Món bánh giản dị mà sâu sắc khiến vua rất hài lòng. Từ đó, bánh chưng bánh giày trở thành món ăn thân thương trong ngày Tết."
  },
  {
    title: "Sự Tích Dưa Hấu",
    difficulty: "EASY",
    age_group: "6-9",
    cover_image_url: "https://udncpujookwiwcuqahfg.supabase.co/storage/v1/object/public/media/test-stories/covers/1778762742687-su-tich-dua-hau-cover.png",
    body: "Mai An Tiêm bị đưa ra đảo hoang nhưng không than khóc. Chàng cùng gia đình dựng lều, tìm nước ngọt và chăm chỉ trồng trọt. Một ngày nọ, đàn chim thả xuống những hạt lạ. An Tiêm gieo hạt, tưới nước, rồi thấy cây bò lan trên cát và kết trái xanh tròn. Bổ quả ra, ruột đỏ ngọt mát. Chàng khắc dấu lên dưa thả ra biển. Nhà vua biết chuyện, hiểu rằng người chăm chỉ có thể tự tạo cuộc sống tốt đẹp."
  },
  {
    title: "Sơn Tinh Thủy Tinh",
    difficulty: "MEDIUM",
    age_group: "7-10",
    cover_image_url: "https://udncpujookwiwcuqahfg.supabase.co/storage/v1/object/public/media/test-stories/covers/1778762743297-son-tinh-thuy-tinh-cover.png",
    body: "Vua Hùng kén chồng cho công chúa Mỵ Nương. Sơn Tinh đem đến núi rừng, cây cỏ và thú quý. Thủy Tinh đem theo nước lớn, mây mưa và sóng mạnh. Sơn Tinh đến trước nên được cưới công chúa. Thủy Tinh tức giận dâng nước đuổi theo. Sơn Tinh nâng núi cao, dựng đồi chắn lũ để bảo vệ mọi người. Cuối cùng nước rút, bản làng bình yên. Câu chuyện nhắc trẻ hiểu về thiên nhiên và lòng kiên trì."
  },
  {
    title: "Chú Cuội",
    difficulty: "EASY",
    age_group: "6-9",
    cover_image_url: "https://udncpujookwiwcuqahfg.supabase.co/storage/v1/object/public/media/test-stories/covers/1778762743917-chu-cuoi-cover.png",
    body: "Cuội là một chàng tiều phu tốt bụng. Một lần vào rừng, Cuội tìm thấy cây thuốc quý có thể cứu người bị thương. Chàng mang cây về trồng và dặn mọi người phải tưới bằng nước sạch. Nhưng một hôm, cây bật rễ và bay dần lên trời. Cuội vội nắm lấy rễ cây nên bị kéo lên tận mặt trăng. Từ đó, mỗi đêm trăng sáng, trẻ em nhìn lên trời và tưởng tượng thấy chú Cuội ngồi dưới gốc cây đa."
  },
  {
    title: "Thỏ Và Rùa",
    difficulty: "EASY",
    age_group: "5-8",
    cover_image_url: "https://udncpujookwiwcuqahfg.supabase.co/storage/v1/object/public/media/test-stories/covers/1778762744365-tho-va-rua-cover.png",
    body: "Thỏ luôn khoe mình chạy nhanh nhất khu rừng. Rùa chậm chạp nhưng rất kiên trì, nên nhận lời thi chạy với Thỏ. Khi cuộc đua bắt đầu, Thỏ phóng đi thật nhanh rồi nghĩ Rùa còn ở rất xa. Thỏ nằm dưới gốc cây ngủ một giấc. Rùa không dừng lại, cứ bước từng bước nhỏ về phía đích. Khi Thỏ tỉnh dậy, Rùa đã gần tới nơi. Rùa thắng cuộc nhờ chăm chỉ và không bỏ cuộc."
  },
  {
    title: "Cây Tre Trăm Đốt",
    difficulty: "MEDIUM",
    age_group: "7-10",
    cover_image_url: "https://udncpujookwiwcuqahfg.supabase.co/storage/v1/object/public/media/test-stories/covers/1778762744748-cay-tre-tram-dot-cover.png",
    body: "Anh nông dân hiền lành làm việc chăm chỉ cho phú ông. Phú ông hứa gả con gái nếu anh tìm được cây tre trăm đốt. Anh vào rừng tìm mãi mà không thấy, rồi gặp một ông lão tốt bụng. Ông dạy anh câu thần chú để nối các đốt tre lại với nhau. Nhờ sự thật thà và lòng kiên trì, anh mang được cây tre trăm đốt về làng. Phú ông không thể nuốt lời, còn mọi người hiểu rằng kẻ gian dối sẽ bị bài học thích đáng."
  }
];

async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  const db = new Client(DB_CONFIG);
  await db.connect();
  console.log('Connected to PostgreSQL and Supabase');

  for (let i = 0; i < stories.length; i++) {
    const s = stories[i];
    const slug = s.title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '');
    const ts = Date.now();

    // Upload body.txt to Supabase
    const bodyPath = `stories/${ts}-${slug}/body.txt`;
    const { data: bodyUpload, error: bodyErr } = await supabase.storage
      .from(BUCKET)
      .upload(bodyPath, Buffer.from(s.body, 'utf-8'), {
        contentType: 'text/plain; charset=utf-8',
        upsert: true,
      });
    if (bodyErr) {
      console.error(`[${i+1}/7] FAILED upload body for "${s.title}":`, bodyErr.message);
      continue;
    }
    const bodyUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${bodyPath}`;

    // Upload segmented.txt (same as body for now — no underthesea available)
    const segPath = `stories/${ts}-${slug}/segmented.txt`;
    const { data: segUpload, error: segErr } = await supabase.storage
      .from(BUCKET)
      .upload(segPath, Buffer.from(s.body, 'utf-8'), {
        contentType: 'text/plain; charset=utf-8',
        upsert: true,
      });
    if (segErr) {
      console.error(`[${i+1}/7] FAILED upload segmented for "${s.title}":`, segErr.message);
      continue;
    }
    const segUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${segPath}`;

    // Calculate word count
    const wordCount = s.body.trim().split(/\s+/).length;

    // Insert into DB
    const id = randomUUID();
    await db.query(
      `INSERT INTO reading_content (id, title, body_url, body_segmented_url, difficulty, age_group, word_count, cover_image_url, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())`,
      [id, s.title, bodyUrl, segUrl, s.difficulty, s.age_group, wordCount, s.cover_image_url, CLINICIAN_ID]
    );

    console.log(`[${i+1}/7] ✅ Created: "${s.title}" (${wordCount} words, ${s.difficulty})`);
  }

  await db.end();
  console.log('\nDone! All 7 stories seeded.');
}

main().catch(console.error);
