const mockSend = jest.fn();

jest.mock('@aws-sdk/client-s3', () => {
  class Command {
    constructor(input) {
      this.input = input;
    }
  }

  return {
    S3Client: jest.fn(() => ({ send: mockSend })),
    PutObjectCommand: Command,
    GetObjectCommand: Command,
    DeleteObjectCommand: Command,
    ListObjectsV2Command: Command,
  };
});

const { StorageService } = require('./storage.service');

describe('StorageService with S3', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.S3_MEDIA_BUCKET = 'readease-test-media';
    process.env.AWS_REGION = 'ap-southeast-1';
  });

  afterAll(() => {
    delete process.env.S3_MEDIA_BUCKET;
    delete process.env.AWS_REGION;
  });

  it('uploads an object and returns a stable same-origin URL', async () => {
    mockSend.mockResolvedValueOnce({});
    const service = new StorageService();

    const result = await service.upload(
      Buffer.from('reading text'),
      'body.txt',
      'text/plain; charset=utf-8',
      'stories',
    );

    expect(result.key).toMatch(/^stories\/\d+-body\.txt$/);
    expect(result.url).toBe(
      `/api/v1/upload/file/content?key=${encodeURIComponent(result.key)}`,
    );
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          Bucket: 'readease-test-media',
          Key: result.key,
          ContentType: 'text/plain; charset=utf-8',
          ServerSideEncryption: 'AES256',
        }),
      }),
    );
  });

  it('downloads an object as a buffer', async () => {
    mockSend.mockResolvedValueOnce({
      Body: { transformToByteArray: jest.fn().mockResolvedValue(Buffer.from('hello')) },
      ContentType: 'text/plain; charset=utf-8',
      ContentLength: 5,
      ETag: 'test-etag',
    });
    const service = new StorageService();

    const result = await service.download('stories/example.txt');

    expect(result.body.toString('utf8')).toBe('hello');
    expect(result.contentType).toBe('text/plain; charset=utf-8');
    expect(result.contentLength).toBe(5);
  });
});
