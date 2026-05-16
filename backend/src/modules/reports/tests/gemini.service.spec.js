const { GeminiService } = require('../gemini.service');

function makeConfigMock(values = {}) {
  return {
    get: jest.fn((key) => values[key]),
  };
}

const reportData = {
  childName: 'Minh Anh',
  periodStart: '2026-05-09',
  periodEnd: '2026-05-16',
  totalSessions: 2,
  completedSessions: 2,
  totalReadingMinutes: 18,
  averageWordsPerMinute: 32,
  averageEffortScore: 0.82,
  effortImprovement: {
    firstEffortScore: 0.78,
    lastEffortScore: 0.86,
    percentagePointChange: 8,
    relativePercentChange: 10.3,
    direction: 'IMPROVED',
  },
  booksRead: [
    { title: 'Chú Cuội', difficulty: 'Dễ', wordCount: 84 },
    { title: 'Thỏ Và Rùa', difficulty: 'Dễ', wordCount: 79 },
  ],
  sessionDetails: [
    {
      date: '2026-05-15',
      title: 'Chú Cuội',
      difficulty: 'Dễ',
      status: 'COMPLETED',
      durationMinutes: 8,
      wordCount: 84,
      wordsPerMinute: 11,
      effortScore: 0.78,
    },
    {
      date: '2026-05-16',
      title: 'Thỏ Và Rùa',
      difficulty: 'Dễ',
      status: 'COMPLETED',
      durationMinutes: 10,
      wordCount: 79,
      wordsPerMinute: 8,
      effortScore: 0.86,
    },
  ],
  cognitiveBreakdown: { FLUENT: 30, REGRESSION: 5, DISTRACTION: 2 },
  motorMetrics: { avgVelocity: 120.5, avgDwellTime: 310, totalEvents: 400 },
};

describe('GeminiService report quality gate', () => {
  const oldOpenRouterKey = process.env.OPENROUTER_API_KEY;

  beforeEach(() => {
    delete process.env.OPENROUTER_API_KEY;
  });

  afterEach(() => {
    if (oldOpenRouterKey === undefined) {
      delete process.env.OPENROUTER_API_KEY;
    } else {
      process.env.OPENROUTER_API_KEY = oldOpenRouterKey;
    }
    jest.clearAllMocks();
  });

  it('should generate a complete structured fallback report when no AI provider is configured', async () => {
    const service = new GeminiService(makeConfigMock());

    const result = await service.generateWeeklyReport(reportData);

    expect(result.model).toBe('fallback-local');
    expect(result.isFallback).toBe(true);
    expect(result.content).toContain('## Tổng quan số liệu');
    expect(result.content).toContain('## Chi tiết từng phiên đọc trong tuần');
    expect(result.content).toContain('## Mức cải thiện');
    expect(result.content).toContain('## Nội dung đã đọc');
    expect(result.content).toContain('## Phân tích trạng thái đọc');
    expect(result.content).toContain('## Nhận xét');
  });

  it('should reject truncated AI markdown that does not include the completion marker', () => {
    const service = new GeminiService(makeConfigMock({ 'gemini.apiKey': 'test-key' }));
    const validation = service._validateAiReportContent(`
# Báo cáo tiến độ đọc hàng tuần

## Tổng quan số liệu
| Chỉ số | Giá trị |
|---|---|
| Tổng phiên đọc | 2 phiên |

## Chi tiết từng phiên đọc trong tuần
| # | Ngày | Truyện | Độ khó | Trạng thái | Thời lượng | Số từ | Tốc độ (từ/phút) | Effort |
|---|---|---|---|---|---:|---:|---:|---:|
| 1 | 2026-05-15 | Chú Cuội | Dễ | COMPLETED | 8 phút | 84 | 11 | 78% |

## Mức cải thiện
## Nội dung đã đọc
## Phân tích trạng thái đọc
| Trạng thái | Số lần | Tỷ lệ |
|---|---|---|
| Đọc trôi chảy (Fluent) | 30 | 81% |
| Đọc lại (Regression) | 5 | 14% |
| Mất tập trung (Distraction) | 2 | 5% |

## Nhận xét
Bé đang có tiến bộ tốt.
`);

    expect(validation.ok).toBe(false);
    expect(validation.reasons).toContain('missing_end_marker');
  });

  it('should accept complete AI markdown with all required sections and marker', () => {
    const service = new GeminiService(makeConfigMock({ 'gemini.apiKey': 'test-key' }));
    const validation = service._validateAiReportContent(`
# Báo cáo tiến độ đọc hàng tuần

Xin chào phụ huynh, đây là báo cáo tuần này của bé. Nội dung ghi nhận tiến độ đọc, mức cải thiện và các gợi ý đồng hành tại nhà.

## Tổng quan số liệu
| Chỉ số | Giá trị |
|---|---|
| Tổng phiên đọc | 2 phiên |
| Phiên đã hoàn thành | 2 phiên |
| Tổng thời gian đọc | 18 phút |
| Tốc độ đọc trung bình | 32 từ/phút |
| Điểm nỗ lực trung bình | 82% |

## Chi tiết từng phiên đọc trong tuần
| # | Ngày | Truyện | Độ khó | Trạng thái | Thời lượng | Số từ | Tốc độ (từ/phút) | Effort |
|---|---|---|---|---|---:|---:|---:|---:|
| 1 | 2026-05-15 | Chú Cuội | Dễ | COMPLETED | 8 phút | 84 | 11 | 78% |
| 2 | 2026-05-16 | Thỏ Và Rùa | Dễ | COMPLETED | 10 phút | 79 | 8 | 86% |

## Mức cải thiện
| Chỉ số | Giá trị |
|---|---|
| Effort phiên đầu | 78% |
| Effort phiên cuối | 86% |
| Thay đổi | Cải thiện 8.0 điểm phần trăm |

## Nội dung đã đọc
- **Chú Cuội** (Dễ, 84 từ)
- **Thỏ Và Rùa** (Dễ, 79 từ)

## Phân tích trạng thái đọc
| Trạng thái | Số lần | Tỷ lệ |
|---|---|---|
| Đọc trôi chảy (Fluent) | 30 | 81% |
| Đọc lại (Regression) | 5 | 14% |
| Mất tập trung (Distraction) | 2 | 5% |

## Nhận xét
Bé đang duy trì nhịp đọc tích cực và có thể tiếp tục luyện đọc ngắn mỗi ngày. Phụ huynh nên khuyến khích bé kể lại nội dung sau khi đọc để tăng khả năng ghi nhớ.

<!-- READEASE_REPORT_COMPLETE -->
`);

    expect(validation).toEqual({ ok: true, reasons: [] });
  });

  it('should reject AI markdown when the comment section appears before required report sections', () => {
    const service = new GeminiService(makeConfigMock({ 'gemini.apiKey': 'test-key' }));
    const validation = service._validateAiReportContent(`
# Báo cáo tiến độ đọc hàng tuần

## Tổng quan số liệu
| Chỉ số | Giá trị |
|---|---|
| Tổng phiên đọc | 2 phiên |

## Chi tiết từng phiên đọc trong tuần
| # | Ngày | Truyện | Độ khó | Trạng thái | Thời lượng | Số từ | Tốc độ (từ/phút) | Effort |
|---|---|---|---|---|---:|---:|---:|---:|
| 1 | 2026-05-15 | Chú Cuội | Dễ | COMPLETED | 8 phút | 84 | 11 | 78% |

## Nhận xét
Bé có tiến bộ tốt.

## Mức cải thiện
| Chỉ số | Giá trị |
|---|---|
| Effort phiên đầu | 78% |
| Effort phiên cuối | 86% |
| Thay đổi | Cải thiện 8.0 điểm phần trăm |

## Nội dung đã đọc
- **Chú Cuội** (Dễ, 84 từ)

## Phân tích trạng thái đọc
| Trạng thái | Số lần | Tỷ lệ |
|---|---|---|
| Đọc trôi chảy (Fluent) | 30 | 81% |
| Đọc lại (Regression) | 5 | 14% |
| Mất tập trung (Distraction) | 2 | 5% |

<!-- READEASE_REPORT_COMPLETE -->
`);

    expect(validation.ok).toBe(false);
    expect(validation.reasons).toContain('invalid_section_order');
    expect(validation.reasons).toContain('comment_section_not_last');
  });

  it('should reject AI markdown when cognitive rows are outside the cognitive section', () => {
    const service = new GeminiService(makeConfigMock({ 'gemini.apiKey': 'test-key' }));
    const validation = service._validateAiReportContent(`
# Báo cáo tiến độ đọc hàng tuần

## Tổng quan số liệu
| Chỉ số | Giá trị |
|---|---|
| Tổng phiên đọc | 2 phiên |
| Đọc lại (Regression) | 5 | 14% |
| Mất tập trung (Distraction) | 2 | 5% |

## Chi tiết từng phiên đọc trong tuần
| # | Ngày | Truyện | Độ khó | Trạng thái | Thời lượng | Số từ | Tốc độ (từ/phút) | Effort |
|---|---|---|---|---|---:|---:|---:|---:|
| 1 | 2026-05-15 | Chú Cuội | Dễ | COMPLETED | 8 phút | 84 | 11 | 78% |

## Mức cải thiện
| Chỉ số | Giá trị |
|---|---|
| Effort phiên đầu | 78% |
| Effort phiên cuối | 86% |
| Thay đổi | Cải thiện 8.0 điểm phần trăm |

## Nội dung đã đọc
- **Chú Cuội** (Dễ, 84 từ)

## Phân tích trạng thái đọc
| Trạng thái | Số lần | Tỷ lệ |
|---|---|---|
| Đọc trôi chảy (Fluent) | 30 | 81% |

## Nhận xét
Bé đang duy trì nhịp đọc tích cực và có thể tiếp tục luyện đọc ngắn mỗi ngày.

<!-- READEASE_REPORT_COMPLETE -->
`);

    expect(validation.ok).toBe(false);
    expect(validation.reasons).toContain('missing_cognitive_row_2');
    expect(validation.reasons).toContain('missing_cognitive_row_3');
  });

  it('should fallback instead of returning invalid AI output after quality retries', async () => {
    const service = new GeminiService(makeConfigMock({ 'gemini.apiKey': 'test-key' }));
    service._callWithRetry = jest.fn().mockResolvedValue({
      response: {
        text: () => '# Báo cáo bị cắt\n\n## Tổng quan số liệu\n| Chỉ số | Giá trị |',
      },
    });

    const result = await service.generateWeeklyReport(reportData);

    expect(service._callWithRetry).toHaveBeenCalledTimes(2);
    expect(result.model).toBe('fallback-local');
    expect(result.isFallback).toBe(true);
    expect(result.content).toContain('## Nhận xét');
    expect(result.content).not.toContain('Báo cáo bị cắt');
  });

  it('should strip the internal completion marker before returning valid AI output', async () => {
    const service = new GeminiService(makeConfigMock({ 'gemini.apiKey': 'test-key' }));
    service._callWithRetry = jest.fn().mockResolvedValue({
      response: {
        text: () => `
# Báo cáo tiến độ đọc hàng tuần

Xin chào phụ huynh, đây là báo cáo tuần này của bé. Nội dung ghi nhận tiến độ đọc, mức cải thiện và các gợi ý đồng hành tại nhà.

## Tổng quan số liệu
| Chỉ số | Giá trị |
|---|---|
| Tổng phiên đọc | 2 phiên |
| Phiên đã hoàn thành | 2 phiên |
| Tổng thời gian đọc | 18 phút |
| Tốc độ đọc trung bình | 32 từ/phút |
| Điểm nỗ lực trung bình | 82% |

## Chi tiết từng phiên đọc trong tuần
| # | Ngày | Truyện | Độ khó | Trạng thái | Thời lượng | Số từ | Tốc độ (từ/phút) | Effort |
|---|---|---|---|---|---:|---:|---:|---:|
| 1 | 2026-05-15 | Chú Cuội | Dễ | COMPLETED | 8 phút | 84 | 11 | 78% |
| 2 | 2026-05-16 | Thỏ Và Rùa | Dễ | COMPLETED | 10 phút | 79 | 8 | 86% |

## Mức cải thiện
| Chỉ số | Giá trị |
|---|---|
| Effort phiên đầu | 78% |
| Effort phiên cuối | 86% |
| Thay đổi | Cải thiện 8.0 điểm phần trăm |

## Nội dung đã đọc
- **Chú Cuội** (Dễ, 84 từ)
- **Thỏ Và Rùa** (Dễ, 79 từ)

## Phân tích trạng thái đọc
| Trạng thái | Số lần | Tỷ lệ |
|---|---|---|
| Đọc trôi chảy (Fluent) | 30 | 81% |
| Đọc lại (Regression) | 5 | 14% |
| Mất tập trung (Distraction) | 2 | 5% |

## Nhận xét
Bé đang duy trì nhịp đọc tích cực và có thể tiếp tục luyện đọc ngắn mỗi ngày. Phụ huynh nên khuyến khích bé kể lại nội dung sau khi đọc để tăng khả năng ghi nhớ.

<!-- READEASE_REPORT_COMPLETE -->
`,
      },
    });

    const result = await service.generateWeeklyReport(reportData);

    expect(result.model).toBe('gemini-2.0-flash');
    expect(result.isFallback).toBe(false);
    expect(result.content).toContain('## Nhận xét');
    expect(result.content).not.toContain('READEASE_REPORT_COMPLETE');
  });
});
