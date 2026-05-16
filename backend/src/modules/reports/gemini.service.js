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

const GENERATION_TIMEOUT_MS = 45000; // Long reports need more room than short chat replies.
const MAX_RETRIES = 1;
const MAX_REPORT_QUALITY_RETRIES = 1;
const RETRY_DELAY_MS = 1000;
const REPORT_MAX_OUTPUT_TOKENS = 4096;
const REPORT_END_MARKER = '<!-- READEASE_REPORT_COMPLETE -->';

class GeminiService {
  constructor(configService) {
    this.configService = configService;
    this.client = null;
    this.modelName = '';

    this._initClient();
  }

  /**
   * Lazily initialise the AI client.
   * Priority: OpenRouter API key → Google Gemini SDK → fallback mode.
   */
  _initClient() {
    const openRouterKey =
      this.configService.get('OPENROUTER_API_KEY') || process.env.OPENROUTER_API_KEY;
    const geminiKey = this.configService.get('gemini.apiKey');
    this.modelName = this.configService.get('gemini.model') || 'gemini-2.0-flash';
    this.provider = 'none'; // 'openrouter' | 'google' | 'none'

    if (openRouterKey) {
      // ── OpenRouter mode (OpenAI-compatible API) ──
      this.openRouterKey = openRouterKey;
      this.openRouterModel = process.env.OPENROUTER_MODEL || 'google/gemini-2.0-flash-exp:free';
      this.provider = 'openrouter';
      logger.info('AI client initialised via OpenRouter', {
        context: 'GeminiService',
        data: { model: this.openRouterModel },
      });
    } else if (geminiKey) {
      // ── Google Gemini SDK mode ──
      this.client = new GoogleGenerativeAI(geminiKey);
      this.provider = 'google';
      logger.info('Gemini client initialised', {
        context: 'GeminiService',
        data: { model: this.modelName },
      });
    } else {
      logger.warn('No AI API key configured — reports will use fallback mode', {
        context: 'GeminiService',
      });
    }
  }

  /**
   * Generate a weekly reading progress report via AI.
   *
   * @param {object} data - Aggregated reading data for the week
   * @returns {Promise<{ content: string, model: string, isFallback: boolean }>}
   */
  async generateWeeklyReport(data) {
    // ── Fallback mode when no provider is available ──
    if (this.provider === 'none') {
      logger.info('Generating fallback report (no API key)', {
        context: 'GeminiService',
      });
      return {
        content: this._buildFallbackReport(data),
        model: 'fallback-local',
        isFallback: true,
      };
    }

    // ── Call AI with retry (OpenRouter or Google SDK) ──
    try {
      const usedModel = this.provider === 'openrouter' ? this.openRouterModel : this.modelName;
      let lastText = '';
      let lastValidation = null;

      for (let attempt = 0; attempt <= MAX_REPORT_QUALITY_RETRIES; attempt += 1) {
        const prompt =
          attempt === 0
            ? this._buildPrompt(data)
            : this._buildRepairPrompt(data, lastText, lastValidation);
        const model = this._createGoogleModel();
        const result = await this._callWithRetry(model, prompt);
        const response = result.response;
        const text = this._normalizeAiReportText(response.text());
        const validation = this._validateAiReportContent(text);

        if (validation.ok) {
          logger.info('AI report generated successfully', {
            context: 'GeminiService',
            data: {
              provider: this.provider,
              model: usedModel,
              length: text.length,
              qualityAttempt: attempt + 1,
            },
          });

          return {
            content: this._stripReportEndMarker(text),
            model: usedModel,
            isFallback: false,
          };
        }

        lastText = text;
        lastValidation = validation;

        logger.warn('AI report failed quality validation', {
          context: 'GeminiService',
          data: {
            provider: this.provider,
            model: usedModel,
            qualityAttempt: attempt + 1,
            reasons: validation.reasons,
            length: text.length,
          },
        });
      }

      throw new Error(
        `AI report did not pass quality validation: ${lastValidation?.reasons?.join(', ') || 'unknown'}`,
      );
    } catch (error) {
      const isQuotaError = error.message?.includes('429') || error.message?.includes('quota');

      if (isQuotaError) {
        logger.warn('AI quota exceeded (429) — using fallback report', {
          context: 'GeminiService',
          data: { provider: this.provider, error: error.message },
        });
      } else {
        logger.error('AI call failed, falling back to local report', {
          context: 'GeminiService',
          data: { provider: this.provider, error: error.message },
        });
      }

      return {
        content: this._buildFallbackReport(data),
        model: 'fallback-local',
        isFallback: true,
      };
    }
  }

  /**
   * Call AI provider with a single automatic retry for transient network errors.
   * Supports both Google SDK and OpenRouter (OpenAI-compatible).
   */
  async _callWithRetry(modelOrNull, prompt) {
    if (this.provider === 'openrouter') {
      return this._callOpenRouter(prompt);
    }

    // Google Gemini SDK path
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await Promise.race([
          modelOrNull.generateContent(prompt),
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

  _createGoogleModel() {
    if (this.provider !== 'google') return null;

    return this.client.getGenerativeModel({
      model: this.modelName,
      generationConfig: {
        temperature: 0.35,
        topP: 0.8,
        maxOutputTokens: REPORT_MAX_OUTPUT_TOKENS,
      },
    });
  }

  /**
   * Call OpenRouter's OpenAI-compatible chat completions endpoint.
   * Returns an object matching the Google SDK response shape: { response: { text() } }
   */
  async _callOpenRouter(prompt) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GENERATION_TIMEOUT_MS);

    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.openRouterKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://readease.app',
          'X-Title': 'ReadEase',
        },
        body: JSON.stringify({
          model: this.openRouterModel,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7,
          top_p: 0.85,
          max_tokens: REPORT_MAX_OUTPUT_TOKENS,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`OpenRouter ${res.status}: ${errBody}`);
      }

      const json = await res.json();
      const text = json.choices?.[0]?.message?.content || '';

      // Return shape matching Google SDK for compatibility
      return {
        response: {
          text: () => text,
        },
      };
    } catch (err) {
      clearTimeout(timeout);
      throw err;
    }
  }

  _normalizeAiReportText(text) {
    return String(text || '')
      .replace(/^```(?:markdown|md)?\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();
  }

  _stripReportEndMarker(text) {
    return String(text || '').replace(REPORT_END_MARKER, '').trim();
  }

  _validateAiReportContent(text) {
    const content = String(text || '').trim();
    const reasons = [];

    if (content.length < 600) {
      reasons.push('too_short');
    }

    if (!content.includes(REPORT_END_MARKER)) {
      reasons.push('missing_end_marker');
    }

    const lines = content.split('\n');
    const headingSpecs = [
      { key: 'overview', pattern: /^#{1,3}\s*tổng quan số liệu\s*$/i },
      { key: 'sessions', pattern: /^#{1,3}\s*chi tiết từng phiên đọc trong tuần\s*$/i },
      { key: 'improvement', pattern: /^#{1,3}\s*mức cải thiện\s*$/i },
      { key: 'content', pattern: /^#{1,3}\s*nội dung đã đọc\s*$/i },
      { key: 'cognitive', pattern: /^#{1,3}\s*phân tích trạng thái đọc\s*$/i },
      { key: 'comment', pattern: /^#{1,3}\s*nhận xét\s*$/i },
    ];

    const headingIndexes = {};
    headingSpecs.forEach((spec) => {
      headingIndexes[spec.key] = lines.findIndex((line) => spec.pattern.test(line.trim()));
      if (headingIndexes[spec.key] === -1) {
        reasons.push(`missing_heading_${spec.key}`);
      }
    });

    const expectedOrder = ['overview', 'sessions', 'improvement', 'content', 'cognitive', 'comment'];
    const presentOrderedIndexes = expectedOrder
      .map((key) => headingIndexes[key])
      .filter((index) => index >= 0);
    const isHeadingOrderValid = presentOrderedIndexes.every(
      (index, position) => position === 0 || index > presentOrderedIndexes[position - 1],
    );

    if (!isHeadingOrderValid) {
      reasons.push('invalid_section_order');
    }

    if (headingIndexes.comment >= 0) {
      const headingAfterComment = lines
        .slice(headingIndexes.comment + 1)
        .find((line) => /^#{1,3}\s+\S/.test(line.trim()));
      if (headingAfterComment) {
        reasons.push('comment_section_not_last');
      }
    }

    const cognitiveSection = this._extractSectionByHeadingKey(lines, headingIndexes.cognitive);
    const requiredRows = [
      /đọc trôi chảy\s*\(fluent\)/i,
      /đọc lại\s*\(regression\)/i,
      /mất tập trung\s*\(distraction\)/i,
    ];
    requiredRows.forEach((pattern, index) => {
      if (!pattern.test(cognitiveSection)) {
        reasons.push(`missing_cognitive_row_${index + 1}`);
      }
    });

    const tableLines = content
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('|') || line.endsWith('|'));

    const malformedTableLine = tableLines.find(
      (line) => !line.startsWith('|') || !line.endsWith('|') || line.split('|').length < 3,
    );

    if (malformedTableLine) {
      reasons.push('malformed_markdown_table');
    }

    return {
      ok: reasons.length === 0,
      reasons,
    };
  }

  _extractSectionByHeadingKey(lines, headingIndex) {
    if (!Array.isArray(lines) || headingIndex < 0) return '';

    const rest = lines.slice(headingIndex + 1);
    const nextHeadingOffset = rest.findIndex((line) => /^#{1,3}\s+\S/.test(line.trim()));
    const sectionLines =
      nextHeadingOffset >= 0 ? rest.slice(0, nextHeadingOffset) : rest;

    return sectionLines.join('\n');
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
    const sessionRows =
      data.sessionDetails && data.sessionDetails.length > 0
        ? data.sessionDetails
            .map(
              (s, i) =>
                `| ${i + 1} | ${s.date || 'N/A'} | ${s.title} | ${s.difficulty} | ${s.status} | ${s.durationMinutes} phút | ${s.wordCount} | ${s.wordsPerMinute} | ${(s.effortScore * 100).toFixed(0)}% |`,
            )
            .join('\n')
        : '| - | - | Chưa có phiên đọc | - | - | 0 phút | 0 | 0 | 0% |';

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
    const fluentPercent = cogTotal > 0 ? ((cog.FLUENT / cogTotal) * 100).toFixed(0) : '0';
    const regressionPercent = cogTotal > 0 ? ((cog.REGRESSION / cogTotal) * 100).toFixed(0) : '0';
    const distractionPercent = cogTotal > 0 ? ((cog.DISTRACTION / cogTotal) * 100).toFixed(0) : '0';
    const cogSection =
      cogTotal > 0
        ? `### Cognitive State Analysis (ML-classified)
| Trạng thái | Số lần | Tỷ lệ |
|---|---|---|
| Đọc trôi chảy (Fluent) | ${cog.FLUENT} | ${fluentPercent}% |
| Đọc lại (Regression) | ${cog.REGRESSION} | ${regressionPercent}% |
| Mất tập trung (Distraction) | ${cog.DISTRACTION} | ${distractionPercent}% |
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

    const improvement = data.effortImprovement || {
      firstEffortScore: 0,
      lastEffortScore: 0,
      percentagePointChange: 0,
      relativePercentChange: 0,
      direction: 'NO_CHANGE',
    };
    const improvementLabel =
      improvement.direction === 'IMPROVED'
        ? 'Cải thiện'
        : improvement.direction === 'DECLINED'
          ? 'Giảm'
          : 'Không đổi';

    return `You are **ReadEase AI**, an educational reporting assistant specialising in children with Dyslexia (ages 6-12). You generate weekly progress reports for parents and guardians.

### Child Information
- **Name**: ${data.childName || 'Student'}
- **Report Period**: ${data.periodStart} → ${data.periodEnd}

### Reading Statistics This Week
- **Total Reading Sessions**: ${data.totalSessions}
- **Completed Sessions**: ${data.completedSessions || 0}
- **Total Reading Time**: ${data.totalReadingMinutes} minutes
- **Average Reading Speed**: ${data.averageWordsPerMinute} words/minute
- **Average Effort Score**: ${(data.averageEffortScore * 100).toFixed(0)}%

### All Reading Sessions This Week
| # | Ngày | Truyện | Độ khó | Trạng thái | Thời lượng | Số từ | Tốc độ (từ/phút) | Effort |
|---|---|---|---|---|---:|---:|---:|---:|
${sessionRows}

### Improvement
- **First Session Effort**: ${(improvement.firstEffortScore * 100).toFixed(0)}%
- **Last Session Effort**: ${(improvement.lastEffortScore * 100).toFixed(0)}%
- **Change**: ${improvementLabel} ${Math.abs(improvement.percentagePointChange).toFixed(1)} điểm phần trăm (${Math.abs(improvement.relativePercentChange).toFixed(1)}%)

### Books / Content Read
${booksList}

${cogSection}

${motorSection}

### Report Requirements
1. Write in **Markdown** format.
2. Use a warm, encouraging, and professional tone suitable for Vietnamese parents.
3. Start with a greeting and a 2-sentence overall summary.
4. Include a "Tổng quan số liệu" section.
5. Include a "Chi tiết từng phiên đọc trong tuần" section and preserve the session table with all rows.
6. Include a "Mức cải thiện" section using the improvement numbers above.
7. Include a "Phân tích trạng thái đọc" section and preserve this exact table format:
| Trạng thái | Số lần | Tỷ lệ |
|---|---|---|
| Đọc trôi chảy (Fluent) | <n> | <n>% |
| Đọc lại (Regression) | <n> | <n>% |
| Mất tập trung (Distraction) | <n> | <n>% |
8. End with one final section whose heading is exactly "## Nhận xét"; put 2-3 gentle, actionable suggestions in this section.
9. End with motivational words for both the child and the parent.
10. Do NOT include any clinical Dyslexia diagnosis terminology or medical advice.
11. Write the entire report in **Vietnamese** language.
12. Keep all Markdown tables valid: every table row must start and end with "|".
13. Do not stop in the middle of a table, list, or sentence.
14. The final line of the report MUST be exactly: ${REPORT_END_MARKER}
15. Required section order:
    # Báo cáo tiến độ đọc hàng tuần
    ## Tổng quan số liệu
    ## Chi tiết từng phiên đọc trong tuần
    ## Mức cải thiện
    ## Nội dung đã đọc
    ## Phân tích trạng thái đọc
    ## Nhận xét
16. Do not place any heading after "## Nhận xét".

Generate the report now:`.trim();
  }

  _buildRepairPrompt(data, previousText, validation) {
    const reasons = validation?.reasons?.join(', ') || 'unknown';
    const previous = String(previousText || '').slice(0, 4000);

    return `${this._buildPrompt(data)}

The previous report failed backend validation for these reasons: ${reasons}.

Regenerate the full report from scratch. Do not summarize the failed draft.
Make sure the report is complete, section order is correct, "## Nhận xét" is the final heading, all Markdown tables are closed, and the final line is exactly:
${REPORT_END_MARKER}

Previous invalid draft for reference only:
${previous}`.trim();
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // FALLBACK REPORT (local generation)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /**
   * Build a simple, structured Markdown report without calling AI.
   * Used when the API key is missing or the API fails.
   */
  _buildFallbackReport(data) {
    const sessionRows =
      data.sessionDetails && data.sessionDetails.length > 0
        ? data.sessionDetails
            .map(
              (s, i) =>
                `| ${i + 1} | ${s.date || 'N/A'} | ${s.title} | ${s.difficulty} | ${s.status} | ${s.durationMinutes} phút | ${s.wordCount} | ${s.wordsPerMinute} | ${(s.effortScore * 100).toFixed(0)}% |`,
            )
            .join('\n')
        : '| - | - | Chưa có phiên đọc | - | - | 0 phút | 0 | 0 | 0% |';

    const booksList =
      data.booksRead.length > 0
        ? data.booksRead
            .map((b) => `- **${b.title}** (${b.difficulty || 'N/A'}, ${b.wordCount || '?'} từ)`)
            .join('\n')
        : '- _Chưa có nội dung nào được hoàn thành trong tuần này._';

    const effortPercent = (data.averageEffortScore * 100).toFixed(0);
    const improvement = data.effortImprovement || {
      firstEffortScore: 0,
      lastEffortScore: 0,
      percentagePointChange: 0,
      relativePercentChange: 0,
      direction: 'NO_CHANGE',
    };
    const improvementLabel =
      improvement.direction === 'IMPROVED'
        ? 'cải thiện'
        : improvement.direction === 'DECLINED'
          ? 'giảm'
          : 'không thay đổi';

    // Cognitive state summary for fallback
    const cog = data.cognitiveBreakdown || { FLUENT: 0, REGRESSION: 0, DISTRACTION: 0 };
    const cogTotal = cog.FLUENT + cog.REGRESSION + cog.DISTRACTION;
    const fluentPercent = cogTotal > 0 ? ((cog.FLUENT / cogTotal) * 100).toFixed(0) : '0';
    const regressionPercent = cogTotal > 0 ? ((cog.REGRESSION / cogTotal) * 100).toFixed(0) : '0';
    const distractionPercent = cogTotal > 0 ? ((cog.DISTRACTION / cogTotal) * 100).toFixed(0) : '0';

    const motor = data.motorMetrics || { avgVelocity: 0, avgDwellTime: 0, totalEvents: 0 };
    const readingSummary =
      data.totalSessions > 0
        ? `Trong tuần này, bé đã có **${data.totalSessions} phiên đọc**, trong đó **${data.completedSessions || 0} phiên** được ghi nhận hoàn thành. Điểm nỗ lực trung bình đạt **${effortPercent}%**, phản ánh mức độ bé bám theo hoạt động đọc trong các phiên đã ghi nhận.`
        : 'Tuần này hệ thống chưa ghi nhận phiên đọc nào. Phụ huynh có thể khuyến khích bé bắt đầu bằng các truyện ngắn và duy trì thời lượng đọc nhẹ nhàng mỗi ngày.';

    const improvementSentence =
      improvement.direction === 'IMPROVED'
        ? `So với phiên đầu tuần, phiên cuối có dấu hiệu cải thiện **${Math.abs(improvement.percentagePointChange).toFixed(1)} điểm phần trăm**.`
        : improvement.direction === 'DECLINED'
          ? `So với phiên đầu tuần, phiên cuối giảm **${Math.abs(improvement.percentagePointChange).toFixed(1)} điểm phần trăm**, nên phụ huynh có thể theo dõi thêm nhịp đọc và mức tập trung của bé.`
          : 'Chỉ số giữa phiên đầu và phiên cuối chưa thay đổi đáng kể, nên cần thêm dữ liệu ở các tuần tiếp theo để nhìn rõ xu hướng.';

    const suggestionOne =
      data.totalSessions > 0
        ? '- Duy trì lịch đọc ngắn, đều đặn 10-15 phút mỗi ngày, ưu tiên truyện có độ khó vừa sức.'
        : '- Bắt đầu bằng 1-2 truyện ngắn trong tuần tới để hệ thống có đủ dữ liệu theo dõi tiến độ.';
    const suggestionTwo =
      Number(cog.REGRESSION || 0) > Number(cog.FLUENT || 0)
        ? '- Khi bé đọc lại nhiều, hãy cho bé dừng ở từ khó, đọc chậm từng cụm từ và hỏi bé hiểu nội dung ra sao.'
        : '- Tiếp tục để bé đọc theo nhịp tự nhiên, chỉ hỗ trợ khi bé dừng lâu hoặc tỏ ra mất tập trung.';
    const suggestionThree =
      Number(cog.DISTRACTION || 0) > 0
        ? '- Giảm yếu tố gây xao nhãng xung quanh trong lúc đọc để bé dễ giữ mạch câu chuyện hơn.'
        : '- Khen bé sau mỗi phiên hoàn thành để củng cố thói quen đọc tích cực.';

    const cogSection = `## Phân tích trạng thái đọc

| Trạng thái | Số lần | Tỷ lệ |
|---|---|---|
| Đọc trôi chảy (Fluent) | ${cog.FLUENT} | ${fluentPercent}% |
| Đọc lại (Regression) | ${cog.REGRESSION} | ${regressionPercent}% |
| Mất tập trung (Distraction) | ${cog.DISTRACTION} | ${distractionPercent}% |`;

    const motorSection =
      motor.totalEvents > 0
        ? `
### Tín hiệu hành vi chuột

| Chỉ số | Giá trị |
|---|---:|
| Tốc độ chuột trung bình | ${Number(motor.avgVelocity || 0).toFixed(1)} px/s |
| Thời gian dừng trung bình | ${Number(motor.avgDwellTime || 0).toFixed(0)} ms |
| Số điểm tracking | ${Number(motor.totalEvents || 0)} |`
        : '';

    return `# Báo cáo tiến độ đọc hàng tuần

**Học sinh:** ${data.childName || 'Học sinh'}
**Giai đoạn:** ${data.periodStart} — ${data.periodEnd}

Xin chào phụ huynh, dưới đây là báo cáo tiến độ đọc tuần này của bé. ${readingSummary}

## Tổng quan số liệu

| Chỉ số | Giá trị |
|---|---|
| Tổng phiên đọc | ${data.totalSessions} phiên |
| Phiên đã hoàn thành | ${data.completedSessions || 0} phiên |
| Tổng thời gian đọc | ${data.totalReadingMinutes} phút |
| Tốc độ đọc trung bình | ${data.averageWordsPerMinute} từ/phút |
| Điểm nỗ lực trung bình | ${effortPercent}% |

## Chi tiết từng phiên đọc trong tuần

| # | Ngày | Truyện | Độ khó | Trạng thái | Thời lượng | Số từ | Tốc độ (từ/phút) | Effort |
|---|---|---|---|---|---:|---:|---:|---:|
${sessionRows}

## Mức cải thiện

| Chỉ số | Giá trị |
|---|---|
| Effort phiên đầu | ${(improvement.firstEffortScore * 100).toFixed(0)}% |
| Effort phiên cuối | ${(improvement.lastEffortScore * 100).toFixed(0)}% |
| Thay đổi | ${improvementLabel} ${Math.abs(improvement.percentagePointChange).toFixed(1)} điểm phần trăm (${Math.abs(improvement.relativePercentChange).toFixed(1)}%) |

${improvementSentence}

## Nội dung đã đọc
${booksList}

${cogSection}
${motorSection}

## Nhận xét

${suggestionOne}
${suggestionTwo}
${suggestionThree}

Chúc bé tiếp tục giữ tinh thần đọc tích cực. Phụ huynh có thể đồng hành bằng cách chọn thời điểm đọc yên tĩnh và khuyến khích bé kể lại nội dung sau mỗi truyện.
`;
  }
}

// ── Dependency Injection ──
const { Inject } = require('@nestjs/common');
Inject(ConfigService)(GeminiService, undefined, 0);
Injectable()(GeminiService);

module.exports = { GeminiService };
