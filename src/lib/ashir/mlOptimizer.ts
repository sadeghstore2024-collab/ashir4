/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export class MLOptimizer {
  private tradeHistory: { features: Record<string, number>; action: number; result: number }[] = [];
  private weights: Record<string, number> = {
    orderflow: 0.22,
    vol_regime: 0.18,
    liquidity: 0.15,
    funding: 0.12,
    correlation: 0.08,
    time_sniper: 0.15,
    volume_surge: 0.1,
  };
  private learningRate = 0.08;
  private modelTrained = false;
  private lastTraining = 0;

  recordTrade(subSignals: any, action: string, result: string) {
    if (!subSignals) return;
    
    // Extract actual numeric scores
    const features: Record<string, number> = {
      orderflow: subSignals.orderflow?.score ?? 0.5,
      vol_regime: subSignals.vol_regime?.score ?? 0.5,
      liquidity: subSignals.liquidity?.score ?? 0.5,
      funding: subSignals.funding?.score ?? 0.5,
      correlation: subSignals.correlation?.score ?? 0.5,
      time_sniper: subSignals.time_sniper?.score ?? 0.5,
      volume_surge: subSignals.volume_surge?.score ?? 0.5,
    };

    this.tradeHistory.push({
      features,
      action: action === "buy" ? 1 : 0,
      result: result === "win" ? 1 : 0,
    });

    if (this.tradeHistory.length > 200) this.tradeHistory.shift();
    
    // Auto-trigger learning model update on new record
    this.train();
  }

  train() {
    if (this.tradeHistory.length < 2) return false;

    try {
      // Delta rule adjustment: iterate over the trade history and apply gradient updates to weights
      const nextWeights = { ...this.weights };

      for (const trade of this.tradeHistory) {
        const error = trade.result === 1 ? 0.5 : -0.5; // Win (+0.5 gradient support), Loss (-0.5 penalty)

        for (const [key, weight] of Object.entries(nextWeights)) {
          const score = trade.features[key] ?? 0.5;
          // deviation from neutral (0.5 is neutral score)
          const deviation = score - 0.5;
          
          // Apply weight delta
          nextWeights[key] = Math.max(0.04, Math.min(0.40, weight + this.learningRate * deviation * error));
        }
      }

      // Re-normalize weights so they sum exactly to 1.0
      let totalWeight = 0;
      for (const w of Object.values(nextWeights)) {
        totalWeight += w;
      }
      
      if (totalWeight > 0) {
        for (const key of Object.keys(nextWeights)) {
          this.weights[key] = Math.round((nextWeights[key] / totalWeight) * 1000) / 1000;
        }
      }

      this.modelTrained = true;
      this.lastTraining = Date.now();
      return true;
    } catch (e) {
      console.error("[MLOptimizer] Error in model weight optimization training:", e);
      return false;
    }
  }

  getWeights() {
    return this.weights;
  }

  predictConfidence(subSignals: any) {
    if (!subSignals) return 0.5;
    
    let weightedSum = 0;
    let totalWeight = 0;

    for (const [key, weight] of Object.entries(this.weights)) {
      const score = subSignals[key]?.score ?? 0.5;
      weightedSum += score * weight;
      totalWeight += weight;
    }

    return totalWeight > 0 ? (weightedSum / totalWeight) : 0.5;
  }
}
