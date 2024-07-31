require("dotenv").config();

const {
  conversations,
  createConversation,
} = require("@grammyjs/conversations");
const { Bot, GrammyError, HttpError, Keyboard, session } = require("grammy");
const { hydrateFiles } = require("@grammyjs/files");
const bot = new Bot(process.env.BOT_API_KEY);
const adminID = process.env.ADMIN_ID;
const groupID = process.env.GROUP_ID;
const fs = require("fs");
bot.use(
  session({
    initial: () => ({}),
  })
);
bot.use(conversations());
bot.api.config.use(hydrateFiles(bot.token));

bot.command("start", async (ctx) => {
  await ctx.reply("Напишите команду /help для показа команд");
  let set = new Set(JSON.parse(getJSON("users")));
  set.add(ctx.from.id);

  fs.writeFile("users.json", JSON.stringify(Array.from(set)), (err) => {
    if (err) {
      ctx.reply("Ошибка");
      return;
    }
  });
});

function getJSON(name) {
  return fs.readFileSync(`${name}.json`, (err, data) => {
    if (err) {
      ctx.reply("Ошибка");
      return;
    }
  });
}

function getParsedQuestions() {
  let json = getJSON("questions");
  return JSON.parse(json.toString());
}

function isNan(answer) {
  if (!answer.msg?.text || isNaN(answer.msg?.text)) return true;
}

let questions = [];
function setQuestions() {
  let parsedQuestions = getParsedQuestions();
  questions = [];
  let i = 0;
  for (const key in parsedQuestions) {
    if (parsedQuestions[key].hasOwnProperty("answer")) {
      i++;
      questions.push(`${i}. ${parsedQuestions[key].question} \n`);
    }
  }
}

async function help(conversation, ctx) {
  let json = getJSON("questions");
  let parsedQuestions = JSON.parse(json.toString());

  await ctx.reply(
    `Часто задаваемые вопросы:
${questions.join("")}
Пожалуйста, напишите цифру вопроса, чтобы получить на него ответ`,
    {
      parse_mode: "HTML",
    }
  );
  const answer = await conversation.wait();
  if (isNan(answer)) {
    await ctx.reply("Это не номер вопроса. Введите команду заново");
    return;
  }
  const num = Number(answer.msg.text);
  if (parsedQuestions[num - 1]?.question) {
    await ctx.reply(parsedQuestions[num - 1].answer);
  } else {
    await ctx.reply("Такого вопроса нет.");
  }
}

bot.use(createConversation(help));
bot.command("help", async (ctx) => {
  setQuestions();
  await ctx.conversation.enter("help");
});

function checkID(ctx) {
  return Number(ctx.from.id) !== Number(adminID);
}

async function createQuestion(conversation, ctx) {
  if (checkID(ctx)) {
    await ctx.reply("Вы не администратор");
    return;
  }
  let parsedQuestions = getParsedQuestions();
  await ctx.reply("Введите вопрос");
  const question = await conversation.wait();
  await ctx.reply("Введите ответ");
  const answer = await conversation.wait();

  if (!question.msg.text || !answer.msg.text) {
    await ctx.reply("Это не текст. Введите команду заново");
    return;
  }

  parsedQuestions.push({
    question: question.msg.text,
    answer: answer.msg.text,
  });

  fs.writeFile("questions.json", JSON.stringify(parsedQuestions), (err) => {
    if (err) {
      ctx.reply("Ошибка");
      return;
    }
    ctx.reply("Ваш вопрос успешно добавлен");
  });
}

bot.use(createConversation(createQuestion));
bot.command("create_question", async (ctx) => {
  await ctx.conversation.enter("createQuestion");
});

async function changeQuestion(conversation, ctx) {
  if (checkID(ctx)) {
    await ctx.reply("Вы не администратор");
    return;
  }
  setQuestions();
  await ctx.reply(
    `${questions.join("")}
Пожалуйста, напишите цифру вопроса для изменения`,
    {
      parse_mode: "HTML",
    }
  );
  let parsedQuestions = getParsedQuestions();
  const answer = await conversation.wait();
  if (isNan(answer)) {
    await ctx.reply("Это не номер вопроса. Введите команду заново");
    return;
  }

  const num = Number(answer.msg.text);
  if (!parsedQuestions[num - 1]?.question) {
    await ctx.reply("Такого вопроса нет. Введите команду заново");
    return;
  }

  const keyboard = new Keyboard()
    .text("Вопрос")
    .row()
    .text("Ответ")
    .row()
    .resized();

  await ctx.reply("Что вы хотите изменить?", {
    reply_markup: keyboard,
  });
  const choose = await conversation.wait();

  let newInfo;
  switch (choose.msg.text.toLowerCase()) {
    case "вопрос":
      await ctx.reply("Напишите новый вопрос");
      newInfo = await conversation.wait();
      parsedQuestions[num - 1].question = newInfo.msg.text;
      fs.writeFile("questions.json", JSON.stringify(parsedQuestions), (err) => {
        if (err) {
          ctx.reply("Ошибка");
          return;
        }
        ctx.reply("Ваш вопрос успешно изменен");
      });

      break;
    case "ответ":
      await ctx.reply("Напишите новый ответ");
      newInfo = await conversation.wait();
      parsedQuestions[num - 1].answer = newInfo.msg.text;
      fs.writeFile("questions.json", JSON.stringify(parsedQuestions), (err) => {
        if (err) {
          ctx.reply("Ошибка");
          return;
        }
        ctx.reply("Ваш вопрос успешно изменен");
      });
      break;

    default:
      return;
  }
}

bot.use(createConversation(changeQuestion));
bot.command("change_question", async (ctx) => {
  await ctx.conversation.enter("changeQuestion");
});

function getRequests() {
  return fs.readFileSync("requests.json", (err, data) => {
    if (err) {
      ctx.reply("Ошибка");
      return;
    }
  });
}

async function sendQuestion(conversation, ctx) {
  await ctx.reply(
    "Напишите ваш вопрос в одном предложении. Если требуется с фотографией - приложите ее в сообщение и в описании укажите текст."
  );
  const question = await conversation.wait();

  if (question.msg?.photo) {
    const file = await ctx.api.getFile(
      question.update.message.photo[question.update.message.photo.length - 1]
        .file_id
    );
    try {
      if (file.getUrl !== "download") {
        await bot.api.sendPhoto(groupID, file.file_id);
      }
    } catch (error) {
      await ctx.reply("Ошибка");
      return;
    }
  }

  try {
    if (question.msg?.caption) {
      question.msg.text = question.msg.caption;
      await bot.api.sendMessage(
        groupID,
        `Вопрос от: <b><a href="tg://user?id=${ctx.msg.from.id}">${ctx.msg.from.first_name}</a></b>. Изображение прилагается к вопросу.

          ${question.msg.text}

              ID вопроса - <b>${ctx.msg.message_id}</b>`,
        {
          parse_mode: "HTML",
        }
      );
    } else {
      await bot.api.sendMessage(
        groupID,
        `Вопрос от: <b><a href="tg://user?id=${ctx.msg.from.id}">${ctx.msg.from.first_name}</a></b>

          ${question.msg.text}

    ID вопроса - <b>${ctx.msg.message_id}</b>`,
        {
          parse_mode: "HTML",
        }
      );
    }

    let requests = JSON.parse(getRequests().toString());

    if (requests.length > 20) {
      requests.push({ from: ctx.from.id, id: ctx.msg.message_id });
      let pop = requests.pop();
      fs.writeFile("requests.json", JSON.stringify([pop]), (err) => {
        if (err) {
          ctx.reply("Ошибка");
          return;
        }
      });
    } else {
      requests.push({ from: ctx.from.id, id: ctx.msg.message_id });
      fs.writeFile("requests.json", JSON.stringify(requests), (err) => {
        if (err) {
          ctx.reply("Ошибка");
          return;
        }
      });
    }

    await ctx.reply(
      "Ваш вопрос успешно был отправлен администратору. Он ответит в ближайшее время."
    );
  } catch (error) {
    await ctx.reply("Ошибка при отправке вопроса");
    return;
  }
}

bot.use(createConversation(sendQuestion));
bot.command("question", async (ctx) => {
  await ctx.conversation.enter("sendQuestion");
});

async function checkMessage(requests, msgID, ctx, conversation) {
  for (let element of requests) {
    if (msgID.msg?.text == element.id) {
      ctx.reply("Напишите ответ на вопрос");
      const answer = await conversation.wait();
      bot.api.sendMessage(element.from, answer.msg.text);
      return true;
    }
  }
  return false;
}

async function answer(conversation, ctx) {
  if (checkID(ctx)) {
    await ctx.reply("Вы не администратор");
    return;
  }
  await ctx.reply("Введите айди вопроса");
  const msgID = await conversation.wait();
  if (isNan(msgID)) {
    await ctx.reply("Это не номер вопроса. Введите команду заново");
    return;
  }
  let requests = JSON.parse(getRequests().toString());

  if (!checkMessage(requests, msgID, ctx, conversation)) {
    await ctx.reply("Вопрос не найден. Введите команду заново");
  }
}

bot.use(createConversation(answer));
bot.command("answer", async (ctx) => {
  await ctx.conversation.enter("answer");
});

function validatePhoneNumber(input) {
  const regex = /^[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{3}[-\s\.]?[0-9]{4,6}$/;
  return regex.test(input);
}

async function sendForm(conversation, ctx) {
  await ctx.reply("Введите ваше ФИО");
  const name = await conversation.wait();

  await ctx.reply("Введите ваш номер телефона");
  const number = await conversation.wait();
  if (!validatePhoneNumber(number.msg.text)) {
    await ctx.reply("Номер телефона не верен. Введите команду заново");
    return;
  }

  await ctx.reply("Введите время к примеру");
  const time = await conversation.wait();
  try {
    await bot.api.sendMessage(
      groupID,
      `Новая заявка от <b><a href="tg://user?id=${ctx.msg.from.id}">${ctx.msg.from.first_name}</a></b>
    ФИО: ${name.msg.text}
    Номер телефона: ${number.msg.text}
    Время: ${time.msg.text}`,
      {
        parse_mode: "HTML",
      }
    );
    await ctx.reply("Ваша заявка успешно отправлена");
  } catch (error) {
    await ctx.reply("Ошибка");
  }
}

bot.use(createConversation(sendForm));
bot.command("form", async (ctx) => {
  await ctx.conversation.enter("sendForm");
});

async function mailing(conversation, ctx) {
  if (checkID(ctx)) {
    await ctx.reply("Вы не администратор");
    return;
  }
  await ctx.reply("Введите текст для рассылки. Возможна отправка изображения");
  let json = JSON.parse(getJSON("users"));
  const message = await conversation.wait();

  if (message.msg?.photo && message.msg?.caption) {
    const file = await ctx.api.getFile(
      message.update.message.photo[message.update.message.photo.length - 1]
        .file_id
    );
    try {
      if (file.getUrl !== "download") {
        json.forEach((element) => {
          bot.api.sendPhoto(element, file.file_id).then(() => {
            bot.api.sendMessage(element, message.msg.caption);
          });
        });
      }
    } catch (error) {
      await ctx.reply("Ошибка");
      return;
    }
  } else if (message.msg?.text) {
    json.forEach((element) => {
      bot.api.sendMessage(element, message.msg.text);
    });
  }
}

bot.use(createConversation(mailing));
bot.command("mailing", async (ctx) => {
  await ctx.conversation.enter("mailing");
});

bot.on("message", async (ctx) => {
  await ctx.reply("Введите команду");
});

bot.api.setMyCommands([
  { command: "start", description: "Начать" },
  { command: "help", description: "Ответы на популярные вопросы" },
  { command: "form", description: "Отправить заявку" },
  { command: "question", description: "Задать вопрос" },
  {
    command: "answer",
    description: "Ответить на вопрос по id (для администратора)",
  },
  {
    command: "create_question",
    description: "Создать новый вопрос (для администратора)",
  },
  {
    command: "change_question",
    description: "Редактирование вопросов (для администратора)",
  },
  {
    command: "mailing",
    description: "Массовая рассылка (для администратора)",
  },
]);
bot.catch((err) => {
  const ctx = err.ctx;
  console.error(`Ошибка при обработке обновления ${ctx.update.update_id}:`);
  const e = err.error;

  if (e instanceof GrammyError) {
    console.error("Ошибка при запросе:", e.description);
  } else if (e instanceof HttpError) {
    console.error("Не могу связаться с Телеграм:", e);
  } else {
    console.error("Неизвестная ошибка:", e);
  }
});
bot.start();
