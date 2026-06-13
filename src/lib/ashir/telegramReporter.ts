/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import axios from "axios";
import { Signal, Position } from "./types";
import { format } from "date-fns";

export class TelegramReporter {
  private token: string;
  private chatId: string;
  private on: boolean;
  public signalCount = 0;
  private startTime = new Date();

  constructor(token: string, chatId: string) {
    this.token = token;
    this.chatId = chatId;
    this.on = !!(token && chatId);
  }

  async send(text: string) {
    if (!this.on) {
      console.log(`[TG] ${text.slice(0, 200)}`);
      return false;
    }
    try {
      await axios.post(`https://api.telegram.org/bot${this.token}/sendMessage`, {
        chat_id: this.chatId,
        text: text.slice(0, 4000),
        parse_mode: "HTML",
      });
      return true;
    } catch (e) {
      return false;
    }
  }

  private _contract(s: string): string {
    const c: Record<string, string> = {
      "BTC": "bitcoin (native)",
      "ETH": "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
      "BNB": "0xB8c77482e45F1F44dE1745F52C74426C631bDD52",
      "SOL": "So11111111111111111111111111111111111111112",
      "XRP": "0x1D2F0dA169ceB9fC7B3144628dB156f3F6c60dBE",
      "ADA": "0x3EE2200Efb3400fAbB9AacF31297cBdD1d435D47",
      "DOGE": "0xBA2aE424d960c26247Dd6c32edC70B295c744C43",
      "DOT": "0x7083609fCE4d1d8Dc0C979AAb8c869Ea2C873402",
      "LINK": "0x514910771AF9Ca656af840dff83E8264EcF986CA",
      "UNI": "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984",
      "MATIC": "0x7D1AfA7B718fb893dB30A3aBc0Cfc608AaCfeBB0",
      "ARB": "0xB50721BCf8d664c30412Cfbc6cf7a15145234ad1",
      "OP": "0x4200000000000000000000000000000000000042",
      "PEPE": "0x6982508145454Ce325dDbE47a25d4ec3d2311933",
      "SHIB": "0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE",
      "AVAX": "0x1CE0c2827e2eF14D5C4f29a091d735A204794041",
      "TRX": "0x50327c6c5a14DCaDE707ABad2E27eB517df87AB5",
      "GALA": "0x15D4c048F83bd7e37d49eA4C83a07267Ec4203dA",
      "SAND": "0x3845badAde8e6dFF049820680d1F14bD3903a5d0"
    };
    return c[s.toUpperCase()] || "جستجو: CoinMarketCap";
  }

  async sendSignal(sig: Signal, risk: any) {
    this.signalCount++;
    const s = sig.symbol;
    const a = sig.action;
    const emoji = a === "buy" ? "🟢" : "🔴";
    const actionText = a === "buy" ? "خرید (LONG)" : "فروش (SHORT)";
    const confidence = sig.confidence;
    const stars = confidence >= 0.85 ? "⭐⭐⭐" : confidence >= 0.75 ? "⭐⭐" : "⭐";
    const score = sig.score;

    // Dynamic regime-aware Power Text to guarantee logical consistency with market conditions
    let powerText = "";
    if (sig.regime === "extreme") {
      if (confidence >= 0.90) powerText = "💎 بسیار سنگین — ⚠️ ریسک فوق‌العاده بالا به دلیل طوفان مارکت";
      else if (confidence >= 0.85) powerText = "💎 سنگین — ⚠️ نوسان شدید، فقط فله‌ای با کل سرمایه وارد نشو! پله‌ای و بسیار سبک";
      else if (confidence >= 0.75) powerText = "🔥 محکم — ⚠️ در فاز قرمز مارکت، ورود با حجم بسیار ناچیز";
      else if (confidence >= 0.65) powerText = "📊 متوسط — ⚠️ ریسک بالا، اکیداً پیشنهاد می‌شود نظاره‌گر باشی";
      else powerText = "⚡ ضعیف — ❌ مطلقاً وارد نشو! بیرون ماندن بهترین سود است";
    } else if (sig.regime === "high") {
      if (confidence >= 0.90) powerText = "💎 بسیار سنگین — نوسان بالاست، با رعایت دقیق حد ضرر وارد شو";
      else if (confidence >= 0.85) powerText = "💎 سنگین — فاز پرنوسان، مدیریت ریسک و ورود با حجم سبک‌تر";
      else if (confidence >= 0.75) powerText = "🔥 محکم — ورود منطقی با حجم متناسب نوسان";
      else if (confidence >= 0.65) powerText = "📊 متوسط — با احتیاط بالا در مارکت پرنوسان";
      else powerText = "⚡ ضعیف — اسکن شرایط نامناسب، یه نگاه دیگه بنداز";
    } else {
      // Normal or favorable steady regimes
      if (confidence >= 0.90) powerText = "💎 بسیار سنگین — ورود مطمئن";
      else if (confidence >= 0.85) powerText = "💎 سنگین — با خیال راحت وارد شو";
      else if (confidence >= 0.75) powerText = "🔥 محکم — ورود منطقی";
      else if (confidence >= 0.65) powerText = "📊 متوسط — با احتیاط";
      else powerText = "⚡ ضعیف — یه نگاه دیگه بنداز";
    }

    const p = sig.price;
    const sl = sig.stop_loss || 0;
    const tp1 = sig.take_profit || 0;
    const tp2 = sig.take_profit_2 || 0;

    const slp = sl > 0 ? Math.abs(p - sl) / p * 100 : 0;
    const tp1p = tp1 > 0 ? Math.abs(tp1 - p) / p * 100 : 0;
    const tp2p = tp2 > 0 ? Math.abs(tp2 - p) / p * 100 : 0;

    const ps = risk.position_size;
    const pp = (risk.fraction || 0) * 100;
    const ml = ps * slp / 100;
    const pr1 = ps * tp1p / 100;
    const pr2 = ps * tp2p / 100;
    const rr = slp > 0 ? tp1p / slp : 0;

    // Regime Fa
    const regimeFa: Record<string, string> = {
      "trending_up": "📈 صعودی — بازار میره بالا",
      "trending_down": "📉 نزولی — بازار میریزه",
      "ranging": "↔️ رنج — تو جا میزنه",
      "volatile": "🌪 طوفانی — نوسان زیاده",
      "low": "🟢 آروم — نوسان کمه",
      "normal": "🟡 معمولی — شرایط عادی",
      "high": "🟠 پرحجم — نوسان بالا",
      "extreme": "🔴 خطرناک — بهتره بیرون بمونی"
    };
    const reg_fa = regimeFa[sig.regime] || sig.regime;

    const dv = sig.daily_vol * 100;
    const vs = sig.vol_surge;
    const vm = sig.vol_surge_msg || "";
    const vol_text = vs ? `🔥 <b>حجم:</b> ${vm}\n   پول هوشمند ۲ روزه داره وارد میشه — سیگنال قویتر` : "📊 <b>حجم:</b> عادی — افزایش متوالی نداره";

    // Threshold explanation
    const dt = sig.dynamic_threshold || 0.80;
    const thresholdFa: Record<string, string> = { "0.7": "آروم (low)", "0.75": "عادی (normal)", "0.8": "پیشفرض", "0.85": "پرنوسان (high)", "0.9": "طوفانی (extreme)" };
    const threshold_fa = thresholdFa[dt.toString()] || dt.toFixed(2);
    const threshold_msg = `📏 <b>آستانه امروز:</b> ${dt.toFixed(2)} (وضعیت نوسانی: ${threshold_fa}) — ${dt < 0.80 ? 'پایینتر از حد نرمال، سیگنال راحتتر صادر میشه' : dt > 0.80 ? 'بالاتر از حد نرمال، فقط سیگنالهای قوی رد میشن' : 'حد نرمال'}`;

    const sub = sig.sub_signals || {};

    const of_sig = sub.orderflow?.signal || "neutral";
    const of_score = sub.orderflow?.score || 0.5;
    const oft = of_sig === "buy" ? "🟢 خریدارا قویترن — صف خرید سنگینه" : of_sig === "sell" ? "🔴 فروشندهها غالبن — صف فروش شلوغه" : "⚪ تعادل — خریدار و فروشنده برابرن";

    const vr_reason = sub.vol_regime?.reason || "";
    const vr_score = sub.vol_regime?.score || 0.5;
    const vrt = vr_reason.includes("Oversold") ? "🟢 اشباع فروش — برگشت میزنه" : vr_reason.includes("Overbought") ? "🔴 اشباع خرید — اصلاح میکنه" : vr_reason.includes("Momentum") ? "🚀 شتاب داره" : "⚪ عادی";

    const l_reason = sub.liquidity?.reason || "";
    const l_score = sub.liquidity?.score || 0.5;
    const lt = l_reason.toLowerCase().includes("above yesterday high") ? "🟢 سقف دیروز شکست — حد ضرر فروشندهها خورده شد" : l_reason.toLowerCase().includes("below yesterday low") ? "🔴 کف دیروز شکست — حد ضرر خریدارا خورده شد" : "⚪ خبری نیست";

    const f_reason = sub.funding?.reason || "";
    const f_score = sub.funding?.score || 0.5;
    const ft = f_reason.includes("Pump without volume") || f_reason.includes("Dump without volume") ? "⚠️ حرکت بیحجم — فیکه" : f_reason.includes("Strong pump") ? "🟢 پامپ با حجم — واقعیه" : f_reason.includes("Strong dump") ? "🔴 دامپ با حجم — واقعیه" : "⚪ عادی";

    const c_reason = sub.correlation?.reason || "";
    const c_score = sub.correlation?.score || 0.5;
    const ct = c_reason.toLowerCase().includes("lagging") ? "🟢 عقب مونده از BTC — به زودی رشد" : c_reason.toLowerCase().includes("will follow") ? "🔴 هنوز نریخته — به زودی میریزه" : "⚪ همبستگی عادی";

    const t_reason = sub.time_sniper?.reason || "";
    const t_score = sub.time_sniper?.score || 0.5;
    const tt = t_reason.includes("Stop hunt") && t_reason.includes("BUY") ? "🟢 شکار حد ضرر صعودی" : t_reason.includes("Stop hunt") && t_reason.includes("SELL") ? "🔴 شکار حد ضرر نزولی" : t_reason.includes("Breakout") ? "🚀 شکست واقعی" : "⚪ خارج ساعت کلیدی";

    const i_msg = sub.iceberg?.message || "";
    const i_score = sub.iceberg?.score || 0.5;
    const it = i_msg.toLowerCase().includes("buy") ? "🟢 نهنگ مخفیانه میخره — Iceberg buy" : i_msg.toLowerCase().includes("sell") ? "🔴 نهنگ مخفیانه میفروشه — Iceberg sell" : "⚪ پیدا نشد";

    const p_msg = sub.pain_point?.message || "";
    const p_score = sub.pain_point?.score || 0.5;
    const pnt = p_msg ? `📍 ${p_msg}` : "⚪ نقطه خاصی نیست";

    const d_msg = sub.divergence?.message || "";
    const d_score = sub.divergence?.score || 0.5;
    const dtxt = d_msg.toLowerCase().includes("bullish") ? "🟢 واگرایی مثبت — پول هوشمند میخره" : d_msg.toLowerCase().includes("bearish") ? "🔴 واگرایی منفی — پول هوشمند میفروشه" : "⚪ همجهت";

    const cg = sig.correlation_group || "نامشخص";
    const cw = risk.correlation_warning || "";
    const con = this._contract(s);
    const mlk = sig.market_link || `https://www.xt.com/trade/${s.toLowerCase()}_usdt`;
    const tv = sig.tradingview_link || `https://www.tradingview.com/symbols/${s}USDT`;
    const srch = sig.search_link || `https://www.google.com/search?q=${s}+coin`;

    const fmt = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    
    // Formatter to display prices with exactly 4 decimal places (preserving higher precision for microscopic Satoshi coins)
    const fmtPrice = (v: number) => {
      if (!v) return "0.0000";
      if (v < 0.0001) return v.toFixed(8);
      return v.toFixed(4);
    };

    const msg = `
${emoji} <b>#${s}/USDT | ${actionText}</b> ${stars}
━━━━━━━━━━━━━━━━━━━━━━━━━━
💰 <b>قیمت ورود:</b> <code>$${fmtPrice(p)}</code>
🎯 <b>حد سودها (TP):</b>
  ├ <b>تارگت ۱ (۵۰٪ خروج):</b> <code>$${fmtPrice(tp1)}</code> (+${tp1p.toFixed(2)}%)
  └ <b>تارگت ۲ (کامل):</b> <code>$${fmtPrice(tp2)}</code> (+${tp2p.toFixed(2)}%)
🔴 <b>حد ضرر (SL):</b> <code>$${fmtPrice(sl)}</code> (-${slp.toFixed(2)}%)
⚡ <b>اهرم هوشمند:</b> <code>${sig.leverage || 20}x</code> (انتخاب هوشمند بر اساس حجم و مومنتوم)
⚖️ <b>ریسک به ریوارد:</b> <code>1:${rr.toFixed(2)}</code>

🛡️ <b>مدیریت سرمایه:</b> ورود با <code>$${fmt(ps)}</code> (${pp.toFixed(1)}٪ کل دارایی)
🧠 <b>تحلیل SMC:</b> <code>${sig.veto_reason || "تاییدیه براساس شکست ساختار CHoCH و تست موفق زون FVG."}</code>

🔗 <a href='${mlk}'>ترید در XT</a> | <a href='${tv}'>تریدینگ‌ویو</a>
━━━━━━━━━━━━━━━━━━━━━━━━━━
🐉 <b>سامانه هوشمند اشیر ۴.۰</b> | ⏰ ${format(new Date(), 'HH:mm:ss')} | #سیگنال_${this.signalCount}
`;
    return this.send(msg.trim());
  }

  async sendSummary(orders: Position[], capital: number, scanned: number, totalMarket: number) {
    const bc = orders.filter(o => o.action === "buy").length;
    const sc = orders.filter(o => o.action === "sell").length;
    const ex = orders.reduce((s, o) => s + o.position_value, 0);
    
    // Uptime calculation (str(datetime.now() - self.start_time).split(".")[0])
    const diffMs = new Date().getTime() - this.startTime.getTime();
    const totalSecs = Math.floor(diffMs / 1000);
    const hrs = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    const ut = `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    
    const fmt = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const ratio = capital > 0 ? (ex / capital * 100) : 0;

    let msg = `📊 <b>گزارش اسکن</b>
━━━━━━━━━━━━━━━━
🔍 ${scanned} از ${totalMarket} ارز | ⏱ ${ut}
💰 سرمایه: <b>$${fmt(capital)}</b>
📈 پوزیشن: ${orders.length} (🟢${bc} 🔴${sc})
💎 درگیری: <b>$${fmt(ex)}</b> (${ratio.toFixed(1)}٪)
`;
    orders.forEach(o => {
      msg += `  ${o.action === "buy" ? "🟢" : "🔴"} ${o.symbol}: $${fmt(o.position_value)}\n`;
    });
    msg += `━━━━━━━━━━━━━━━━\n🐉 Ashir 4.0 | ${format(new Date(), "HH:mm:ss")}`;
    return this.send(msg.trim());
  }

  async sendWelcome() {
    const msg = `
⚡️ <b>ربات کورتکس اشیر ۴.۰ فعال شد!</b>
━━━━━━━━━━━━━━━━━━━━
🔮 <b>بیدارباش هوش مالی بازار</b>

🏦 <b>صرافی:</b> XT Exchange
🔍 <b>ظرفیت اسکن:</b> ۱۳۰۰+ جفت‌ارز در ۳۰ ثانیه
🧬 <b>استراتژی فعال:</b> Cortex Hyper-Strict Elite Scalper

📊 <b>هسته تحلیلی و فناوری‌ها:</b>
• شکار اوردربوک مخفی (Iceberg/OFI/Pressure)
• گپ‌های لیکوئیدیتی و نقاط درد مارکت (Pain Points)
• تحلیل واگرایی، آنتروپی و جذب نقدینگی (CVD/VAI)
• پیش‌بینی نوسانات آماری GARCH(1,1)
• هوش مصنوعی چندلایه Random Forest ML (یادگیری ۲۴ ساعته)
• مدیریت همبستگی چارت‌ها (Correlation Manager)
• مدیریت بهینه پورتفوی با فرمول Kelly Dynamic

📉 <b>آستانه حساسیت داینامیک:</b>
🟢 آرام: ۰.۷۰ | 🟡 عادی: ۰.۷۴ | 🟠 نوسانی: ۰.۷۸ | 🔴 طوفانی: ۰.۸۲

⚠️ <i>تحلیل هوشمند بازار آغاز شد...</i>
⏰ ${format(new Date(), 'yyyy-MM-dd HH:mm')}
━━━━━━━━━━━━━━━━━━━━
`;
    return this.send(msg.trim());
  }
}
