(function() {
    'use strict';

    var STYLE_ID = 'dynamic-print-orientation';

    function applyOrientation(mode) {
        var style = document.getElementById(STYLE_ID);
        if (!style) {
            style = document.createElement('style');
            style.id = STYLE_ID;
            document.head.appendChild(style);
        }

        if (mode === 'landscape') {
            style.textContent = `
                @page { size: A4 portrait; margin: 40mm 8mm 20mm 8mm; }
                @page landscape-page {
                    size: A4 landscape;
                    margin: 35mm 6mm 18mm 6mm;
                }
                @media print {
                    .table-wrapper,
                    .veh-table-wrap,
                    .damaged-table-wrapper,
                    .table-scroll {
                        page: landscape-page !important;
                        page-break-before: always !important;
                        break-before: page !important;
                    }
                }
            `;
        } else {
            style.textContent = `
                @page { size: A4 portrait; margin: 40mm 8mm 20mm 8mm; }
                @media print {
                    .table-wrapper,
                    .veh-table-wrap,
                    .damaged-table-wrapper,
                    .table-scroll {
                        page: auto !important;
                        page-break-before: auto !important;
                        break-before: auto !important;
                    }
                }
            `;
        }

        document.body.classList.remove('print-portrait', 'print-landscape');
        document.body.classList.add(mode === 'landscape' ? 'print-landscape' : 'print-portrait');

        try {
            localStorage.setItem('print_orientation', mode);
        } catch (e) {}
    }

    function printWith(mode) {
        applyOrientation(mode);

        var label = mode === 'landscape' ? 'Paysage (أفقي)' : 'Portrait (عمودي)';
        if (window.vehShowToast) {
            window.vehShowToast('🖨️ الطباعة ' + label + '...', 'info', 1500);
        }

        setTimeout(function() {
            window.print();
        }, 350);
    }

    function restoreOrientation() {
        var saved = 'landscape';
        try {
            saved = localStorage.getItem('print_orientation') || 'landscape';
        } catch (e) {}
        applyOrientation(saved);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', restoreOrientation);
    } else {
        restoreOrientation();
    }

    window.PrintOrientation = {
        portrait: function() { printWith('portrait'); },
        landscape: function() { printWith('landscape'); },
        apply: applyOrientation,
        restore: restoreOrientation
    };
})();
