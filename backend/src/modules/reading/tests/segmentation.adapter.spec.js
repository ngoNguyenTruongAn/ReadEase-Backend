const axios = require('axios');
const { SegmentationAdapter } = require('../segmentation.adapter');

jest.mock('axios');

describe('SegmentationAdapter', () => {
  let adapter;

  beforeEach(() => {
    adapter = new SegmentationAdapter();
    jest.clearAllMocks();
  });

  describe('normalizeText()', () => {
    it('should return empty string for null/undefined/empty input', () => {
      expect(adapter.normalizeText(null)).toBe('');
      expect(adapter.normalizeText(undefined)).toBe('');
      expect(adapter.normalizeText('')).toBe('');
      expect(adapter.normalizeText('   ')).toBe('');
    });

    it('should collapse multiple spaces into single space', () => {
      expect(adapter.normalizeText('con   bò   ăn   cỏ')).toBe('con bò ăn cỏ');
    });

    it('should normalize CRLF to LF', () => {
      expect(adapter.normalizeText('line1\r\nline2')).toBe('line1\nline2');
    });

    it('should collapse 3+ newlines into double newline', () => {
      expect(adapter.normalizeText('a\n\n\n\nb')).toBe('a\n\nb');
    });

    it('should trim leading/trailing whitespace', () => {
      expect(adapter.normalizeText('  hello  ')).toBe('hello');
    });

    it('should preserve Vietnamese diacritics', () => {
      expect(adapter.normalizeText('Ngày xưa có một con vịt')).toBe('Ngày xưa có một con vịt');
    });
  });

  describe('segment()', () => {
    it('should return empty string for empty input', async () => {
      const result = await adapter.segment('');
      expect(result).toBe('');
      expect(axios.post).not.toHaveBeenCalled();
    });

    it('should return empty string for whitespace-only input', async () => {
      const result = await adapter.segment('   ');
      expect(result).toBe('');
    });

    it('should call ML service and return segmented text', async () => {
      axios.post.mockResolvedValue({
        data: { segmented: 'con_bò ăn cỏ' },
      });

      const result = await adapter.segment('con bò ăn cỏ');

      expect(result).toBe('con_bò ăn cỏ');
      expect(axios.post).toHaveBeenCalledWith(
        'http://localhost:8000/segment',
        { text: 'con bò ăn cỏ' },
        { timeout: 5000 },
      );
    });

    it('should retry once on first failure and succeed', async () => {
      axios.post
        .mockRejectedValueOnce(new Error('ECONNREFUSED'))
        .mockResolvedValueOnce({ data: { segmented: 'con_bò ăn cỏ' } });

      const result = await adapter.segment('con bò ăn cỏ');

      expect(result).toBe('con_bò ăn cỏ');
      expect(axios.post).toHaveBeenCalledTimes(2);
    });

    it('should fallback to normalized text after 2 failures', async () => {
      axios.post.mockRejectedValue(new Error('Service unavailable'));

      const result = await adapter.segment('con bò ăn cỏ');

      expect(result).toBe('con bò ăn cỏ');
      expect(axios.post).toHaveBeenCalledTimes(2);
    });

    it('should fallback when response is missing segmented field', async () => {
      axios.post.mockResolvedValue({ data: { unexpected: 'value' } });

      const result = await adapter.segment('con bò ăn cỏ');

      // First attempt: missing field → log warn, Second attempt: same → fallback
      expect(result).toBe('con bò ăn cỏ');
    });

    it('should handle timeout errors gracefully', async () => {
      const timeoutError = new Error('timeout of 5000ms exceeded');
      timeoutError.code = 'ECONNABORTED';
      axios.post.mockRejectedValue(timeoutError);

      const result = await adapter.segment('con bò ăn cỏ');

      expect(result).toBe('con bò ăn cỏ');
    });

    it('should normalize input before sending to service', async () => {
      axios.post.mockResolvedValue({
        data: { segmented: 'con_bò ăn cỏ' },
      });

      await adapter.segment('  con   bò   ăn   cỏ  ');

      expect(axios.post).toHaveBeenCalledWith(
        expect.any(String),
        { text: 'con bò ăn cỏ' },
        expect.any(Object),
      );
    });

    it('should handle mixed Vietnamese-English text', async () => {
      axios.post.mockResolvedValue({
        data: { segmented: 'Học_sinh đọc sách Harry Potter' },
      });

      const result = await adapter.segment('Học sinh đọc sách Harry Potter');

      expect(result).toBe('Học_sinh đọc sách Harry Potter');
    });

    it('should handle punctuation-heavy text', async () => {
      axios.post.mockResolvedValue({
        data: { segmented: 'Xin chào! Bạn khỏe không?' },
      });

      const result = await adapter.segment('Xin chào! Bạn khỏe không?');

      expect(result).toBe('Xin chào! Bạn khỏe không?');
    });
  });
});
