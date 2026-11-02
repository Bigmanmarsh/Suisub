// The Telegram side. Only the first person to /start can use this agent.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { Bot, InlineKeyboard } from 'grammy';

export function ownerStore(file) {
  let chatId = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')).chatId : null;
  return {
    get: () => chatId,
    claim(id) {
      chatId = id;
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, JSON.stringify({ chatId }));
    },
  };
}

export function toKeyboard(rows) {
  const keyboard = new InlineKeyboard();
  rows.forEach((row) => {
    row.forEach((item) => keyboard.text(item.text, item.data));
    keyboard.row();
  });
  return keyboard;
}

export function createBot({ token, owner, getAgent, botInfo }) {
  const bot = new Bot(token, botInfo ? { botInfo } : undefined);

  bot.use(async (ctx, next) => {
    const id = ctx.chat?.id;
    if (owner.get() === null && ctx.message?.text?.startsWith('/start')) owner.claim(id);
    if (id !== owner.get()) {
      await ctx.reply('This agent already belongs to someone else.');
      return;
    }
    await next();
  });

  bot.command('start', () => getAgent().start());
  bot.command('status', () => getAgent().status());
  bot.command('bill', (ctx) => getAgent().addBill(ctx.match));
  bot.command('data', () => getAgent().askForData());
  bot.command('usage', () => getAgent().askUsage());
  bot.command('network',() => getAgent().chooseNetwork());
  bot.command('stop', () => getAgent().stopAutopilot());
  bot.on('callback_query:data', async (ctx) => {
    await ctx.answerCallbackQuery();
    await getAgent().press(ctx.callbackQuery.data);
  });
  bot.catch(async (error) => {
    console.error('Telegram error:', error.message);
    await error.ctx.reply(`Sorry, that didn't work: ${error.error?.message ?? 'unknown error'}`).catch(() => {});
  });
  return bot;
}
