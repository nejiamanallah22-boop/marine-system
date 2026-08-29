/**
 * 🚢 PM2 Ecosystem Configuration
 * لإدارة تشغيل الخادم في الإنتاج
 */

module.exports = {
  apps: [{
    name: 'marine-system',
    script: 'src/app.js',
    instances: 2, // عدد المثيلات
    exec_mode: 'cluster',
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 5000
    },
    env_development: {
      NODE_ENV: 'development',
      PORT: 5000
    },
    error_file: 'logs/err.log',
    out_file: 'logs/out.log',
    log_file: 'logs/combined.log',
    time: true,
    kill_timeout: 5000,
    listen_timeout: 8000,
    shutdown_with_message: true
  }]
};
