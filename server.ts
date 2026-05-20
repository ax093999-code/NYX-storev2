import express from "express";
import { Telegraf } from "telegraf";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Mock DB for products
interface Product {
  id: string;
  title: string;
  price: number;
  description: string;
  stock: number;
  downloadLink?: string;
  imageUrl?: string;
  icon?: string;
}

let products: Product[] = [
  {
    id: "1",
    title: "دليل التصميم الاحترافي",
    price: 15,
    stock: 10,
    description: "دليل شامل بصيغة PDF لتعلم التصميم في 30 يوم.",
    downloadLink: "https://example.com/downloads/design-guide.pdf",
    icon: "📚",
  },
  {
    id: "2",
    title: "اشتراك مجموعة VIP",
    price: 50,
    stock: 3,
    description: "وصول لمجموعة التليجرام الخاصة لمدة شهر.",
    downloadLink: "https://t.me/+AbCdEfGhIjKl",
    icon: "💎",
  },
];

const clients = new Set<(event: string, data: any) => void>();

function checkStock(product: Product) {
  if (product.stock <= settings.lowStockThreshold) {
    clients.forEach((c) => c("low_stock", product));
  }
}

interface AppSettings {
  lowStockThreshold: number;
  paymentMethods: string[];
  maintenanceMode: boolean;
}
let settings: AppSettings = {
  lowStockThreshold: 2,
  paymentMethods: [process.env.BYBIT_VISA_CARD || "Bybit: XXXX-XXXX-XXXX-XXXX"],
  maintenanceMode: false,
};

interface Order {
  id: string;
  userId: number;
  username?: string;
  productId?: string;
  status: "pending" | "approved" | "rejected";
  photoUrl?: string;
  timestamp: number;
  type?: "product" | "wallet";
  amount?: number;
}
let orders: Order[] = [];
const pendingPayments = new Map<number, string>();
const pendingCustomCharge = new Set<number>();
interface User {
  id: number;
  name: string;
  username?: string;
  balance: number;
  referrals: number;
  referredBy?: number;
}

const users: User[] = [];

// --------------------------------------------
// Telegram Bot Config
// --------------------------------------------
const botToken = process.env.TELEGRAM_BOT_TOKEN;
const bybitVisaCard = process.env.BYBIT_VISA_CARD || "XXXX-XXXX-XXXX-XXXX";
const adminChatId = process.env.ADMIN_CHAT_ID;

let ai: GoogleGenAI | null = null;
if (process.env.GEMINI_API_KEY) {
  ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

let bot: Telegraf | null = null;
if (botToken) {
  bot = new Telegraf(botToken);
}

// --------------------------------------------
// API Routes (Frontend Dashboard)
// --------------------------------------------
app.get("/api/settings", (req, res) => {
  res.json(settings);
});

app.post("/api/settings", (req, res) => {
  if (req.body.lowStockThreshold !== undefined) {
    settings.lowStockThreshold = parseInt(req.body.lowStockThreshold, 10);
  }
  if (req.body.paymentMethods) {
    settings.paymentMethods = req.body.paymentMethods;
  }
  if (req.body.maintenanceMode !== undefined) {
    settings.maintenanceMode = req.body.maintenanceMode;
  }
  res.json(settings);
});

app.get("/api/users", (req, res) => {
  res.json(users);
});

app.post("/api/users/:id/balance", (req, res) => {
  const userId = parseInt(req.params.id);
  const amount = parseFloat(req.body.amount);
  let user = users.find((u) => u.id === userId);

  if (!user) {
    user = { id: userId, name: "مستخدم " + userId, balance: 0, referrals: 0 };
    users.push(user);
    if (bot) {
      bot.telegram
        .getChat(userId)
        .then((chat) => {
          if ("first_name" in chat) {
            user!.name = chat.first_name || user!.name;
            clients.forEach((c) => c("user_updated", user));
          }
        })
        .catch(() => {});
    }
  }

  user.balance += amount;
  if (bot) {
    bot.telegram
      .sendMessage(
        user.id,
        `💰 إشعار إداري:\nتم تعديل رصيد محفظتك بمقدار *$${amount}*.\n\nالرصيد الحالي: *$${user.balance.toFixed(2)}*`,
        { parse_mode: "Markdown" },
      )
      .catch(console.error);
  }
  clients.forEach((c) => c("user_updated", user));
  res.json(user);
});

app.get("/api/orders", (req, res) => {
  const enrichedOrders = orders.map((o) => ({
    ...o,
    product: products.find((p) => p.id === o.productId),
  }));
  res.json(enrichedOrders);
});

app.post("/api/orders/:id/approve", async (req, res) => {
  const order = orders.find((o) => o.id === req.params.id);
  if (!order || order.status !== "pending")
    return res.status(400).send("Invalid order");

  order.status = "approved";

  if (order.type === "wallet" && order.amount) {
    const user = users.find((u) => u.id === order.userId);
    if (user) {
      user.balance += order.amount;
      clients.forEach((c) => c("user_updated", user));
      if (bot) {
        bot.telegram
          .sendMessage(
            user.id,
            `✅ تم استلام تحويلك بنجاح وشحن محفظتك بمبلغ *$${order.amount.toFixed(2)}*.\nالرصيد الحالي: *$${user.balance.toFixed(2)}*`,
            { parse_mode: "Markdown" },
          )
          .catch(console.error);
      }
    }
    clients.forEach((c) => c("order_updated", order));
    return res.json({ success: true });
  }

  const product = products.find((p) => p.id === order.productId);
  if (!product) return res.status(400).send("Product missing");

  product.stock -= 1;

  checkStock(product);

  if (product.stock <= settings.lowStockThreshold) {
    if (adminChatId && bot) {
      bot.telegram
        .sendMessage(
          adminChatId,
          `⚠️ تنبيه من المخزون: المنتج "${product.title}" أوشك على النفاد. المتبقي: ${product.stock} نسخ فقط.`,
        )
        .catch(console.error);
    }
  }

  if (bot) {
    try {
      await bot.telegram.sendMessage(
        order.userId,
        `✅ مبروك! تم تأكيد الدفع لطلب "${product.title}".\n\nإليك رابط التحميل/الوصول الخاص بك:\n${product.downloadLink || "[رابط التحميل غير متوفر]"}\n\nنشكرك على ثقتك بـ متجرنا!`,
      );
    } catch (e) {
      console.error("Failed to notify user", e);
    }
  }
  res.json({ success: true });
});

app.post("/api/orders/:id/reject", async (req, res) => {
  const order = orders.find((o) => o.id === req.params.id);
  if (!order || order.status !== "pending")
    return res.status(400).send("Invalid order");

  order.status = "rejected";

  if (bot) {
    try {
      if (order.type === "wallet") {
        await bot.telegram.sendMessage(
          order.userId,
          `❌ عذراً، لم نتمكن من تأكيد التحويل لشحن المحفظة. الرجاء المحاولة مرة أخرى أو التواصل مع الدعم.`,
        );
      } else {
        const product = products.find((p) => p.id === order.productId);
        await bot.telegram.sendMessage(
          order.userId,
          `❌ عذراً، تم مراجعة إيصال الدفع لطلب "${product?.title || "المنتج"}" ولم نتمكن من تأكيد التحويل. الرجاء المحاولة مرة أخرى أو التواصل مع الدعم.`,
        );
      }
    } catch (e) {
      console.error("Failed to notify user", e);
    }
  }
  res.json({ success: true });
});

app.get("/api/products", (req, res) => {
  res.json(products);
});

app.post("/api/products", (req, res) => {
  const newProduct: Product = {
    id: Date.now().toString(),
    title: req.body.title,
    price: parseFloat(req.body.price),
    stock: parseInt(req.body.stock) || 0,
    description: req.body.description,
    downloadLink: req.body.downloadLink || "",
    imageUrl: req.body.imageUrl || "",
    icon: req.body.icon || "",
  };
  products.push(newProduct);
  res.json(newProduct);
});

app.delete("/api/products/:id", (req, res) => {
  products = products.filter((p) => p.id !== req.params.id);
  res.sendStatus(200);
});

app.put("/api/products/:id", (req, res) => {
  const index = products.findIndex((p) => p.id === req.params.id);
  if (index !== -1) {
    products[index] = { ...products[index], ...req.body };
    checkStock(products[index]);
    res.json(products[index]);
  } else {
    res.status(404).send("Not found");
  }
});

app.get("/api/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const sendEvent = (event: string, data: any) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  clients.add(sendEvent);
  req.on("close", () => {
    clients.delete(sendEvent);
  });
});

app.get("/api/status", (req, res) => {
  res.json({
    telegramConfigured: !!process.env.TELEGRAM_BOT_TOKEN,
    paymentConfigured: !!process.env.BYBIT_VISA_CARD,
  });
});

// --------------------------------------------
// Telegram Bot Setup
// --------------------------------------------
// Bot is initialized above
if (bot) {
  const getMainMenu = (
    userId: number,
    name: string,
    totalUsers: number,
    balance: number,
    botUsername?: string,
  ) => {
    const refLink = botUsername
      ? `https://t.me/${botUsername}?start=ref_${userId}`
      : "";
    const refText = refLink ? `\n🔗 رابط الدعوة الخاص بك:\n\`${refLink}\`` : "";
    return {
      text: `✨ *مرحباً بك يا* [${name}](tg://user?id=${userId}) *في Nyx Store* ✨\n\n🔹 *معلومات الحساب:*\n🆔 الأيدي: \`${userId}\`\n💰 الرصيد المتاح: *$${balance.toFixed(2)}*${refText}\n\n👇 *يرجى اختيار ما تود القيام به من القائمة أدناه:*`,
      opts: {
        parse_mode: "Markdown" as const,
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "🛒 عرض المنتجات المتاحة",
                callback_data: "menu_products",
              },
            ],
            [
              { text: "🛍️ تاريخ مشترياتي", callback_data: "menu_orders" },
              { text: "👤 الملف الشخصي", callback_data: "menu_profile" },
            ],
            [
              {
                text: "🎁 نظام الإحالة (تحت الصيانة)",
                callback_data: "menu_maintenance_alert",
              },
              {
                text: "💳 شحن الرصيد (تحت الصيانة)",
                callback_data: "menu_maintenance_alert",
              },
            ],
            [{ text: "🌐 تغيير اللغة - English", callback_data: "menu_lang" }],
            [{ text: "👨‍💻 الدعم الفني والتواصل", url: "https://t.me/Nyx_0v" }],
          ],
        },
      },
    };
  };

  bot.use(async (ctx, next) => {
    if (settings.maintenanceMode) {
      if (ctx.from?.id && String(ctx.from.id) === adminChatId) {
        return next();
      }
      if (ctx.callbackQuery) {
        return ctx.answerCbQuery(
          "⚠️ المتجر حالياً تحت الصيانة. يرجى المحاولة لاحقاً.",
          { show_alert: true },
        );
      }
      return ctx.reply(
        "⚠️ *عذراً، المتجر حالياً في وضع الصيانة.*\n\nنحن نقوم ببعض التحديثات وسنعود في أقرب وقت ممكن. يرجى المحاولة لاحقاً.",
        { parse_mode: "Markdown" },
      );
    }
    return next();
  });

  bot.start(async (ctx) => {
    const userId = ctx.from.id;
    const name = ctx.from.first_name || "مستخدم";
    const payload = ctx.payload;

    let user = users.find((u) => u.id === userId);
    if (!user) {
      user = { id: userId, name, balance: 0, referrals: 0 };
      if (payload && payload.startsWith("ref_")) {
        const referrerId = parseInt(payload.split("_")[1]);
        if (referrerId && referrerId !== userId) {
          const referrer = users.find((u) => u.id === referrerId);
          if (referrer) {
            referrer.referrals += 1;
            referrer.balance += 1; // Reward $1 per referral
            user.referredBy = referrerId;
            try {
              bot?.telegram.sendMessage(
                referrerId,
                `🎉 مبروك! قام شخص جديد بالتسجيل عبر رابط الإحالة الخاص بك.\n+تم إضافة 1.00$ إلى رصيدك!`,
              );
            } catch (e) {
              console.error("Failed to notify referrer", e);
            }
          }
        }
      }
      users.push(user);
    }
    const botInfo = await bot.telegram.getMe();
    const menu = getMainMenu(
      userId,
      name,
      2900 + users.length,
      user.balance,
      botInfo.username,
    );

    await ctx.reply("يتم تجهيز القائمة الرئيسية 👇...", {
      reply_markup: {
        keyboard: [
          [{ text: "🛒 عرض المنتجات" }],
          [{ text: "🛍️ مشترياتي" }, { text: "💳 شحن الرصيد" }],
          [{ text: "📞 تواصل مع الدعم" }, { text: "🎁 نظام الإحالة" }],
          [{ text: "📊 حالة المتجر" }],
        ],
        resize_keyboard: true,
      },
    });

    ctx.reply(menu.text, menu.opts);
  });

  bot.command("admin", (ctx) => {
    if (String(ctx.from.id) !== adminChatId) return;

    const text =
      `👨‍💻 *لوحة أوامر الإدارة السريعة:*\n\n` +
      `/status - معرفة حالة البوت والإحصائيات السريعة\n` +
      `/maintenance - تفعيل/إلغاء وضع الصيانة بالبوت\n` +
      `\nيمكنك أيضاً التحكم الكامل بالمتجر (إضافة منتجات، إدارة المستخدمين، مراجعة الطلبات) من خلال لوحة التحكم الخاصة بك على الويب.`;

    ctx.reply(text, { parse_mode: "Markdown" });
  });

  bot.command("status", (ctx) => {
    if (String(ctx.from.id) !== adminChatId) return;
    const pendingOrders = orders.filter((o) => o.status === "pending").length;
    const activeProducts = products.filter((p) => p.stock > 0).length;

    ctx.reply(
      `📊 *إحصائيات البوت السريعة:*\n\nالمستخدمين: ${users.length}\nالطلبات المعلقة: ${pendingOrders}\nالمنتجات النشطة: ${activeProducts}`,
      { parse_mode: "Markdown" },
    );
  });

  bot.command("maintenance", (ctx) => {
    if (String(ctx.from.id) !== adminChatId) return;
    settings.maintenanceMode = !settings.maintenanceMode;
    ctx.reply(
      `تم ${settings.maintenanceMode ? "تفعيل 🔴" : "إلغاء 🟢"} وضع الصيانة بنجاح.`,
    );
  });

  bot.command("help_admin", (ctx) => {
    if (String(ctx.from.id) !== adminChatId) return;
    const msg =
      `👑 *قائمة أوامر الإدارة:*\n\n` +
      `/admin - عرض لوحة تحكم الإدارة وقبول/رفض الطلبات\n` +
      `/status - عرض حالة المتجر وإحصائيات سريعة\n` +
      `/maintenance - تفعيل/إلغاء وضع الصيانة بالمتجر\n` +
      `/products - عرض المنتجات المتاحة كعميل\n\n` +
      `💡 *تعديل رصيد المستخدمين:* لإضافة أو إزالة رصيد لأي مستخدم بشكل مباشر، اذهب إلى لوحة التحكم على الموقع قسم *العملاء*، وهناك ستتمكن من تعديل الرصيد يدوياً باستخدام الـ Telegram ID الخاص بهم.`;
    ctx.reply(msg, { parse_mode: "Markdown" });
  });

  const sendProducts = async (ctx: any) => {
    if (products.length === 0) {
      if (ctx.callbackQuery) {
        return ctx.answerCbQuery("عذراً، لا توجد منتجات متاحة حالياً.", {
          show_alert: true,
        });
      }
      return ctx.reply("عذراً، لا توجد منتجات متاحة حالياً.");
    }

    const keyboard = products.map((p, i) => {
      const icon = p.icon || ["📚", "💎", "🎮", "🔑"][i % 4];
      const stockStatus = p.stock > 0 ? `📦 ${p.stock}` : `🔴 غير متوفر`;
      const btnText = `${icon} ${p.title} | $${p.price} | ${stockStatus}`;
      return [{ text: btnText, callback_data: `view_${p.id}` }];
    });

    keyboard.push([
      { text: "🔄 تحديث القائمة", callback_data: "menu_products" },
    ]);

    try {
      if (ctx.callbackQuery && ctx.callbackQuery.message) {
        await ctx.deleteMessage();
      }
    } catch (e) {}

    await ctx.reply(
      "🛒 *المنتجات المتاحة في المتجر:*\nيرجى اختيار المنتج لعرض التفاصيل والنقر للشراء:",
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: keyboard,
        },
      },
    );

    if (ctx.callbackQuery) ctx.answerCbQuery();
  };

  bot.action(/^view_(.+)$/, async (ctx) => {
    const productId = ctx.match[1];
    const product = products.find((p) => p.id === productId);

    if (!product) {
      return ctx.answerCbQuery("⚠️ المنتج غير موجود أو تم حذفه.", {
        show_alert: true,
      });
    }

    // Build keyboard for view
    const keyboard = [];
    if (product.stock > 0) {
      keyboard.push([
        { text: "شراء الآن 🛒", callback_data: `buy_${product.id}` },
      ]);
    } else {
      keyboard.push([
        { text: "🔴 غير متوفر حالياً", callback_data: "out_of_stock_alert" },
      ]);
    }
    keyboard.push([
      { text: "🔙 العودة للقائمة", callback_data: "menu_products" },
    ]);

    const icon = product.icon || "📦";
    const text = `${icon} *المنتج:* ${product.title}\n💰 *السعر:* $${product.price}\n📊 *المخزون المتوفر:* ${product.stock > 0 ? product.stock + " نسخة" : "نفدت الكمية 🔴"}\n\n📝 *الوصف:*\n${product.description}`;

    try {
      if (ctx.callbackQuery && ctx.callbackQuery.message) {
        await ctx.deleteMessage();
      }
    } catch (e) {}

    try {
      if (product.imageUrl) {
        let photoSource: any = product.imageUrl;
        if (product.imageUrl.startsWith("data:image/")) {
          const base64Data = product.imageUrl.replace(
            /^data:image\/\w+;base64,/,
            "",
          );
          photoSource = { source: Buffer.from(base64Data, "base64") };
        }
        await ctx.replyWithPhoto(photoSource, {
          caption: text,
          parse_mode: "Markdown",
          reply_markup: { inline_keyboard: keyboard },
        });
      } else {
        await ctx.reply(text, {
          parse_mode: "Markdown",
          reply_markup: { inline_keyboard: keyboard },
        });
      }
    } catch (e) {
      await ctx.reply(text, {
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: keyboard },
      });
    }

    ctx.answerCbQuery();
  });

  bot.action("out_of_stock_alert", (ctx) => {
    ctx.answerCbQuery(
      "⚠️ عذراً، هذا المنتج غير متوفر في المخزون حالياً. يرجى المحاولة لاحقاً.",
      { show_alert: true },
    );
  });

  bot.command("products", sendProducts);
  bot.action("menu_products", sendProducts);
  bot.hears("🛒 عرض المنتجات المتاحة", sendProducts);
  bot.hears("🛒 عرض المنتجات", sendProducts);

  const showOrders = async (ctx: any) => {
    const userOrders = orders.filter(
      (o) => o.userId === ctx.from.id && o.status === "approved",
    );
    if (userOrders.length === 0) {
      const msg = 'لم تقم بأي عمليات شراء سابقة. تصفح "المنتجات" للبدء!';
      if (ctx.callbackQuery) {
        ctx.answerCbQuery();
        return ctx.reply(msg);
      }
      return ctx.reply(msg);
    }

    const msg = userOrders
      .map((o) => {
        const p = products.find((prod) => prod.id === o.productId);
        return `🔹 *${p?.title || "منتج"}*\nالرابط: ${p?.downloadLink || "غير متوفر"}`;
      })
      .join("\n\n");

    await ctx.reply(`🛍️ مشترياتك السابقة:\n\n${msg}`, {
      parse_mode: "Markdown",
    });
    if (ctx.callbackQuery) ctx.answerCbQuery();
  };

  bot.action("menu_orders", showOrders);
  bot.hears("🛍️ تاريخ مشترياتي", showOrders);
  bot.hears("🛍️ مشترياتي", showOrders);

  bot.action("menu_referrals", async (ctx) => {
    const userId = ctx.from?.id;
    const user = users.find((u) => u.id === userId);
    if (!user) return ctx.answerCbQuery();

    // Get bot username dynamically if possible or use a fallback
    const botInfo = await bot.telegram.getMe();
    const refLink = `https://t.me/${botInfo.username}?start=ref_${userId}`;

    const text = `👥 *نظام الإحالات*\n\nاربح 1.00$ عن كل شخص يقوم بالدخول للمتجر عن طريق رابطك!\n\n🔗 رابط الدعوة الخاص بك:\n\`${refLink}\`\n\n📊 إحصائياتك:\n- عدد المدعوين: ${user.referrals}\n- الأرباح من الإحالات: ${(user.referrals * 1).toFixed(2)}$`;

    await ctx.reply(text, { parse_mode: "Markdown" });
    ctx.answerCbQuery();
  });

  bot.action("menu_profile", (ctx) => {
    const userId = ctx.from?.id;
    const user = users.find((u) => u.id === userId);
    if (!user) return ctx.answerCbQuery();

    const text = `👤 *الملف الشخصي*\n\nالاسم: ${user.name}\nالأيدي: \`${user.id}\`\nالرصيد: ${user.balance.toFixed(2)}$\nالمدعوين: ${user.referrals}`;
    ctx.reply(text, { parse_mode: "Markdown" });
    ctx.answerCbQuery();
  });

  bot.action("menu_lang", (ctx) => {
    ctx.answerCbQuery("Language switched to English (Demo / قيد التطوير)", {
      show_alert: true,
    });
  });

  bot.action("menu_maintenance_alert", (ctx) => {
    ctx.answerCbQuery(
      "⚠️ هذه الميزة تحت التطوير والصيانة حالياً. ستتوفر قريباً!",
      { show_alert: true },
    );
  });

  bot.hears("📞 تواصل مع الدعم", (ctx) => {
    ctx.reply("للتواصل مع الدعم الفني، يرجى مراسلة: @Nyx_0v");
  });

  bot.hears("💳 شحن الرصيد", (ctx) => {
    const keyboard = [
      [
        { text: "$1", callback_data: "charge_1" },
        { text: "$5", callback_data: "charge_5" },
        { text: "$10", callback_data: "charge_10" },
      ],
      [
        { text: "$20", callback_data: "charge_20" },
        { text: "$50", callback_data: "charge_50" },
        { text: "$100", callback_data: "charge_100" },
      ],
      [{ text: "مبلغ مخصص ✍️", callback_data: "custom_charge" }],
    ];
    ctx.reply(
      "💳 *شحن الرصيد*\nالرصيد يتم شحنه بمعدل (1 دولار = 1 رصيد).\nالحد الأدنى للشحن هو $1.\nاختر المبلغ الذي تود إضافته لمحفظتك:",
      {
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: keyboard },
      },
    );
  });

  bot.action("custom_charge", async (ctx) => {
    pendingCustomCharge.add(ctx.from.id);
    await ctx.reply(
      "✍️ الرجاء كتابة المبلغ الذي تود شحنه (بأرقام إنجليزية، ومثلاً: 15):",
    );
    ctx.answerCbQuery();
  });

  bot.action(/^charge_([\d.]+)$/, async (ctx) => {
    const amount = Number(ctx.match[1]);
    const paymentInfo = settings.paymentMethods.join("\n💳 ");

    try {
      if (ctx.callbackQuery && ctx.callbackQuery.message) {
        await ctx.deleteMessage();
      }
    } catch (e) {}

    await ctx.reply(
      `لشحن محفظتك بقيمة *$${amount}*\nيرجى تحويل المبلغ إلى إحدى طرق الدفع التالية:\n\n💳 ${paymentInfo}\n\nبعد إتمام التحويل، اضغط على زر التاكيد بالأسفل.`,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "تم التحويل ✅",
                callback_data: `confirm_charge_${amount}`,
              },
            ],
          ],
        },
      },
    );
    ctx.answerCbQuery();
  });

  bot.action(/^confirm_charge_([\d.]+)$/, async (ctx) => {
    const amount = Number(ctx.match[1]);
    pendingPayments.set(ctx.from.id, `wallet:${amount}`);

    await ctx
      .editMessageText(
        `حسناً، يرجى الآن تصوير الشاشة (Screenshot) لعملية التحويل وإرسال الصورة هنا للتحقق منها وإضافة *$${amount}* لمحفظتك.`,
        {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [{ text: "إلغاء الأمر ❌", callback_data: "cancel_payment" }],
            ],
          },
        },
      )
      .catch(() => {});
    ctx.answerCbQuery();
  });

  bot.hears("🎁 نظام الإحالة", (ctx) => {
    ctx.reply("⚠️ نظام الإحالة تحت التطوير والصيانة حالياً. ستتوفر قريباً!");
  });

  bot.hears("📊 حالة المتجر", (ctx) => {
    const activeProducts = products.filter((p) => p.stock > 0).length;
    ctx.reply(
      `📊 *حالة المتجر الحالية:*\n\n🟢 البوت يعمل بشكل ممتاز\n📦 عدد المنتجات المتاحة: ${activeProducts}\n⚙️ نظام المراجعة التلقائي: نشط`,
      { parse_mode: "Markdown" },
    );
  });

  bot.action(/^buy_(.+)$/, async (ctx) => {
    const productId = ctx.match[1];
    const product = products.find((p) => p.id === productId);

    if (!product) return ctx.answerCbQuery("المنتج غير موجود.");
    if (product.stock <= 0)
      return ctx.answerCbQuery("عذراً، نفدت كمية هذا المنتج.", {
        show_alert: true,
      });

    const user = users.find((u) => u.id === ctx.from.id);
    const balance = user?.balance || 0;

    let keyboard = [];
    if (balance >= product.price) {
      keyboard.push([
        {
          text: `💳 خصم من رصيد المحفظة ($${balance.toFixed(2)})`,
          callback_data: `pay_wallet_${product.id}`,
        },
      ]);
    } else {
      keyboard.push([
        {
          text: `💳 رصيدك غير كافٍ. يتوفر ($${balance.toFixed(2)})`,
          callback_data: "charge_wallet_info",
        },
      ]);
    }
    keyboard.push([
      {
        text: "📤 تحويل بنكي / إلكتروني (يدوي)",
        callback_data: `pay_manual_${product.id}`,
      },
    ]);
    keyboard.push([
      { text: "🔙 العودة للتفاصيل", callback_data: `view_${product.id}` },
    ]);

    try {
      if (ctx.callbackQuery && ctx.callbackQuery.message) {
        await ctx.deleteMessage();
      }
    } catch (e) {}

    await ctx.reply(
      `🛒 إتمام الشراء لمنتج: *${product.title}*\n💰 المطلوب: *$${product.price}*\n\nالرجاء اختيار طريقة الدفع المناسبة لك:`,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: keyboard,
        },
      },
    );
    ctx.answerCbQuery();
  });

  bot.action("charge_wallet_info", (ctx) => {
    ctx.answerCbQuery(
      "رصيدك لا يكفي لشراء هذا المنتج. تواصل مع الإدارة لشحن رصيد محفظتك عبر الدعم.",
      { show_alert: true },
    );
  });

  bot.action(/^pay_wallet_(.+)$/, async (ctx) => {
    const productId = ctx.match[1];
    const product = products.find((p) => p.id === productId);
    if (!product || product.stock <= 0)
      return ctx.answerCbQuery("المنتج غير متوفر.", { show_alert: true });

    const user = users.find((u) => u.id === ctx.from.id);
    if (!user || user.balance < product.price) {
      return ctx.answerCbQuery("الرصيد غير كافٍ.", { show_alert: true });
    }

    user.balance -= product.price;
    product.stock = Math.max(0, product.stock - 1);
    checkStock(product);

    const newOrder: Order = {
      id: Date.now().toString(),
      userId: ctx.from.id,
      username: ctx.from.username,
      productId: product.id,
      status: "approved",
      timestamp: Date.now(),
      type: "product",
    };
    orders.push(newOrder);

    clients.forEach((c) => c("order_updated", newOrder));
    clients.forEach((c) => c("user_updated", user));

    try {
      if (ctx.callbackQuery && ctx.callbackQuery.message)
        await ctx.deleteMessage();
    } catch (e) {}

    await ctx.reply(
      `✅ *مبروك!* تم إتمام الشراء بنجاح باستخدام رصيد المحفظة.\n\nتفضل رابط/بيانات المنتج:\n${product.downloadLink || "[ غير متوفر حالياً ]"}\n\nالرصيد المتبقي: $${user.balance.toFixed(2)}`,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: "🔙 العودة للقائمة", callback_data: "menu_products" }],
          ],
        },
      },
    );

    if (adminChatId) {
      bot.telegram
        .sendMessage(
          adminChatId,
          `💰 تم شراء منتج عن طريق المحفظة!\nالمشتري: @${user.username || user.id}\nالمنتج: ${product.title}\nالمبلغ: $${product.price}`,
        )
        .catch(() => {});
    }
    ctx.answerCbQuery();
  });

  bot.action(/^pay_manual_(.+)$/, async (ctx) => {
    const productId = ctx.match[1];
    const product = products.find((p) => p.id === productId);

    if (!product) {
      return ctx.answerCbQuery("المنتج غير موجود.");
    }

    if (product.stock <= 0) {
      return ctx.answerCbQuery("عذراً، نفدت كمية هذا المنتج.", {
        show_alert: true,
      });
    }

    try {
      if (ctx.callbackQuery && ctx.callbackQuery.message) {
        await ctx.deleteMessage();
      }
    } catch (e) {}

    try {
      const paymentInfo = settings.paymentMethods.join("\n💳 ");
      await ctx.reply(
        `لشراء "${product.title}"\nيرجى تحويل مبلغ ${product.price}$ إلى إحدى طرق الدفع التالية:\n\n💳 ${paymentInfo}\n\nبعد إتمام التحويل، اضغط على زر التاكيد بالأسفل.`,
        {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "تم التحويل ✅",
                  callback_data: `confirm_${product.id}`,
                },
              ],
            ],
          },
        },
      );
      ctx.answerCbQuery();
    } catch (e) {
      console.error(e);
      ctx.answerCbQuery("حدث خطأ.");
    }
  });

  bot.action(/^confirm_(.+)$/, async (ctx) => {
    const productId = ctx.match[1];
    const product = products.find((p) => p.id === productId);

    if (!product || product.stock <= 0) {
      return ctx.answerCbQuery("عذراً، هذا المنتج لم يعد متوفراً.", {
        show_alert: true,
      });
    }

    pendingPayments.set(ctx.from.id, productId);

    await ctx.editMessageText(
      `حسناً، يرجى الآن تصوير الشاشة (Screenshot) لعملية التحويل وإرسال الصورة هنا للتحقق منها وإتمام طلب "${product.title}".`,
      {
        reply_markup: {
          inline_keyboard: [],
        },
      },
    );
    ctx.answerCbQuery();
  });

  bot.on("photo", async (ctx) => {
    const userId = ctx.from.id;
    const paymentTarget = pendingPayments.get(userId);

    if (!paymentTarget) {
      // Allow AI to handle standard photo replies if no payment is pending
      return;
    }

    const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;

    try {
      const fileLink = await ctx.telegram.getFileLink(fileId);

      const isWalletCharge = paymentTarget.startsWith("wallet:");
      let amount = 0;
      let productIdStr = paymentTarget;

      if (isWalletCharge) {
        amount = Number(paymentTarget.split(":")[1]);
        productIdStr = undefined as any;
      }

      const newOrder: Order = {
        id: Date.now().toString(),
        userId: userId,
        username: ctx.from.username,
        productId: productIdStr,
        status: "pending",
        photoUrl: fileLink.href,
        timestamp: Date.now(),
        type: isWalletCharge ? "wallet" : "product",
        amount: isWalletCharge ? amount : undefined,
      };
      orders.push(newOrder);
      clients.forEach((c) => c("new_order", newOrder));

      pendingPayments.delete(userId);

      ctx.reply("✅ تم استلام صورة التحويل بنجاح! جاري مراجعتها...");

      let aiApproved = false;
      if (ai) {
        try {
          let expectedPrice = amount;
          if (!isWalletCharge) {
            const product = products.find((p) => p.id === paymentTarget);
            expectedPrice = product?.price || 0;
          }

          const imageRes = await fetch(fileLink.href);
          const arrayBuffer = await imageRes.arrayBuffer();
          const base64EncodeString =
            Buffer.from(arrayBuffer).toString("base64");

          const aiRes = await ai.models.generateContent({
            model: "gemini-3.5-flash",
            contents: {
              parts: [
                {
                  inlineData: {
                    mimeType: "image/jpeg",
                    data: base64EncodeString,
                  },
                },
                {
                  text: `قم بتحليل إيصال الدفع هذا. هل المبلغ المحول يعادل أو يزيد عن ${expectedPrice} دولار وهل عملية التحويل تبدو ناجحة ومكتملة بشكل يبدو مؤكداً للاعتماد التلقائي؟ أجب بدقة بـ "مؤكد" أو "غير مؤكد".`,
                },
              ],
            },
          });

          if (aiRes.text?.trim()?.includes("مؤكد")) {
            aiApproved = true;
          }
        } catch (err) {
          console.error("AI check error", err);
        }
      }

      if (aiApproved) {
        newOrder.status = "approved";
        clients.forEach((c) => c("order_updated", newOrder));
        if (isWalletCharge) {
          const user = users.find((u) => u.id === userId);
          if (user) {
            user.balance += amount;
            clients.forEach((c) => c("user_updated", user));
            await ctx.reply(
              `🎉 لقد تمت الموافقة على التحويل بنجاح من خلال نظام المراجعة الآلي.\n\nتم شحن محفظتك بـ *$${amount}*\nالرصيد الحالي: *$${user.balance.toFixed(2)}*`,
              { parse_mode: "Markdown" },
            );
            if (adminChatId && bot) {
              bot.telegram.sendMessage(
                adminChatId,
                `🤖 تم قبول تلقائي لشحن محفظة بمقدار $${amount} لـ @${ctx.from.username || userId}.`,
              );
            }
          }
        } else {
          const prod = products.find((p) => p.id === paymentTarget);
          if (prod) {
            prod.stock = Math.max(0, prod.stock - 1);
            checkStock(prod);
            await ctx.reply(
              `🎉 لقد تمت الموافقة على التحويل بنجاح من خلال نظام المراجعة الآلي.\n\nتفضل منتجك:\n${prod.downloadLink || "لا يوجد رابط متاح حاليا"}`,
            );
            if (adminChatId && bot) {
              bot.telegram.sendMessage(
                adminChatId,
                `🤖 تم قبول ومراجعة الدفع تلقائياً لطلب ${newOrder.id} من @${ctx.from.username || userId}.`,
              );
            }
          }
        }
      } else {
        await ctx.reply(
          "⏳ لم يتمكن النظام الآلي من التأكد من الإيصال. تم تحويل الطلب للمراجعة اليدوية من قبل الإدارة.",
        );
        if (adminChatId && bot) {
          bot.telegram.sendMessage(
            adminChatId,
            `🔔 التماس دفع جديد بحاجة למراجعة یَدَویَّة من @${ctx.from.username || userId} للطلب: ${isWalletCharge ? "شحن محفظة ($" + amount + ")" : "منتج رقم " + paymentTarget}`,
          );
        }
      }
    } catch (e) {
      console.error(e);
      ctx.reply("حدث خطأ أثناء معالجة الصورة. يرجى المحاولة لاحقاً.");
    }
  });

  bot.on("text", async (ctx) => {
    if (ctx.message.text.startsWith("/")) return;

    if (pendingCustomCharge.has(ctx.from.id)) {
      const amountStr = ctx.message.text;
      const amount = Number(amountStr);
      if (isNaN(amount) || amount < 1) {
        return ctx.reply(
          "❌ الرجاء إدخال رقم صحيح ومبلغ صالح للشحن (أقل مبلغ 1$).",
        );
      }

      pendingCustomCharge.delete(ctx.from.id);

      const paymentInfo = settings.paymentMethods.join("\n💳 ");
      await ctx.reply(
        `لشحن محفظتك بقيمة *$${amount}*\nيرجى تحويل المبلغ إلى إحدى طرق الدفع التالية:\n\n💳 ${paymentInfo}\n\nبعد إتمام التحويل، اضغط على زر التاكيد بالأسفل.`,
        {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "تم التحويل ✅",
                  callback_data: `confirm_charge_${amount}`,
                },
              ],
            ],
          },
        },
      );
      return;
    }

    if (!ai) {
      return ctx.reply(
        "مرحباً بك! يعمل مساعد الذكاء الاصطناعي الخاص بالمتجر عند تفعيل مفتاح API، يرجى التواصل مع الإدارة.",
      );
    }

    try {
      const availableProducts = products.filter((p) => p.stock > 0);
      const productsList = availableProducts
        .map(
          (p) =>
            `- ${p.title} | السعر: $${p.price} | المتوفر: ${p.stock} نسخة | التفاصيل: ${p.description}`,
        )
        .join("\n");

      const systemPrompt = `أنت مساعد ذكي لمتجر رقمي يسمى "Nyx Store" مخصص للعمل داخل بوت تليجرام.
ستتحدث مع العميل بأسلوب لبق، مختصر وودود باللغة العربية.
مهمتك الرئيسية هي مساعدة العميل بالإجابة عن استفساراته حول المتجر والمنتجات المتوفرة.
إذا أراد العميل التواصل مع الدعم الفني أو الإدارة، أخبره أن يتواصل مع الحساب @Nyx_0v.
إذا أراد العميل إتمام عملية الشراء لمنتج ما، وجهه بأن يقوم باختيار أمر "المنتجات 🛒" من القائمة الرئيسية، أو استخدام الأمر /products.

المنتجات المتوفرة والمخزون الحالي:
${productsList || "نفدت جميع المنتجات حالياً. يرجى إخبار العميل بذلك."}`;

      ctx.sendChatAction("typing").catch(() => {});

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: ctx.message.text,
        config: {
          systemInstruction: systemPrompt,
        },
      });

      if (response.text) {
        await ctx.reply(response.text, {
          reply_markup: {
            inline_keyboard: [
              [
                { text: "👍 مفيد", callback_data: "ai_rating_up" },
                { text: "👎 غير مفيد", callback_data: "ai_rating_down" },
                { text: "💬 ترك ملاحظة", callback_data: "ai_feedback" },
              ],
            ],
          },
        });
      }
    } catch (e) {
      console.error("Gemini error:", e);
      // Optional: Inform user about the error or degrade gracefully
      ctx.reply(
        "عذراً، أواجه صعوبة في الاستجابة حالياً. يمكنك استخدام /products لتصفح المنتجات المتوفرة.",
      );
    }
  });

  bot.action("ai_rating_up", async (ctx) => {
    await ctx.answerCbQuery("شكراً لتقييمك! نسعد بخدمتك ♥️", {
      show_alert: true,
    });
    // Remove the keyboard after rating
    try {
      if (ctx.callbackQuery.message) {
        await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
      }
    } catch (e) {}
  });

  bot.action("ai_rating_down", async (ctx) => {
    await ctx.answerCbQuery(
      "نأسف لعدم إفادتك، سنعمل على تحسين استجابات الذكاء الاصطناعي 😔",
      { show_alert: true },
    );
    try {
      if (ctx.callbackQuery.message) {
        await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
      }
    } catch (e) {}
  });

  bot.action("ai_feedback", async (ctx) => {
    await ctx.answerCbQuery(
      "يرجى التواصل مع الدعم @Nyx_0v لترك ملاحظاتك، شكراً لك!",
      { show_alert: true },
    );
  });

  bot
    .launch()
    .then(() => {
      console.log("Telegram bot is running");
    })
    .catch(console.error);

  process.once("SIGINT", () => bot.stop("SIGINT"));
  process.once("SIGTERM", () => bot.stop("SIGTERM"));
} else {
  console.warn("TELEGRAM_BOT_TOKEN is not configured. Bot skipped.");
}

// --------------------------------------------
// Vite Middleware & Start Server
// --------------------------------------------
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Web server listening on port ${PORT}`);
  });
}

startServer();
