require('dns').setDefaultResultOrder('ipv4first');
const { Telegraf } = require('telegraf');
const { GoogleGenAI } = require('@google/genai');
const express = require('express');
const axios = require('axios');

const app = express();
app.get('/', (req, res) => res.send('Bot Parlay Pro Aktif'));
app.listen(process.env.PORT || 3000);

const bot = new Telegraf(process.env.TELEGRAM_TOKEN);
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const FORMAT_PROMPT_UTAMA = `Kamu adalah Master Analyst Parlay Profesional. Tugasmu adalah menganalisis data pertandingan sepak bola yang diberikan dan menyusunnya Wajib menggunakan format output persis seperti di bawah ini secara disiplin:

ANALISA PARLAY PROFESIONAL — (Hari, Tanggal Hari Ini)
(Daftar Singkat Liga yang dianalisa, misal: EPL | La Liga)
📌 PERTANDINGAN YANG DIANALISA
Dari semua laga malam ini, ada (Jumlah) pertandingan yang lolos seleksi berdasarkan kualitas data dan value betting:
# | Liga | Jam WIB | Laga
(Buat daftar tabel/list pertandingan yang dianalisa)

🔍 ANALISA LENGKAP — MATCH A/B/C/dst
⚽ (NAMA TIM A vs TIM B) — (NAMA LIGA) (JAM) WIB
1️⃣ FORM & PERFORMA: (Isi analisa performa terbaru)
2️⃣ HEAD TO HEAD: (Isi sejarah pertemuan kedua tim)
3️⃣ KONDISI SKUAD & CEDERA: (Isi info pemain absen/cedera jika ada)
4️⃣ MOTIVASI: (Isi target tim, posisi klasemen, survival/juara)
5️⃣ TAKTIK: (Isi prediksi skema permainan)
6️⃣ DATA STATISTIK LANJUTAN: (Isi rata-rata gol, kebobolan, dll)
7️⃣ CORNER ANALYSIS: (Isi rata-rata corner dan prediksi market corner)
8️⃣ KARTU & FOUL: (Isi ekspektasi tensi laga dan wasit jika relevan)
9️⃣ FAKTOR EKSTERNAL: (Isi jadwal padat, kelelahan, cuaca, atau laga kandang/tandang)
🔟 ANALISA ODDS & MARKET: (Peringatan bandar, trap odds, market terbaik yang underlooked)
✅ VERDICT MATCH:
PILIH: (Pilihan Handicap/OU/Corner/BTTS) -> (Alasan singkat)

🟢 PARLAY AMAN
(Jumlah Leg) Leg | Semua berdasarkan data + analisa 10 poin penuh
Leg | Liga | Laga | BET | Alasan Utama
(Buat daftar ringkasan parlay)
Est. Odds per leg: (Estimasi odds per leg)
🧮 Total Parlay Aman = (Total perkalian odds)`;

bot.on('text', async (ctx) => {
    if (ctx.chat.id.toString() !== process.env.MY_CHAT_ID) return;
    const pesan = ctx.message.text;

    // JALUR 1: AMBIL JADWAL YANG BELUM MULAI HARI INI
    if (pesan.toLowerCase() === '/jadwal') {
        await ctx.reply("⏳ Menarik jadwal pertandingan HARI INI yang BELUM MULAI...");
        try {
            // Ambil tanggal hari ini format YYYY-MM-DD secara otomatis
            const hariIni = new Date().toISOString().split('T')[0];
            
            const res = await axios.get(`https://v3.football.api-sports.io/fixtures?date=${hariIni}`, {
                headers: { 'x-rapidapi-key': process.env.FOOTBALL_API_KEY }
            });
            
            const data = res.data.response;
            if (!data || data.length === 0) return ctx.reply("❌ Tidak ada jadwal pertandingan untuk hari ini di API.");
            
            // FILTER: Hanya ambil pertandingan yang BELUM MULAI (Status: NS = Not Started)
            const belumMulai = data.filter(m => m.fixture.status.short === 'NS');
            
            if (belumMulai.length === 0) {
                return ctx.reply("ℹ️ Semua pertandingan hari ini sudah mulai atau sudah selesai.");
            }
            
            let dataMentahPertandingan = "";
            // Ambil maksimal 4 pertandingan teratas yang belum mulai
            belumMulai.slice(0, 4).forEach((m, index) => {
                let date = new Date(m.fixture.date);
                let wib = new Date(date.getTime() + (7 * 60 * 60 * 1000));
                let jamWib = String(wib.getHours()).padStart(2, '0') + ":" + String(wib.getMinutes()).padStart(2, '0');
                
                dataMentahPertandingan += `Match ${String.fromCharCode(65 + index)}:\n`;
                dataMentahPertandingan += `- Liga: ${m.league.name} (${m.league.country})\n`;
                dataMentahPertandingan += `- Waktu: ${jamWib} WIB\n`;
                dataMentahPertandingan += `- Laga: ${m.teams.home.name} vs ${m.teams.away.name}\n\n`;
            });

            const promptAnalisisAPI = `${FORMAT_PROMPT_UTAMA}\n\nBerikut adalah data pertandingan yang BELUM MULAI hari ini. Tolong buatkan prediksi parlaynya:\n${dataMentahPertandingan}`;

            const response = await ai.models.generateContent({
                model: 'gemini-3.5-flash',
                contents: promptAnalisisAPI
            });
            return await ctx.reply(response.text);

        } catch (e) {
            return ctx.reply("❌ Gagal memproses jadwal parlay: " + e.message);
        }
    } 
    
    // JALUR 2: INPUT MANUAL
    else {
        await ctx.reply("⏳ Menganalisis input manual dengan format profesional 10 Poin...");
        try {
            const promptAnalisisManual = `${FORMAT_PROMPT_UTAMA}\n\nBerikut adalah data pertandingan dari user yang wajib kamu analisis:\n${pesan}`;
            const response = await ai.models.generateContent({
                model: 'gemini-3.5-flash',
                contents: promptAnalisisManual
            });
            await ctx.reply(response.text);
        } catch (e) {
             return ctx.reply("❌ Gagal: " + e.message);
        }
    }
});

bot.launch().then(() => console.log('✅ Bot Parlay Pre-Match Siap Tempur!'));
