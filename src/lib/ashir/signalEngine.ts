/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GARCH11, VolumeAnalyzer, OrderFlowAnalyzer, ATR, RSI } from "./indicators";
import { VolRegimeStrategy, LiquidityStrategy, FundingStrategy, CorrelationStrategy, TimeSniperStrategy, AdvancedConfluenceScalper } from "./strategies";
import { MLOptimizer } from "./mlOptimizer";
import { ShadowHunter, PainPointDetector, DivergenceSniffer } from "./advancedStrategies";
import { Klines, OrderBook, Signal } from "./types";

// 🌐 Deep mathematical EMA calculation
function calculateEMA(prices: number[], periods: number): number[] {
  const ema: number[] = [];
  if (prices.length === 0) return ema;
  const multiplier = 2 / (periods + 1);
  let currentEma = prices[0];
  ema.push(currentEma);
  for (let i = 1; i < prices.length; i++) {
    currentEma = (prices[i] - currentEma) * multiplier + currentEma;
    ema.push(currentEma);
  }
  return ema;
}

// 💧 High-reliability Money Flow Index (MFI) Calculation
function calculateMFI(highs: number[], lows: number[], closes: number[], volumes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  
  const typicalPrices: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    typicalPrices.push((highs[i] + lows[i] + closes[i]) / 3);
  }

  let posFlowSum = 0;
  let negFlowSum = 0;

  const startIdx = closes.length - period;
  for (let i = startIdx; i < closes.length; i++) {
    const tpCurrent = typicalPrices[i];
    const tpPrev = typicalPrices[i - 1];
    const rawMoneyFlow = tpCurrent * volumes[i];

    if (tpCurrent > tpPrev) {
      posFlowSum += rawMoneyFlow;
    } else if (tpCurrent < tpPrev) {
      negFlowSum += rawMoneyFlow;
    }
  }

  if (negFlowSum === 0) return 100;
  const moneyRatio = posFlowSum / negFlowSum;
  return 100 - (100 / (1 + moneyRatio));
}

export class SignalEngine {
  private garch = new GARCH11();
  private orderflow = new OrderFlowAnalyzer();
  private volRegime = new VolRegimeStrategy();
  private liquidity = new LiquidityStrategy();
  private funding = new FundingStrategy();
  private correlation = new CorrelationStrategy();
  private timeSniper = new TimeSniperStrategy();
  private ml = new MLOptimizer();
  private shadowHunter = new ShadowHunter();
  private painDetector = new PainPointDetector();
  private divergenceSniffer = new DivergenceSniffer();
  private confluenceScalper = new AdvancedConfluenceScalper();
  
  public sensitivity: "conservative" | "balanced" | "active" = "conservative";
  public disable9Layers = false;
  // فیلد سازگاری با پنل/سرور قدیمی - دیگر در منطق تحلیل استفاده نمی‌شود.
  public strategy: string = "auto";

  // High Elite-tier threshold to filter out low-probability trades entirely
  public minScore = 0.84;

  private getDynamicThreshold(regime: string): number {
    if (this.sensitivity === "conservative") {
      if (regime === "extreme") return 0.82;
      if (regime === "high") return 0.79;
      if (regime === "normal") return 0.76;
      if (regime === "low") return 0.74;
      return 0.76;
    } else if (this.sensitivity === "active") {
      if (regime === "extreme") return 0.65;
      if (regime === "high") return 0.62;
      if (regime === "normal") return 0.59;
      if (regime === "low") return 0.57;
      return 0.59;
    } else { // balanced
      if (regime === "extreme") return 0.72;
      if (regime === "high") return 0.69;
      if (regime === "normal") return 0.67;
      if (regime === "low") return 0.64;
      return 0.67;
    }
  }

  async analyze(symbol: string, klines: Klines, orderbook: OrderBook | null, change24h = 0, btcChange = 0, livePrice = 0): Promise<Signal | null> {
    const closes = klines.close;
    const highs = klines.high;
    const lows = klines.low;
    const opens = klines.open;
    const volumes = klines.volume;

    // Reject assets without sufficient footprint
    if (closes.length < 50) return null;

    const currentPrice = livePrice > 0 ? livePrice : closes[closes.length - 1];

    // ==========================================
    // 📊 BASE CALCULATION MATRICES
    // ==========================================

    // 1. Multi-Timeframe EMA Trend Convergence
    const ema9 = calculateEMA(closes, 9);
    const ema21 = calculateEMA(closes, 21);
    const ema50 = calculateEMA(closes, 50);
    const latestEma9 = ema9[ema9.length - 1];
    const latestEma21 = ema21[ema21.length - 1];
    const latestEma50 = ema50[ema50.length - 1];
    const prevEma50 = ema50.length > 5 ? ema50[ema50.length - 6] : ema50[0];
    const ema50SlopePositive = latestEma50 > prevEma50;

    // 2. High-Precision RSI Momentum Guard
    const rsiVal = RSI.calculate(closes, 14);

    // 3. Money Flow Index Capital Flow Influx
    const mfiVal = calculateMFI(highs, lows, closes, volumes, 14);

    // 4. Volume Surge Analytics (Trailing 24 hours)
    const trailingVolumeMA = volumes.slice(-24).reduce((sum, v) => sum + v, 0) / 24;
    const latestVolume = volumes[volumes.length - 1];
    const volumeSurgeRatio = trailingVolumeMA > 0 ? latestVolume / trailingVolumeMA : 1.0;

    // 5. GARCH statistical volatility
    const returns: number[] = [];
    for (let i = 1; i < closes.length; i++) {
      returns.push(Math.log(closes[i] / closes[i - 1]));
    }
    this.garch.fit(returns);
    const volMetrics = this.garch.getMetrics();
    const volSurgeResult = VolumeAnalyzer.detectVolumeSurge(volumes);

    // 6. Order Book Imbalance Assessment
    let orderflowScore = 0.5;
    let orderflowSignal = "neutral";
    let imbalance = 0;
    if (orderbook) {
      const ofResult = this.orderflow.analyze(orderbook.bids, orderbook.asks, currentPrice);
      orderflowScore = ofResult.score;
      orderflowSignal = ofResult.signal;
      imbalance = ofResult.imbalance;
    }

    // Secondary sub-strategy engines for multi-layer support
    const vrResult = this.volRegime.analyze(closes, returns, volMetrics.regime, volMetrics.daily_vol);
    const liqResult = this.liquidity.analyze(closes, highs, lows);
    const fundResult = this.funding.analyze(change24h, volSurgeResult.surge);
    const corrResult = this.correlation.analyze(symbol, btcChange, change24h);
    const tsResult = this.timeSniper.analyze(closes, highs, lows, opens);

    // Advanced structures (Icebergs/Divergences/Pain points)
    let icebergResult = { iceberg_detected: false, direction: "none", strength: 0, message: "" };
    if (orderbook) {
      icebergResult = this.shadowHunter.detectIceberg(orderbook.bids, orderbook.asks);
    }
    const icebergScore = icebergResult.direction === "accumulation" ? 0.85 : icebergResult.direction === "distribution" ? 0.15 : 0.5;

    const yesterdayHigh = highs[highs.length - 2];
    const yesterdayLow = lows[lows.length - 2];
    const yesterdayMedian = (yesterdayHigh + yesterdayLow) / 2;
    const weeklyOpen = opens.length >= 7 ? opens[opens.length - 7] : opens[0];
    
    const painResult = this.painDetector.detect(
      currentPrice,
      yesterdayHigh,
      yesterdayLow,
      weeklyOpen,
      orderbook?.bids || [],
      orderbook?.asks || []
    );
    const painScore = painResult.active && painResult.distance_pct < 0.35 ? (currentPrice > painResult.target_price ? 0.20 : 0.80) : 0.5;

    const divergenceResult = this.divergenceSniffer.sniff(closes, volumes);
    const divergenceScore = divergenceResult.type === "bullish" ? 0.85 : divergenceResult.type === "bearish" ? 0.15 : 0.5;

    const atr = ATR.calculate(highs, lows, closes, 14);
    const relativeATR = atr / currentPrice;

    // ==========================================
    // 🛡️ RE-ARCHITECTED 13 STRICT FILTER CORES
    // ==========================================

    const longFilters = [
      {
        id: 1,
        key: "trend_coherence",
        name: "پایش همگرایی چندزمانی خطوط EMA (MTCG)",
        passed: currentPrice > latestEma9 && latestEma9 > latestEma21 && latestEma21 > latestEma50 && ema50SlopePositive,
        desc: `قیمت (${currentPrice.toFixed(4)}) بالاتر از EMA9 (${latestEma9.toFixed(4)}) > EMA21 (${latestEma21.toFixed(4)}) > EMA50 (${latestEma50.toFixed(4)}) به همراه شیب صعودی EMA50.`
      },
      {
        id: 2,
        key: "rsi_safety",
        name: "محدوده سلامت مومنتوم (RSI_SH)",
        passed: rsiVal >= 45.0 && rsiVal <= 64.0,
        desc: `شاخص RSI (${rsiVal.toFixed(1)}) در محدوده شتاب صعودی امن (بین ۴۵ تا ۶۴) قرار دارد.`
      },
      {
        id: 3,
        key: "mfi_flow",
        name: "جریان نقدینگی ورودی شاخص MFI",
        passed: mfiVal >= 48.0,
        desc: `شاخص جریان پول MFI (${mfiVal.toFixed(1)}) نشان‌دهنده ورود نقدینگی هوشمند و تجمیع مقتدرانه است.`
      },
      {
        id: 4,
        key: "garch_vol",
        name: "سقف نوسانات آماری GARCH (VGCC)",
        passed: volMetrics.annualized_vol < 1.45 && volMetrics.regime !== "extreme",
        desc: `نوسان سالانه (${(volMetrics.annualized_vol * 100).toFixed(1)}%) زیر سقف بحرانی ۱۴۵٪ و دور از تلاطم مفرط قرار دارد.`
      },
      {
        id: 5,
        key: "vol_surge_check",
        name: "افزایش تجمعی و پایدار حجم کورتکس (VSCF)",
        passed: volumeSurgeRatio >= 1.15 || volSurgeResult.surge,
        desc: `نسبت افزایش حجم معاملات (${volumeSurgeRatio.toFixed(2)}) بالاتر از حدنصاب ۱.۱۵ است.`
      },
      {
        id: 6,
        key: "orderbook_imbalance",
        name: "تراز عمق سفارشات خرید دو طرفه (ROIS)",
        passed: imbalance >= 0.03,
        desc: `بزرگتر بودن سنگینی صف خرید اوردربوک صرافی با برتری ثبت شده +${(imbalance * 100).toFixed(1)}% نسبت به فروش.`
      },
      {
        id: 7,
        key: "range_breakout",
        name: "مرزهای رِنج دیروز بازار (MDRB)",
        passed: currentPrice > yesterdayMedian,
        desc: `خروج از فاز سقوط سنگین و قرارگیری قیمت روزانه بالاتر از خط میانی دیروز (${yesterdayMedian.toFixed(4)}).`
      },
      {
        id: 8,
        key: "btc_anchor",
        name: "همسویی بازاری بیت‌کوین به عنوان لیدر (BDAA)",
        passed: btcChange >= -1.2,
        desc: `ثبات نسبی بیت‌کوین با نوسان ۲۴ ساعته (${btcChange.toFixed(2)}%) مناسب بالای سد ریزش عمیق.`
      },
      {
        id: 9,
        key: "time_sniper_phase",
        name: "سیکل تناوبی زمانی اسنایپر (MCSP)",
        passed: tsResult.score >= 0.40,
        desc: `امتیاز چرخه فاز زمانی لندن/نیویورک (${tsResult.score.toFixed(2)}) فاقد مقاومت ریزشی حاد بازار است.`
      },
      {
        id: 10,
        key: "iceberg_guard",
        name: "شکار دیوارهای معکوس نهنگ‌های پنهان (HISHP)",
        passed: icebergResult.direction !== "distribution",
        desc: `نبود توزیع سنگین یا فروشهای الگوریتمی خرد شده که مانع رشد کوین شوند.`
      },
      {
        id: 11,
        key: "pain_point_margin",
        name: "سقف نفوذ در استخرهای لیکوییدی (PPMS)",
        passed: !painResult.active || painResult.distance_pct >= 0.45 || currentPrice > painResult.target_price,
        desc: `عدم حضور در مجاورت سد مقاومتی دیوار سفارشات سرکوب‌کننده اوردربوک صرافی.`
      },
      {
        id: 12,
        key: "divergence_exhaustion",
        name: "واگرایی شتاب جریان پول هوشمند (DSEC)",
        passed: divergenceResult.type !== "bearish",
        desc: `تایید سلامت روند صعودی و عدم ردیابی واگرایی نزولی روی قله‌های چارت.`
      },
      {
        id: 13,
        key: "atr_spread",
        name: "آستانه نوسان نرمال دامنه نوسان (ATRSS)",
        passed: relativeATR >= 0.005 && relativeATR <= 0.045,
        desc: `نسبت نوسان ATR (${(relativeATR * 100).toFixed(2)}%) در محدوده ایده آل و منطقی معاملاتی صرافی.`
      }
    ];

    const shortFilters = [
      {
        id: 1,
        key: "trend_coherence",
        name: "پایش همگرایی چندزمانی خطوط EMA (MTCG)",
        passed: currentPrice < latestEma9 && latestEma9 < latestEma21 && latestEma21 < latestEma50 && !ema50SlopePositive,
        desc: `قیمت (${currentPrice.toFixed(4)}) فروتر از EMA9 (${latestEma9.toFixed(4)}) < EMA21 (${latestEma21.toFixed(4)}) < EMA50 (${latestEma50.toFixed(4)}) به همراه شیب نزولی EMA50.`
      },
      {
        id: 2,
        key: "rsi_safety",
        name: "محدوده سلامت مومنتوم (RSI_SH)",
        passed: rsiVal >= 36.0 && rsiVal <= 55.0,
        desc: `شاخص RSI (${rsiVal.toFixed(1)}) در محدوده ریزشی مناسب و بدون اشباع فروش شدید قرار دارد.`
      },
      {
        id: 3,
        key: "mfi_flow",
        name: "جریان نقدینگی خروجی شاخص MFI",
        passed: mfiVal <= 52.0,
        desc: `شاخص MFI (${mfiVal.toFixed(1)}) خروج نقدینگی فعال یا ممانعت از تجمیع را تایید می‌کند.`
      },
      {
        id: 4,
        key: "garch_vol",
        name: "سقف نوسانات آماری GARCH (VGCC)",
        passed: volMetrics.annualized_vol < 1.45 && volMetrics.regime !== "extreme",
        desc: `نوسان سالانه (${(volMetrics.annualized_vol * 100).toFixed(1)}%) زیر سقف بحرانی ۱۴۵٪ و دور از تلاطم مفرط بازار.`
      },
      {
        id: 5,
        key: "vol_surge_check",
        name: "افزایش تجمعی و پایدار حجم کورتکس (VSCF)",
        passed: volumeSurgeRatio >= 1.15 || volSurgeResult.surge,
        desc: `نسبت افزایش حجم معاملات (${volumeSurgeRatio.toFixed(2)}) بالاتر از حدنصاب ۱.۱۵ است.`
      },
      {
        id: 6,
        key: "orderbook_imbalance",
        name: "تراز عمق سفارشات فروش دو طرفه (ROIS)",
        passed: imbalance <= -0.03,
        desc: `سنگینی تراز فروش اوردربوک با برتری ثبت شده ${(imbalance * 100).toFixed(1)}% نسبت به خریداران.`
      },
      {
        id: 7,
        key: "range_breakout",
        name: "مرزهای رِنج دیروز بازار (MDRB)",
        passed: currentPrice < yesterdayMedian,
        desc: `قرارگیری قیمت زیر خط میانی دیروز (${yesterdayMedian.toFixed(4)}) جهت تایید مومنتوم ضعف خریداران.`
      },
      {
        id: 8,
        key: "btc_anchor",
        name: "همسویی بازاری بیت‌کوین به عنوان لیدر (BDAA)",
        passed: btcChange <= 1.2,
        desc: `نبود فشار صعودی هجومی روی چارت بیت‌کوین (${btcChange.toFixed(2)}%) جهت جلوگیری از فشرده‌شدن موقعیت فروش.`
      },
      {
        id: 9,
        key: "time_sniper_phase",
        name: "سیکل تناوبی زمانی اسنایپر (MCSP)",
        passed: tsResult.score <= 0.60,
        desc: `شاخص زمانی بازار لندن/نیویورک (${tsResult.score.toFixed(2)}) مانع ایجاد حمایت خرید شدید است.`
      },
      {
        id: 10,
        key: "iceberg_guard",
        name: "شکار دیوارهای معکوس نهنگ‌های پنهان (HISHP)",
        passed: icebergResult.direction !== "accumulation",
        desc: `عدم ردیابی دیوارهای خرید منقسم بزرگ ریتیل یا نهنگی که از ریزش چارت حمایت کنند.`
      },
      {
        id: 11,
        key: "pain_point_margin",
        name: "سقف نفوذ در استخرهای لیکوییدی (PPMS)",
        passed: !painResult.active || painResult.distance_pct >= 0.45 || currentPrice < painResult.target_price,
        desc: `عدم قرارگیری قیمت مماس و بالای دیوارهای حمایت قوی اوردربوک صرافی.`
      },
      {
        id: 12,
        key: "divergence_exhaustion",
        name: "واگرایی شتاب جریان پول هوشمند (DSEC)",
        passed: divergenceResult.type !== "bullish",
        desc: `تایید روند نزولی جاری و عدم قرارگیری روی قعر واگرایی‌های مثبت محرک رشد قیمت.`
      },
      {
        id: 13,
        key: "atr_spread",
        name: "آستانه نوسان نرمال دامنه نوسان (ATRSS)",
        passed: relativeATR >= 0.005 && relativeATR <= 0.045,
        desc: `نسبت نوسان ATR (${(relativeATR * 100).toFixed(2)}%) در محدوده معاملاتی زنده و کارآمد صرافی.`
      }
    ];

    const physicalLayers = [
      "orderbook_imbalance",
      "garch_vol",
      "atr_spread",
      "mfi_flow",
      "btc_anchor",
      "iceberg_guard",
      "divergence_exhaustion",
      "time_sniper_phase",
      "pain_point_margin"
    ];

    if (this.disable9Layers) {
      longFilters.forEach(f => {
        if (physicalLayers.includes(f.key)) {
          f.passed = true;
          f.desc = "غیر فعال‌سازی دستی فیلترها - عبور آزاد بدون بررسی تاییدیه ۹ بعدی.";
        }
      });
      shortFilters.forEach(f => {
        if (physicalLayers.includes(f.key)) {
          f.passed = true;
          f.desc = "غیر فعال‌سازی دستی فیلترها - عبور آزاد بدون بررسی تاییدیه ۹ بعدی.";
        }
      });
    }

    const longPassedCount = longFilters.filter(f => f.passed).length;
    const shortPassedCount = shortFilters.filter(f => f.passed).length;

    let action: "buy" | "sell" | "stay_out" = "stay_out";
    let vetoReason = "";
    let finalScore = 0.5;

    const confResult = this.confluenceScalper.analyze(klines, orderbook, imbalance);

    if (confResult.signal === "buy") {
      action = "buy";
      finalScore = confResult.score;
      vetoReason = confResult.details?.reason || "سیگنال خرید بر اساس استراتژی پیشرفته همگرایی چندعاملی (Advanced Confluence) صادر شد.";
    } else if (confResult.signal === "sell") {
      action = "sell";
      finalScore = confResult.score;
      vetoReason = confResult.details?.reason || "سیگنال فروش بر اساس استراتژی پیشرفته همگرایی چندعاملی (Advanced Confluence) صادر شد.";
    } else {
      action = "stay_out";
      vetoReason = confResult.details?.reason || "شرایط ورود استراتژی پیشرفته همگرایی چندعاملی برای این نماد برقرار نیست.";
      if (longPassedCount >= shortPassedCount) {
        finalScore = Math.min(0.70, longPassedCount / 13);
      } else {
        finalScore = Math.max(0.30, 1 - (shortPassedCount / 13));
      }
    }

    // Set score mapping directly to dynamic threshold constraints
    const dynamicThreshold = this.getDynamicThreshold(volMetrics.regime);

    // Calculate Adaptive ATR stop loss runway
    const rawStopLossPct = Math.max(1.4 * (atr / currentPrice), 0.012); 
    const stopLossPct = Math.min(rawStopLossPct, 0.035); // cap at 3.5%

    let dynamicRR1 = 1.35;
    let dynamicRR2 = 2.50;

    // Micro-varied targets using deterministic RSI noise parameters
    const rsiNoise = (rsiVal % 1) * 0.12 - 0.06;
    dynamicRR1 += rsiNoise;
    dynamicRR2 += rsiNoise * 2.0;

    dynamicRR1 = Math.max(1.10, Math.min(1.80, dynamicRR1));
    dynamicRR2 = Math.max(2.10, Math.min(3.80, dynamicRR2));

    const takeProfit1Pct = stopLossPct * dynamicRR1;
    const takeProfit2Pct = stopLossPct * dynamicRR2;

    let stopLoss = currentPrice;
    let takeProfit = currentPrice;
    let takeProfit2 = currentPrice;

    if (action === "buy") {
      stopLoss = currentPrice * (1 - stopLossPct);
      takeProfit = currentPrice * (1 + takeProfit1Pct);
      takeProfit2 = currentPrice * (1 + takeProfit2Pct);
    } else if (action === "sell") {
      stopLoss = currentPrice * (1 + stopLossPct);
      takeProfit = currentPrice * (1 - takeProfit1Pct);
      takeProfit2 = currentPrice * (1 - takeProfit2Pct);
    }

    let confidence = 0.5;
    if (action === "buy") {
      confidence = Math.max(0.5, Math.min(0.95, finalScore));
    } else if (action === "sell") {
      confidence = Math.max(0.5, Math.min(0.95, 1 - finalScore));
    }

    // ⚡ Dynamic Smart Leverage Selector (3x to 7x) — اسکالپ کم‌ریسک
    // اعتماد بالاتر و نوسان معقول، لوریج را کمی بالا می‌برد؛ نوسان زیاد آن را پایین می‌آورد.
    const volRiskDampener = Math.max(0.35, Math.min(1.0, 0.012 / relativeATR));
    const rawLeverage = 3 + 4 * (confidence - 0.5) * 2;
    let leverageSelection = Math.round(rawLeverage * volRiskDampener);
    leverageSelection = Math.max(3, Math.min(7, leverageSelection));

    // Map strict filter flags backwards to UI Layer matrices (with 0.85/0.45 score limits to trigger/reject checklist green lamps)
    const mapSubSignal = (passed: boolean) => ({
      score: passed ? 0.85 : 0.45,
      signal: passed ? (action !== "stay_out" ? action : "hold") : "stay_out"
    });

    const isBuySetup = longPassedCount >= shortPassedCount;
    const activeFilters = isBuySetup ? longFilters : shortFilters;

    const findFilterPassed = (key: string) => {
      const found = activeFilters.find(f => f.key === key);
      return found ? found.passed : false;
    };

    const subSignalsObj = {
      orderflow: mapSubSignal(findFilterPassed("orderbook_imbalance")),
      vol_regime: mapSubSignal(findFilterPassed("garch_vol")),
      liquidity: mapSubSignal(findFilterPassed("atr_spread")),
      funding: mapSubSignal(findFilterPassed("mfi_flow")),
      correlation: mapSubSignal(findFilterPassed("btc_anchor")),
      iceberg: mapSubSignal(findFilterPassed("iceberg_guard")),
      divergence: mapSubSignal(findFilterPassed("divergence_exhaustion")),
      time_sniper: mapSubSignal(findFilterPassed("time_sniper_phase")),
      pain_point: mapSubSignal(findFilterPassed("pain_point_margin")),
    };

    // 🧠 Cortex Neural Setup Veto and Dynamic Learning Optimizer
    const mlConfidence = this.ml.predictConfidence(subSignalsObj);
    let minMLConfidence = 0.62;
    if (this.sensitivity === "conservative") {
      minMLConfidence = 0.67; // Highly strict filter setup
    } else if (this.sensitivity === "balanced") {
      minMLConfidence = 0.62; // Standard adaptive setup matching
    } else {
      minMLConfidence = 0.57; // Active trading mode
    }

    if (action !== "stay_out" && mlConfidence < minMLConfidence) {
      vetoReason = `Cortex Predictive Setup Reject: همگرایی و تایید آماری کورتکس بر روی الگوهای معاملاتی (${(mlConfidence * 100).toFixed(1)}٪) از حداقل حدنصاب بهینه‌سازی شده پس از زیان‌های اخیر (${(minMLConfidence * 100).toFixed(1)}٪) کمتر است. ربات برای پیشگیری از ثبت زیان مکرر، ورود را به طور خودکار لغو نمود.`;
      action = "stay_out";
      // Update subSignals signal property to reflect stay_out / vetoed status
      Object.keys(subSignalsObj).forEach((k) => {
        (subSignalsObj as any)[k].signal = "stay_out";
      });
    }

    return {
      symbol,
      action,
      score: finalScore,
      confidence: Math.min(confidence, 1.0),
      price: currentPrice,
      stop_loss: stopLoss,
      take_profit: takeProfit,
      take_profit_2: takeProfit2,
      leverage: leverageSelection,
      daily_vol: volMetrics.daily_vol,
      regime: volMetrics.regime,
      vol_surge: volSurgeResult.surge || volumeSurgeRatio >= 1.4,
      vol_surge_msg: volSurgeResult.message || `جهش حجم معاملات کوانتومی (×${volumeSurgeRatio.toFixed(1)})`,
      imbalance,
      iceberg: icebergResult,
      pain_point: painResult,
      divergence: divergenceResult,
      dynamic_threshold: dynamicThreshold,
      ml_weights: this.ml.getWeights(),
      sub_signals: subSignalsObj,
      veto_reason: vetoReason !== "" ? vetoReason : undefined,
    };
  }

  recordTrade(subSignals: any, action: string, result: string) {
    this.ml.recordTrade(subSignals, action, result);
  }
}
