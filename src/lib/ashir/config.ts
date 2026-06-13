/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Config } from "./types";

export const config: Config = {
  // Telegram Info
  TELEGRAM_TOKEN: process.env.TELEGRAM_TOKEN || "8462634113:AAF5sBK187VXB3UakMT3cw5n5P0_EJWCSr8",
  TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID || "2146248157",
  
  // XT Exchange Info
  XT_API_KEY: process.env.XT_API_KEY || "458efddf-5c6d-41dd-85de-5012ff4fa5fb",
  XT_BASE_URL: "https://sapi.xt.com",
  
  // Risk Management
  BASE_CAPITAL: 1000,
  MAX_POSITIONS: 5,
  POSITION_SIZE_MAX: 0.10,
  MAX_DRAWDOWN: 0.20,
  KELLY_FRACTION: 0.25,
  
  // Scanner Settings
  SCAN_INTERVAL: 20,
  TOP_TICKER_FILTER: 300,
  ORDERBOOK_FILTER: 80,
  DEEP_ANALYSIS: 40,
  MIN_FINAL_SCORE: 0.80,
  REQUEST_DELAY: 0.08,
};
