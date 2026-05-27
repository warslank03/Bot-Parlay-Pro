require('dns').setDefaultResultOrder('ipv4first');
const { Telegraf } = require('telegraf');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const express = require('express');
const axios = require('axios');

const app = express();
app.get('/', (req, res) => res.send('Bot Parlay Pro Aktif'));
app.listen(process.env.PORT || 3000);

const bot = new Telegraf(process.env.TELEGRAM_TOKEN);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const FORMAT_PROMPT_UTAMA = "Kamu adalah Master Analyst Parlay Profesional. Tugasmu adalah menganalisis data pertandingan sepak bola yang diberikan dan menyusunnya Wajib menggunakan format output persis seperti di bawah ini secara disiplin:\n\n" +
"ANALISA PARLAY PROFESIONAL -- (Hari, Tanggal Hari Ini)\n" +
"(Daftar Singkat Liga yang dianalisa, misal: EPL | La Liga)\n" +
"PERTANDINGAN YANG DIANALISA\n" +
"Dari semua laga malam ini, ada (Jumlah) pertandingan yang lolos seleksi berdasarkan kualitas data dan value betting:\n" +
"# | Liga | Jam WIB | Laga\n" +
"(Buat daftar tabel/list pertandingan yang dianalisa)\n\n" +
"ANALISA LENGKAP -- MATCH A/B/C/dst\n" +
"MATCH (NAMA TIM A vs TIM B) -- (NAMA LIGA) (JAM) WIB\n" +
"1. FORM DAN PERFORMA: (Isi analisa performa terbaru)\n" +
"2. HEAD TO HEAD: (Isi sejarah pertemuan kedua tim)\n" +
"3. KONDISI SKUAD DAN CEDERA: (Isi info pemain absen/cedera jika ada)\n" +
"4. MOTIVASI: (Isi target tim, posisi klasemen, survival/juara)\n" +
"5. TAKTIK: (Isi prediksi skema permainan)\n" +
"6. DATA STATISTIK LANJUTAN: (Isi rata-rata gol, kebobolan, dll)\n" +
"7. CORNER ANALYSIS: (Isi rata-rata corner dan prediksi market corner)\n" +
"8. KARTU DAN FOUL: (Isi ekspektasi tensi laga)\n" +
"9. FAKTOR EKSTERNAL: (Isi jadwal padat, kelelahan, cuaca, atau laga kandang/tandang)\n" +
"10. ANALISA ODDS DAN MARKET: (Peringatan bandar, trap odds, market terbaik yang underlooked)\n" +
"VERDICT MATCH:\n" +
"PILIH: (Pilihan Handicap/OU/Corner/BTTS) -> (Alasan singkat)\n\n" +
"PARLAY AMAN\n" +
"(Jumlah Leg) Leg | Semua berdasarkan data + analisa 10 poin penuh\n" +
"Leg | Liga | Laga | BET | Alasan Utama\n" +
"(Buat daftar ringkasan parlay)\n" +
"Est. Odds per leg: (Estimasi odds per leg)\n" +
"Total Parlay Aman = (Total perkalian odds)";

bot.on('text', async (ctx) => {
    if (ctx.chat.id.toString() !== process.env.MY_CHAT_ID) return;
    const pesan = ctx.message.text;

    // JALUR 1: AMBIL DATA LIVE DARI API
    if (pesan.toLowerCase() === '/jadwal') {
        await ctx.reply("⏳ Menarik data pertandingan LIVE dari API dan menyusun Analisis 10 Poin...");
        try {
            const res = await axios.get('https://v3.football.api-sports.io/fixtures?live=all', {
                headers: { 'x-rapidapi-key': process.env.FOOTBALL_API_KEY }
            });
            const data = res.data.response;
            if (!data || data.length === 0) return ctx.reply("❌ Tidak ada pertandingan live saat ini di API.");
            
            let dataMentahPertandingan = "";
            data.slice(0, 4).forEach((m, index) => {
                let date = new Date(m.fixture.date);
                let wib = new Date(date.getTime() + (7 * 60 * 60 * 1000));
                let jamWib = wib.getHours() + ":" + String(wib.getMinutes()).padStart(2, '0');
                
                dataMentahPertandingan += `Match ${index + 1}:\n`;
                dataMentahPertandingan += `- Liga: ${m.league.name} (${m.league.country})\n`;
                dataMentahPertandingan += `- Waktu: ${jamWib} WIB\n`;
                dataMentahPertandingan += `- Laga: ${m.teams.home.name} vs ${m.teams.away.name}\n`;
                dataMentahPertandingan += `- Skor: ${m.goals.home} - ${m.goals.away} (Menit: ${m.fixture.status.elapsed}')\n\n`;
            });

            const promptAnalisisAPI = `${FORMAT_PROMPT_UTAMA}\n\nBerikut adalah data pertandingan live asli yang harus kamu analisis sekarang:\n${dataMentahPertandingan}`;

            // KUNCI MODEL DIUBAH SESUAI LOG TERBARU LU (gemini-pro)
            const model = genAI.getGenerativeModel({ model: 'gemini-pro' });
            const result = await model.generateContent(promptAnalisisAPI);
            return await ctx.reply(result.response.text());

        } catch (e) {
            // FALLBACK AMAN KE GEMINI-1.5-FLASH KALO PRO LIMIT
            try {
                const modelLite = genAI.getGenerativeModel({ model: 'gemini-pro' });
                const result = await modelLite.generateContent(promptAnalisisAPI);
                return await ctx.reply("ℹ️ *Mode Flash (Pro sedang limit):*\n\n" + result.response.text());
            } catch (liteErr) {
                return ctx.reply("❌ Gagal memproses data jadwal: " + e.message);
            }
        }
    } 
    
    // JALUR 2: ANALISIS INPUT MANUAL DARI USER
    else {
        await ctx.reply("⏳ Menganalisis dengan format profesional 10 Poin...");
        try {
            const promptAnalisisManual = `${FORMAT_PROMPT_UTAMA}\n\nBerikut adalah data pertandingan dari user yang wajib kamu analisis:\n${pesan}`;
            const model = genAI.getGenerativeModel({ model: 'gemini-pro' });
            const result = await model.generateContent(promptAnalisisManual);
            await ctx.reply(result.response.text());
        } catch (e) {
            try {
                const modelLite = genAI.getGenerativeModel({ model: 'gemini-pro' });
                const promptAnalisisManual = `${FORMAT_PROMPT_UTAMA}\n\nBerikut adalah data pertandingan dari user yang wajib kamu analisis:\n${pesan}`;
                const result = await modelLite.generateContent(promptAnalisisManual);
                await ctx.reply("ℹ️ *Mode Flash (Pro sedang limit):*\n\n" + result.response.text());
            } catch (liteErr) {
                await ctx.reply("⚠️ Kedua model gagal: " + liteErr.message);
            }
        }
    }
});

bot.launch().then(() => console.log('✅ Bot Parlay Siap Tempur!'));
