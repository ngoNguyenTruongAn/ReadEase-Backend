const { Injectable } = require('@nestjs/common');
const { ThrottlerGuard } = require('@nestjs/throttler');

class GuardianThrottlerGuard extends ThrottlerGuard {
  async getTracker(req) {
    if (req?.user?.sub) {
      return `guardian:${req.user.sub}`;
    }

    return req.ip || req.ips?.[0] || 'anonymous';
  }
}

Injectable()(GuardianThrottlerGuard);

module.exports = { GuardianThrottlerGuard };
