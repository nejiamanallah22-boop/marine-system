/**
 * ============================================================
 * 🚢 منظومة الوسائل البحرية - StorageManager.js v7.0
 * ============================================================
 * مدير التخزين الآمن مع تشفير
 * ============================================================
 */

class StorageManager {
    constructor(config = {}) {
        this.config = {
            prefix: 'marine_',
            encryptionKey: null,
            useEncryption: false,
            ...config
        };
        
        // التحقق من دعم التخزين
        this.supported = this.checkSupport();
        
        console.log('💾 StorageManager initialized');
    }
    
    // ============================================================
    // 🔍 SUPPORT CHECK
    // ============================================================
    
    checkSupport() {
        try {
            const testKey = '__test__';
            localStorage.setItem(testKey, 'test');
            localStorage.removeItem(testKey);
            return true;
        } catch {
            return false;
        }
    }
    
    // ============================================================
    // 📦 SET / GET
    // ============================================================
    
    set(key, value) {
        if (!this.supported) return false;
        
        try {
            const fullKey = this.config.prefix + key;
            let data = value;
            
            if (this.config.useEncryption && this.config.encryptionKey) {
                data = this.encrypt(value);
            } else {
                data = JSON.stringify(value);
            }
            
            localStorage.setItem(fullKey, data);
            return true;
        } catch (error) {
            console.error('Storage set error:', error);
            return false;
        }
    }
    
    get(key, defaultValue = null) {
        if (!this.supported) return defaultValue;
        
        try {
            const fullKey = this.config.prefix + key;
            const data = localStorage.getItem(fullKey);
            
            if (data === null) return defaultValue;
            
            if (this.config.useEncryption && this.config.encryptionKey) {
                return this.decrypt(data);
            }
            
            return JSON.parse(data);
        } catch (error) {
            console.error('Storage get error:', error);
            return defaultValue;
        }
    }
    
    remove(key) {
        if (!this.supported) return false;
        
        try {
            const fullKey = this.config.prefix + key;
            localStorage.removeItem(fullKey);
            return true;
        } catch (error) {
            console.error('Storage remove error:', error);
            return false;
        }
    }
    
    clear() {
        if (!this.supported) return false;
        
        try {
            const keys = Object.keys(localStorage);
            keys.forEach(key => {
                if (key.startsWith(this.config.prefix)) {
                    localStorage.removeItem(key);
                }
            });
            return true;
        } catch (error) {
            console.error('Storage clear error:', error);
            return false;
        }
    }
    
    // ============================================================
    // 🔐 ENCRYPTION
    // ============================================================
    
    encrypt(value) {
        try {
            const jsonStr = JSON.stringify(value);
            // تشفير بسيط (في الإنتاج استخدم مكتبة مثل CryptoJS)
            return btoa(encodeURIComponent(jsonStr));
        } catch (error) {
            console.error('Encryption error:', error);
            return null;
        }
    }
    
    decrypt(encrypted) {
        try {
            const jsonStr = decodeURIComponent(atob(encrypted));
            return JSON.parse(jsonStr);
        } catch (error) {
            console.error('Decryption error:', error);
            return null;
        }
    }
    
    // ============================================================
    // 📊 SESSION STORAGE
    // ============================================================
    
    setSession(key, value) {
        try {
            const fullKey = this.config.prefix + key;
            sessionStorage.setItem(fullKey, JSON.stringify(value));
            return true;
        } catch {
            return false;
        }
    }
    
    getSession(key, defaultValue = null) {
        try {
            const fullKey = this.config.prefix + key;
            const data = sessionStorage.getItem(fullKey);
            return data ? JSON.parse(data) : defaultValue;
        } catch {
            return defaultValue;
        }
    }
    
    removeSession(key) {
        try {
            const fullKey = this.config.prefix + key;
            sessionStorage.removeItem(fullKey);
            return true;
        } catch {
            return false;
        }
    }
    
    clearSession() {
        try {
            const keys = Object.keys(sessionStorage);
            keys.forEach(key => {
                if (key.startsWith(this.config.prefix)) {
                    sessionStorage.removeItem(key);
                }
            });
            return true;
        } catch {
            return false;
        }
    }
    
    // ============================================================
    // 📋 COOKIE
    // ============================================================
    
    setCookie(key, value, days = 7) {
        try {
            const expires = new Date();
            expires.setTime(expires.getTime() + (days * 24 * 60 * 60 * 1000));
            document.cookie = `${this.config.prefix}${key}=${encodeURIComponent(JSON.stringify(value))};expires=${expires.toUTCString()};path=/;SameSite=Lax`;
            return true;
        } catch {
            return false;
        }
    }
    
    getCookie(key, defaultValue = null) {
        try {
            const name = this.config.prefix + key + '=';
            const decoded = decodeURIComponent(document.cookie);
            const parts = decoded.split('; ');
            
            for (let part of parts) {
                if (part.indexOf(name) === 0) {
                    const value = part.substring(name.length);
                    return JSON.parse(value);
                }
            }
            return defaultValue;
        } catch {
            return defaultValue;
        }
    }
    
    removeCookie(key) {
        try {
            document.cookie = `${this.config.prefix}${key}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
            return true;
        } catch {
            return false;
        }
    }
    
    // ============================================================
    // 🔍 UTILITY
    // ============================================================
    
    keys() {
        if (!this.supported) return [];
        
        const keys = [];
        Object.keys(localStorage).forEach(key => {
            if (key.startsWith(this.config.prefix)) {
                keys.push(key.substring(this.config.prefix.length));
            }
        });
        return keys;
    }
    
    size() {
        if (!this.supported) return 0;
        return this.keys().length;
    }
    
    clearAll() {
        this.clear();
        this.clearSession();
        return true;
    }
}

// تصدير للاستخدام
if (typeof module !== 'undefined' && module.exports) {
    module.exports = StorageManager;
}
