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

// Template prompt instruksi format 10 poin yang lu mau
const FORMAT_PROMPT_UTAMA = `
Kamu adalah Master Analyst Parlay Profesional. Tugasmu adalah menganalisis data pertandingan sepak bola yang diberikan dan menyusunnya Wajib menggunakan format output persis seperti di bawah ini secara disiplin:

ANALISA PARLAY PROFESIONAL — [Hari, Tanggal Hari Ini]
[Daftar Singkat Liga yang dianalisa, misal: EPL | La Liga]
📌 PERTANDINGAN YANG DIANALISA
Dari semua laga malam ini, ada [Jumlah] pertandingan yang lolos seleksi berdasarkan kualitas data dan value betting:
# | Liga | Jam WIB | Laga
[Buat daftar tabel/list pertandingan yang dianalisa]

🔍 ANALISA LENGKAP — MATCH [A/B/C/dst]
⚽ [NAMA TIM A vs TIM B] — [NAMA LIGA] [JAM] WIB
1️⃣ FORM & PERFORMA: [Isi analisa performa terbaru]
2️⃣ HEAD TO HEAD: [Isi sejarah pertemuan kedua tim]
3️⃣ KONDISI SKUAD & CEDERA: [Isi info pemain absen/cedera jika ada]
4️⃣ MOTIVASI: [Isi target tim, posisi klasemen, survival/juara]
5️⃣ TAKTIK: [Isi prediksi skema permainan]
6️⃣ DATA STATISTIK LANJUTAN: [Isi rata-rata gol, kebobolan, dll]
7️⃣ CORNER ANALYSIS: [Isi rata-rata corner dan prediksi market corner]
8️⃣ KARTU & FOUL: [Isi ekspektasi tensi laga dan wasit jika relevan]
9️⃣ FAKTOR EKSTERNAL: [Isi jadwal padat, kelelahan, cuaca, atau laga kandang/tandang]
🔟 ANALISA ODDS & MARKET: [Peringatan bandar, trap odds, market terbaik yang underlooked]
✅ VERDICT MATCH [A/B/C/dst]:
PILIH: [Pilihan Handicap/OU/Corner/BTTS] → [Alasan singkat]

🟢 PARLAY AMAN
[Jumlah Leg] Leg | Semua berdasarkan data + analisa 10 poin penuh
Leg | Liga | Laga | BET | Alasan Utama
[Buat daftar ringkasan parlay]
Est. Odds per leg: [Estimasi odds per leg]
🧮 Total Parlay Aman ≈ [Total perkalian odds]
`;

bot.on('text', async (ctx) => {
    if (ctx.chat.id.toString() !== process.env.MY_CHAT_ID) return;
    const pesan = ctx.message.text;

    // JALUR 1: Jika mengetik /jadwal (Otomatis ambil data Live API + dianalisis Gemini pakai format 10 Poin)
    if (pesan.toLowerCase() === '/jadwal') {
        await ctx.reply("⏳ Menarik data pertandingan LIVE dari API dan menyusun Analisis 10 Poin...");
        try {
            const res = await axios.get('https://v3.football.api-sports.io/fixtures?live=all', {
                headers: { 'x-rapidapi-key': process.env.FOOTBALL_API_KEY }
            });
            const data = res.data.response;
            if (!data || data.length === 0) return ctx.reply("❌ Tidak ada pertandingan live saat ini di API.");
            
            // Ambil maksimal 4 pertandingan live teratas untuk menghemat kuota token AI
            let dataMentahPertandingan = "";
            data.slice(0, 4).forEach((m, index) => {
                let date = new Date(m.fixture.date);
                let wib = new Date(date.getTime() + (7 * 60 * 60 * 1000));
                let jamWib = wib.getHours() + ":" + String(wib.getMinutes()).padStart(2, '0');
                
                dataMentahPertandingan += `Match ${String.fromCharCode(65 + index)}:\n`;
                dataMentahPertandingan += `- Liga: ${m.league.name} (${m.league.country})\n`;
                dataMentahPertandingan += `- Waktu: ${jamWib} WIB\n`;
                dataMentahPertandingan += `- Laga: ${m.teams.home.name} vs ${m.teams.away.name}\n`;
                dataMentahPertandingan += `- Skor Saat Ini: ${m.goals.home} - ${m.goals.away} (Menit: ${m.fixture.status.elapsed}')\n\n`;
            });

            const promptAnalisisAPI = `${FORMAT_PROMPT_UTAMA}\n\nBerikut adalah data pertandingan live asli yang harus kamu analisis sekarang:\n${dataMentahPertandingan}`;

            const model = genAI.getGenerativeModel({ model: 'gemini-3.1-pro' });
            const result = await model.generateContent(promptAnalisisAPI);
            return await ctx.reply(result.response.text());

        } catch (e) {
            return ctx.reply("❌ Gagal memproses data jadwal: " + e.message);
        }
    } 
    
    // JALUR 2: Jika lu input manual daftar pertandingan lewat chat biasa
    else {
        await ctx.reply("⏳ Menganalisis input manual dengan format profesional 10 Poin...");
        try {
            const promptAnalisisManual = `${FORMAT_PROMPT_UTAMA}\n\nBerikut adalah data pertandingan dari user yang wajib kamu analisis:\n${pesan}`;
            
            const model = genAI.getGenerativeModel({ model: 'gemini-3.1-pro' });
            const result = await model.generateContent(promptAnalisisManual);
            await ctx.reply(result.response.text());
        } catch (e) {
            // Fallback otomatis ke Flash-Lite jika Pro limit
            try {
                const modelLite = genAI.getGenerativeModel({ model: 'gemini-3.1-flash-lite' });
                const promptAnalisisManual = `${FORMAT_PROMPT_UTAMA}\n\nBerikut adalah data pertandingan dari user yang wajib kamu analisis:\n${pesan}`;
                const result = await modelLite.generateContent(promptAnalisisManual);
                await ctx.reply("ℹ️ *Mode Flash-Lite (Pro sedang limit):*\n\n" + result.response.text(), {parse_mode: "Markdown"});
            } catch (liteErr) {
                await ctx.reply("⚠️ Kedua model gagal: " + liteErr.message);
            }
        }
    }
});

bot.launch().then(() => console.log('✅ Bot Parlay Format Pro Siap Tempur!'));
        }
    }

    // Analisis dengan sistem fallback (Pro -> Flash-Lite)
    await ctx.reply("⏳ Sedang menganalisis...");
    try {
        const model = genAI.getGenerativeModel({ model: 'gemini-3.1-pro' });
        const result = await model.generateContent(pesan);
        await ctx.reply(result.response.text());
    } catch (e) {
        console.log("⚠️ Pro Limit, switch ke Flash-Lite...");
        try {
            const modelLite = genAI.getGenerativeModel({ model: 'gemini-3.1-flash-lite' });
            const result = await modelLite.generateContent(pesan);
            await ctx.reply("ℹ️ *Mode Flash-Lite (Pro sedang limit):*\n\n" + result.response.text(), {parse_mode: "Markdown"});
        } catch (liteErr) {
            await ctx.reply("⚠️ Kedua model gagal: " + liteErr.message);
        }
    }
});

bot.launch().then(() => console.log('✅ Bot Berhasil Jalan di Railway!'));
