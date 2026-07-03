/* ==========================================================================
   LOGIKA BISNIS JAVASCRIPT - APLIKASI KASIR NEW CITRA INDONESIA
   Fitur: Login PIN, POS/Kasir, CRUD Produk, Keranjang, Transaksi, Struk,
          Riwayat, Laporan Sesi, Kas Drawer (Masuk/Keluar), Absensi & Settings.
   Penyimpanan: Web LocalStorage (Persisten)
   ========================================================================== */
// 1. DATA DEFAULT SEBELUM USER MENAMBAHKAN DATA SENDIRI (INITIAL STATE)
const INITIAL_PRODUCTS = [
    { name: "Kopi Susu New Citra", sku: "NCO-001", category: "Minuman", price: 18000, stock: 50, img: "https://images.unsplash.com/photo-1541167760496-1628856ab772?auto=format&fit=crop&q=80&w=150" },
    { name: "Americano Cold Brew", sku: "NCO-002", category: "Minuman", price: 15000, stock: 40, img: "https://images.unsplash.com/photo-1517701604599-bb29b565090c?auto=format&fit=crop&q=80&w=150" },
    { name: "Croissant Almond", sku: "NCO-003", category: "Makanan", price: 22000, stock: 15, img: "https://images.unsplash.com/photo-1555507036-ab1f4038808a?auto=format&fit=crop&q=80&w=150" },
    { name: "Spaghetti Bolognese", sku: "NCO-004", category: "Makanan", price: 35000, stock: 20, img: "https://images.unsplash.com/photo-1572449043416-55f4685c9bb7?auto=format&fit=crop&q=80&w=150" },
    { name: "Tumbler New Citra Official", sku: "NCO-005", category: "Barang", price: 85000, stock: 10, img: "https://images.unsplash.com/photo-1523362628745-0c100150b504?auto=format&fit=crop&q=80&w=150" }
];
const INITIAL_EMPLOYEES = [
    { id: "1", name: "Andi", role: "Kasir", pin: "8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92" }, // 123456
    { id: "2", name: "Budi", role: "Kasir", pin: "3d4f2bf07dc1be38b20cd6e46949a1071f9d0e3d40a25e6e33c6d6a2f4cfcf1a" }, // 111111
    { id: "3", name: "Citra", role: "Manager", pin: "a93b455240bc182b8f8045951d38260b411d73a7c645b23d9178ec642ec34533" } // 888888
];

// Helper fungsi hash SHA-256 untuk keamanan PIN
async function hashPIN(pin) {
    const msgBuffer = new TextEncoder().encode(pin);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Notifikasi Toast Kustom yang Elegan
function showToast(message, type = "info") {
    const container = document.getElementById("toast-container");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = `toast ${type}`;

    let icon = "fa-circle-info";
    if (type === "success") icon = "fa-circle-check";
    if (type === "error") icon = "fa-circle-xmark";
    if (type === "warning") icon = "fa-triangle-exclamation";

    toast.innerHTML = `
        <div class="toast-icon"><i class="fa-solid ${icon}"></i></div>
        <div class="toast-message">${message}</div>
    `;

    container.appendChild(toast);

    // Auto-remove setelah 3 detik
    setTimeout(() => {
        toast.classList.add("fade-out");
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, 3000);
}
// 2. STATE MANAGER (APLIKASI DATA GLOBAL)
let state = {
    products: [],
    employees: [],
    currentEmployee: null,
    currentSession: null, // Sesi Kasir Buka/Tutup
    cart: [],
    sales: [],
    cashLogs: [],
    absensi: [],
    settings: {
        outletName: "New Citra Indonesia",
        outletAddress: "Jl. Kedungmundu Raya No 161A, Sendangguwo, Tembalang, Semarang Jawa Tengah 50273..",
        outletPhone: "0812-3456-7890",
        taxRate: 11,
        receiptFooter: "Terima Kasih Atas Kunjungan Anda!"
    }
};
// 3. INISIALISASI & LOAD DATA DARI LOCAL STORAGE
async function initApp() {
    // Load Pengaturan
    const savedSettings = localStorage.getItem("nco_settings");
    if (savedSettings) state.settings = JSON.parse(savedSettings);
    // Load Produk (Jika kosong gunakan produk default)
    const savedProducts = localStorage.getItem("nco_products");
    if (savedProducts) {
        state.products = JSON.parse(savedProducts);
    } else {
        state.products = INITIAL_PRODUCTS;
        saveToLocalStorage("nco_products", state.products);
    }
    // Load Karyawan
    const savedEmployees = localStorage.getItem("nco_employees");
    if (savedEmployees) {
        state.employees = JSON.parse(savedEmployees);
    } else {
        state.employees = INITIAL_EMPLOYEES;
        saveToLocalStorage("nco_employees", state.employees);
    }
    
    // Migrasi PIN lama ke Hash SHA-256 jika masih plaintext (6 digit)
    let needsSave = false;
    for (let emp of state.employees) {
        if (emp.pin && emp.pin.length === 6) {
            emp.pin = await hashPIN(emp.pin);
            needsSave = true;
        }
    }
    if (needsSave) {
        saveToLocalStorage("nco_employees", state.employees);
    }

    // Load Riwayat Penjualan
    const savedSales = localStorage.getItem("nco_sales");
    if (savedSales) state.sales = JSON.parse(savedSales);
    // Load Mutasi Kas drawer
    const savedCash = localStorage.getItem("nco_cash");
    if (savedCash) state.cashLogs = JSON.parse(savedCash);
    // Load Riwayat Absensi
    const savedAbsensi = localStorage.getItem("nco_absensi");
    if (savedAbsensi) state.absensi = JSON.parse(savedAbsensi);
    // Cek Sesi Kasir Aktif
    const activeSession = localStorage.getItem("nco_active_session");
    if (activeSession) {
        state.currentSession = JSON.parse(activeSession);
        // Cari karyawan yang bersangkutan
        state.currentEmployee = state.employees.find(emp => emp.id === state.currentSession.employeeId);
        showMainApp();
    } else {
        showLoginScreen();
    }
    // Jalankan Jam Digital
    startClock();

    // Render dropdown karyawan di halaman login dan absensi
    renderEmployeeDropdowns();
}
function saveToLocalStorage(key, data) {
    localStorage.setItem(key, JSON.stringify(data));
}
// 4. LOGIKA JAM DIGITAL
function startClock() {
    const clockEl = document.getElementById("clock");
    const absenTimeEl = document.getElementById("absen-clock-time");
    const absenDateEl = document.getElementById("absen-clock-date");

    const weekdays = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
    const months = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
    setInterval(() => {
        const now = new Date();
        const timeStr = now.toTimeString().split(' ')[0];

        if (clockEl) clockEl.innerText = timeStr;
        if (absenTimeEl) absenTimeEl.innerText = timeStr;

        const dayName = weekdays[now.getDay()];
        const day = now.getDate().toString().padStart(2, '0');
        const monthName = months[now.getMonth()];
        const year = now.getFullYear();
        const dateStr = `${dayName}, ${day} ${monthName} ${year}`;

        if (absenDateEl) absenDateEl.innerText = dateStr;
    }, 1000);
}
// 5. RENDER DROPDOWN KARYAWAN
function renderEmployeeDropdowns() {
    const loginSelect = document.getElementById("employee-select");
    const absensiSelect = document.getElementById("absensi-employee-select");
    const pinChangeSelect = document.getElementById("select-employee-pin");
    if (loginSelect) {
        loginSelect.innerHTML = `<option value="" disabled selected>Pilih Karyawan</option>`;
        state.employees.forEach(emp => {
            loginSelect.innerHTML += `<option value="${emp.id}" data-role="${emp.role}">${emp.name} (${emp.role})</option>`;
        });
    }
    if (absensiSelect) {
        absensiSelect.innerHTML = `<option value="" disabled selected>Pilih Karyawan</option>`;
        state.employees.forEach(emp => {
            absensiSelect.innerHTML += `<option value="${emp.name}">${emp.name} (${emp.role})</option>`;
        });
    }
    if (pinChangeSelect) {
        pinChangeSelect.innerHTML = "";
        state.employees.forEach(emp => {
            pinChangeSelect.innerHTML += `<option value="${emp.id}">${emp.name}</option>`;
        });
    }
}
// 6. LOGIKA LOGIN PIN & VIRTUAL KEYBOARD
let enteredPin = "";
const pinDots = document.querySelectorAll(".pin-dot");
const loginErrorMsg = document.getElementById("login-error-msg");
document.querySelectorAll(".key-btn").forEach(button => {
    button.addEventListener("click", async () => {
        const key = button.getAttribute("data-key");
        const selectEmp = document.getElementById("employee-select").value;
        if (!selectEmp) {
            showToast("Silakan pilih karyawan terlebih dahulu!", "warning");
            return;
        }
        loginErrorMsg.classList.add("hidden");
        if (key === "C") {
            enteredPin = "";
        } else if (key === "backspace") {
            enteredPin = enteredPin.slice(0, -1);
        } else {
            if (enteredPin.length < 6) {
                enteredPin += key;
            }
        }
        updatePinDots();
        // Cek PIN jika sudah 6 digit
        if (enteredPin.length === 6) {
            await verifyLogin(selectEmp, enteredPin);
        }
    });
});
function updatePinDots() {
    pinDots.forEach((dot, index) => {
        if (index < enteredPin.length) {
            dot.classList.add("filled");
        } else {
            dot.classList.remove("filled");
        }
    });
}
async function verifyLogin(employeeId, pin) {
    const employee = state.employees.find(emp => emp.id === employeeId);
    const hashedPin = await hashPIN(pin);

    if (employee && employee.pin === hashedPin) {
        state.currentEmployee = employee;

        // Buat sesi kasir baru jika belum ada sesi aktif
        const existingSession = localStorage.getItem("nco_active_session");
        if (!existingSession) {
            const now = new Date();
            state.currentSession = {
                sessionId: "SESS-" + Date.now(),
                employeeId: employee.id,
                employeeName: employee.name,
                openTime: now.toLocaleString('id-ID'),
                cashStart: 200000, // Kas laci awal default Rp 200.000
                status: "aktif"
            };
            saveToLocalStorage("nco_active_session", state.currentSession);

            // Catat modal awal ke kasir logs (Mutasi Kas Masuk)
            const logId = "CSH-" + Date.now();
            state.cashLogs.push({
                logId: logId,
                sessionId: state.currentSession.sessionId,
                timestamp: now.toLocaleTimeString('id-ID'),
                type: "pemasukan",
                amount: 200000,
                note: "Modal Kas Awal Sesi Buka Toko",
                operator: employee.name
            });
            saveToLocalStorage("nco_cash", state.cashLogs);
        } else {
            state.currentSession = JSON.parse(existingSession);
        }
        // Tampilkan Dashboard
        showMainApp();

        // Reset login state
        enteredPin = "";
        updatePinDots();
        document.getElementById("employee-select").value = "";
    } else {
        // PIN Salah
        loginErrorMsg.classList.remove("hidden");
        enteredPin = "";
        updatePinDots();
    }
}
// 7. NAVIGASI DASHBOARD SPA & SIDEBAR
const sidebarNavItems = document.querySelectorAll(".nav-item");
const pageSections = document.querySelectorAll(".page-section");
sidebarNavItems.forEach(item => {
    item.addEventListener("click", () => {
        const targetPage = item.getAttribute("data-target");

        if (targetPage) {
            // Ubah class active di navigasi
            sidebarNavItems.forEach(nav => nav.classList.remove("active"));
            item.classList.add("active");

            // Tampilkan halaman target dan sembunyikan yang lain
            pageSections.forEach(section => {
                if (section.id === targetPage) {
                    section.classList.remove("hidden");
                    section.classList.add("active");
                } else {
                    section.classList.add("hidden");
                    section.classList.remove("active");
                }
            });
            // Sinkronisasi data saat berpindah tab
            if (targetPage === "page-kasir") renderCatalog();
            if (targetPage === "page-penjualan") renderSalesTable();
            if (targetPage === "page-absensi") renderAbsensiTable();
            if (targetPage === "page-laporan") {
                renderLaporanKasirTable();
                renderCashFlowTable();
            }
            if (targetPage === "page-pengaturan") loadSettingsIntoForm();
        }
    });
});
// Shortcut button handler pada halaman utama Kasir
document.getElementById("shortcut-produk").addEventListener("click", () => {
    triggerNav("page-kasir");
});
document.getElementById("shortcut-tambah-produk").addEventListener("click", () => {
    openProductModal();
});
document.getElementById("shortcut-riwayat").addEventListener("click", () => {
    triggerNav("page-penjualan");
});
document.getElementById("shortcut-pengeluaran").addEventListener("click", () => {
    triggerNav("page-laporan");
    // Aktifkan sub tab kasir mutasi
    document.querySelector('[data-sub="sub-laporan-kas-flow"]').click();
});
document.getElementById("shortcut-laporan").addEventListener("click", () => {
    triggerNav("page-laporan");
});
document.getElementById("shortcut-pengaturan").addEventListener("click", () => {
    triggerNav("page-pengaturan");
});
document.getElementById("btn-edit-outlet-shortcut").addEventListener("click", () => {
    triggerNav("page-pengaturan");
});
function triggerNav(targetPageId) {
    const navBtn = document.querySelector(`[data-target="${targetPageId}"]`);
    if (navBtn) navBtn.click();
}
function showLoginScreen() {
    document.getElementById("login-screen").classList.remove("hidden");
    document.getElementById("main-app").classList.add("hidden");
}
function showMainApp() {
    document.getElementById("login-screen").classList.add("hidden");
    document.getElementById("main-app").classList.remove("hidden");

    // Tampilkan data Karyawan Aktif
    document.getElementById("user-display-name").innerText = state.currentEmployee.name;
    document.getElementById("user-display-role").innerText = `${state.currentEmployee.role} - New Citra House`;
    document.getElementById("user-avatar-initial").innerText = state.currentEmployee.name.charAt(0).toUpperCase();
    // Tampilkan Nama & Alamat Outlet Dinamis
    updateOutletHeaderDOM();
    // Render Data Awal
    renderCatalog();
    calculateHeaderSummary();
}
function updateOutletHeaderDOM() {
    document.getElementById("outlet-display-name").innerText = state.settings.outletName;
    document.getElementById("outlet-display-address").innerText = state.settings.outletAddress;
}
// 8. LOGIKA HEADER RINGKASAN HARI INI
function calculateHeaderSummary() {
    const today = new Date().toLocaleDateString('id-ID');

    // Total Penjualan hari ini (Metode Selesai)
    let totalSales = 0;
    state.sales.forEach(sale => {
        if (sale.status === "Selesai" && sale.dateOnly === today) {
            totalSales += sale.grandTotal;
        }
    });
    // Hitung profit kotor (Simulasi 40% margin profit untuk New Citra)
    const totalProfit = Math.round(totalSales * 0.4);
    document.getElementById("header-total-penjualan").innerText = formatRupiah(totalSales);
    document.getElementById("header-total-profit").innerText = formatRupiah(totalProfit);
}
// 9. KATALOG PRODUK (RENDERING & FILTER)
const productsContainer = document.getElementById("products-container");
const searchInput = document.getElementById("product-search");
const categorySelect = document.getElementById("product-category-select");
function renderCatalog() {
    if (!productsContainer) return;

    const query = searchInput.value.toLowerCase();
    const category = categorySelect.value;

    productsContainer.innerHTML = "";
    const filtered = state.products.filter(prod => {
        const matchQuery = prod.name.toLowerCase().includes(query) || prod.sku.toLowerCase().includes(query);
        const matchCategory = category === "all" || prod.category === category;
        return matchQuery && matchCategory;
    });
    if (filtered.length === 0) {
        productsContainer.innerHTML = `
            <div class="empty-order-state" style="grid-column: 1/-1; padding: 40px 0;">
                <p>Tidak ada produk ditemukan.</p>
            </div>
        `;
        return;
    }
    filtered.forEach((prod, index) => {
        // Temukan index asli di array state.products
        const originalIndex = state.products.findIndex(p => p.sku === prod.sku);

        const defaultImg = "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&q=80&w=150";
        const imgSrc = prod.img ? prod.img : defaultImg;

        const isOutOfStock = prod.stock <= 0;
        const isLowStock = prod.stock > 0 && prod.stock <= 5;
        const stockClass = isOutOfStock ? "empty" : (isLowStock ? "warning" : "");
        const stockText = isOutOfStock ? "Habis" : (isLowStock ? `Minim: ${prod.stock}` : `Stok: ${prod.stock}`);
        const card = document.createElement("div");
        card.className = "product-card";
        // Tambahkan event click untuk tambah ke keranjang
        card.addEventListener("click", (e) => {
            // Hindari trigger click jika menekan tombol aksi overlay
            if (e.target.closest(".action-overlay-btn")) return;
            addToCart(prod);
        });
        card.innerHTML = `
            <div class="product-img-box">
                <img src="${imgSrc}" alt="${prod.name}" onerror="this.src='${defaultImg}'">
                <span class="product-category-tag">${prod.category}</span>
                <span class="product-stock-tag ${stockClass}">${stockText}</span>
            </div>
            <div class="product-info">
                <span class="product-sku">${prod.sku}</span>
                <h4 class="product-name">${prod.name}</h4>
                <div class="product-price">${formatRupiah(prod.price)}</div>
            </div>
            <div class="product-actions-overlay">
                <button class="action-overlay-btn edit" onclick="openProductModal(${originalIndex})" title="Edit Produk"><i class="fa-solid fa-pen"></i></button>
                <button class="action-overlay-btn delete" onclick="deleteProduct(${originalIndex})" title="Hapus Produk"><i class="fa-solid fa-trash-can"></i></button>
            </div>
        `;
        productsContainer.appendChild(card);
    });
}
searchInput.addEventListener("input", renderCatalog);
categorySelect.addEventListener("change", renderCatalog);
// 10. CRUD PRODUK (TAMBAH, EDIT, HAPUS)
const productModal = document.getElementById("modal-product");
const productForm = document.getElementById("product-form");
function openProductModal(index = null) {
    productModal.classList.remove("hidden");

    if (index !== null) {
        // Mode Edit
        const prod = state.products[index];
        document.getElementById("modal-product-title").innerText = "Edit Produk";
        document.getElementById("form-product-index").value = index;
        document.getElementById("prod-name").value = prod.name;
        document.getElementById("prod-sku").value = prod.sku;
        document.getElementById("prod-sku").disabled = true; // SKU tidak boleh diubah
        document.getElementById("prod-category").value = prod.category;
        document.getElementById("prod-stock").value = prod.stock;
        document.getElementById("prod-price").value = prod.price;
        document.getElementById("prod-img").value = prod.img || "";
    } else {
        // Mode Tambah
        document.getElementById("modal-product-title").innerText = "Tambah Produk Baru";
        productForm.reset();
        document.getElementById("form-product-index").value = "";
        document.getElementById("prod-sku").disabled = false;
    }
}
// Global scope bindings untuk tombol di catalog card
window.openProductModal = openProductModal;
window.deleteProduct = deleteProduct;
// Tutup modal produk
document.getElementById("btn-close-product-modal").addEventListener("click", closeProductModal);
document.getElementById("btn-cancel-product").addEventListener("click", closeProductModal);
function closeProductModal() {
    productModal.classList.add("hidden");
}
productForm.addEventListener("submit", (e) => {
    e.preventDefault();

    const indexVal = document.getElementById("form-product-index").value;
    const name = document.getElementById("prod-name").value;
    const sku = document.getElementById("prod-sku").value.trim().toUpperCase();
    const category = document.getElementById("prod-category").value;
    const stock = parseInt(document.getElementById("prod-stock").value);
    const price = parseInt(document.getElementById("prod-price").value);
    const img = document.getElementById("prod-img").value.trim();
    if (indexVal !== "") {
        // Aksi Update
        const index = parseInt(indexVal);
        state.products[index] = {
            ...state.products[index],
            name, category, stock, price, img
        };
    } else {
        // Cek SKU Duplikat
        const duplicate = state.products.find(p => p.sku === sku);
        if (duplicate) {
            showToast(`SKU ${sku} sudah digunakan oleh produk lain!`, "error");
            return;
        }
        // Aksi Tambah Baru
        state.products.push({ name, sku, category, stock, price, img });
    }
    saveToLocalStorage("nco_products", state.products);
    closeProductModal();
    renderCatalog();
});
function deleteProduct(index) {
    const prod = state.products[index];
    if (confirm(`Apakah Anda yakin ingin menghapus produk "${prod.name}"?`)) {
        state.products.splice(index, 1);
        saveToLocalStorage("nco_products", state.products);
        renderCatalog();
    }
}
// 11. MANAJEMEN KERANJANG (CART HANDLING)
const cartContainer = document.getElementById("cart-container");
const cartItemsList = document.getElementById("cart-items-list");
const cartEmptyState = document.getElementById("cart-empty-state");
const cartSubtotalEl = document.getElementById("cart-subtotal");
const cartTaxEl = document.getElementById("cart-tax");
const cartTotalEl = document.getElementById("cart-total");
const checkoutBtn = document.getElementById("btn-checkout");
function addToCart(product) {
    if (product.stock <= 0) {
        showToast("Stok barang ini sedang habis!", "error");
        return;
    }
    const exist = state.cart.find(item => item.sku === product.sku);
    if (exist) {
        if (exist.quantity >= product.stock) {
            showToast("Jumlah pesanan melebihi sisa stok yang tersedia!", "warning");
            return;
        }
        exist.quantity += 1;
    } else {
        state.cart.push({
            sku: product.sku,
            name: product.name,
            price: product.price,
            quantity: 1,
            maxStock: product.stock
        });
    }
    renderCart();
}
function updateCartQty(sku, change) {
    const item = state.cart.find(i => i.sku === sku);
    if (!item) return;
    item.quantity += change;
    if (item.quantity <= 0) {
        // Hapus item jika Qty 0
        state.cart = state.cart.filter(i => i.sku !== sku);
    } else if (item.quantity > item.maxStock) {
        showToast("Jumlah melebihi sisa stok!", "warning");
        item.quantity = item.maxStock;
    }
    renderCart();
}
function removeFromCart(sku) {
    state.cart = state.cart.filter(i => i.sku !== sku);
    renderCart();
}
function renderCart() {
    if (state.cart.length === 0) {
        cartEmptyState.classList.remove("hidden");
        cartItemsList.classList.add("hidden");
        checkoutBtn.disabled = true;
        document.getElementById("cart-item-count").innerText = "0 Item";

        cartSubtotalEl.innerText = "Rp 0";
        cartTaxEl.innerText = "Rp 0";
        cartTotalEl.innerText = "Rp 0";
        return;
    }
    cartEmptyState.classList.add("hidden");
    cartItemsList.classList.remove("hidden");
    checkoutBtn.disabled = false;
    // Hitung total item
    const totalItems = state.cart.reduce((sum, item) => sum + item.quantity, 0);
    document.getElementById("cart-item-count").innerText = `${totalItems} Item`;
    cartItemsList.innerHTML = "";
    let subtotal = 0;
    state.cart.forEach(item => {
        const itemSubtotal = item.price * item.quantity;
        subtotal += itemSubtotal;
        const cartItemDOM = document.createElement("div");
        cartItemDOM.className = "cart-item";
        cartItemDOM.innerHTML = `
            <div class="cart-item-details">
                <h5 class="cart-item-name">${item.name}</h5>
                <span class="cart-item-price">${formatRupiah(item.price)}</span>
            </div>
            <div class="cart-item-quantity-controls">
                <button class="qty-btn" onclick="updateCartQty('${item.sku}', -1)">-</button>
                <span class="qty-value">${item.quantity}</span>
                <button class="qty-btn" onclick="updateCartQty('${item.sku}', 1)">+</button>
            </div>
            <div class="cart-item-subtotal">${formatRupiah(itemSubtotal)}</div>
            <button class="cart-item-remove" onclick="removeFromCart('${item.sku}')"><i class="fa-solid fa-xmark"></i></button>
        `;
        cartItemsList.appendChild(cartItemDOM);
    });
    window.updateCartQty = updateCartQty;
    window.removeFromCart = removeFromCart;
    // Kalkulasi Pajak & Total
    const tax = Math.round(subtotal * (state.settings.taxRate / 100));
    const total = subtotal + tax;
    cartSubtotalEl.innerText = formatRupiah(subtotal);
    cartTaxEl.innerText = formatRupiah(tax);
    cartTotalEl.innerText = formatRupiah(total);
}
// 12. PROSES PEMBAYARAN & MODAL PEMBAYARAN
const paymentModal = document.getElementById("modal-payment");
const cashGivenInput = document.getElementById("cash-given-input");
const cashChangeAmount = document.getElementById("cash-change-amount");
const submitPaymentBtn = document.getElementById("btn-submit-payment");
let checkoutSubtotal = 0;
let checkoutTax = 0;
let checkoutTotal = 0;
let selectedPaymentMethod = "Tunai";
// Open payment modal
checkoutBtn.addEventListener("click", () => {
    // Hitung ulang total belanjaan
    const subtotal = state.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const tax = Math.round(subtotal * (state.settings.taxRate / 100));
    const total = subtotal + tax;
    checkoutSubtotal = subtotal;
    checkoutTax = tax;
    checkoutTotal = total;
    document.getElementById("payment-total-amount").innerText = formatRupiah(total);

    // Set default Tunai
    selectPaymentMethod("Tunai");
    paymentModal.classList.remove("hidden");
});
document.getElementById("btn-close-payment-modal").addEventListener("click", closePaymentModal);
document.getElementById("btn-cancel-payment").addEventListener("click", closePaymentModal);
function closePaymentModal() {
    paymentModal.classList.add("hidden");
    cashGivenInput.value = "";
    cashChangeAmount.innerText = "Rp 0";
    submitPaymentBtn.disabled = true;
}
// Pilihan Metode Pembayaran
document.querySelectorAll(".payment-method-card").forEach(card => {
    card.addEventListener("click", () => {
        const method = card.getAttribute("data-method");
        selectPaymentMethod(method);
    });
});
function selectPaymentMethod(method) {
    selectedPaymentMethod = method;

    // Aktifkan visual tab
    document.querySelectorAll(".payment-method-card").forEach(c => {
        if (c.getAttribute("data-method") === method) {
            c.classList.add("active");
        } else {
            c.classList.remove("active");
        }
    });
    // Tampilkan form detail yang sesuai
    document.getElementById("payment-cash-section").classList.add("hidden");
    document.getElementById("payment-bank-section").classList.add("hidden");
    document.getElementById("payment-qris-section").classList.add("hidden");
    if (method === "Tunai") {
        document.getElementById("payment-cash-section").classList.remove("hidden");
        // Validasi input tunai
        validateCashPayment();
    } else if (method === "Bank") {
        document.getElementById("payment-bank-section").classList.remove("hidden");
        // VA Selalu valid karena di-approve manual oleh operator
        submitPaymentBtn.disabled = false;
    } else if (method === "QRIS") {
        document.getElementById("payment-qris-section").classList.remove("hidden");
        // QRIS QR generator mockup
        const qrImg = document.getElementById("qris-img-mock");
        qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=NewCitra_${checkoutTotal}_${Date.now()}`;
        submitPaymentBtn.disabled = false;
    }
}
// Uang Tunai pas & Cepat nominal uang
document.getElementById("btn-cash-pas").addEventListener("click", () => {
    cashGivenInput.value = checkoutTotal;
    validateCashPayment();
});
document.querySelectorAll(".cash-quick-buttons button[data-amount]").forEach(btn => {
    btn.addEventListener("click", () => {
        const amount = parseInt(btn.getAttribute("data-amount"));
        cashGivenInput.value = amount;
        validateCashPayment();
    });
});
cashGivenInput.addEventListener("input", validateCashPayment);
function validateCashPayment() {
    const cashGiven = parseInt(cashGivenInput.value) || 0;
    const change = cashGiven - checkoutTotal;
    if (change >= 0) {
        cashChangeAmount.innerText = formatRupiah(change);
        submitPaymentBtn.disabled = false;
    } else {
        cashChangeAmount.innerText = "Uang tidak cukup";
        submitPaymentBtn.disabled = true;
    }
}
// 13. SELESAIKAN PEMBAYARAN & CETAK STRUK
const receiptModal = document.getElementById("modal-receipt");
submitPaymentBtn.addEventListener("click", () => {
    const now = new Date();
    const resiNum = "TX-" + now.getFullYear() + String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0') + "-" + String(state.sales.length + 1).padStart(4, '0');

    const cashGiven = selectedPaymentMethod === "Tunai" ? parseInt(cashGivenInput.value) : checkoutTotal;
    const changeAmount = selectedPaymentMethod === "Tunai" ? (cashGiven - checkoutTotal) : 0;
    const newSale = {
        transactionId: resiNum,
        timestamp: now.toLocaleString('id-ID'),
        dateOnly: now.toLocaleDateString('id-ID'),
        cashier: state.currentEmployee.name,
        paymentMethod: selectedPaymentMethod,
        subtotal: checkoutSubtotal,
        tax: checkoutTax,
        grandTotal: checkoutTotal,
        cashGiven: cashGiven,
        change: changeAmount,
        items: [...state.cart],
        status: "Selesai"
    };
    // 1. Simpan Transaksi Ke Riwayat Penjualan
    state.sales.push(newSale);
    saveToLocalStorage("nco_sales", state.sales);
    // 2. Kurangi Stok Produk Di Gudang Inventaris
    state.cart.forEach(item => {
        const targetProd = state.products.find(p => p.sku === item.sku);
        if (targetProd) {
            targetProd.stock = Math.max(0, targetProd.stock - item.quantity);
        }
    });
    saveToLocalStorage("nco_products", state.products);
    // 3. Masukkan Pemasukan Ke Kas Laci Drawer (Jika Cash/Tunai)
    if (selectedPaymentMethod === "Tunai") {
        state.cashLogs.push({
            logId: "CSH-" + Date.now(),
            sessionId: state.currentSession.sessionId,
            timestamp: now.toLocaleTimeString('id-ID'),
            type: "pemasukan",
            amount: checkoutTotal,
            note: `Penjualan Tunai Resi ${resiNum}`,
            operator: state.currentEmployee.name
        });
        saveToLocalStorage("nco_cash", state.cashLogs);
    }
    // 4. Render Ke Lembar Struk Cetak Preview
    renderReceiptPrintDOM(newSale);
    // 5. Tutup Modal Kasir & Pembayaran, Kosongkan Keranjang
    closePaymentModal();
    state.cart = [];
    renderCart();
    calculateHeaderSummary();
    // 6. Munculkan Struk
    receiptModal.classList.remove("hidden");
});
function renderReceiptPrintDOM(sale) {
    document.getElementById("receipt-store-name").innerText = state.settings.outletName;
    document.getElementById("receipt-store-address").innerText = state.settings.outletAddress;
    document.getElementById("receipt-store-phone").innerText = "Telp: " + state.settings.outletPhone;
    document.getElementById("receipt-resi-num").innerText = sale.transactionId;
    document.getElementById("receipt-date").innerText = sale.timestamp;
    document.getElementById("receipt-cashier-name").innerText = `${sale.cashier} (Kasir)`;
    document.getElementById("receipt-method").innerText = sale.paymentMethod;
    const receiptItemsContainer = document.getElementById("receipt-items-list");
    receiptItemsContainer.innerHTML = "";
    sale.items.forEach(item => {
        receiptItemsContainer.innerHTML += `
            <div class="receipt-item-row">
                <div class="receipt-item-top">
                    <span>${item.name}</span>
                    <span>${formatRupiah(item.price * item.quantity)}</span>
                </div>
                <div class="receipt-item-bottom">
                    ${item.quantity} x ${formatRupiah(item.price)}
                </div>
            </div>
        `;
    });
    document.getElementById("receipt-subtotal").innerText = formatRupiah(sale.subtotal);
    document.getElementById("receipt-tax").innerText = formatRupiah(sale.tax);
    document.getElementById("receipt-total").innerText = formatRupiah(sale.grandTotal);
    document.getElementById("receipt-paid").innerText = formatRupiah(sale.cashGiven);
    document.getElementById("receipt-change").innerText = formatRupiah(sale.change);
    document.getElementById("receipt-footer-msg").innerText = state.settings.receiptFooter;
}
// Tutup modal receipt struk
document.getElementById("btn-close-receipt-modal").addEventListener("click", () => receiptModal.classList.add("hidden"));
document.getElementById("btn-close-receipt-bottom").addEventListener("click", () => receiptModal.classList.add("hidden"));
// Aksi Cetak Struk Printer Browser - Bersih & Tanpa Reload DOM
document.getElementById("btn-print-receipt-action").addEventListener("click", () => {
    window.print();
});
// 14. RENDERING RIWAYAT PENJUALAN
function renderSalesTable() {
    const salesTableBody = document.getElementById("sales-table-body");
    if (!salesTableBody) return;
    salesTableBody.innerHTML = "";
    if (state.sales.length === 0) {
        salesTableBody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; color: var(--text-secondary);">Belum ada riwayat penjualan hari ini.</td>
            </tr>
        `;
        return;
    }
    // Urutkan transaksi dari yang terbaru (Descending)
    const sortedSales = [...state.sales].reverse();
    sortedSales.forEach(sale => {
        const row = document.createElement("tr");
        row.innerHTML = `
            <td><strong>${sale.transactionId}</strong></td>
            <td>${sale.timestamp}</td>
            <td>${sale.cashier}</td>
            <td>${sale.paymentMethod}</td>
            <td><span class="status-badge-table selesai">${sale.status}</span></td>
            <td><strong>${formatRupiah(sale.grandTotal)}</strong></td>
            <td>
                <button class="btn btn-secondary" onclick="reprintReceipt('${sale.transactionId}')" style="padding: 6px 12px; font-size: 0.75rem;">
                    <i class="fa-solid fa-print"></i> Struk
                </button>
            </td>
        `;
        salesTableBody.appendChild(row);
    });
}
function reprintReceipt(transactionId) {
    const sale = state.sales.find(s => s.transactionId === transactionId);
    if (sale) {
        renderReceiptPrintDOM(sale);
        receiptModal.classList.remove("hidden");
    }
}
window.reprintReceipt = reprintReceipt;
// Ekspor Laporan Penjualan CSV Sesungguhnya
function exportSalesToCSV() {
    if (state.sales.length === 0) {
        showToast("Tidak ada data penjualan untuk diekspor!", "warning");
        return;
    }

    let csvContent = "No Transaksi,Tanggal,Kasir,Metode Pembayaran,Status,Subtotal,Pajak,Total Tagihan\n";

    state.sales.forEach(sale => {
        const row = [
            sale.transactionId,
            sale.timestamp.replace(/,/g, ""), // Bersihkan koma agar format CSV rapi
            sale.cashier,
            sale.paymentMethod,
            sale.status,
            sale.subtotal,
            sale.tax,
            sale.grandTotal
        ].join(",");
        csvContent += row + "\n";
    });

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `laporan_penjualan_new_citra_${Date.now()}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showToast("Laporan penjualan berhasil diunduh sebagai CSV!", "success");
}
document.getElementById("btn-export-sales").addEventListener("click", exportSalesToCSV);
// 15. SEKSI LAPORAN KASIR (MUTASI KAS DRAWER & SESI KASIR)
const cashMovementForm = document.getElementById("cash-movement-form");
function renderLaporanKasirTable() {
    const body = document.getElementById("laporan-kasir-table-body");
    if (!body) return;
    body.innerHTML = "";
    // Dapatkan sesi historis + sesi aktif saat ini
    let allSessions = [];
    const savedClosedSessions = localStorage.getItem("nco_closed_sessions");
    if (savedClosedSessions) allSessions = JSON.parse(savedClosedSessions);
    if (state.currentSession) {
        allSessions.push({
            ...state.currentSession,
            closeTime: "-",
            cashEnd: "-",
            netSales: calculateSessionNetSales(state.currentSession.sessionId),
            status: "aktif"
        });
    }
    allSessions.reverse().forEach(sess => {
        const row = document.createElement("tr");
        const statusClass = sess.status === "aktif" ? "aktif" : "tutup";
        const statusText = sess.status === "aktif" ? "Aktif" : "Ditutup";
        row.innerHTML = `
            <td>${sess.openTime}</td>
            <td><strong>${sess.employeeName}</strong></td>
            <td>${sess.closeTime}</td>
            <td>${formatRupiah(sess.cashStart)}</td>
            <td>${sess.cashEnd === "-" ? "-" : formatRupiah(sess.cashEnd)}</td>
            <td><strong>${formatRupiah(sess.netSales)}</strong></td>
            <td><span class="status-badge-table ${statusClass}">${statusText}</span></td>
        `;
        body.appendChild(row);
    });
}
function calculateSessionNetSales(sessionId) {
    // Sesi penjualan bersih
    return state.sales.reduce((sum, sale) => {
        // POS Cashier session mapping
        return sum + sale.grandTotal;
    }, 0);
}
// Input Cash Flow (Uang masuk/keluar)
if (cashMovementForm) {
    cashMovementForm.addEventListener("submit", (e) => {
        e.preventDefault();

        const type = document.getElementById("cash-move-type").value;
        const amount = parseInt(document.getElementById("cash-move-amount").value);
        const note = document.getElementById("cash-move-note").value.trim();
        const now = new Date();
        if (!state.currentSession) {
            showToast("Tidak ada sesi kasir aktif. Silakan login kembali.", "error");
            return;
        }
        state.cashLogs.push({
            logId: "CSH-" + Date.now(),
            sessionId: state.currentSession.sessionId,
            timestamp: now.toLocaleTimeString('id-ID'),
            type: type,
            amount: amount,
            note: note,
            operator: state.currentEmployee.name
        });
        saveToLocalStorage("nco_cash", state.cashLogs);
        cashMovementForm.reset();

        // Refresh tabel mutasi kas
        renderCashFlowTable();
    });
}
function renderCashFlowTable() {
    const tableBody = document.getElementById("cash-flow-table-body");
    const summaryIn = document.getElementById("summary-kas-in");
    const summaryOut = document.getElementById("summary-kas-out");
    if (!tableBody) return;
    tableBody.innerHTML = "";
    if (!state.currentSession) {
        tableBody.innerHTML = `<tr><td colspan="5" style="text-align:center;">Sesi kasir tidak aktif.</td></tr>`;
        return;
    }
    // Filter mutasi kas untuk sesi aktif saat ini saja
    const sessionLogs = state.cashLogs.filter(log => log.sessionId === state.currentSession.sessionId);
    let totalIn = 0;
    let totalOut = 0;
    if (sessionLogs.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-secondary);">Belum ada mutasi uang keluar masuk laci hari ini.</td></tr>`;
    } else {
        sessionLogs.reverse().forEach(log => {
            if (log.type === "pemasukan") totalIn += log.amount;
            if (log.type === "pengeluaran") totalOut += log.amount;
            const row = document.createElement("tr");
            const typeText = log.type === "pemasukan" ? "Kas Masuk" : "Kas Keluar";
            const badgeClass = log.type === "pemasukan" ? "in" : "out";
            row.innerHTML = `
                <td>${log.timestamp}</td>
                <td><span class="kas-badge ${badgeClass}">${typeText}</span></td>
                <td><strong>${formatRupiah(log.amount)}</strong></td>
                <td>${log.note}</td>
                <td>${log.operator}</td>
            `;
            tableBody.appendChild(row);
        });
    }
    if (summaryIn) summaryIn.innerText = formatRupiah(totalIn);
    if (summaryOut) summaryOut.innerText = formatRupiah(totalOut);
}
// Sub Tab Navigator Laporan (Sesi vs Mutasi)
document.querySelectorAll(".sub-tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        const targetSubId = btn.getAttribute("data-sub");

        document.querySelectorAll(".sub-tab-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        document.querySelectorAll(".sub-tab-content").forEach(c => {
            if (c.id === targetSubId) {
                c.classList.remove("hidden");
                c.classList.add("active");
            } else {
                c.classList.add("hidden");
                c.classList.remove("active");
            }
        });
    });
});
// 16. LOGIKA PENGATURAN TOKO (SETTINGS FORM)
const settingsOutletForm = document.getElementById("settings-outlet-form");
const settingsPinForm = document.getElementById("settings-pin-form");
function loadSettingsIntoForm() {
    document.getElementById("set-outlet-name").value = state.settings.outletName;
    document.getElementById("set-outlet-address").value = state.settings.outletAddress;
    document.getElementById("set-outlet-phone").value = state.settings.outletPhone;
    document.getElementById("set-tax-rate").value = state.settings.taxRate;
    document.getElementById("set-receipt-footer").value = state.settings.receiptFooter;
}
if (settingsOutletForm) {
    settingsOutletForm.addEventListener("submit", (e) => {
        e.preventDefault();

        state.settings.outletName = document.getElementById("set-outlet-name").value.trim();
        state.settings.outletAddress = document.getElementById("set-outlet-address").value.trim();
        state.settings.outletPhone = document.getElementById("set-outlet-phone").value.trim();
        saveToLocalStorage("nco_settings", state.settings);
        updateOutletHeaderDOM();
        showToast("Informasi Outlet New Citra Indonesia berhasil diperbarui!", "success");
    });
}
// Simpan Pajak
document.getElementById("btn-save-struk-settings").addEventListener("click", () => {
    state.settings.taxRate = parseInt(document.getElementById("set-tax-rate").value) || 0;
    state.settings.receiptFooter = document.getElementById("set-receipt-footer").value.trim();

    saveToLocalStorage("nco_settings", state.settings);
    showToast("Pengaturan struk & persentase pajak berhasil diperbarui!", "success");
});
// Ganti PIN Karyawan
if (settingsPinForm) {
    settingsPinForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        const empId = document.getElementById("select-employee-pin").value;
        const newPin = document.getElementById("set-new-pin").value;
        if (newPin.length !== 6 || isNaN(newPin)) {
            showToast("PIN harus berupa 6 digit angka!", "error");
            return;
        }
        const employee = state.employees.find(emp => emp.id === empId);
        if (employee) {
            employee.pin = await hashPIN(newPin);
            saveToLocalStorage("nco_employees", state.employees);
            document.getElementById("set-new-pin").value = "";
            showToast(`PIN baru untuk Karyawan ${employee.name} berhasil diperbarui!`, "success");
        }
    });
}
// Sub Tab Navigator Pengaturan
document.querySelectorAll(".settings-menu-item").forEach(item => {
    item.addEventListener("click", () => {
        const targetPaneId = item.getAttribute("data-settings-target");

        document.querySelectorAll(".settings-menu-item").forEach(i => i.classList.remove("active"));
        item.classList.add("active");
        document.querySelectorAll(".settings-pane").forEach(pane => {
            if (pane.id === targetPaneId) {
                pane.classList.remove("hidden");
                pane.classList.add("active");
            } else {
                pane.classList.add("hidden");
                pane.classList.remove("active");
            }
        });
    });
});
// 17. INTEGRASI FITUR ABSENSI
const btnAbsenMasuk = document.getElementById("btn-absen-masuk");
const btnAbsenPulang = document.getElementById("btn-absen-pulang");
btnAbsenMasuk.addEventListener("click", () => {
    performAbsensi("Masuk");
});
btnAbsenPulang.addEventListener("click", () => {
    performAbsensi("Pulang");
});
function performAbsensi(type) {
    const employeeName = document.getElementById("absensi-employee-select").value;

    if (!employeeName) {
        showToast("Silakan pilih nama karyawan terlebih dahulu!", "warning");
        return;
    }
    const now = new Date();
    const dateStr = now.toLocaleDateString('id-ID');
    const timeStr = now.toLocaleTimeString('id-ID');
    // Cari riwayat log absensi karyawan hari ini
    const todayLogIndex = state.absensi.findIndex(a => a.employeeName === employeeName && a.date === dateStr);
    if (type === "Masuk") {
        if (todayLogIndex !== -1) {
            showToast(`"${employeeName}" sudah absen masuk hari ini pukul ${state.absensi[todayLogIndex].timeIn}`, "warning");
            return;
        }
        // Simpan log baru
        state.absensi.push({
            logId: "ABS-" + Date.now(),
            employeeName: employeeName,
            date: dateStr,
            timeIn: timeStr,
            timeOut: "-",
            status: "Hadir"
        });
        showToast(`Absen MASUK Berhasil! Selamat bekerja ${employeeName}.`, "success");
    } else {
        // Tipe Pulang
        if (todayLogIndex === -1) {
            showToast(`"${employeeName}" belum absen masuk hari ini!`, "error");
            return;
        }
        if (state.absensi[todayLogIndex].timeOut !== "-") {
            showToast(`"${employeeName}" sudah absen pulang hari ini pukul ${state.absensi[todayLogIndex].timeOut}`, "warning");
            return;
        }
        state.absensi[todayLogIndex].timeOut = timeStr;
        showToast(`Absen PULANG Berhasil! Terima kasih atas dedikasi Anda ${employeeName}.`, "success");
    }
    saveToLocalStorage("nco_absensi", state.absensi);
    renderAbsensiTable();
    document.getElementById("absensi-employee-select").value = "";
}
function renderAbsensiTable() {
    const tableBody = document.getElementById("absensi-table-body");
    if (!tableBody) return;
    tableBody.innerHTML = "";
    const today = new Date().toLocaleDateString('id-ID');
    // Ambil log absensi hari ini saja
    const todayLogs = state.absensi.filter(a => a.date === today);
    if (todayLogs.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="4" style="text-align:center; color:var(--text-secondary);">Belum ada riwayat absensi hari ini.</td>
            </tr>
        `;
        return;
    }
    todayLogs.reverse().forEach(log => {
        row = document.createElement("tr");
        row.innerHTML = `
            <td><strong>${log.employeeName}</strong></td>
            <td>${log.timeIn}</td>
            <td>${log.timeOut}</td>
            <td><span class="status-badge-table selesai">${log.status}</span></td>
        `;
        tableBody.appendChild(row);
    });
}
// 18. LOGIKA TUTUP KASIR (CLOSE SESSION)
const tutupKasirModal = document.getElementById("modal-tutup-kasir");
const tutupKasirForm = document.getElementById("tutup-kasir-form");
// Klik tombol Tutup Kasir di Sidebar
document.getElementById("btn-tutup-kasir-sidebar").addEventListener("click", () => {
    if (!state.currentSession) return;
    // Rekap Sesi Saat Ini
    document.getElementById("session-open-time").innerText = state.currentSession.openTime;
    document.getElementById("session-cash-start").innerText = formatRupiah(state.currentSession.cashStart);

    // Hitung total penjualan sesi ini
    const netSales = state.sales.reduce((sum, sale) => {
        return sum + sale.grandTotal;
    }, 0);
    document.getElementById("session-total-sales").innerText = formatRupiah(netSales);
    // Hitung total kas masuk/keluar dari mutasi laci
    let totalIn = 0;
    let totalOut = 0;
    const sessionLogs = state.cashLogs.filter(log => log.sessionId === state.currentSession.sessionId);
    sessionLogs.forEach(log => {
        if (log.type === "pemasukan") totalIn += log.amount;
        if (log.type === "pengeluaran") totalOut += log.amount;
    });
    document.getElementById("session-cash-in").innerText = formatRupiah(totalIn);
    document.getElementById("session-cash-out").innerText = formatRupiah(totalOut);
    // Estimasi uang di laci = Kas Awal + Penjualan Cash + Kas Masuk - Kas Keluar
    // Penjualan Cash adalah penjualan dengan metode 'Tunai'
    const cashSales = state.sales.reduce((sum, sale) => {
        if (sale.paymentMethod === "Tunai") return sum + sale.grandTotal;
        return sum;
    }, 0);
    // Kas masuk sudah include modal awal Rp 200.000 jika dicatat, 
    // tapi mari kalkulasi dari transaksi riil:
    // Uang di laci = Kas Awal + Kas Masuk (selain modal awal) + Cash Sales - Kas Keluar
    // Sederhananya, total in sudah memuat modal awal (200.000) dan cash sales (karena masuk mutasi kas di submitPayment)
    const expectedCash = totalIn - totalOut;
    document.getElementById("session-expected-cash").innerText = formatRupiah(expectedCash);
    tutupKasirModal.classList.remove("hidden");
});
document.getElementById("btn-close-tutup-modal").addEventListener("click", () => tutupKasirModal.classList.add("hidden"));
tutupKasirForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const actualCashInput = parseInt(document.getElementById("actual-cash-input").value) || 0;
    const note = document.getElementById("session-closing-note").value.trim();
    const now = new Date();
    const netSales = state.sales.reduce((sum, sale) => sum + sale.grandTotal, 0);
    // Masukkan sesi aktif ke closed sessions list
    let closedSessions = [];
    const savedClosed = localStorage.getItem("nco_closed_sessions");
    if (savedClosed) closedSessions = JSON.parse(savedClosed);
    const closedSessObj = {
        ...state.currentSession,
        closeTime: now.toLocaleString('id-ID'),
        cashEnd: actualCashInput,
        netSales: netSales,
        closingNote: note,
        status: "tutup"
    };
    closedSessions.push(closedSessObj);
    saveToLocalStorage("nco_closed_sessions", closedSessions);
    // Hapus sesi aktif dari LocalStorage
    localStorage.removeItem("nco_active_session");

    // Reset global state sesi
    state.currentSession = null;
    state.currentEmployee = null;
    state.sales = []; // Bersihkan riwayat penjualan lokal untuk sesi baru
    saveToLocalStorage("nco_sales", []);
    tutupKasirModal.classList.add("hidden");
    tutupKasirForm.reset();

    showToast("Sesi kasir berhasil ditutup! Data sesi telah di-arsip.", "success");

    // Arahkan kembali ke halaman login karyawan
    showLoginScreen();
});
// Keluar Kasir Saja (Logout tanpa tutup sesi)
document.getElementById("btn-logout").addEventListener("click", () => {
    if (confirm("Apakah Anda yakin ingin keluar sementara? Sesi transaksi aktif Anda akan tetap berjalan.")) {
        state.currentEmployee = null;
        showLoginScreen();
    }
});
// Toggle Sidebar collapse
document.getElementById("toggle-sidebar").addEventListener("click", () => {
    document.getElementById("app-sidebar").classList.toggle("collapsed");
});
// 19. UTILITY UTAMA: FORMAT MATA UANG RUPIAH
function formatRupiah(angka) {
    return 'Rp ' + Number(angka).toLocaleString('id-ID');
}
// Jalankan App saat seluruh DOM termuat
window.addEventListener("DOMContentLoaded", initApp);

