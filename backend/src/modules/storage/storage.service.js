/**
 * Supabase Storage Service
 *
 * Handles file upload, delete, and public URL generation
 * using Supabase Storage buckets.
 *
 * Bucket: 'media' (auto-created if not exists)
 */

const { Injectable } = require('@nestjs/common');
const { createClient } = require('@supabase/supabase-js');
const { logger } = require('../../common/logger/winston.config');

class StorageService {
  constructor() {
    const url = process.env.SUPABASE_URL || '';
    const key = process.env.SUPABASE_SERVICE_KEY || '';
    this.bucket = process.env.SUPABASE_BUCKET || 'media';

    if (!url || !key) {
      logger.warn('Supabase credentials not configured — storage disabled', {
        context: 'StorageService',
      });
      this.supabase = null;
      return;
    }

    this.supabase = createClient(url, key);

    // Ensure bucket exists on startup
    this.ensureBucket().catch((err) => {
      logger.error('Failed to ensure bucket', {
        context: 'StorageService',
        data: { error: err.message },
      });
    });
  }

  /**
   * Create bucket if it doesn't exist
   */
  async ensureBucket() {
    if (!this.supabase) return;

    const { data: buckets } = await this.supabase.storage.listBuckets();
    const exists = buckets?.some((b) => b.name === this.bucket);

    if (!exists) {
      const { error } = await this.supabase.storage.createBucket(this.bucket, {
        public: true,
        fileSizeLimit: 10 * 1024 * 1024, // 10 MB max
        allowedMimeTypes: ['image/png', 'image/jpeg', 'image/gif', 'image/svg+xml', 'image/webp'],
      });

      if (error) {
        logger.error('Create bucket failed', {
          context: 'StorageService',
          data: { error: error.message },
        });
      } else {
        logger.info(`Bucket "${this.bucket}" created`, { context: 'StorageService' });
      }
    }
  }

  /**
   * Upload file to Supabase Storage
   *
   * @param {Buffer} fileBuffer - File content
   * @param {string} originalName - Original filename
   * @param {string} mimeType - MIME type (image/png, etc.)
   * @param {string} folder - Subfolder in bucket (avatars, covers, rewards)
   * @returns {Promise<{url: string, key: string}>}
   */
  async upload(fileBuffer, originalName, mimeType, folder = 'general') {
    if (!this.supabase) {
      throw new Error(
        'Supabase Storage chưa được cấu hình. Vui lòng thêm SUPABASE_URL và SUPABASE_SERVICE_KEY vào .env',
      );
    }

    // Generate unique filename: folder/timestamp-originalname
    const timestamp = Date.now();
    const safeName = originalName.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    const key = `${folder}/${timestamp}-${safeName}`;

    const { error } = await this.supabase.storage.from(this.bucket).upload(key, fileBuffer, {
      contentType: mimeType,
      upsert: false,
    });

    if (error) {
      logger.error('Upload failed', {
        context: 'StorageService',
        data: { key, error: error.message },
      });
      throw new Error(`Upload thất bại: ${error.message}`);
    }

    const url = this.getPublicUrl(key);

    logger.info('File uploaded', {
      context: 'StorageService',
      data: { key, url, size: fileBuffer.length },
    });

    return { url, key };
  }

  /**
   * Get public URL for a file
   */
  getPublicUrl(key) {
    if (!this.supabase) return null;

    const { data } = this.supabase.storage.from(this.bucket).getPublicUrl(key);

    return data?.publicUrl || null;
  }

  /**
   * Delete file from storage
   *
   * @param {string} key - File key (e.g. "avatars/123-photo.png")
   */
  async delete(key) {
    if (!this.supabase) {
      throw new Error('Supabase Storage chưa được cấu hình');
    }

    const { error } = await this.supabase.storage.from(this.bucket).remove([key]);

    if (error) {
      logger.error('Delete failed', {
        context: 'StorageService',
        data: { key, error: error.message },
      });
      throw new Error(`Xóa file thất bại: ${error.message}`);
    }

    logger.info('File deleted', {
      context: 'StorageService',
      data: { key },
    });

    return { message: 'File đã được xóa', key };
  }

  /**
   * List files in a folder
   *
   * @param {string} folder - Folder path
   * @returns {Promise<Array>}
   */
  async listFiles(folder = '') {
    if (!this.supabase) {
      throw new Error('Supabase Storage chưa được cấu hình');
    }

    const { data, error } = await this.supabase.storage
      .from(this.bucket)
      .list(folder, { limit: 100, sortBy: { column: 'created_at', order: 'desc' } });

    if (error) {
      throw new Error(`Lấy danh sách file thất bại: ${error.message}`);
    }

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
