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

bot.on('text', async (ctx) => {
    if (ctx.chat.id.toString() !== process.env.MY_CHAT_ID) return;
    const pesan = ctx.message.text;

    // JALUR 1: AMBIL DATA LIVE DARI API
    if (pesan.toLowerCase() === '/jadwal') {
        await ctx.reply("⏳ Menarik data pertandingan LIVE dari API...");
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

            const promptAnalisisAPI = `Berikan analisis parlay mendalam menggunakan format 10 poin lengkap (Form, H2H, Skuad, Motivasi, Taktik, Statistik, Corner, Kartu, Eksternal, Odds) untuk pertandingan live berikut:\n\n${dataMentahPertandingan}`;

            const model = genAI.getGenerativeModel({ model: 'gemini-3.1-pro' });
            const result = await model.generateContent(promptAnalisisAPI);
            return await ctx.reply(result.response.text());

        } catch (e) {
            return ctx.reply("❌ Gagal memproses data jadwal: " + e.message);
        }
    } 
    
    // JALUR 2: ANALISIS INPUT MANUAL DARI USER
    else {
        await ctx.reply("⏳ Menganalisis dengan format profesional 10 Poin...");
        try {
            const promptAnalisisManual = `Berikan analisis parlay mendalam menggunakan format 10 poin lengkap (Form, H2H, Skuad, Motivasi, Taktik, Statistik, Corner, Kartu, Eksternal, Odds) untuk data pertandingan ini:\n\n${pesan}`;
            const model = genAI.getGenerativeModel({ model: 'gemini-3.1-pro' });
            const result = await model.generateContent(promptAnalisisManual);
            await ctx.reply(result.response.text());
        } catch (e) {
            try {
                const modelLite = genAI.getGenerativeModel({ model: 'gemini-3.1-flash-lite' });
                const promptAnalisisManual = `Berikan analisis parlay mendalam menggunakan format 10 poin lengkap (Form, H2H, Skuad, Motivasi, Taktik, Statistik, Corner, Kartu, Eksternal, Odds) untuk data pertandingan ini:\n\n${pesan}`;
                const result = await modelLite.generateContent(promptAnalisisManual);
                await ctx.reply("ℹ️ *Mode Flash-Lite (Pro sedang limit):*\n\n" + result.response.text(), {parse_mode: "Markdown"});
            } catch (liteErr) {
                await ctx.reply("⚠️ Kedua model gagal: " + liteErr.message);
            }
        }
    }
});

bot.launch().then(() => console.log('✅ Bot Parlay Siap Tempur!'));
                
