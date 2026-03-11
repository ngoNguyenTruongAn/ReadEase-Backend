/**
 * Roles Guard
 *
 * Checks if the authenticated user has the required role(s)
 * to access a given route. Works with @Roles() decorator.
 *
 * Usage: @UseGuards(JwtAuthGuard, RolesGuard)
 */
const { Injectable, Dependencies } = require('@nestjs/common');
const { Reflector } = require('@nestjs/core');

class RolesGuard {
  /**
   * @param {Reflector} reflector - NestJS Reflector for reading metadata
   */
  constructor(reflector) {
    this.reflector = reflector;
  }

  /**
   * @param {import('@nestjs/common').ExecutionContext} context
   * @returns {boolean}
   */
  canActivate(context) {
    const requiredRoles = this.reflector.get('roles', context.getHandler());

    if (!requiredRoles) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) return false;

    return requiredRoles.includes(user.role);
  }
}

Reflect.decorate([Injectable(), Dependencies(Reflector)], RolesGuard);

module.exports = { RolesGuard };
