const {
  Injectable,
  UnauthorizedException,
  ConflictException
} = require('@nestjs/common');

const bcrypt = require('bcrypt');
const { JwtService } = require('@nestjs/jwt');
const { InjectRepository } = require('@nestjs/typeorm');

const { UserEntity } = require('../users/entities/user.entity');

class AuthService {

  constructor(userRepository, jwtService) {
    this.userRepository = userRepository;
    this.jwtService = jwtService;
  }

  async register(dto) {

    const existing = await this.userRepository.findOne({
      where: { email: dto.email }
    });

    if (existing) {
      throw new ConflictException('Email already exists');
    }

    const password_hash = await bcrypt.hash(dto.password, 10);

    const user = this.userRepository.create({
      email: dto.email,
      password_hash,
      role: dto.role || 'parent'
    });

    await this.userRepository.save(user);

    return { message: 'User registered successfully' };
  }

  async login(dto) {

    const user = await this.userRepository.findOne({
      where: { email: dto.email }
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
      role: user.role
    };

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: '15m'
    });

    const refreshToken = this.jwtService.sign(payload, {
      expiresIn: '7d'
    });

    return {
      accessToken,
      refreshToken
    };
  }

  async refresh(dto) {

    try {

      const payload = this.jwtService.verify(dto.refreshToken);

      const accessToken = this.jwtService.sign({
        sub: payload.sub,
        email: payload.email,
        role: payload.role
      });

      return { accessToken };

    } catch {

      throw new UnauthorizedException('Invalid refresh token');

    }

  }

}

InjectRepository(UserEntity)(AuthService, null, 0);
Reflect.decorate(
  [require('@nestjs/common').Inject(JwtService)],
  AuthService,
  1
);
Injectable()(AuthService);

module.exports = { AuthService };