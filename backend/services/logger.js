// services/logger.js
const dgram = require('dgram');
const fs = require('fs');
const path = require('path');

// ---- helper to extract ip + device from req ----
function getClientInfoFromReq(req) {
  const device = req.headers['user-agent'] || 'unknown';

  let ip =
    (req.headers['x-forwarded-for'] &&
      req.headers['x-forwarded-for'].split(',')[0].trim()) ||
    req.socket?.remoteAddress ||
    req.connection?.remoteAddress ||
    null;

  if (ip === '::1') ip = '127.0.0.1';
  if (ip && ip.startsWith('::ffff:')) ip = ip.slice(7);

  return { ip, device };
}

class LoggerService {
  constructor(
    logstashHost = process.env.LOGSTASH_HOST || 'localhost',
    logstashPort = process.env.LOGSTASH_PORT
      ? parseInt(process.env.LOGSTASH_PORT)
      : 5000,
    options = {}
  ) {
    this.logstashHost = logstashHost;
    this.logstashPort = logstashPort;
    this.client = dgram.createSocket('udp4');

    this.client.on('error', (err) => {
      console.error('Logger UDP client error:', err);
    });

    this.fallbackLogPath =
      options.fallbackLogPath ||
      path.join(__dirname, '..', 'logs', 'app.log');
    try {
      fs.mkdirSync(path.dirname(this.fallbackLogPath), { recursive: true });
    } catch (e) {}
  }

  sendRaw(message) {
    return new Promise((resolve) => {
      const buf = Buffer.from(message);
      this.client.send(
        buf,
        0,
        buf.length,
        this.logstashPort,
        this.logstashHost,
        (err) => {
          if (err) {
            console.error('❌ Log send error:', err);
            fs.appendFile(this.fallbackLogPath, message + '\n', () => resolve());
          } else {
            resolve();
          }
        }
      );
    });
  }

  async sendLog(
    eventType,
    userId,
    username,
    description,
    metadata = {},
    priority = 'low'
  ) {
    const logData = {
      timestamp: new Date().toISOString(),
      eventType,
      userId: userId != null ? String(userId) : null,
      username,
      description,
      priority,
      metadata,
    };

    await this.sendRaw(JSON.stringify(logData));
  }

  // ========= NEW UNIVERSAL FUNCTION =========
  async logFromRequest(
    req,
    {
      eventType,
      description,
      metadata = {},
      priority = 'low',
      userId,
      username,
    }
  ) {
    const { ip, device } = getClientInfoFromReq(req);

    // read possible values from metadata
    const metaUserId = metadata?.userId;
    const metaUsername = metadata?.username;

    const finalUserId =
      userId ?? metaUserId ?? req.user?._id ?? null;

    const finalUsername =
      username ?? metaUsername ?? req.user?.username ?? 'guest';

    // 👇 this was missing
    const finalMetadata = {
      ...metadata,
      ip,
      device,
    };

    await this.sendLog(
      eventType,
      finalUserId,
      finalUsername,
      description,
      finalMetadata,
      priority
    );
  }

  // you can keep your old specific methods if you want,
  // or slowly replace them with logFromRequest(...)
}

module.exports = new LoggerService();
