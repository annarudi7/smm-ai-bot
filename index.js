require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const OpenAI = require('openai');

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('SMM AI Bot is running!');
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

const token = process.env.BOT_TOKEN;
const openaiApiKey = process.env.OPENAI_API_KEY;

if (!token) {
  console.error('Ошибка: BOT_TOKEN не найден в .env!');
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });
const openai = new OpenAI({ 
    apiKey: openaiApiKey,
    baseURL: 'https://openrouter.ai/api/v1' 
    });

const userState = {};

console.log('SMM AI Bot успешно запущен!');

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const firstName = msg.from.first_name || 'друг';

  userState[chatId] = { mode: null, tone: 'дружелюбный и вовлекающий' };

  const welcomeMessage = `Привет, ${firstName}! 👋\n\nЯ твой **SMM-ассистент на базе ИИ**.\n\nВыбери тип контента из меню ниже, а затем просто напиши тему или описание продукта!`;

  const keyboard = {
    reply_markup: {
      keyboard: [
        ['🛍 Продающий пост', '💡 Экспертный пост'],
        ['🎉 Развлекательный пост', '⚙️ Настройки Tone of Voice']
      ],
      resize_keyboard: true
    }
  };

  bot.sendMessage(chatId, welcomeMessage, { parse_mode: 'Markdown', ...keyboard });
});

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (!text || text === '/start') return;

  if (!userState[chatId]) {
    userState[chatId] = { mode: null, tone: 'дружелюбный и вовлекающий' };
  }

  if (text === '🛍 Продающий пост') {
    userState[chatId].mode = 'selling';
    return bot.sendMessage(chatId, '🛍 **Режим: Продающий пост**\n\nНапиши, какой продукт/услугу продаем, кто целевая аудитория и есть ли скидка/акция.');
  }

  if (text === '💡 Экспертный пост') {
    userState[chatId].mode = 'expert';
    return bot.sendMessage(chatId, '💡 **Режим: Экспертный пост**\n\nНапиши тему или проблему. Например: *"Как справиться с выгоранием"* или *"3 ошибки в настройке рекламы"*.');
  }

  if (text === '🎉 Развлекательный пост') {
    userState[chatId].mode = 'entertainment';
    return bot.sendMessage(chatId, '🎉 **Режим: Развлекательный пост**\n\nНапиши тему или инфоповод для легкого поста с вовлечением и интерактивом.');
  }

  if (text === '⚙️ Настройки Tone of Voice') {
    return bot.sendMessage(chatId, `⚙️ **Текущий тон:** ${userState[chatId].tone}\n\nЧтобы изменить тон, просто напиши сообщение вида: *"Тон: Дерзкий и ироничный"* или *"Тон: Строгий и деловой"*.`);
  }

  if (text.toLowerCase().startsWith('тон:')) {
    const newTone = text.split(':')[1].trim();
    userState[chatId].tone = newTone;
    return bot.sendMessage(chatId, `✅ Тон общения успешно изменен на: **${newTone}**`, { parse_mode: 'Markdown' });
  }

  if (!userState[chatId].mode) {
    return bot.sendMessage(chatId, 'Пожалуйста, сначала выбери режим в меню ниже (например, Продающий или Экспертный пост).');
  }

  const waitMessage = await bot.sendMessage(chatId, '✍️ *Генерирую пост, подожди пару секунд...*', { parse_mode: 'Markdown' });

  try {
    const modePrompts = {
      selling: 'Напиши продающий пост для соцсетей по формуле AIDA (Внимание, Интерес, Желание, Призыв к действию). Добавь эмодзи и структурируй текст абзацами.',
      expert: 'Напиши экспертный, полезный пост для соцсетей с четкой структурой, советами и выводами. Текст должен вызывать доверие.',
      entertainment: 'Напиши легкий, вовлекающий развлекательный пост для соцсетей. В конце обязательно задай интерактивный вопрос аудитории.'
    };

    const systemPrompt = `Ты опытный SMM-копирайтер и контент-стратег. 
Твоя задача — написать пост на основе запроса пользователя.
Стиль/Tone of Voice: ${userState[chatId].tone}.
Тип поста: ${modePrompts[userState[chatId].mode]}
Добавляй подходящие эмодзи и форматируй текст для удобного чтения.`;

    const response = await openai.chat.completions.create({
        model: 'qwen/qwen-2.5-7b-instruct',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text }
      ],
      temperature: 0.7
    });

    const generatedPost = response.choices[0].message.content;

    bot.deleteMessage(chatId, waitMessage.message_id);
    bot.sendMessage(chatId, generatedPost, { parse_mode: 'Markdown' });

  } catch (error) {
    console.error('Ошибка OpenAI:', error);
    bot.deleteMessage(chatId, waitMessage.message_id);
    bot.sendMessage(chatId, '❌ Произошла ошибка при генерации поста. Проверь API-ключ OpenAI в файле .env.');
  }
});