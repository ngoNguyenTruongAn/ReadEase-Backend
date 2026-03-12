const { Injectable, UnauthorizedException, ConflictException } = require('@nestjs/common');

const bcrypt = require('bcrypt');
const { JwtService } = require('@nestjs/jwt');
const { InjectRepository } = require('@nestjs/typeorm');

const { UserEntity } = require('../users/entities/user.entity');

class AuthService {
  constructor(userRepository, jwtService) {
    this.userRepository = userRepository;
    this.jwtService = jwtService;
  }

  /**
   * REGISTER
   */
  async register(dto) {
    const existing = await this.userRepository.findOne({
      where: { email: dto.email },
    });

    if (existing) {
      throw new ConflictException('Email already exists');
    }

    const password_hash = await bcrypt.hash(dto.password, 12);

    const user = this.userRepository.create({
      email: dto.email,
      password_hash,
      display_name: dto.displayName,
      role: dto.role || 'ROLE_GUARDIAN',
    });

    await this.userRepository.save(user);

    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: '15m',
    });

    const refreshToken = this.jwtService.sign(payload, {
      expiresIn: '7d',
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    };
  }

  /**
   * LOGIN
   */
  async login(dto) {
    const user = await this.userRepository.findOne({
      where: { email: dto.email },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const match = await bcrypt.compare(dto.password, user.password_hash);

    if (!match) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: '15m',
    });

    const refreshToken = this.jwtService.sign(payload, {
      expiresIn: '7d',
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    };
  }

  /**
   * REFRESH TOKEN
   */
  async refresh(dto) {
    try {
      const payload = this.jwtService.verify(dto.refreshToken);

      const user = await this.userRepository.findOne({
        where: { id: payload.sub },
      });

      if (!user) {
        throw new UnauthorizedException();
      }

      const newPayload = {
        sub: user.id,
        email: user.email,
        role: user.role,
      };

      const accessToken = this.jwtService.sign(newPayload, {
        expiresIn: '15m',
      });

      return { accessToken };
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }
}

/**
 * Dependency Injection
 */
InjectRepository(UserEntity)(AuthService, undefined, 0);
require('@nestjs/common').Inject(JwtService)(AuthService, undefined, 1);
Injectable()(AuthService);

module.exports = { AuthService };
