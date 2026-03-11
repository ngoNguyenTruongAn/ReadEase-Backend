const { Test } = require('@nestjs/testing');
const { AuthService } = require('./auth.service');
const { JwtService } = require('@nestjs/jwt');
const { getRepositoryToken } = require('@nestjs/typeorm');

const bcrypt = require('bcrypt');

const { UserEntity } = require('../users/entities/user.entity');

describe('AuthService', () => {

  let service;
  let repo;
  let jwtService;

  const mockRepo = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn()
  };

  const mockJwt = {
    sign: jest.fn().mockReturnValue('mock-token')
  };

  beforeEach(async () => {

    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: getRepositoryToken(UserEntity),
          useValue: mockRepo
        },
        {
          provide: JwtService,
          useValue: mockJwt
        }
      ]
    }).compile();

    service = module.get(AuthService);
    repo = module.get(getRepositoryToken(UserEntity));
    jwtService = module.get(JwtService);

  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should register user', async () => {

    repo.findOne.mockResolvedValue(null);

    jest.spyOn(bcrypt, 'hash').mockResolvedValue('hashed-password');

    repo.create.mockReturnValue({
      id: 1,
      email: 'test@mail.com',
      role: 'ROLE_CHILD'
    });

    repo.save.mockResolvedValue({
      id: 1,
      email: 'test@mail.com',
      role: 'ROLE_CHILD'
    });

    const result = await service.register({
      email: 'test@mail.com',
      password: '12345678',
      displayName: 'Test',
      role: 'ROLE_CHILD'
    });

    expect(result.accessToken).toBeDefined();
    expect(result.refreshToken).toBeDefined();
    expect(jwtService.sign).toHaveBeenCalled();

  });

});