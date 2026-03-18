/**
 * Upload Controller
 *
 * REST API for file upload/delete/list via Supabase Storage.
 *
 * Endpoints:
 *   POST   /api/v1/upload          — Upload file (multipart/form-data)
 *   POST   /api/v1/upload/multiple — Upload nhiều file
 *   GET    /api/v1/upload/:folder  — List files trong folder
 *   DELETE /api/v1/upload          — Delete file by key
 */

require('reflect-metadata');

const {
  Controller,
  Post,
  Get,
  Delete,
  Req,
  Param,
  Body,
  UseGuards,
  UseInterceptors,
  BadRequestException,
  HttpCode,
  Inject,
} = require('@nestjs/common');

const { FileInterceptor, FilesInterceptor } = require('@nestjs/platform-express');
const multer = require('multer');

const { JwtAuthGuard } = require('../auth/guards/jwt-auth.guard');
const { StorageService } = require('./storage.service');

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/svg+xml', 'image/webp'];

const multerOptions = {
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new BadRequestException(
          `Loại file không hỗ trợ: ${file.mimetype}. Chỉ chấp nhận: ${ALLOWED_TYPES.join(', ')}`,
        ),
        false,
      );
    }
  },
};

class UploadController {
  constructor(storageService) {
    this.storageService = storageService;
  }

  /**
   * POST /api/v1/upload
   * Upload single file
   *
   * Form data:
   *   - file: File (required)
   *   - folder: string (optional, default: "general")
   */
  async uploadFile(req) {
    const file = req.file;

    if (!file) {
      throw new BadRequestException('Vui lòng chọn file để upload');
    }

    const folder = req.body?.folder || 'general';

    const result = await this.storageService.upload(
      file.buffer,
      file.originalname,
      file.mimetype,
      folder,
    );

    return {
      success: true,
      data: {
        url: result.url,
        key: result.key,
        originalName: file.originalname,
        size: file.size,
        mimeType: file.mimetype,
      },
    };
  }

  /**
   * POST /api/v1/upload/multiple
   * Upload multiple files (max 5)
   */
  async uploadMultiple(req) {
    const files = req.files;

    if (!files || files.length === 0) {
      throw new BadRequestException('Vui lòng chọn ít nhất 1 file');
    }

    const folder = req.body?.folder || 'general';

    const results = await Promise.all(
      files.map(async (file) => {
        const result = await this.storageService.upload(
          file.buffer,
          file.originalname,
          file.mimetype,
          folder,
        );

        return {
          url: result.url,
          key: result.key,
          originalName: file.originalname,
          size: file.size,
          mimeType: file.mimetype,
        };
      }),
    );

    return {
      success: true,
      data: results,
      count: results.length,
    };
  }

  /**
   * GET /api/v1/upload/:folder
   * List files in a folder
   */
  async listFiles(folder) {
    const files = await this.storageService.listFiles(folder);

    return {
      success: true,
      data: files,
      count: files.length,
    };
  }

  /**
   * DELETE /api/v1/upload
   * Delete file by key
   */
  async deleteFile(body) {
    if (!body?.key) {
      throw new BadRequestException('Vui lòng cung cấp key của file cần xóa');
    }

    const result = await this.storageService.delete(body.key);

    return {
      success: true,
      data: result,
    };
  }
}

// ── NestJS Decorators (JavaScript style) ──

Controller('api/v1/upload')(UploadController);
Inject(StorageService)(UploadController, undefined, 0);

// POST /api/v1/upload — Single file
const uploadFileDescriptor = Object.getOwnPropertyDescriptor(
  UploadController.prototype,
  'uploadFile',
);
Reflect.decorate(
  [
    Post(),
    HttpCode(200),
    UseGuards(JwtAuthGuard),
    UseInterceptors(FileInterceptor('file', multerOptions)),
  ],
  UploadController.prototype,
  'uploadFile',
  uploadFileDescriptor,
);
Req()(UploadController.prototype, 'uploadFile', 0);

// POST /api/v1/upload/multiple — Multiple files
const uploadMultipleDescriptor = Object.getOwnPropertyDescriptor(
  UploadController.prototype,
  'uploadMultiple',
);
Reflect.decorate(
  [
    Post('multiple'),
    HttpCode(200),
    UseGuards(JwtAuthGuard),
    UseInterceptors(FilesInterceptor('files', 5, multerOptions)),
  ],
  UploadController.prototype,
  'uploadMultiple',
  uploadMultipleDescriptor,
);
Req()(UploadController.prototype, 'uploadMultiple', 0);

// GET /api/v1/upload/:folder — List files
const listFilesDescriptor = Object.getOwnPropertyDescriptor(
  UploadController.prototype,
  'listFiles',
);
Reflect.decorate(
  [Get(':folder'), UseGuards(JwtAuthGuard)],
  UploadController.prototype,
  'listFiles',
  listFilesDescriptor,
);
Param('folder')(UploadController.prototype, 'listFiles', 0);

// DELETE /api/v1/upload — Delete file
const deleteFileDescriptor = Object.getOwnPropertyDescriptor(
  UploadController.prototype,
  'deleteFile',
);
Reflect.decorate(
  [Delete(), HttpCode(200), UseGuards(JwtAuthGuard)],
  UploadController.prototype,
  'deleteFile',
  deleteFileDescriptor,
);
Body()(UploadController.prototype, 'deleteFile', 0);

module.exports = { UploadController };
