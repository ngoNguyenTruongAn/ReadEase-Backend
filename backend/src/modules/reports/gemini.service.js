/**
 * Gemini AI Service
 *
 * Handles all communication with the Google Gemini API.
 * Generates weekly reading progress reports in Markdown format
 * with Dyslexia-aware cognitive and behavioural analysis.
 *
 * Fallback: If the API key is missing or the API fails,
 * a locally-generated fallback report is returned instead.
 *
 * Retry: One automatic retry on transient network errors.
 */

const { Injectable } = require('@nestjs/common');
const { ConfigService } = require('@nestjs/config');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { logger } = require('../../common/logger/winston.config');

const GENERATION_TIMEOUT_MS = 20000; // 20 seconds
const MAX_RETRIES = 1;
const RETRY_DELAY_MS = 1000;

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
   * @param {string} data.childName
   * @param {string} data.periodStart - ISO date string
   * @param {string} data.periodEnd - ISO date string
   * @param {number} data.totalSessions
   * @param {number} data.totalReadingMinutes
   * @param {number} data.averageWordsPerMinute
   * @param {number} data.averageEffortScore - 0-1 scale
   * @param {Array}  data.booksRead - [{ title, difficulty, wordCount }]
   * @param {object} data.cognitiveBreakdown - { FLUENT, REGRESSION, DISTRACTION }
   * @param {object} data.motorMetrics - { avgVelocity, avgDwellTime, totalEvents }
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

    // ── Call Gemini API with retry ──
    try {
      const prompt = this._buildPrompt(data);
      const model = this.client.getGenerativeModel({
        model: this.modelName,
        generationConfig: {
          temperature: 0.7,
          topP: 0.85,
          maxOutputTokens: 1024,
        },
      });

      const result = await this._callWithRetry(model, prompt);
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
      // Detect quota-exceeded (429) errors specifically for clearer monitoring
      const isQuotaError = error.message?.includes('429') || error.message?.includes('quota');

      if (isQuotaError) {
        logger.warn(
          'Gemini API quota exceeded (429) — using fallback report. Check your plan and billing at https://ai.google.dev/gemini-api/docs/rate-limits',
          {
            context: 'GeminiService',
            data: { model: this.modelName, error: error.message },
          },
        );
      } else {
        logger.error('Gemini API call failed, falling back to local report', {
          context: 'GeminiService',
          data: { error: error.message },
        });
      }

      return {
        content: this._buildFallbackReport(data),
        model: 'fallback-local',
        isFallback: true,
      };
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // RETRY LOGIC
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /**
   * Call Gemini with a single automatic retry for transient network errors.
   * Does NOT retry on quota errors (429) — those are immediately propagated.
   */
  async _callWithRetry(model, prompt) {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await Promise.race([
          model.generateContent(prompt),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Gemini API timeout')), GENERATION_TIMEOUT_MS),
          ),
        ]);
      } catch (err) {
        const isQuota = err.message?.includes('429') || err.message?.includes('quota');
        if (attempt === MAX_RETRIES || isQuota) throw err;

        logger.warn(`Gemini transient error — retrying (attempt ${attempt + 1})`, {
          context: 'GeminiService',
          data: { error: err.message },
        });
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      }
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // PROMPT ENGINEERING
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /**
   * Build a Dyslexia-aware prompt that includes cognitive state analysis
   * and motor behaviour metrics alongside standard reading statistics.
   *
   * Follows Google Prompting Guide 101: Persona → Task → Context → Format.
   */
  _buildPrompt(data) {
    const booksList =
      data.booksRead.length > 0
        ? data.booksRead
            .map(
              (b, i) =>
                `  ${i + 1}. "${b.title}" (Difficulty: ${b.difficulty || 'N/A'}, Words: ${b.wordCount || 'N/A'})`,
            )
            .join('\n')
        : '  (No books completed this week)';

    // Cognitive state breakdown (from session_replay_events)
    const cog = data.cognitiveBreakdown || { FLUENT: 0, REGRESSION: 0, DISTRACTION: 0 };
    const cogTotal = cog.FLUENT + cog.REGRESSION + cog.DISTRACTION;
    const cogSection =
      cogTotal > 0
        ? `### Cognitive State Analysis (ML-classified)
- **Fluent Reading Events**: ${cog.FLUENT} (${((cog.FLUENT / cogTotal) * 100).toFixed(0)}%)
- **Regression / Re-reading Events**: ${cog.REGRESSION} (${((cog.REGRESSION / cogTotal) * 100).toFixed(0)}%)
- **Distraction Events**: ${cog.DISTRACTION} (${((cog.DISTRACTION / cogTotal) * 100).toFixed(0)}%)
- **Interpretation**: ${cog.REGRESSION > cog.FLUENT ? 'Child shows frequent re-reading — may indicate word decoding difficulty.' : 'Reading flow is mostly fluent — positive indicator.'}`
        : '### Cognitive State Analysis\n- No cognitive tracking data available for this period.';

    // Motor behaviour metrics (from mouse_events)
    const motor = data.motorMetrics || { avgVelocity: 0, avgDwellTime: 0, totalEvents: 0 };
    const motorSection =
      motor.totalEvents > 0
        ? `### Motor Behaviour Metrics (Cursor Tracking)
- **Average Cursor Speed**: ${motor.avgVelocity.toFixed(1)} px/s
- **Average Dwell Time**: ${motor.avgDwellTime.toFixed(0)} ms per word
- **Total Tracking Events**: ${motor.totalEvents}`
        : '';

    return `You are **ReadEase AI**, an educational reporting assistant specialising in children with Dyslexia (ages 6-12). You generate weekly progress reports for parents and guardians.

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

${cogSection}

${motorSection}

### Report Requirements
1. Write in **Markdown** format.
2. Use a warm, encouraging, and professional tone suitable for Vietnamese parents.
3. Start with a greeting and a 2-sentence overall summary.
4. Include a "Thành tích tuần này" (Achievements) section highlighting positives.
5. Include a "Phân tích hành vi đọc" (Reading Behaviour Analysis) section that interprets the cognitive state and motor data above in parent-friendly language — do NOT use raw numbers, translate them into observations (e.g., "Bé có xu hướng đọc lại một số từ khó" instead of "REGRESSION: 30%").
6. If the effort score is below 50% or regressions exceed 40%, provide a "Gợi ý cải thiện" section with 2-3 gentle, actionable suggestions.
7. End with motivational words for both the child and the parent.
8. Keep the report between 250-400 words.
9. Do NOT include any clinical Dyslexia diagnosis terminology or medical advice.
10. Write the entire report in **Vietnamese** language.

Generate the report now:`.trim();
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // FALLBACK REPORT (local generation)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /**
   * Build a simple, structured Markdown report without calling AI.
   * Used when the API key is missing or the API fails.
   */
  _buildFallbackReport(data) {
    const booksList =
      data.booksRead.length > 0
        ? data.booksRead
            .map((b) => `- **${b.title}** (${b.difficulty || 'N/A'}, ${b.wordCount || '?'} từ)`)
            .join('\n')
        : '- _Chưa có nội dung nào được hoàn thành trong tuần này._';

    const effortPercent = (data.averageEffortScore * 100).toFixed(0);

    // Cognitive state summary for fallback
    const cog = data.cognitiveBreakdown || { FLUENT: 0, REGRESSION: 0, DISTRACTION: 0 };
    const cogTotal = cog.FLUENT + cog.REGRESSION + cog.DISTRACTION;
    const cogSection =
      cogTotal > 0
        ? `## 🧠 Phân Tích Hành Vi Đọc

| Trạng thái | Số lần | Tỷ lệ |
|---|---|---|
| Đọc trôi chảy (Fluent) | ${cog.FLUENT} | ${((cog.FLUENT / cogTotal) * 100).toFixed(0)}% |
| Đọc lại (Regression) | ${cog.REGRESSION} | ${((cog.REGRESSION / cogTotal) * 100).toFixed(0)}% |
| Mất tập trung (Distraction) | ${cog.DISTRACTION} | ${((cog.DISTRACTION / cogTotal) * 100).toFixed(0)}% |`
        : '';

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

${cogSection}

## 💡 Nhận Xét
${
  data.totalSessions > 0
    ? `Bé đã hoàn thành **${data.totalSessions} phiên đọc** trong tuần này. Hãy tiếp tục duy trì thói quen đọc mỗi ngày để cải thiện kỹ năng đọc nhé!`
    : 'Tuần này bé chưa có phiên đọc nào được ghi nhận. Hãy khuyến khích bé dành ít nhất 10-15 phút mỗi ngày để luyện đọc nhé!'
}

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
