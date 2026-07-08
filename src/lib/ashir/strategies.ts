/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { mean, std, sum } from "mathjs";
import { Klines, OrderBook } from "./types";

export class VolRegimeStrategy {
  analyze(closes: number[], returns: number[], regime: string, dailyVol: number) {
    if (regime === "low") {
      const ma = mean(closes.slice(-20)) as unknown as number;
      const s = std(closes.slice(-20)) as unknown as number;
      const zscore = s > 0 ? (closes[closes.length - 1] - ma) / s : 0;
      if (zscore < -1.3) return { score: 0.82, signal: "buy", reason: "Oversold Breakout Zone" };
      if (zscore > 1.3) return { score: 0.18, signal: "sell", reason: "Overbought Breakout Zone" };
      return { score: 0.5, signal: "neutral", reason: "In range" };
    } else if (["normal", "high"].includes(regime)) {
      const momentum = sum(returns.slice(-10)) as number;
      // High-precision momentum breakout trigger
      if (momentum > 0.015) return { score: 0.80, signal: "buy", reason: `Momentum +${(momentum * 100).toFixed(2)}%` };
      if (momentum < -0.015) return { score: 0.20, signal: "sell", reason: `Momentum ${(momentum * 100).toFixed(2)}%` };
      return { score: 0.5, signal: "neutral", reason: "No momentum" };
    } else if (regime === "extreme") {
      // In extreme market volatility, find extreme short-term exhaustion reversals
      const momentum = sum(returns.slice(-5)) as number;
      if (momentum > 0.04) return { score: 0.15, signal: "sell", reason: "Extreme Momentum Exhaustion (SHORT)" };
      if (momentum < -0.04) return { score: 0.85, signal: "buy", reason: "Extreme Momentum Exhaustion (LONG)" };
      return { score: 0.5, signal: "stay_out", reason: "Extreme Volatility Shield" };
    }
    return { score: 0.5, signal: "neutral" };
  }
}

export class LiquidityStrategy {
  analyze(closes: number[], highs: number[], lows: number[]) {
    if (closes.length < 20) return { score: 0.5, signal: "neutral" };
    const yesterdayHigh = highs[highs.length - 2];
    const yesterdayLow = lows[lows.length - 2];
    const current = closes[closes.length - 1];
    let score = 0.5;
    const reasons: string[] = [];
    if (current > yesterdayHigh * 1.002) {
      score = 0.78;
      reasons.push("Above yesterday's high breakout");
    } else if (current < yesterdayLow * 0.998) {
      score = 0.22;
      reasons.push("Below yesterday's low breakdown");
    }
    const signal = score > 0.6 ? "buy" : score < 0.4 ? "sell" : "neutral";
    return { score, signal, reason: reasons.length > 0 ? reasons.join(", ") : "Normal trading range" };
  }
}

export class FundingStrategy {
  analyze(change24h: number, volumeSurge: boolean) {
    // Realistic 24h gainers/losers thresholds
    if (change24h > 10 && !volumeSurge) return { score: 0.25, signal: "sell", reason: "Exhaustion pump without volume" };
    if (change24h < -10 && !volumeSurge) return { score: 0.75, signal: "buy", reason: "Exhaustion dump without volume" };
    if (change24h > 8 && volumeSurge) return { score: 0.82, signal: "buy", reason: "Strong pump with volume surge" };
    if (change24h < -8 && volumeSurge) return { score: 0.18, signal: "sell", reason: "Strong dump with volume surge" };
    return { score: 0.5, signal: "neutral", reason: "Normal volume and action" };
  }
}

export class CorrelationStrategy {
  analyze(symbol: string, btcChange: number, altChange: number) {
    if (symbol.toUpperCase() === "BTC") return { score: 0.5, signal: "neutral", reason: "BTC base correlation" };
    // 1.2% BTC move is substantial in active hours
    if (btcChange > 1.2 && altChange < 0.4 && altChange > -0.4) {
      return { score: 0.80, signal: "buy", reason: `BTC +${btcChange.toFixed(1)}%, high potential lagged catcher` };
    }
    if (btcChange < -1.2 && altChange > -0.4 && altChange < 0.4) {
      return { score: 0.20, signal: "sell", reason: `BTC ${btcChange.toFixed(1)}%, high potential lagged breakdown tracker` };
    }
    return { score: 0.5, signal: "neutral", reason: "Direct pair correlation normal" };
  }
}

export class TimeSniperStrategy {
  private keyTimes: Record<string, number> = { "London Open": 10, "NY Open": 14, "Daily Close": 23 };

  analyze(closes: number[], highs: number[], lows: number[], opens: number[]) {
    if (closes.length < 5) return { score: 0.5, signal: "neutral" };
    const now = new Date();
    const currentHour = now.getUTCHours();
    let nearKey = false;
    let timeName = "";
    for (const [name, hour] of Object.entries(this.keyTimes)) {
      if (Math.abs(currentHour - hour) <= 1) {
        nearKey = true;
        timeName = name;
        break;
      }
    }
    if (!nearKey) return { score: 0.5, signal: "neutral", reason: "Not key time" };

    const last = closes.length - 1;
    const body = Math.abs(closes[last] - opens[last]);
    const upperShadow = highs[last] - Math.max(closes[last], opens[last]);
    const lowerShadow = Math.min(closes[last], opens[last]) - lows[last];
    const totalRange = highs[last] - lows[last];
    const shadowRatio = totalRange > 0 ? (upperShadow + lowerShadow) / totalRange : 0.5;
    const bodyRatio = totalRange > 0 ? body / totalRange : 0.5;

    if (shadowRatio > 0.7 && bodyRatio < 0.3) {
      if (closes[last] > opens[last] && lowerShadow > upperShadow) {
        return { score: 0.85, signal: "buy", reason: `Stop hunt at ${timeName} — BUY` };
      } else if (closes[last] < opens[last] && upperShadow > lowerShadow) {
        return { score: 0.15, signal: "sell", reason: `Stop hunt at ${timeName} — SELL` };
      }
    } else if (bodyRatio > 0.6 && shadowRatio < 0.3) {
      if (closes[last] > opens[last]) return { score: 0.8, signal: "buy", reason: `Breakout at ${timeName} — BUY` };
      return { score: 0.2, signal: "sell", reason: `Breakout at ${timeName} — SELL` };
    }
    return { score: 0.5, signal: "neutral", reason: "No clear pattern" };
  }
}

/**
 * AdvancedConfluenceScalper
 * =========================
 * یک موتور تصمیم‌گیری چندعاملی (Multi-Factor Confluence Engine) برای اسکالپ
 * روی کندل‌های ۱۵ دقیقه. به‌جای یک قانون ساده، ۷ عامل مستقل و معتبر تحلیل
 * تکنیکال را با وزن‌دهی جمع می‌کند و فقط زمانی سیگنال صادر می‌شود که
 * هم‌گرایی (confluence) قوی بین این عوامل وجود داشته باشد.
 *
 * عوامل و وزن‌ها (جمع = ۱.۰):
 *  1) روند تایم‌فریم بالاتر (HTF Trend, ۱ ساعته از تجمیع کندل‌های ۱۵ دقیقه) — وزن 0.20
 *  2) ساختار EMA چندگانه (20/50/100) + شیب — وزن 0.15
 *  3) مومنتوم MACD (12,26,9) — وزن 0.15
 *  4) موقعیت نسبت به VWAP و باندهای آن — وزن 0.10
 *  5) جریان سفارشات/اردربوک (OFI + Pressure Ratio) — وزن 0.15
 *  6) تایید حجم نسبی (Relative Volume) — وزن 0.10
 *  7) ساختار بازار / شکار نقدینگی (Liquidity Sweep بر روی سقف/کف اخیر) — وزن 0.15
 *
 * فیلترهای پیش‌نیاز (Gate، نه امتیازی):
 *  - فیلتر نوسان نسبی با ATR (رد بازارهای راکد/فوق‌پرنوسان)
 *  - فیلتر Bollinger Squeeze (در فشردگی شدید، ورود نمی‌شود — منتظر شکست)
 *
 * خروجی نهایی score در بازه‌ی [0.05 , 0.95] است که در signalEngine برای
 * تعیین action، confidence و لوریج استفاده می‌شود.
 */
export class AdvancedConfluenceScalper {
  private ema(values: number[], period: number): number[] {
    const out: number[] = [];
    if (values.length === 0) return out;
    const k = 2 / (period + 1);
    let cur = values[0];
    out.push(cur);
    for (let i = 1; i < values.length; i++) {
      cur = (values[i] - cur) * k + cur;
      out.push(cur);
    }
    return out;
  }

  private rsi(closes: number[], period = 14): number {
    if (closes.length < period + 1) return 50;
    let gains = 0, losses = 0;
    for (let i = closes.length - period; i < closes.length; i++) {
      const d = closes[i] - closes[i - 1];
      if (d > 0) gains += d; else losses -= d;
    }
    if (losses === 0) return gains === 0 ? 50 : 100;
    const rs = gains / losses;
    return 100 - 100 / (1 + rs);
  }

  private atr(high: number[], low: number[], close: number[], period = 14): number {
    const len = close.length;
    if (len < period + 1) return 0;
    let trSum = 0;
    for (let i = len - period; i < len; i++) {
      trSum += Math.max(
        high[i] - low[i],
        Math.abs(high[i] - close[i - 1]),
        Math.abs(low[i] - close[i - 1])
      );
    }
    return trSum / period;
  }

  private macd(closes: number[]): { macdLine: number; signalLine: number; hist: number; prevHist: number } {
    const ema12 = this.ema(closes, 12);
    const ema26 = this.ema(closes, 26);
    const len = closes.length;
    const macdSeries: number[] = [];
    for (let i = 0; i < len; i++) macdSeries.push(ema12[i] - ema26[i]);
    const signalSeries = this.ema(macdSeries, 9);
    const hist = macdSeries[len - 1] - signalSeries[len - 1];
    const prevHist = len > 1 ? macdSeries[len - 2] - signalSeries[len - 2] : hist;
    return { macdLine: macdSeries[len - 1], signalLine: signalSeries[len - 1], hist, prevHist };
  }

  private bollinger(closes: number[], period = 20, mult = 2): { upper: number; lower: number; mid: number; width: number; avgWidth: number } {
    const len = closes.length;
    const slice = closes.slice(-period);
    const mid = slice.reduce((a, b) => a + b, 0) / period;
    const variance = slice.reduce((a, b) => a + Math.pow(b - mid, 2), 0) / period;
    const sd = Math.sqrt(variance);
    const upper = mid + mult * sd;
    const lower = mid - mult * sd;
    const width = (upper - lower) / mid;

    // میانگین پهنای باند در ۵۰ کندل اخیر برای تشخیص فشردگی (squeeze)
    const widths: number[] = [];
    const lookback = Math.min(50, len - period);
    for (let i = 0; i < lookback; i++) {
      const s = closes.slice(len - period - i, len - i);
      const m = s.reduce((a, b) => a + b, 0) / period;
      const v = s.reduce((a, b) => a + Math.pow(b - m, 2), 0) / period;
      widths.push((2 * mult * Math.sqrt(v)) / (m || 1));
    }
    const avgWidth = widths.length ? widths.reduce((a, b) => a + b, 0) / widths.length : width;
    return { upper, lower, mid, width, avgWidth };
  }

  private vwap(high: number[], low: number[], close: number[], volume: number[], lookback = 48): { vwap: number; upper: number; lower: number } {
    const len = close.length;
    const offset = Math.max(0, len - lookback);
    let num = 0, den = 0;
    for (let i = offset; i < len; i++) {
      const tp = (high[i] + low[i] + close[i]) / 3;
      num += tp * volume[i];
      den += volume[i];
    }
    const vw = den > 0 ? num / den : close[len - 1];
    let varSum = 0;
    for (let i = offset; i < len; i++) varSum += Math.pow(close[i] - vw, 2);
    const sd = Math.sqrt(varSum / (len - offset)) || 0.000001;
    return { vwap: vw, upper: vw + 1.5 * sd, lower: vw - 1.5 * sd };
  }

  /** تجمیع کندل‌های ۱۵ دقیقه به کندل‌های ۱ ساعته (هر ۴ کندل) برای تشخیص روند تایم‌فریم بالاتر */
  private resampleHTF(klines: Klines, groupSize = 4): number[] {
    const { close } = klines;
    const len = close.length;
    const htfCloses: number[] = [];
    for (let i = len % groupSize; i + groupSize <= len; i += groupSize) {
      htfCloses.push(close[i + groupSize - 1]); // close of the last candle in the group
    }
    return htfCloses;
  }

  /** شناسایی شکار نقدینگی (Liquidity Sweep): شکست کوتاه سقف/کف اخیر و برگشت قیمت به داخل محدوده */
  private liquiditySweep(high: number[], low: number[], close: number[], open: number[]): number {
    const len = close.length;
    if (len < 12) return 0;

    const lookback = 10;
    const priorHigh = Math.max(...high.slice(len - lookback - 1, len - 1));
    const priorLow = Math.min(...low.slice(len - lookback - 1, len - 1));

    const curHigh = high[len - 1];
    const curLow = low[len - 1];
    const curClose = close[len - 1];
    const curOpen = open[len - 1];

    // Bullish sweep: کندل فعلی زیر کف قبلی رفته اما بسته شدن بالای آن و کندل صعودی است
    if (curLow < priorLow && curClose > priorLow && curClose > curOpen) {
      return 1; // سیگنال صعودی
    }
    // Bearish sweep: کندل فعلی بالای سقف قبلی رفته اما بسته شدن زیر آن و کندل نزولی است
    if (curHigh > priorHigh && curClose < priorHigh && curClose < curOpen) {
      return -1; // سیگنال نزولی
    }
    return 0;
  }

  private orderbookMetrics(orderbook: OrderBook | null, imbalanceField?: number): { pressureRatio: number; ofi: number } {
    if (orderbook && orderbook.bids.length > 0 && orderbook.asks.length > 0) {
      const bidVol = orderbook.bids.slice(0, 10).reduce((s, b) => s + b[1], 0);
      const askVol = orderbook.asks.slice(0, 10).reduce((s, a) => s + a[1], 0);
      const pressureRatio = bidVol / (askVol || 1);

      let bidNotional = 0, askNotional = 0;
      const limit = Math.min(10, orderbook.bids.length, orderbook.asks.length);
      for (let i = 0; i < limit; i++) {
        bidNotional += orderbook.bids[i][0] * orderbook.bids[i][1];
        askNotional += orderbook.asks[i][0] * orderbook.asks[i][1];
      }
      const total = bidNotional + askNotional;
      const ofi = total > 0 ? (bidNotional - askNotional) / total : 0;
      return { pressureRatio, ofi };
    }
    const imb = imbalanceField || 0;
    const pressureRatio = imb >= 0 ? 1 + imb * 1.5 : 1 / (1 - imb * 1.5);
    return { pressureRatio, ofi: imb };
  }

  /**
   * @param klines کندل‌های ۱۵ دقیقه (حداقل ۱۰۰ کندل لازم است برای دقت کافی)
   * @param orderbook اوردربوک لحظه‌ای (اختیاری)
   * @param imbalanceField عدد جانشین در صورت نبود اوردربوک
   */
  analyze(
    klines: Klines,
    orderbook: OrderBook | null,
    imbalanceField?: number
  ): { signal: "buy" | "sell" | "neutral"; score: number; details?: any } {
    const { high, low, close, open, volume } = klines;
    const len = close.length;
    if (len < 100) return { signal: "neutral", score: 0.5, details: { reason: "داده‌ی کافی برای تحلیل چندعاملی موجود نیست (حداقل ۱۰۰ کندل لازم است)." } };

    const currentClose = close[len - 1];

    // ---------- فیلترهای پیش‌نیاز (Gate) ----------
    const atrVal = this.atr(high, low, close, 14);
    const relativeATR = atrVal / currentClose;
    if (relativeATR < 0.0012 || relativeATR > 0.06) {
      return { signal: "neutral", score: 0.5, details: { reason: `نوسان نسبی (${(relativeATR * 100).toFixed(2)}%) خارج از محدوده‌ی سالم برای اسکالپ است.` } };
    }

    const bb = this.bollinger(close, 20, 2);
    const isSqueeze = bb.width < bb.avgWidth * 0.65;
    if (isSqueeze) {
      return { signal: "neutral", score: 0.5, details: { reason: "بازار در فشردگی باندهای بولینگر (Squeeze) است؛ منتظر شکست برای ورود." } };
    }

    // ---------- عامل ۱: روند تایم‌فریم بالاتر (HTF) ----------
    const htfCloses = this.resampleHTF(klines, 4); // 15m * 4 = 1h
    let htfScore = 0;
    if (htfCloses.length >= 20) {
      const htfEma20 = this.ema(htfCloses, 20);
      const htfEma50Period = Math.min(50, Math.floor(htfCloses.length * 0.8));
      const htfEma50 = this.ema(htfCloses, htfEma50Period);
      const e20 = htfEma20[htfEma20.length - 1];
      const e50 = htfEma50[htfEma50.length - 1];
      const slopeLb = Math.min(5, htfEma50.length - 1);
      const e50Prev = htfEma50[htfEma50.length - 1 - slopeLb];
      if (e20 > e50 && e50 > e50Prev) htfScore = 1;
      else if (e20 < e50 && e50 < e50Prev) htfScore = -1;
      else htfScore = (e20 - e50) / (e50 || 1) > 0 ? 0.3 : -0.3;
    }

    // ---------- عامل ۲: ساختار EMA چندگانه (15m) ----------
    const ema20s = this.ema(close, 20);
    const ema50s = this.ema(close, 50);
    const ema100Period = Math.min(100, Math.floor(len * 0.9));
    const ema100s = this.ema(close, ema100Period);
    const ema20 = ema20s[ema20s.length - 1];
    const ema50 = ema50s[ema50s.length - 1];
    const ema100 = ema100s[ema100s.length - 1];
    const slopeLb2 = Math.min(10, ema100s.length - 1);
    const ema100Prev = ema100s[ema100s.length - 1 - slopeLb2];

    let emaScore = 0;
    if (ema20 > ema50 && ema50 > ema100 && ema100 > ema100Prev) emaScore = 1;
    else if (ema20 < ema50 && ema50 < ema100 && ema100 < ema100Prev) emaScore = -1;
    else {
      const spread = (ema20 - ema50) / (ema50 || 1);
      emaScore = Math.max(-1, Math.min(1, spread * 20));
    }

    // ---------- عامل ۳: مومنتوم MACD ----------
    const { hist, prevHist } = this.macd(close);
    const macdAccel = hist - prevHist;
    let macdScore = 0;
    if (hist > 0 && macdAccel > 0) macdScore = 1;
    else if (hist > 0 && macdAccel <= 0) macdScore = 0.3;
    else if (hist < 0 && macdAccel < 0) macdScore = -1;
    else if (hist < 0 && macdAccel >= 0) macdScore = -0.3;

    // ---------- عامل ۴: موقعیت نسبت به VWAP ----------
    const vw = this.vwap(high, low, close, volume, 48);
    let vwapScore = 0;
    if (currentClose > vw.vwap) {
      vwapScore = currentClose > vw.upper ? 0.5 : 1; // خیلی دور از VWAP کمی کم‌اعتبارتر است (ریسک اصلاح)
    } else if (currentClose < vw.vwap) {
      vwapScore = currentClose < vw.lower ? -0.5 : -1;
    }

    // ---------- عامل ۵: جریان سفارشات / اردربوک ----------
    const { pressureRatio, ofi } = this.orderbookMetrics(orderbook, imbalanceField);
    let obScore = 0;
    obScore += Math.max(-1, Math.min(1, (pressureRatio - 1) * 0.8)); // pressureRatio حول 1
    obScore += Math.max(-1, Math.min(1, ofi * 2));
    obScore = Math.max(-1, Math.min(1, obScore / 2));

    // ---------- عامل ۶: حجم نسبی ----------
    const avgVol = volume.slice(-20).reduce((s, v) => s + v, 0) / 20 || 1;
    const relativeVolume = volume[len - 1] / avgVol;
    // حجم بالا، سیگنال جهتِ کندل را تقویت می‌کند
    const candleDirection = close[len - 1] > open[len - 1] ? 1 : close[len - 1] < open[len - 1] ? -1 : 0;
    let volScore = 0;
    if (relativeVolume >= 1.0) {
      volScore = candleDirection * Math.min(1, (relativeVolume - 1) * 1.5);
    }

    // ---------- عامل ۷: ساختار بازار / شکار نقدینگی ----------
    const sweepScore = this.liquiditySweep(high, low, close, open);

    // ---------- جمع‌بندی وزنی ----------
    const weights = {
      htf: 0.20,
      ema: 0.15,
      macd: 0.15,
      vwap: 0.10,
      ob: 0.15,
      vol: 0.10,
      sweep: 0.15,
    };

    const combined =
      htfScore * weights.htf +
      emaScore * weights.ema +
      macdScore * weights.macd +
      vwapScore * weights.vwap +
      obScore * weights.ob +
      volScore * weights.vol +
      sweepScore * weights.sweep;

    const rsi = this.rsi(close, 14);

    // فیلتر RSI: از ورود در نقاط اشباع شدید در همان جهت سیگنال جلوگیری می‌کند
    let rsiPenalty = 0;
    if (combined > 0 && rsi > 78) rsiPenalty = -0.15;
    if (combined < 0 && rsi < 22) rsiPenalty = 0.15;

    const finalCombined = Math.max(-1, Math.min(1, combined + rsiPenalty));
    const score = Math.max(0.05, Math.min(0.95, 0.5 + finalCombined * 0.45));

    const factorBreakdown = {
      htfTrend: htfScore,
      emaStructure: emaScore,
      macdMomentum: macdScore,
      vwapPosition: vwapScore,
      orderFlow: obScore,
      relativeVolume: volScore,
      liquiditySweep: sweepScore,
      rsi,
      pressureRatio,
      ofi,
      relativeATR,
      combined: finalCombined,
    };

    const BUY_THRESHOLD = 0.35;
    const SELL_THRESHOLD = -0.35;

    if (finalCombined >= BUY_THRESHOLD) {
      const reason = `همگرایی چندعاملی خرید (Confluence Score: +${(finalCombined * 100).toFixed(0)}٪):
• روند تایم‌فریم بالاتر (۱ساعته): ${htfScore > 0 ? "صعودی" : htfScore < 0 ? "نزولی" : "خنثی"}
• ساختار EMA (20/50/100): ${emaScore > 0 ? "صعودی هم‌راستا" : emaScore < 0 ? "نزولی هم‌راستا" : "مخلوط"}
• مومنتوم MACD: ${hist > 0 ? "هیستوگرام مثبت" : "هیستوگرام منفی"} (شتاب ${macdAccel >= 0 ? "+" : ""}${macdAccel.toFixed(5)})
• موقعیت نسبت به VWAP: قیمت ${currentClose > vw.vwap ? "بالای" : "زیر"} VWAP (${vw.vwap.toFixed(4)})
• فشار اردربوک: نسبت ${pressureRatio.toFixed(2)}، OFI=${(ofi * 100).toFixed(1)}٪
• حجم نسبی: ${relativeVolume.toFixed(2)}x
• ساختار بازار: ${sweepScore > 0 ? "شکار نقدینگی صعودی شناسایی شد (Bullish Liquidity Sweep)" : sweepScore < 0 ? "هشدار شکار نقدینگی نزولی" : "بدون سیگنال خاص"}
• RSI(14)=${rsi.toFixed(1)}`;

      return {
        signal: "buy",
        score,
        details: { pattern: "Advanced Confluence (LONG)", reason, factors: factorBreakdown }
      };
    }

    if (finalCombined <= SELL_THRESHOLD) {
      const reason = `همگرایی چندعاملی فروش (Confluence Score: ${(finalCombined * 100).toFixed(0)}٪):
• روند تایم‌فریم بالاتر (۱ساعته): ${htfScore > 0 ? "صعودی" : htfScore < 0 ? "نزولی" : "خنثی"}
• ساختار EMA (20/50/100): ${emaScore > 0 ? "صعودی هم‌راستا" : emaScore < 0 ? "نزولی هم‌راستا" : "مخلوط"}
• مومنتوم MACD: ${hist > 0 ? "هیستوگرام مثبت" : "هیستوگرام منفی"} (شتاب ${macdAccel >= 0 ? "+" : ""}${macdAccel.toFixed(5)})
• موقعیت نسبت به VWAP: قیمت ${currentClose > vw.vwap ? "بالای" : "زیر"} VWAP (${vw.vwap.toFixed(4)})
• فشار اردربوک: نسبت ${pressureRatio.toFixed(2)}، OFI=${(ofi * 100).toFixed(1)}٪
• حجم نسبی: ${relativeVolume.toFixed(2)}x
• ساختار بازار: ${sweepScore < 0 ? "شکار نقدینگی نزولی شناسایی شد (Bearish Liquidity Sweep)" : sweepScore > 0 ? "هشدار شکار نقدینگی صعودی" : "بدون سیگنال خاص"}
• RSI(14)=${rsi.toFixed(1)}`;

      return {
        signal: "sell",
        score,
        details: { pattern: "Advanced Confluence (SHORT)", reason, factors: factorBreakdown }
      };
    }

    return {
      signal: "neutral",
      score: 0.5,
      details: {
        reason: `همگرایی کافی برای ورود وجود ندارد (Confluence Score: ${(finalCombined * 100).toFixed(0)}٪، حد آستانه ±۳۵٪).`,
        factors: factorBreakdown
      }
    };
  }
}

/**
 * MicroScalpStrategy - استراتژی اسکالپ بسیار سریع
 *
 * هدف: شناسایی فرصت‌های ورود کوتاه‌مدت (چند دقیقه) بر اساس:
 *  ۱) کراس EMA سریع/کند (EMA5 / EMA13) برای تشخیص شروع حرکت لحظه‌ای
 *  ۲) مومنتوم RSI کوتاه‌مدت (RSI7) برای فیلتر تله‌های اشباع خرید/فروش
 *  ۳) شکست رنج کوچک اخیر (Micro Range Breakout) برای تایید نقطه ورود دقیق
 *  ۴) فشار آنی اردربوک (در صورت وجود) برای تایید جهت نهایی
 *
 * این استراتژی برای تایم‌فریم‌های پایین (۱ تا ۵ دقیقه) و حرکات سریع طراحی شده
 * و به‌صورت یک "رای" مستقل در کنار سایر استراتژی‌ها عمل می‌کند.
 */
export class MicroScalpStrategy {
  private ema(values: number[], period: number): number[] {
    const out: number[] = [];
    if (values.length === 0) return out;
    const k = 2 / (period + 1);
    let cur = values[0];
    out.push(cur);
    for (let i = 1; i < values.length; i++) {
      cur = (values[i] - cur) * k + cur;
      out.push(cur);
    }
    return out;
  }

  private rsi(closes: number[], period = 7): number {
    if (closes.length < period + 1) return 50;
    let gains = 0, losses = 0;
    for (let i = closes.length - period; i < closes.length; i++) {
      const d = closes[i] - closes[i - 1];
      if (d > 0) gains += d; else losses -= d;
    }
    if (losses === 0) return gains === 0 ? 50 : 100;
    const rs = gains / losses;
    return 100 - 100 / (1 + rs);
  }

  analyze(
    closes: number[],
    highs: number[],
    lows: number[],
    orderbook?: OrderBook | null
  ): { signal: "buy" | "sell" | "neutral"; score: number; reason: string } {
    const len = closes.length;
    if (len < 20) return { signal: "neutral", score: 0.5, reason: "داده‌ی کافی برای اسکالپ موجود نیست (حداقل ۲۰ کندل لازم است)." };

    const emaFast = this.ema(closes, 5);
    const emaSlow = this.ema(closes, 13);
    const fastNow = emaFast[len - 1];
    const fastPrev = emaFast[len - 2];
    const slowNow = emaSlow[len - 1];
    const slowPrev = emaSlow[len - 2];

    const bullCross = fastPrev <= slowPrev && fastNow > slowNow;
    const bearCross = fastPrev >= slowPrev && fastNow < slowNow;
    const bullAligned = fastNow > slowNow;
    const bearAligned = fastNow < slowNow;

    const rsiVal = this.rsi(closes, 7);

    const lookback = 8;
    const recentHigh = Math.max(...highs.slice(len - 1 - lookback, len - 1));
    const recentLow = Math.min(...lows.slice(len - 1 - lookback, len - 1));
    const currentClose = closes[len - 1];
    const breakoutUp = currentClose > recentHigh;
    const breakoutDown = currentClose < recentLow;

    let obSignal: "buy" | "sell" | "neutral" = "neutral";
    if (orderbook && orderbook.bids.length > 0 && orderbook.asks.length > 0) {
      const bidVol = orderbook.bids.slice(0, 5).reduce((s, b) => s + b[1], 0);
      const askVol = orderbook.asks.slice(0, 5).reduce((s, a) => s + a[1], 0);
      const ratio = bidVol / (askVol || 1);
      if (ratio > 1.25) obSignal = "buy";
      else if (ratio < 0.8) obSignal = "sell";
    }

    if ((bullCross || bullAligned) && breakoutUp && rsiVal < 75 && rsiVal > 45 && obSignal !== "sell") {
      const score = Math.min(0.90, 0.70 + (rsiVal - 45) / 100 + (obSignal === "buy" ? 0.05 : 0));
      return {
        signal: "buy",
        score,
        reason: `اسکالپ سریع (LONG): کراس EMA5/13 ${bullCross ? "تازه" : "هم‌راستا"} + شکست سقف ۸ کندل اخیر + RSI(7)=${rsiVal.toFixed(1)} سالم${obSignal === "buy" ? " + فشار خریدار در اردربوک" : ""}.`
      };
    }

    if ((bearCross || bearAligned) && breakoutDown && rsiVal > 25 && rsiVal < 55 && obSignal !== "buy") {
      const score = Math.max(0.10, 0.30 - (55 - rsiVal) / 100 - (obSignal === "sell" ? 0.05 : 0));
      return {
        signal: "sell",
        score,
        reason: `اسکالپ سریع (SHORT): کراس EMA5/13 ${bearCross ? "تازه" : "هم‌راستا"} + شکست کف ۸ کندل اخیر + RSI(7)=${rsiVal.toFixed(1)} سالم${obSignal === "sell" ? " + فشار فروشنده در اردربوک" : ""}.`
      };
    }

    return {
      signal: "neutral",
      score: 0.5,
      reason: "شرایط اسکالپ سریع (کراس EMA + شکست رنج کوچک + مومنتوم سالم) فعلاً برقرار نیست."
    };
  }
}
