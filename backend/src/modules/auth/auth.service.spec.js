import { Test, TestingModule } from '@nestjs/testing'
import { AuthService } from './auth.service'
import { JwtService } from '@nestjs/jwt'
import { getRepositoryToken } from '@nestjs/typeorm'
import { User } from '../users/entities/user.entity'
import * as bcrypt from 'bcrypt'

describe('AuthService', () => {

  let service
  let repo

  const mockUserRepo = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn()
  }

  const mockJwt = {
    sign: jest.fn().mockReturnValue('mock-token')
  }

  beforeEach(async () => {

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepo
        },
        {
          provide: JwtService,
          useValue: mockJwt
        }
      ]
    }).compile()

    service = module.get<AuthService>(AuthService)
    repo = module.get(getRepositoryToken(User))
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('should register user', async () => {

    repo.findOne.mockResolvedValue(null)

    jest.spyOn(bcrypt, 'hash').mockResolvedValue('hashed-password')

    repo.create.mockReturnValue({
      id: 1,
      email: 'test@mail.com'
    })

    repo.save.mockResolvedValue({
      id: 1,
      email: 'test@mail.com'
    })

    const result = await service.register({
      email: 'test@mail.com',
      password: '123456',
      displayName: 'Test',
      role: 'child'
    })

    expect(result.accessToken).toBeDefined()
    expect(result.refreshToken).toBeDefined()

  })

  it('should login user', async () => {

    repo.findOne.mockResolvedValue({
      id: 1,
      email: 'test@mail.com',
      password_hash: 'hashed-password',
      role: 'child'
    })

    jest.spyOn(bcrypt, 'compare').mockResolvedValue(true)

    const result = await service.login({
      email: 'test@mail.com',
      password: '123456'
    })

    expect(result.accessToken).toBeDefined()

  })

})