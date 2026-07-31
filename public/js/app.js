// public/js/app.js
console.log('✅ App loaded');

// ============================================================
// دوال تحميل الصفحات
// ============================================================

function loadPage(pageName) {
    const container = document.getElementById('pageContainer');
    if (!container) return;
    
    // إخفاء جميع الصفحات
    document.querySelectorAll('.page-content').forEach(el => el.classList.add('hidden'));
    
    // إظهار الصفحة المطلوبة
    const target = document.getElementById('page-' + pageName);
    if (target) {
        target.classList.remove('hidden');
        // تهيئة الصفحة
        initPage(pageName);
    } else {
        // تحميل الصفحة من ملف خارجي
        fetch(`/pages/${pageName}.html`)
            .then(res => {
                if (!res.ok) throw new Error('Page not found');
                return res.text();
            })
            .then(html => {
                const div = document.createElement('div');
                div.className = 'page-content';
                div.id = 'page-' + pageName;
                div.innerHTML = html;
                container.appendChild(div);
                initPage(pageName);
            })
            .catch(err => {
                console.error('Error loading page:', err);
                container.innerHTML = `
                    <div style="text-align:center; padding:50px; color:#dc3545;">
                        ❌ خطأ في تحميل الصفحة: ${pageName}
                    </div>
                `;
            });
    }
}

function initPage(pageName) {
    console.log('📄 Initializing page:', pageName);
    switch(pageName) {
        case 'fleet':
            loadVessels();
            break;
        case 'maintenance':
            loadMaintenance();
            break;
        case 'efficiency':
            loadVessels();
            break;
        case 'support':
            loadTickets();
            break;
        case 'tracking':
            setTimeout(initMap, 100);
            break;
        case 'map':
            setTimeout(initMap, 100);
            break;
        case 'users':
            loadUsers();
            break;
        case 'notes':
            loadNotes();
            break;
    }
}

function showPage(pageName) {
    loadPage(pageName);
}
