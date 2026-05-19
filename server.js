// الحصول على موقع المستخدم - إجبارياً
let userLocation = null;
let locationError = false;

if (navigator.geolocation) {
    const locationResult = await new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                resolve({
                    success: true,
                    lat: position.coords.latitude,
                    lon: position.coords.longitude
                });
            },
            (error) => {
                console.error('خطأ في تحديد الموقع:', error.message);
                resolve({ success: false, error: error.message });
            }
        );
    });
    
    if (locationResult.success) {
        userLocation = {
            lat: locationResult.lat,
            lon: locationResult.lon,
            city: "الموقع الحقيقي",
            country: "المستخدم"
        };
    } else {
        locationError = true;
        errorDiv.innerHTML = "⚠️ لا يمكن تسجيل الدخول بدون مشاركة الموقع! ⚠️\n\nيرجى السماح للمتصفح بالوصول إلى موقعك.";
        errorDiv.style.display = "block";
        return;
    }
} else {
    errorDiv.innerHTML = "⚠️ متصفحك لا يدعم مشاركة الموقع. يرجى استخدام متصفح حديث.";
    errorDiv.style.display = "block";
    return;
}

if (!userLocation) {
    errorDiv.innerHTML = "⚠️ لا يمكن تسجيل الدخول بدون مشاركة الموقع! ⚠️\n\nيرجى السماح للمتصفح بالوصول إلى موقعك.";
    errorDiv.style.display = "block";
    return;
}

// استدعاء تسجيل الدخول مع الموقع
const user = await loginAPI(username, password, userLocation);
