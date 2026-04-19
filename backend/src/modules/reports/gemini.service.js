/**
 * Gemini AI Service
 *
 * Handles all communication with the Google Gemini API.
 * Generates weekly reading progress reports in Markdown format.
 *
 * Fallback: If the API key is missing or the API fails,
 * a locally-generated fallback report is returned instead.
 */

const { Injectable } = require('@nestjs/common');
const { ConfigService } = require('@nestjs/config');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { logger } = require('../../common/logger/winston.config');

const GENERATION_TIMEOUT_MS = 20000; // 20 seconds

class GeminiService {
  constructor(configService) {
    this.configService = configService;
    this.client = null;
    this.modelName = '';

    this._initClient();
  }

  /**
   * Lazily initialise the Gemini SDK client.
   * If no API key is configured, the service operates in fallback mode.
   */
  _initClient() {
    const apiKey = this.configService.get('gemini.apiKey');
    this.modelName = this.configService.get('gemini.model') || 'gemini-2.0-flash';

    if (apiKey) {
      this.client = new GoogleGenerativeAI(apiKey);
      logger.info('Gemini client initialised', {
        context: 'GeminiService',
        data: { model: this.modelName },
      });
    } else {
      logger.warn('GEMINI_API_KEY not configured — reports will use fallback mode', {
        context: 'GeminiService',
      });
    }
  }

  /**
   * Generate a weekly reading progress report via Gemini.
   *
   * @param {object} data - Aggregated reading data for the week
   * @param {string} data.childName - Display name of the child
   * @param {string} data.periodStart - ISO date string
   * @param {string} data.periodEnd - ISO date string
   * @param {number} data.totalSessions - Number of completed sessions
   * @param {number} data.totalReadingMinutes - Total reading time in minutes
   * @param {number} data.averageWordsPerMinute - Average reading speed
   * @param {number} data.averageEffortScore - Average effort (0-1)
   * @param {Array}  data.booksRead - Array of { title, difficulty, wordCount }
   * @returns {Promise<{ content: string, model: string, isFallback: boolean }>}
   */
  async generateWeeklyReport(data) {
    // ── Fallback mode when no client is available ──
    if (!this.client) {
      logger.info('Generating fallback report (no API key)', {
        context: 'GeminiService',
      });
      return {
        content: this._buildFallbackReport(data),
        model: 'fallback-local',
        isFallback: true,
      };
    }

    // ── Call Gemini API ──
    try {
      const prompt = this._buildPrompt(data);
      const model = this.client.getGenerativeModel({ model: this.modelName });

      const result = await Promise.race([
        model.generateContent(prompt),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Gemini API timeout')), GENERATION_TIMEOUT_MS),
        ),
      ]);

      const response = result.response;
      const text = response.text();

      if (!text || text.trim().length < 20) {
        throw new Error('Gemini returned empty or too-short response');
      }

      logger.info('Gemini report generated successfully', {
        context: 'GeminiService',
        data: { model: this.modelName, length: text.length },
      });

      return {
        content: text.trim(),
        model: this.modelName,
        isFallback: false,
      };
    } catch (error) {
      logger.error('Gemini API call failed, falling back to local report', {
        context: 'GeminiService',
        data: { error: error.message },
      });

      return {
        content: this._buildFallbackReport(data),
        model: 'fallback-local',
        isFallback: true,
      };
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // PROMPT ENGINEERING
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /**
   * Craft a highly contextual prompt for Gemini.
   * The prompt instructs the model to output a Markdown report
   * that is encouraging and easy for parents to understand.
   */
  _buildPrompt(data) {
    const booksList = data.booksRead.length > 0
      ? data.booksRead
          .map(
            (b, i) =>
              `  ${i + 1}. "${b.title}" (Difficulty: ${b.difficulty || 'N/A'}, Words: ${b.wordCount || 'N/A'})`,
          )
          .join('\n')
      : '  (No books completed this week)';

    return `
You are an educational AI assistant for ReadEase, a platform that helps children with Dyslexia improve their reading skills. Your job is to write a WEEKLY PROGRESS REPORT for a parent or guardian.

### Child Information
- **Name**: ${data.childName || 'Student'}
- **Report Period**: ${data.periodStart} → ${data.periodEnd}

### Reading Statistics This Week
- **Total Reading Sessions**: ${data.totalSessions}
- **Total Reading Time**: ${data.totalReadingMinutes} minutes
- **Average Reading Speed**: ${data.averageWordsPerMinute} words/minute
- **Average Effort Score**: ${(data.averageEffortScore * 100).toFixed(0)}%

### Books / Content Read
${booksList}

### Instructions for Report
1. Write in **Markdown** format.
2. Use a warm, encouraging, and professional tone suitable for parents.
3. Start with a short greeting and overall summary.
4. Include a section highlighting the child's achievements this week.
5. If the reading speed or effort score is low, provide gentle, constructive suggestions (e.g., "Try shorter reading sessions of 10 minutes with breaks").
6. End with motivational words for the child and the parent.
7. Keep the report between 200-400 words.
8. Do NOT include any technical jargon about Dyslexia diagnosis.
9. Write the report in **Vietnamese** language.

Generate the report now:
`.trim();
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // FALLBACK REPORT (local generation)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /**
   * Build a simple, structured Markdown report without calling AI.
   * Used when the API key is missing or the API fails.
   */
  _buildFallbackReport(data) {
    const booksList = data.booksRead.length > 0
      ? data.booksRead
          .map((b) => `- **${b.title}** (${b.difficulty || 'N/A'}, ${b.wordCount || '?'} từ)`)
          .join('\n')
      : '- _Chưa có nội dung nào được hoàn thành trong tuần này._';

    const effortPercent = (data.averageEffortScore * 100).toFixed(0);

    return `# 📖 Báo Cáo Tiến Độ Đọc Hàng Tuần

**Học sinh:** ${data.childName || 'Học sinh'}
**Giai đoạn:** ${data.periodStart} — ${data.periodEnd}

---

## 📊 Tổng Quan Tuần Này

| Chỉ số | Giá trị |
|---|---|
| Tổng phiên đọc | ${data.totalSessions} phiên |
| Tổng thời gian đọc | ${data.totalReadingMinutes} phút |
| Tốc độ đọc trung bình | ${data.averageWordsPerMinute} từ/phút |
| Điểm nỗ lực trung bình | ${effortPercent}% |

## 📚 Nội Dung Đã Đọc
${booksList}

## 💡 Nhận Xét
${data.totalSessions > 0
    ? `Bé đã hoàn thành **${data.totalSessions} phiên đọc** trong tuần này. Hãy tiếp tục duy trì thói quen đọc mỗi ngày để cải thiện kỹ năng đọc nhé!`
    : 'Tuần này bé chưa có phiên đọc nào được ghi nhận. Hãy khuyến khích bé dành ít nhất 10-15 phút mỗi ngày để luyện đọc nhé!'}

---
*Báo cáo này được tạo tự động bởi hệ thống ReadEase.*
`;
  }
}

// ── Dependency Injection ──
const { Inject } = require('@nestjs/common');
Inject(ConfigService)(GeminiService, undefined, 0);
Injectable()(GeminiService);

module.exports = { GeminiService };
