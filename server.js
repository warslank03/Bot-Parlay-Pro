require('dns').setDefaultResultOrder('ipv4first');
const { Telegraf } = require('telegraf');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const express = require('express');
const axios = require('axios');

// Web server agar Railway tidak menidurkan bot
const app = express();
app.get('/', (req, res) => res.send('Bot Parlay Aktif!'));
app.listen(process.env.PORT || 3000);

// Membaca token dari "Variables" di Railway
const bot = new Telegraf(process.env.TELEGRAM_TOKEN);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

bot.on('text', async (ctx) => {
    if (ctx.chat.id.toString() !== process.env.MY_CHAT_ID) return;
    const pesan = ctx.message.text;

    // Perintah /jadwal untuk mengambil data API
    if (pesan.toLowerCase() === '/jadwal') {
        await ctx.reply("⏳ Mengambil data pertandingan...");
        try {
            const res = await axios.get('https://v3.football.api-sports.io/fixtures?live=all', {
                headers: { 'x-rapidapi-key': process.env.FOOTBALL_API_KEY }
            });
            const data = res.data.response;
            if (data.length === 0) return ctx.reply("❌ Tidak ada pertandingan live.");
            
            let info = "⚽ **Pertandingan Live:**\n\n";
            data.slice(0, 5).forEach(m => {
                info += `${m.teams.home.name} vs ${m.teams.away.name}\n`;
            });
            return ctx.reply(info, {parse_mode: "Markdown"});
        } catch (e) {
            return ctx.reply("❌ Gagal ambil jadwal: " + e.message);
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
