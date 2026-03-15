/**
 * Email Service
 *
 * Sends OTP emails via SMTP (Nodemailer).
 * In dev mode: logs OTP to console instead of sending.
 */
const { Injectable } = require('@nestjs/common');
const nodemailer = require('nodemailer');
const { logger } = require('../../../common/logger/winston.config');

class EmailService {
  constructor() {
    const host = process.env.SMTP_HOST;
    const port = parseInt(process.env.SMTP_PORT || '587', 10);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASSWORD;
    this.fromAddress = process.env.SMTP_FROM || 'ReadEase <noreply@readease.app>';

    this.isDev =
      !host || !user || !pass || user === 'your-email@gmail.com' || pass === 'your-app-password';

    if (!this.isDev) {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
      });
    }
  }

  /**
   * Send OTP email
   * @param {string} to - recipient email
   * @param {string} code - 6-digit OTP
   * @param {'EMAIL_VERIFY'|'FORGOT_PASSWORD'} type
   */
  async sendOTP(to, code, type) {
    const subject =
      type === 'EMAIL_VERIFY' ? 'ReadEase — Xác thực tài khoản' : 'ReadEase — Đặt lại mật khẩu';

    const heading = type === 'EMAIL_VERIFY' ? 'Xác thực tài khoản của bạn' : 'Đặt lại mật khẩu';

    const description =
      type === 'EMAIL_VERIFY'
        ? 'Cảm ơn bạn đã đăng ký ReadEase! Nhập mã bên dưới để xác thực email.'
        : 'Bạn đã yêu cầu đặt lại mật khẩu. Nhập mã bên dưới để tiếp tục.';

    const html = `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #f8f9fa; border-radius: 16px;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h1 style="color: #2CCFCF; font-size: 28px; margin: 0;">🐉 ReadEase</h1>
        </div>
        <div style="background: #ffffff; padding: 32px; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
          <h2 style="color: #333; font-size: 20px; margin: 0 0 12px;">${heading}</h2>
          <p style="color: #666; font-size: 14px; line-height: 1.6;">${description}</p>
          <div style="text-align: center; margin: 24px 0;">
            <div style="display: inline-block; background: #2CCFCF; color: #fff; font-size: 32px; font-weight: bold; letter-spacing: 8px; padding: 16px 32px; border-radius: 12px;">
              ${code}
            </div>
          </div>
          <p style="color: #999; font-size: 12px; text-align: center;">
            Mã có hiệu lực trong <strong>5 phút</strong>. Không chia sẻ mã này với ai.
          </p>
        </div>
        <p style="color: #bbb; font-size: 11px; text-align: center; margin-top: 16px;">
          © 2026 ReadEase — Smart DTU Capstone Project
        </p>
      </div>
    `;

    // DEV mode: log to console
    if (this.isDev) {
      logger.info('========================================');
      logger.info(`📧 OTP Email (DEV MODE)`);
      logger.info(`   To: ${to}`);
      logger.info(`   Type: ${type}`);
      logger.info(`   Code: ${code}`);
      logger.info('========================================');
      return;
    }

    // PROD mode: send via SMTP
    try {
      await this.transporter.sendMail({
        from: this.fromAddress,
        to,
        subject,
        html,
      });

      logger.info('OTP email sent', {
        context: 'EmailService',
        data: { to, type },
      });
    } catch (err) {
      logger.error('Failed to send OTP email', {
        context: 'EmailService',
        data: { to, type, error: err.message },
      });
      // Don't throw — registration should not fail because email failed
    }
  }
}

Injectable()(EmailService);

module.exports = { EmailService };
