const dgram = require('dgram');
const fs = require('fs');
const path = require('path');

class LoggerService {
  constructor(logstashHost = process.env.LOGSTASH_HOST || 'localhost', logstashPort = process.env.LOGSTASH_PORT ? parseInt(process.env.LOGSTASH_PORT) : 5000, options = {}) {
    this.logstashHost = logstashHost;
    this.logstashPort = logstashPort;
    this.client = dgram.createSocket('udp4');

    this.client.on('error', (err) => {
      console.error('Logger UDP client error:', err);
    });

    // fallback file for when sending to Logstash fails or is disabled
    this.fallbackLogPath = options.fallbackLogPath || path.join(__dirname, '..', 'logs', 'app.log');
    try {
      fs.mkdirSync(path.dirname(this.fallbackLogPath), { recursive: true });
    } catch (e) {}
  }

  sendRaw(message) {
    return new Promise((resolve) => {
      const buf = Buffer.from(message);
      this.client.send(buf, 0, buf.length, this.logstashPort, this.logstashHost, (err) => {
        if (err) {
          console.error('❌ Log send error:', err);
          // fallback: append to local file so logs are not lost
          fs.appendFile(this.fallbackLogPath, message + '\n', (fsErr) => {
            if (fsErr) console.error('Failed to write fallback log:', fsErr);
            resolve();
          });
        } else {
          // keep console logging minimal in production by using NODE_ENV
          if (process.env.NODE_ENV !== 'production') console.log('✅ Log sent:', (() => { try { return JSON.parse(message).eventType } catch(e){ return 'event' } })());
          resolve();
        }
      });
    });
  }

  async sendLog(eventType, userId, username, description, metadata = {}, priority = 'low') {
    const logData = {
      timestamp: new Date().toISOString(),
      eventType,
      userId: userId != null ? String(userId) : null,
      username,
      description,
      priority,
      metadata
    };

    const message = JSON.stringify(logData);
    await this.sendRaw(message);
  }

  async login(userId, username, device, ip) {
    await this.sendLog('LOGIN', userId, username, 'User logged in', { device, ip }, 'low');
  }

  async postCreated(userId, username, postId) {
    await this.sendLog('POST_CREATED', userId, username, 'User created a post', { postId: postId?.toString() }, 'low');
  }

  async commentAdded(userId, username, postId, commentId) {
    await this.sendLog('COMMENT_ADDED', userId, username, 'User added a comment', { postId: postId?.toString(), commentId: commentId?.toString() }, 'low');
  }

  async likeAdded(userId, username, postId) {
    await this.sendLog('LIKE_ADDED', userId, username, 'User liked a post', { postId: postId?.toString() }, 'low');
  }

  async userFollows(followerId, followerUsername, followingId) {
    await this.sendLog('USER_FOLLOWS', followerId, followerUsername, 'User followed someone', { followingId }, 'low');
  }

  async userFollowedBy(userId, username, followerId) {
    await this.sendLog('SOMEONE_FOLLOWS_YOU', userId, username, 'User was followed', { followerId }, 'low');
  }

  // allow graceful shutdown
  close() {
    try {
      this.client.close();
    } catch (e) {}
  }
}

module.exports = new LoggerService();