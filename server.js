/* ==========================================================================
   SERVER BACKEND - APLIKASI KASIR NEW CITRA INDONESIA
   Stack: Node.js + Express + MySQL2
   Fungsi: REST API untuk semua operasi CRUD POS
   Database: kasir_newcitra (MySQL 8.0)
   ========================================================================== */

const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname))); // Serve frontend files

// ============================
// KONEKSI & INISIALISASI DATABASE
// ============================

const DB_CONFIG = {
    host: 'localhost',
    user: 'root',
    password: '',
    multipleStatements: true
};

const DB_NAME = 'kasir_newcitra';

let pool; // Connection pool global

// Fungsi hash SHA-256
function hashPIN(pin) {
    return crypto.createHash('sha256').update(pin).digest('hex');
}

async function initializeDatabase() {
    // 1. Buat database jika belum ada
    const tempConn = await mysql.createConnection(DB_CONFIG);
    await tempConn.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await tempConn.end();

    // 2. Buat connection pool ke database
    pool = mysql.createPool({
        ...DB_CONFIG,
        database: DB_NAME,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
    });

    // 3. Buat semua tabel
    await pool.query(`
        CREATE TABLE IF NOT EXISTS products (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            sku VARCHAR(50) UNIQUE NOT NULL,
            category VARCHAR(50) NOT NULL DEFAULT 'Barang',
            price INT NOT NULL DEFAULT 0,
            stock INT NOT NULL DEFAULT 0,
            img TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS employees (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            role VARCHAR(50) NOT NULL DEFAULT 'Kasir',
            pin VARCHAR(64) NOT NULL
        );
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS sales (
            id INT AUTO_INCREMENT PRIMARY KEY,
            transaction_id VARCHAR(50) UNIQUE NOT NULL,
            timestamp DATETIME NOT NULL,
            date_only DATE NOT NULL,
            cashier VARCHAR(100) NOT NULL,
            payment_method VARCHAR(20) NOT NULL,
            subtotal INT NOT NULL DEFAULT 0,
            tax INT NOT NULL DEFAULT 0,
            grand_total INT NOT NULL DEFAULT 0,
            cash_given INT NOT NULL DEFAULT 0,
            change_amount INT NOT NULL DEFAULT 0,
            items JSON,
            status VARCHAR(20) NOT NULL DEFAULT 'Selesai',
            session_id VARCHAR(50)
        );
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS cash_logs (
            id INT AUTO_INCREMENT PRIMARY KEY,
            log_id VARCHAR(50) NOT NULL,
            session_id VARCHAR(50) NOT NULL,
            timestamp DATETIME NOT NULL,
            type VARCHAR(20) NOT NULL,
            amount INT NOT NULL DEFAULT 0,
            note TEXT,
            operator VARCHAR(100)
        );
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS absensi (
            id INT AUTO_INCREMENT PRIMARY KEY,
            log_id VARCHAR(50) NOT NULL,
            employee_name VARCHAR(100) NOT NULL,
            date DATE NOT NULL,
            time_in VARCHAR(20),
            time_out VARCHAR(20) DEFAULT '-',
            status VARCHAR(20) DEFAULT 'Hadir'
        );
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS sessions (
            id INT AUTO_INCREMENT PRIMARY KEY,
            session_id VARCHAR(50) UNIQUE NOT NULL,
            employee_id INT NOT NULL,
            employee_name VARCHAR(100) NOT NULL,
            open_time DATETIME NOT NULL,
            close_time DATETIME NULL,
            cash_start INT NOT NULL DEFAULT 200000,
            cash_end INT NULL,
            net_sales INT DEFAULT 0,
            closing_note TEXT,
            status VARCHAR(20) NOT NULL DEFAULT 'aktif'
        );
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS settings (
            id INT PRIMARY KEY DEFAULT 1,
            outlet_name VARCHAR(255) NOT NULL DEFAULT 'New Citra Indonesia',
            outlet_address TEXT,
            outlet_phone VARCHAR(30),
            tax_rate INT NOT NULL DEFAULT 11,
            receipt_footer VARCHAR(255) DEFAULT 'Terima Kasih Atas Kunjungan Anda!'
        );
    `);

    // 4. Seed data default jika tabel kosong
    const [products] = await pool.query('SELECT COUNT(*) AS cnt FROM products');
    if (products[0].cnt === 0) {
        await pool.query(`
            INSERT INTO products (name, sku, category, price, stock, img) VALUES
            ('Kopi Susu New Citra', 'NCO-001', 'Minuman', 18000, 50, 'https://images.unsplash.com/photo-1541167760496-1628856ab772?auto=format&fit=crop&q=80&w=150'),
            ('Americano Cold Brew', 'NCO-002', 'Minuman', 15000, 40, 'https://images.unsplash.com/photo-1517701604599-bb29b565090c?auto=format&fit=crop&q=80&w=150'),
            ('Croissant Almond', 'NCO-003', 'Makanan', 22000, 15, 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?auto=format&fit=crop&q=80&w=150'),
            ('Spaghetti Bolognese', 'NCO-004', 'Makanan', 35000, 20, 'https://images.unsplash.com/photo-1572449043416-55f4685c9bb7?auto=format&fit=crop&q=80&w=150'),
            ('Tumbler New Citra Official', 'NCO-005', 'Barang', 85000, 10, 'https://images.unsplash.com/photo-1523362628745-0c100150b504?auto=format&fit=crop&q=80&w=150')
        `);
        console.log('   ✅ Data produk default berhasil di-seed.');
    }

    const [employees] = await pool.query('SELECT COUNT(*) AS cnt FROM employees');
    if (employees[0].cnt === 0) {
        await pool.query(`
            INSERT INTO employees (name, role, pin) VALUES
            ('Andi', 'Kasir', ?),
            ('Budi', 'Kasir', ?),
            ('Citra', 'Manager', ?)
        `, [hashPIN('123456'), hashPIN('111111'), hashPIN('888888')]);
        console.log('   ✅ Data karyawan default berhasil di-seed (PIN ter-hash).');
    }

    const [settings] = await pool.query('SELECT COUNT(*) AS cnt FROM settings');
    if (settings[0].cnt === 0) {
        await pool.query(`
            INSERT INTO settings (id, outlet_name, outlet_address, outlet_phone, tax_rate, receipt_footer)
            VALUES (1, 'New Citra Indonesia', 'Jl. Kedungmundu Raya No 161A, Sendangguwo, Tembalang, Semarang Jawa Tengah 50273..', '0812-3456-7890', 11, 'Terima Kasih Atas Kunjungan Anda!')
        `);
        console.log('   ✅ Data pengaturan default berhasil di-seed.');
    }

    console.log(`\n🗄️  Database "${DB_NAME}" siap digunakan.\n`);
}

// ============================
// API ROUTES: PRODUCTS
// ============================

// GET semua produk
app.get('/api/products', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM products ORDER BY id ASC');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST tambah produk
app.post('/api/products', async (req, res) => {
    try {
        const { name, sku, category, price, stock, img } = req.body;
        const [result] = await pool.query(
            'INSERT INTO products (name, sku, category, price, stock, img) VALUES (?, ?, ?, ?, ?, ?)',
            [name, sku, category, price, stock, img || null]
        );
        res.json({ id: result.insertId, message: 'Produk berhasil ditambahkan' });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: `SKU ${req.body.sku} sudah digunakan!` });
        }
        res.status(500).json({ error: err.message });
    }
});

// PUT update produk
app.put('/api/products/:id', async (req, res) => {
    try {
        const { name, category, price, stock, img } = req.body;
        await pool.query(
            'UPDATE products SET name=?, category=?, price=?, stock=?, img=? WHERE id=?',
            [name, category, price, stock, img || null, req.params.id]
        );
        res.json({ message: 'Produk berhasil diperbarui' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE hapus produk
app.delete('/api/products/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM products WHERE id=?', [req.params.id]);
        res.json({ message: 'Produk berhasil dihapus' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PATCH update stok produk (untuk pengurangan saat checkout)
app.patch('/api/products/:id/stock', async (req, res) => {
    try {
        const { quantity } = req.body; // jumlah yang dikurangi
        await pool.query(
            'UPDATE products SET stock = GREATEST(0, stock - ?) WHERE id=?',
            [quantity, req.params.id]
        );
        res.json({ message: 'Stok berhasil diperbarui' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================
// API ROUTES: EMPLOYEES
// ============================

// GET semua karyawan (tanpa PIN)
app.get('/api/employees', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT id, name, role FROM employees ORDER BY id ASC');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST verifikasi PIN login
app.post('/api/employees/verify', async (req, res) => {
    try {
        const { employeeId, pin } = req.body;
        const hashedPin = hashPIN(pin);
        const [rows] = await pool.query(
            'SELECT id, name, role FROM employees WHERE id=? AND pin=?',
            [employeeId, hashedPin]
        );
        if (rows.length > 0) {
            res.json({ success: true, employee: rows[0] });
        } else {
            res.json({ success: false, message: 'PIN salah' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT ganti PIN karyawan
app.put('/api/employees/:id/pin', async (req, res) => {
    try {
        const { newPin } = req.body;
        const hashedPin = hashPIN(newPin);
        await pool.query('UPDATE employees SET pin=? WHERE id=?', [hashedPin, req.params.id]);
        res.json({ message: 'PIN berhasil diperbarui' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================
// API ROUTES: SALES
// ============================

// GET semua penjualan (opsional filter hari ini)
app.get('/api/sales', async (req, res) => {
    try {
        const { today, sessionId } = req.query;
        let query = 'SELECT * FROM sales';
        const params = [];
        const conditions = [];

        if (today === 'true') {
            conditions.push('date_only = CURDATE()');
        }
        if (sessionId) {
            conditions.push('session_id = ?');
            params.push(sessionId);
        }
        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }
        query += ' ORDER BY id DESC';

        const [rows] = await pool.query(query, params);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET ringkasan penjualan hari ini
app.get('/api/sales/summary/today', async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT COALESCE(SUM(grand_total), 0) AS totalSales
             FROM sales WHERE date_only = CURDATE() AND status = 'Selesai'`
        );
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST catat transaksi baru
app.post('/api/sales', async (req, res) => {
    try {
        const { transaction_id, timestamp, date_only, cashier, payment_method,
                subtotal, tax, grand_total, cash_given, change_amount, items, status, session_id } = req.body;
        await pool.query(
            `INSERT INTO sales (transaction_id, timestamp, date_only, cashier, payment_method,
             subtotal, tax, grand_total, cash_given, change_amount, items, status, session_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [transaction_id, timestamp, date_only, cashier, payment_method,
             subtotal, tax, grand_total, cash_given, change_amount, JSON.stringify(items), status, session_id]
        );
        res.json({ message: 'Transaksi berhasil disimpan' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET hitung jumlah transaksi hari ini (untuk generate resi number)
app.get('/api/sales/count/today', async (req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT COUNT(*) AS cnt FROM sales WHERE date_only = CURDATE()'
        );
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================
// API ROUTES: CASH LOGS
// ============================

// GET mutasi kas per sesi
app.get('/api/cash-logs/:sessionId', async (req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT * FROM cash_logs WHERE session_id=? ORDER BY id DESC',
            [req.params.sessionId]
        );
        // Hitung summary
        let totalIn = 0, totalOut = 0;
        rows.forEach(log => {
            if (log.type === 'pemasukan') totalIn += log.amount;
            if (log.type === 'pengeluaran') totalOut += log.amount;
        });
        res.json({ logs: rows, totalIn, totalOut });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST tambah mutasi kas
app.post('/api/cash-logs', async (req, res) => {
    try {
        const { log_id, session_id, timestamp, type, amount, note, operator } = req.body;
        await pool.query(
            'INSERT INTO cash_logs (log_id, session_id, timestamp, type, amount, note, operator) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [log_id, session_id, timestamp, type, amount, note, operator]
        );
        res.json({ message: 'Mutasi kas berhasil dicatat' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================
// API ROUTES: ABSENSI
// ============================

// GET absensi hari ini
app.get('/api/absensi/today', async (req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT * FROM absensi WHERE date = CURDATE() ORDER BY id DESC'
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST catat absensi masuk
app.post('/api/absensi', async (req, res) => {
    try {
        const { log_id, employee_name, date, time_in, status } = req.body;
        // Cek apakah sudah absen masuk hari ini
        const [existing] = await pool.query(
            'SELECT * FROM absensi WHERE employee_name=? AND date=?',
            [employee_name, date]
        );
        if (existing.length > 0) {
            return res.status(409).json({
                error: `${employee_name} sudah absen masuk hari ini pukul ${existing[0].time_in}`,
                existing: existing[0]
            });
        }
        await pool.query(
            'INSERT INTO absensi (log_id, employee_name, date, time_in, status) VALUES (?, ?, ?, ?, ?)',
            [log_id, employee_name, date, time_in, status]
        );
        res.json({ message: `Absen MASUK berhasil untuk ${employee_name}` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT update absensi pulang
app.put('/api/absensi/clockout', async (req, res) => {
    try {
        const { employee_name, date, time_out } = req.body;
        const [existing] = await pool.query(
            'SELECT * FROM absensi WHERE employee_name=? AND date=?',
            [employee_name, date]
        );
        if (existing.length === 0) {
            return res.status(404).json({ error: `${employee_name} belum absen masuk hari ini!` });
        }
        if (existing[0].time_out !== '-') {
            return res.status(409).json({
                error: `${employee_name} sudah absen pulang hari ini pukul ${existing[0].time_out}`
            });
        }
        await pool.query(
            'UPDATE absensi SET time_out=? WHERE employee_name=? AND date=?',
            [time_out, employee_name, date]
        );
        res.json({ message: `Absen PULANG berhasil untuk ${employee_name}` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================
// API ROUTES: SESSIONS (Sesi Kasir)
// ============================

// GET semua sesi (untuk laporan)
app.get('/api/sessions', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM sessions ORDER BY id DESC');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET sesi aktif
app.get('/api/sessions/active', async (req, res) => {
    try {
        const [rows] = await pool.query("SELECT * FROM sessions WHERE status='aktif' LIMIT 1");
        if (rows.length > 0) {
            res.json({ active: true, session: rows[0] });
        } else {
            res.json({ active: false });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST buat sesi baru
app.post('/api/sessions', async (req, res) => {
    try {
        const { session_id, employee_id, employee_name, open_time, cash_start } = req.body;
        await pool.query(
            `INSERT INTO sessions (session_id, employee_id, employee_name, open_time, cash_start, status)
             VALUES (?, ?, ?, ?, ?, 'aktif')`,
            [session_id, employee_id, employee_name, open_time, cash_start]
        );
        res.json({ message: 'Sesi kasir baru berhasil dibuat' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT tutup sesi kasir
app.put('/api/sessions/:sessionId/close', async (req, res) => {
    try {
        const { close_time, cash_end, net_sales, closing_note } = req.body;
        await pool.query(
            `UPDATE sessions SET close_time=?, cash_end=?, net_sales=?, closing_note=?, status='tutup'
             WHERE session_id=?`,
            [close_time, cash_end, net_sales, closing_note, req.params.sessionId]
        );
        res.json({ message: 'Sesi kasir berhasil ditutup' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================
// API ROUTES: SETTINGS
// ============================

// GET pengaturan
app.get('/api/settings', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM settings WHERE id=1');
        if (rows.length > 0) {
            res.json(rows[0]);
        } else {
            res.json({
                outlet_name: 'New Citra Indonesia',
                outlet_address: '',
                outlet_phone: '',
                tax_rate: 11,
                receipt_footer: 'Terima Kasih Atas Kunjungan Anda!'
            });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT perbarui pengaturan
app.put('/api/settings', async (req, res) => {
    try {
        const { outlet_name, outlet_address, outlet_phone, tax_rate, receipt_footer } = req.body;
        await pool.query(
            `UPDATE settings SET outlet_name=?, outlet_address=?, outlet_phone=?, tax_rate=?, receipt_footer=? WHERE id=1`,
            [outlet_name, outlet_address, outlet_phone, tax_rate, receipt_footer]
        );
        res.json({ message: 'Pengaturan berhasil diperbarui' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================
// FALLBACK: Serve index.html
// ============================
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ============================
// START SERVER
// ============================
async function startServer() {
    console.log('\n🚀 Kasir New Citra POS - Backend Server');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('   Menginisialisasi database MySQL...');

    try {
        await initializeDatabase();

        app.listen(PORT, () => {
            console.log(`🌐 Server berjalan di: http://localhost:${PORT}`);
            console.log(`📡 API tersedia di:    http://localhost:${PORT}/api`);
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        });
    } catch (err) {
        console.error('\n❌ Gagal menginisialisasi:', err.message);
        console.error('   Pastikan MySQL server berjalan (Laragon Start).');
        process.exit(1);
    }
}

startServer();
