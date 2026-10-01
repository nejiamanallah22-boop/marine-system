    async deleteImage(imageId) {
        if (!confirm('هل أنت متأكد من حذف هذه الصورة؟')) return;
        try {
            const res = await fetch(`/api/vehicles/${currentVehicleId}/images/${imageId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'فشل الحذف');

            this.renderCurrent(data.images);
            // تحديث الكاش
            const v = vehiclesCache.find(x => x._id === currentVehicleId);
            if (v) v.images = data.images;

            showToast('✅ تم حذف الصورة', 'success');
        } catch (err) {
            showToast('❌ فشل الحذف: ' + err.message, 'error');
        }
    },

    async setPrimary(imageId) {
        try {
            const res = await fetch(`/api/vehicles/${currentVehicleId}/images/${imageId}/primary`, {
                method: 'PATCH',
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'فشل التحديث');

            this.renderCurrent(data.images);
            const v = vehiclesCache.find(x => x._id === currentVehicleId);
            if (v) v.images = data.images;

            showToast('⭐ تم تعيين الصورة الرئيسية', 'success');
        } catch (err) {
            showToast('❌ فشل التحديث: ' + err.message, 'error');
        }
    },

    reset() {
        this.pendingFiles = [];
        this.renderPreview();
        const cur = document.getElementById('currentImages');
        if (cur) cur.innerHTML = '';
    }
};

/* ============================================================
   5) 📷 نظام الكاميرا (Camera)
   ============================================================ */
const Camera = {
    stream: null,
    facingMode: 'environment',
    isOpen: false,

    async open() {
        const modal = document.getElementById('cameraModal');
        if (!modal) return;

        modal.classList.add('active');
        this.isOpen = true;

        // تحقق من دعم الكاميرا
        if (!navigator.mediaDevices?.getUserMedia) {
            showToast('المتصفح لا يدعم الكاميرا', 'error');
            this.close();
            this.fallbackToFileInput();
            return;
        }

        // تحقق من HTTPS
        if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
            showToast('الكاميرا تتطلب HTTPS أو localhost', 'warning');
            this.close();
            this.fallbackToFileInput();
            return;
        }

        await this.startStream();
    },

    async startStream() {
        try {
            this.stopStream();

            const constraints = {
                video: {
                    facingMode: { ideal: this.facingMode },
                    width:  { ideal: 1920 },
                    height: { ideal: 1080 }
                },
                audio: false
            };

            this.stream = await navigator.mediaDevices.getUserMedia(constraints);
            const video = document.getElementById('cameraVideo');
            if (video) {
                video.srcObject = this.stream;
                await video.play().catch(() => {});
            }
        } catch (err) {
            console.error('Camera error:', err);
            let msg = 'تعذّر الوصول للكاميرا. ';
            if (err.name === 'NotAllowedError')      msg += 'يرجى السماح بالوصول من إعدادات المتصفح.';
            else if (err.name === 'NotFoundError')   msg += 'لا توجد كاميرا على هذا الجهاز.';
            else if (err.name === 'NotReadableError') msg += 'الكاميرا مستخدمة من تطبيق آخر.';
            else                                      msg += err.message;

            showToast(msg, 'error');
            this.close();
            setTimeout(() => this.fallbackToFileInput(), 800);
        }
    },

    stopStream() {
        if (this.stream) {
            this.stream.getTracks().forEach(t => t.stop());
            this.stream = null;
        }
    },

    close() {
        this.stopStream();
        const modal = document.getElementById('cameraModal');
        if (modal) modal.classList.remove('active');
        this.isOpen = false;
    },

    async switchCamera() {
        this.facingMode = this.facingMode === 'environment' ? 'user' : 'environment';
        showToast(this.facingMode === 'user' ? '🤳 الكاميرا الأمامية' : '📷 الكاميرا الخلفية', 'info');
        await this.startStream();
    },

    capture() {
        const video  = document.getElementById('cameraVideo');
        const canvas = document.getElementById('cameraCanvas');

        if (!video || !video.videoWidth) {
            showToast('الكاميرا لم تجهز بعد، انتظر لحظة', 'warning');
            return;
        }

        canvas.width  = video.videoWidth;
        canvas.height = video.videoHeight;

        const ctx = canvas.getContext('2d');

        // مرآة للكاميرا الأمامية
        if (this.facingMode === 'user') {
            ctx.translate(canvas.width, 0);
            ctx.scale(-1, 1);
        }
        ctx.drawImage(video, 0, 0);

        canvas.toBlob((blob) => {
            if (!blob) {
                showToast('فشل التقاط الصورة', 'error');
                return;
            }

            const filename = `capture-${Date.now()}.jpg`;
            const file = new File([blob], filename, { type: 'image/jpeg' });
            file._source = 'camera';

            ImageUploader.pendingFiles.push(file);
            ImageUploader.renderPreview();

            // تأثير وميض
            const flash = document.createElement('div');
            flash.className = 'camera-flash';
            document.querySelector('.camera-stage')?.appendChild(flash);
            setTimeout(() => flash?.remove(), 350);

            // اهتزاز
            if (navigator.vibrate) navigator.vibrate(30);

            showToast('📸 تم التقاط الصورة', 'success', 1200);
        }, 'image/jpeg', 0.92);
    },

    fallbackToFileInput() {
        // فتح منتقي الملفات مع تفعيل الكاميرا على الموبايل
        const input = document.getElementById('cameraInput');
        if (input) input.click();
    }
};

/* ============================================================
   6) 🔗 استيراد صورة من رابط (URL Importer)
   ============================================================ */
const UrlImporter = {
    open() {
        const modal = document.getElementById('urlModal');
        if (!modal) return;
        modal.classList.add('active');
        document.getElementById('urlInput').value = '';
        document.getElementById('urlCaption').value = '';
        document.getElementById('urlPreview').innerHTML = '';
        setTimeout(() => document.getElementById('urlInput')?.focus(), 200);
    },

    close() {
        document.getElementById('urlModal')?.classList.remove('active');
    },

    isValidUrl(str) {
        try {
            const u = new URL(str);
            return u.protocol === 'http:' || u.protocol === 'https:';
        } catch { return false; }
    },

    preview() {
        const url = document.getElementById('urlInput').value.trim();
        const preview = document.getElementById('urlPreview');

        if (!this.isValidUrl(url)) {
            showToast('الرجاء إدخال رابط صحيح يبدأ بـ http أو https', 'error');
            return;
        }

        preview.innerHTML = `
            <div style="display:flex;justify-content:center;padding:16px;">
                <div class="loading-spinner"></div>
            </div>
        `;

        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            preview.innerHTML = `
                <img src="${escapeHtml(url)}" alt="معاينة"
                     style="max-width:100%;max-height:220px;border-radius:10px;border:2px solid #e2e8f0;">
                <p style="margin:8px 0 0;font-size:12px;color:#38a169;">✅ الرابط صالح</p>
            `;
        };
        img.onerror = () => {
            preview.innerHTML = `
                <p style="color:#e53e3e;font-size:13px;padding:12px;">
                    ❌ تعذّر تحميل الصورة. تحقق من الرابط أو أن السيرفر يسمح بالوصول (CORS).
                </p>
            `;
        };
        img.src = url;
    },

    async add() {
        const url = document.getElementById('urlInput').value.trim();
        const caption = document.getElementById('urlCaption').value.trim();

        if (!this.isValidUrl(url)) {
            showToast('الرجاء إدخال رابط صحيح', 'error');
            return;
        }

        showToast('⏳ جاري تحميل الصورة...', 'info');

        try {
            // محاولة 1: تحميل مباشر
            let blob;
            try {
                const response = await fetch(url, { mode: 'cors' });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                blob = await response.blob();
            } catch (corsErr) {
                // محاولة 2: عبر Image + canvas (لتجاوز CORS في بعض الحالات)
                blob = await this.loadViaCanvas(url);
            }

            if (!blob || !blob.type.startsWith('image/')) {
                throw new Error('الرابط لا يشير إلى صورة');
            }
            if (blob.size > 5 * 1024 * 1024) {
                throw new Error('حجم الصورة أكبر من 5MB');
            }

            // استخراج اسم الملف
            let filename = `imported-${Date.now()}.jpg`;
            try {
                const urlPath = new URL(url).pathname;
                const raw = decodeURIComponent(urlPath.split('/').pop());
                if (raw && raw.includes('.')) filename = raw;
            } catch {}

            const file = new File([blob], filename, { type: blob.type });
            file._source = 'upload';
            if (caption) file.caption = caption;

            ImageUploader.pendingFiles.push(file);
            ImageUploader.renderPreview();

            showToast('✅ تم استيراد الصورة', 'success');
            this.close();

        } catch (err) {
            console.error('Import error:', err);
            showToast('❌ فشل الاستيراد: ' + err.message, 'error');
        }
    },

    loadViaCanvas(url) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                try {
                    const canvas = document.createElement('canvas');
                    canvas.width = img.naturalWidth;
                    canvas.height = img.naturalHeight;
                    canvas.getContext('2d').drawImage(img, 0, 0);
                    canvas.toBlob(b => b ? resolve(b) : reject(new Error('فشل التحويل')), 'image/jpeg', 0.92);
                } catch (e) {
                    reject(new Error('الصورة محمية بـ CORS'));
                }
            };
            img.onerror = () => reject(new Error('تعذّر تحميل الصورة'));
            img.src = url;
        });
    }
};

/* ============================================================
   7) تهيئة عند فتح الصفحة
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
    ImageUploader.init();

    // إغلاق الكاميرا والـ URL عند النقر على الخلفية
    document.getElementById('cameraModal')?.addEventListener('click', (e) => {
        if (e.target.id === 'cameraModal') Camera.close();
    });
    document.getElementById('urlModal')?.addEventListener('click', (e) => {
        if (e.target.id === 'urlModal') UrlImporter.close();
    });

    // ESC لإغلاق
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (Camera.isOpen) Camera.close();
            if (document.getElementById('urlModal')?.classList.contains('active')) {
                UrlImporter.close();
            }
        }
    });
});
