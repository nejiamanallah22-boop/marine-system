// ============================================================
// 📋 LOGS.JS - السجلات
// ============================================================

console.log('📋 logs.js loaded');

// ============================================================
// 1. المتغيرات
// ============================================================

let logsList = [];
let filteredLogs = [];
let currentPage = 1;
const pageSize = 10;

// ============================================================
// 2. تحميل البيانات
// ============================================================

function loadLogsData() {
    console.log('📋 تحميل بيانات السجلات...');
    
    logsList = window.allLogs || [];
    filteredLogs = logsList.slice();
    renderLogsTable();
}

// ============================================================
// 3. عرض الجدول
// ============================================================

function renderLogsTable() {
    var tbody = document.getElementById('logsBody');
    if (!tbody) return;
    
    var total = filteredLogs.length;
    var countEl = document.getElementById('logsCount');
    if (countEl) countEl.textContent = total + ' سجل';
    
    if (total === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:40px;color:rgba(255,255,255,0.2);">🚫 لا توجد سجلات</td></tr>';
        return;
    }
    
    var start = (currentPage - 1) * pageSize;
    var end = Math.min(start + pageSize, total);
    var pageData = filteredLogs.slice(start, end);
    
    var html = '';
    pageData.forEach(function(l, i) {
        var statusClass = l.status === 'success' ? 'status-success' : 
                          l.status === 'error' ? 'status-error' : 'status-warning';
        var statusText = l.status === 'success' ? '✅ نجاح' : 
                         l.status === 'error' ? '❌ خطأ' : '⚠️ تحذير';
        
        html += '<tr>';
        html += '<td>' + (start + i + 1) + '</td>';
        html += '<td>' + formatDate(l.timestamp || l.createdAt) + '</td>';
        html += '<td><strong>' + escapeHTML(l.user || 'نظام') + '</strong></td>';
        html += '<td>' + escapeHTML(l.type || '-') + '</td>';
        html += '<td>' + escapeHTML(l.action || '-') + '</td>';
        html += '<td><span class="status-badge ' + statusClass + '">' + statusText + '</span></td>';
        html += '</tr>';
    });
    
    tbody.innerHTML = html;
}

// ============================================================
// 4. تهيئة الصفحة
// ============================================================

function initLogs() {
    console.log('📋 تهيئة صفحة السجلات...');
    loadLogsData();
}

// ============================================================
// 5. تشغيل
// ============================================================

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLogs);
} else {
    initLogs();
}

// ============================================================
// 6. دوال مساعدة
// ============================================================

function escapeHTML(s) {
    if (!s) return '';
    return String(s).replace(/[&<>"']/g, function(m) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m];
    });
}

function formatDate(d) {
    if (!d) return '-';
    try {
        var date = new Date(d);
        if (isNaN(date.getTime())) return '-';
        return date.toLocaleString('ar-TN', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch { return '-'; }
}

console.log('✅ logs.js loaded');
