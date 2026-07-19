const { Injectable } = require('@nestjs/common');
const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} = require('@aws-sdk/client-s3');
const { createClient } = require('@supabase/supabase-js');
const { logger } = require('../../common/logger/winston.config');

class StorageService {
  constructor() {
    this.s3Bucket = process.env.S3_MEDIA_BUCKET || '';
    this.awsRegion = process.env.AWS_REGION || 'ap-southeast-1';

    if (this.s3Bucket) {
      this.provider = 's3';
      this.s3 = new S3Client({ region: this.awsRegion });
      logger.info('S3 storage configured', {
        context: 'StorageService',
        data: { bucket: this.s3Bucket, region: this.awsRegion },
      });
      return;
    }

    const url = process.env.SUPABASE_URL || '';
    const key = process.env.SUPABASE_SERVICE_KEY || '';
    this.bucket = process.env.SUPABASE_BUCKET || 'media';

    if (!url || !key) {
      this.provider = null;
      this.supabase = null;
      logger.warn('Storage is not configured', { context: 'StorageService' });
      return;
    }

    this.provider = 'supabase';
    this.supabase = createClient(url, key);
    this.ensureSupabaseBucket().catch((err) => {
      logger.error('Failed to ensure Supabase bucket', {
        context: 'StorageService',
        data: { error: err.message },
      });
    });
  }

  async ensureSupabaseBucket() {
    if (this.provider !== 'supabase') return;

    const { data: buckets } = await this.supabase.storage.listBuckets();
    if (buckets?.some((bucket) => bucket.name === this.bucket)) return;

    const { error } = await this.supabase.storage.createBucket(this.bucket, {
      public: true,
      fileSizeLimit: 10 * 1024 * 1024,
      allowedMimeTypes: [
        'image/png',
        'image/jpeg',
        'image/gif',
        'image/svg+xml',
        'image/webp',
        'text/plain',
        'text/plain; charset=utf-8',
        'application/json',
      ],
    });

    if (error) throw new Error(error.message);
  }

  buildKey(originalName, folder) {
    const safeFolder = String(folder || 'general').replace(/[^a-zA-Z0-9/_-]/g, '_');
    const safeName = String(originalName).replace(/[^a-zA-Z0-9._-]/g, '_');
    return `${safeFolder}/${Date.now()}-${safeName}`;
  }

  getFileUrl(key) {
    return `/api/v1/upload/file/content?key=${encodeURIComponent(key)}`;
  }

  async upload(fileBuffer, originalName, mimeType, folder = 'general') {
    if (!this.provider) throw new Error('Storage is not configured');

    const key = this.buildKey(originalName, folder);

    if (this.provider === 's3') {
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.s3Bucket,
          Key: key,
          Body: fileBuffer,
          ContentType: mimeType,
          ServerSideEncryption: 'AES256',
        }),
      );

      logger.info('File uploaded to S3', {
        context: 'StorageService',
        data: { key, size: fileBuffer.length },
      });
      return { url: this.getFileUrl(key), key };
    }

    const { error } = await this.supabase.storage.from(this.bucket).upload(key, fileBuffer, {
      contentType: mimeType,
      upsert: false,
    });
    if (error) throw new Error(`Upload failed: ${error.message}`);

    return { url: this.getPublicUrl(key), key };
  }

  getPublicUrl(key) {
    if (this.provider === 's3') return this.getFileUrl(key);
    if (this.provider !== 'supabase') return null;

    const { data } = this.supabase.storage.from(this.bucket).getPublicUrl(key);
    return data?.publicUrl || null;
  }

  async download(key) {
    if (!key || this.provider !== 's3') {
      throw new Error('S3 storage is not configured');
    }

    const result = await this.s3.send(
      new GetObjectCommand({ Bucket: this.s3Bucket, Key: key }),
    );
    const bytes = await result.Body.transformToByteArray();

    return {
      body: Buffer.from(bytes),
      contentType: result.ContentType || 'application/octet-stream',
      contentLength: result.ContentLength,
      etag: result.ETag,
    };
  }

  async delete(key) {
    if (!this.provider) throw new Error('Storage is not configured');

    if (this.provider === 's3') {
      await this.s3.send(new DeleteObjectCommand({ Bucket: this.s3Bucket, Key: key }));
      return { message: 'File deleted', key };
    }

    const { error } = await this.supabase.storage.from(this.bucket).remove([key]);
    if (error) throw new Error(`File deletion failed: ${error.message}`);
    return { message: 'File deleted', key };
  }

  async listFiles(folder = '') {
    if (!this.provider) throw new Error('Storage is not configured');

    if (this.provider === 's3') {
      const prefix = folder ? `${folder.replace(/\/$/, '')}/` : '';
      const result = await this.s3.send(
        new ListObjectsV2Command({ Bucket: this.s3Bucket, Prefix: prefix, MaxKeys: 100 }),
      );

      return (result.Contents || [])
        .sort((a, b) => (b.LastModified?.getTime() || 0) - (a.LastModified?.getTime() || 0))
        .map((file) => ({
          name: file.Key.slice(prefix.length),
          key: file.Key,
          url: this.getFileUrl(file.Key),
          size: file.Size,
          createdAt: file.LastModified,
        }));
    }

    const { data, error } = await this.supabase.storage
      .from(this.bucket)
      .list(folder, { limit: 100, sortBy: { column: 'created_at', order: 'desc' } });
    if (error) throw new Error(`Failed to list files: ${error.message}`);

    return (data || []).map((file) => ({
      name: file.name,
      key: folder ? `${folder}/${file.name}` : file.name,
      url: this.getPublicUrl(folder ? `${folder}/${file.name}` : file.name),
      size: file.metadata?.size || null,
      createdAt: file.created_at,
    }));
  }
}

Injectable()(StorageService);

module.exports = { StorageService };
