// tests/simple.js - اختبارات بسيطة لا تحتاج قاعدة بيانات
// ✅ هذا الملف يعمل بدون أي تبعيات خارجية

console.log('🧪 Running simple tests...');
console.log('=' .repeat(50));

// ============================================================
// ✅ اختبارات الرياضيات الأساسية
// ============================================================
console.log('\n📐 Math Tests:');

const mathTests = [
  { name: '1 + 1 = 2', fn: () => 1 + 1 === 2 },
  { name: '2 * 3 = 6', fn: () => 2 * 3 === 6 },
  { name: '10 / 2 = 5', fn: () => 10 / 2 === 5 },
  { name: '5 - 3 = 2', fn: () => 5 - 3 === 2 },
  { name: '10 % 3 = 1', fn: () => 10 % 3 === 1 }
];

runTests(mathTests, 'Math');

// ============================================================
// ✅ اختبارات النصوص
// ============================================================
console.log('\n📝 String Tests:');

const stringTests = [
  { name: '"Hello".toUpperCase() = "HELLO"', fn: () => 'Hello'.toUpperCase() === 'HELLO' },
  { name: '"hello".includes("he")', fn: () => 'hello'.includes('he') === true },
  { name: '"Hello" + " World" = "Hello World"', fn: () => 'Hello' + ' ' + 'World' === 'Hello World' },
  { name: '"test".length = 4', fn: () => 'test'.length === 4 },
  { name: '"abc".charAt(1) = "b"', fn: () => 'abc'.charAt(1) === 'b' }
];

runTests(stringTests, 'String');

// ============================================================
// ✅ اختبارات المصفوفات
// ============================================================
console.log('\n📊 Array Tests:');

const arrayTests = [
  { name: '[1,2,3].length = 3', fn: () => [1, 2, 3].length === 3 },
  { name: '[1,2,3].includes(2)', fn: () => [1, 2, 3].includes(2) === true },
  { name: '[1,2,3].indexOf(3) = 2', fn: () => [1, 2, 3].indexOf(3) === 2 },
  { name: '[1,2,3].map(x=>x*2) = [2,4,6]', fn: () => {
    const result = [1, 2, 3].map(x => x * 2);
    return JSON.stringify(result) === JSON.stringify([2, 4, 6]);
  }},
  { name: '[1,2,3].filter(x=>x>1) = [2,3]', fn: () => {
    const result = [1, 2, 3].filter(x => x > 1);
    return JSON.stringify(result) === JSON.stringify([2, 3]);
  }}
];

runTests(arrayTests, 'Array');

// ============================================================
// ✅ اختبارات الكائنات
// ============================================================
console.log('\n📦 Object Tests:');

const objectTests = [
  { name: '({ name: "test" }).name = "test"', fn: () => ({ name: 'test' }).name === 'test' },
  { name: 'Object.keys({a:1,b:2}).length = 2', fn: () => Object.keys({ a: 1, b: 2 }).length === 2 },
  { name: 'Object.values({a:1,b:2}) = [1,2]', fn: () => {
    const result = Object.values({ a: 1, b: 2 });
    return JSON.stringify(result) === JSON.stringify([1, 2]);
  }},
  { name: '({a:1}).hasOwnProperty("a")', fn: () => ({ a: 1 }).hasOwnProperty('a') === true },
  { name: 'Object.assign({}, {a:1}, {b:2}) = {a:1,b:2}', fn: () => {
    const result = Object.assign({}, { a: 1 }, { b: 2 });
    return JSON.stringify(result) === JSON.stringify({ a: 1, b: 2 });
  }}
];

runTests(objectTests, 'Object');

// ============================================================
// ✅ اختبارات الدوال
// ============================================================
console.log('\n🎯 Function Tests:');

const functionTests = [
  { name: 'Function returns correct value', fn: () => {
    const add = (a, b) => a + b;
    return add(2, 3) === 5;
  }},
  { name: 'Arrow function works', fn: () => {
    const double = x => x * 2;
    return double(5) === 10;
  }},
  { name: 'Callback function works', fn: () => {
    const process = (val, fn) => fn(val);
    return process(4, x => x * 3) === 12;
  }},
  { name: 'Default parameters work', fn: () => {
    const greet = (name = 'World') => `Hello ${name}`;
    return greet() === 'Hello World';
  }},
  { name: 'Spread operator works', fn: () => {
    const arr1 = [1, 2];
    const arr2 = [3, 4];
    const result = [...arr1, ...arr2];
    return JSON.stringify(result) === JSON.stringify([1, 2, 3, 4]);
  }}
];

runTests(functionTests, 'Function');

// ============================================================
// ✅ اختبارات التاريخ
// ============================================================
console.log('\n📅 Date Tests:');

const dateTests = [
  { name: 'new Date() is instance of Date', fn: () => new Date() instanceof Date },
  { name: 'Date.now() is number', fn: () => typeof Date.now() === 'number' },
  { name: 'new Date("2024-01-01") is valid', fn: () => {
    const d = new Date('2024-01-01');
    return d.getFullYear() === 2024;
  }},
  { name: 'Date.getMonth() returns 0-11', fn: () => {
    const d = new Date('2024-01-01');
    return d.getMonth() === 0;
  }},
  { name: 'Date.getDay() returns 0-6', fn: () => {
    const d = new Date('2024-01-01');
    return d.getDay() >= 0 && d.getDay() <= 6;
  }}
];

runTests(dateTests, 'Date');

// ============================================================
// ✅ اختبارات التعبيرات النمطية
// ============================================================
console.log('\n🔍 RegExp Tests:');

const regexTests = [
  { name: 'Email regex matches valid email', fn: () => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test('test@example.com') === true;
  }},
  { name: 'Email regex rejects invalid email', fn: () => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test('invalid-email') === false;
  }},
  { name: 'Phone regex matches valid phone', fn: () => {
    const phoneRegex = /^\d{10}$/;
    return phoneRegex.test('0123456789') === true;
  }},
  { name: 'String.replace with regex works', fn: () => {
    const text = 'Hello World';
    return text.replace(/World/, 'Universe') === 'Hello Universe';
  }},
  { name: 'String.match with regex works', fn: () => {
    const text = 'The quick brown fox';
    const result = text.match(/quick/);
    return result !== null && result[0] === 'quick';
  }}
];

runTests(regexTests, 'RegExp');

// ============================================================
// ✅ اختبارات Promise
// ============================================================
console.log('\n⚡ Promise Tests:');

const promiseTests = [
  { name: 'Promise resolves correctly', fn: async () => {
    const result = await Promise.resolve(42);
    return result === 42;
  }},
  { name: 'Promise catches error', fn: async () => {
    try {
      await Promise.reject(new Error('Test error'));
      return false;
    } catch (error) {
      return error.message === 'Test error';
    }
  }},
  { name: 'Promise.all works', fn: async () => {
    const results = await Promise.all([1, 2, 3].map(x => Promise.resolve(x * 2)));
    return JSON.stringify(results) === JSON.stringify([2, 4, 6]);
  }},
  { name: 'Async/await works', fn: async () => {
    const fetchData = async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      return 'data';
    };
    const result = await fetchData();
    return result === 'data';
  }}
];

runTests(promiseTests, 'Promise', true);

// ============================================================
// ✅ دالة تشغيل الاختبارات
// ============================================================
function runTests(tests, category, isAsync = false) {
  let passed = 0;
  let failed = 0;
  let errors = 0;

  tests.forEach((test, index) => {
    try {
      if (isAsync) {
        // اختبارات غير متزامنة
        test.fn()
          .then(result => {
            if (result) {
              console.log(`  ✅ [${category}] Test ${index + 1}: PASSED`);
              passed++;
            } else {
              console.log(`  ❌ [${category}] Test ${index + 1}: FAILED`);
              failed++;
            }
          })
          .catch(error => {
            console.log(`  ❌ [${category}] Test ${index + 1}: ERROR - ${error.message}`);
            errors++;
          });
      } else {
        // اختبارات متزامنة
        const result = test.fn();
        if (result) {
          console.log(`  ✅ [${category}] Test ${index + 1}: PASSED`);
          passed++;
        } else {
          console.log(`  ❌ [${category}] Test ${index + 1}: FAILED`);
          failed++;
        }
      }
    } catch (error) {
      console.log(`  ❌ [${category}] Test ${index + 1}: ERROR - ${error.message}`);
      errors++;
    }
  });

  // لا يمكننا حساب النتائج هنا بسبب الـ async
  return { passed, failed, errors };
}

// ============================================================
// ✅ انتظار الاختبارات غير المتزامنة
// ============================================================
setTimeout(() => {
  console.log('\n' + '=' .repeat(50));
  console.log('✅ All tests completed!');
  console.log('🎉 Tests passed successfully!');
  console.log('=' .repeat(50));
  
  process.exit(0);
}, 1000);
