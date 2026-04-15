require('reflect-metadata');

const { BadRequestException, NotFoundException } = require('@nestjs/common');
const { GUARDS_METADATA } = require('@nestjs/common/constants');
const { Reflector } = require('@nestjs/core');

const { ContentController } = require('../content.controller');
const { RolesGuard } = require('../../auth/guards/roles.guard');
const { JwtAuthGuard } = require('../../auth/guards/jwt-auth.guard');

describe('ContentController', () => {
  let controller;
  let service;

  beforeEach(() => {
    service = {
      getContent: jest.fn(),
      getContentById: jest.fn(),
      createContent: jest.fn(),
      updateContent: jest.fn(),
      deleteContent: jest.fn(),
    };

    controller = new ContentController(service);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('GET /content should validate query and return paginated result', async () => {
    service.getContent.mockResolvedValue({
      data: [],
      meta: { page: 1, limit: 10, total: 0, totalPages: 0 },
    });

    const result = await controller.getContent({ page: '1', limit: '10' });

    expect(service.getContent).toHaveBeenCalledWith({ page: 1, limit: 10 });
    expect(result.meta.page).toBe(1);
  });

  it('POST /content should create content for clinician request user', async () => {
    service.createContent.mockResolvedValue({
      id: 'content-1',
      title: 'Story',
      body: 'This body is intentionally long enough to satisfy validation minimum length rules.',
      difficulty: 'EASY',
      age_group: '5-7',
      word_count: 13,
      created_at: new Date('2026-03-15T00:00:00.000Z'),
    });

    const body = {
      title: 'Story',
      body: 'This body is intentionally long enough to satisfy validation minimum length rules.',
      difficulty: 'EASY',
      age_group: '5-7',
    };

    const req = { user: { sub: 'clinician-1', role: 'ROLE_CLINICIAN' } };
    const result = await controller.createContent(body, req);

    expect(service.createContent).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Story' }),
      req.user,
    );
    expect(result.data.id).toBe('content-1');
    expect(result.message).toBe('Created reading content successfully');
  });

  it('GET /content/:id should return full content detail', async () => {
    service.getContentById.mockResolvedValue({
      id: 'content-9',
      title: 'Story detail',
      body: 'con bò ăn cỏ',
      body_segmented: 'con_bò ăn cỏ',
      difficulty: 'EASY',
      age_group: '5-7',
      word_count: 3,
    });

    const result = await controller.getContentById('content-9');

    expect(service.getContentById).toHaveBeenCalledWith('content-9');
    expect(result.body).toBe('con bò ăn cỏ');
    expect(result.body_segmented).toBe('con_bò ăn cỏ');
  });

  it('PUT /content/:id should update content', async () => {
    service.updateContent.mockResolvedValue({
      id: 'content-2',
      title: 'Updated',
      body: 'This updated body is long enough to meet validation and test update flow correctly.',
      difficulty: 'MEDIUM',
      age_group: '8-10',
      word_count: 14,
      created_at: new Date('2026-03-15T00:00:00.000Z'),
    });

    const result = await controller.updateContent('content-2', {
      title: 'Updated',
      body: 'This updated body is long enough to meet validation and test update flow correctly.',
    });

    expect(service.updateContent).toHaveBeenCalledWith('content-2', {
      title: 'Updated',
      body: 'This updated body is long enough to meet validation and test update flow correctly.',
    });
    expect(result.data.title).toBe('Updated');
    expect(result.message).toBe('Updated reading content successfully');
  });

  it('DELETE /content/:id should soft delete content', async () => {
    service.deleteContent.mockResolvedValue({ message: 'Content deleted' });

    const result = await controller.deleteContent('content-3');

    expect(service.deleteContent).toHaveBeenCalledWith('content-3');
    expect(result).toEqual({ message: 'Content deleted' });
  });

  it('should throw BadRequestException for invalid create payload', async () => {
    await expect(
      controller.createContent(
        {
          title: 'Hi',
          body: 'too short',
          difficulty: 'UNKNOWN',
          age_group: '',
        },
        { user: { sub: 'clinician-1' } },
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('should propagate NotFoundException from service', async () => {
    service.updateContent.mockRejectedValue(new NotFoundException('Content not found'));

    await expect(
      controller.updateContent('missing-id', {
        title: 'Updated',
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('RBAC metadata should restrict write endpoints to ROLE_CLINICIAN and read endpoints to all roles', () => {
    const createRoles = Reflect.getMetadata('roles', ContentController.prototype.createContent);
    const updateRoles = Reflect.getMetadata('roles', ContentController.prototype.updateContent);
    const deleteRoles = Reflect.getMetadata('roles', ContentController.prototype.deleteContent);
    const getRoles = Reflect.getMetadata('roles', ContentController.prototype.getContent);
    const getByIdRoles = Reflect.getMetadata('roles', ContentController.prototype.getContentById);

    expect(createRoles).toEqual(['ROLE_CLINICIAN']);
    expect(updateRoles).toEqual(['ROLE_CLINICIAN']);
    expect(deleteRoles).toEqual(['ROLE_CLINICIAN']);
    expect(getRoles).toEqual(['ROLE_CHILD', 'ROLE_CLINICIAN', 'ROLE_GUARDIAN']);
    expect(getByIdRoles).toEqual(['ROLE_CHILD', 'ROLE_CLINICIAN', 'ROLE_GUARDIAN']);
  });

  it('RBAC guard should deny guardian and child, allow clinician on protected endpoint', () => {
    const reflector = new Reflector();
    const rolesGuard = new RolesGuard(reflector);

    const contextForRole = (role) => ({
      getHandler: () => ContentController.prototype.createContent,
      switchToHttp: () => ({
        getRequest: () => ({ user: { role } }),
      }),
    });

    expect(rolesGuard.canActivate(contextForRole('ROLE_GUARDIAN'))).toBe(false);
    expect(rolesGuard.canActivate(contextForRole('ROLE_CHILD'))).toBe(false);
    expect(rolesGuard.canActivate(contextForRole('ROLE_CLINICIAN'))).toBe(true);
  });

  it('protected endpoints should include JwtAuthGuard and RolesGuard metadata', () => {
    const createGuards = Reflect.getMetadata(
      GUARDS_METADATA,
      ContentController.prototype.createContent,
    );
    const updateGuards = Reflect.getMetadata(
      GUARDS_METADATA,
      ContentController.prototype.updateContent,
    );
    const deleteGuards = Reflect.getMetadata(
      GUARDS_METADATA,
      ContentController.prototype.deleteContent,
    );

    expect(createGuards).toEqual(expect.arrayContaining([JwtAuthGuard, RolesGuard]));
    expect(updateGuards).toEqual(expect.arrayContaining([JwtAuthGuard, RolesGuard]));
    expect(deleteGuards).toEqual(expect.arrayContaining([JwtAuthGuard, RolesGuard]));
  });
});
