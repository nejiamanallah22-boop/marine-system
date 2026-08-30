module.exports = {
    apps: [{
        name: 'marine-system',
        script: 'server.js',
        instances: 2,
        exec_mode: 'cluster',
        watch: false,
        max_memory_restart: '1G',
        env: {
            NODE_ENV: 'production',
            PORT: 5000
        },
        error_file: 'logs/pm2-error.log',
        out_file: 'logs/pm2-out.log',
        log_file: 'logs/pm2-combined.log',
        time: true,
        merge_logs: true,
        log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    }]
};
