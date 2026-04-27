import os
import json
import logging
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

_client: OpenAI | None = None


def _get_client() -> OpenAI | None:
    global _client
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not api_key or api_key in ("your_openai_api_key_here", "your_openai_key"):
        return None
    if _client is None:
        _client = OpenAI(api_key=api_key)
    return _client


def generate_explanation(prediction: str, confidence: float, indicators: dict, news: dict | str = "", force_fallback: bool = False) -> dict:
    client = _get_client()

    # Handle both old string news and new dict news
    news_text = news.get("headlines", "") if isinstance(news, dict) else news
    news_trend = news.get("trend", "NEUTRAL") if isinstance(news, dict) else "NEUTRAL"
    news_score = news.get("sentiment_score", 0.0) if isinstance(news, dict) else 0.0

    current    = float(indicators.get('Close',        0)    or 0)
    support    = float(indicators.get('Support',      0)    or 0)
    resistance = float(indicators.get('Resistance',   0)    or 0)
    rsi        = float(indicators.get('RSI',          50)   or 50)
    volatility = float(indicators.get('Volatility',   0.01) or 0.01)
    macd_diff  = float(indicators.get('MACD_diff',    0)    or 0)
    ma50       = float(indicators.get('MA_50',        0)    or 0)
    ma200      = float(indicators.get('MA_200',       0)    or 0)
    bb_width   = float(indicators.get('BB_Width',     0)    or 0)
    vol_change = float(indicators.get('Volume_Change',0)    or 0)
    candle     = float(indicators.get('Candle_Body',  0)    or 0)
    real_atr   = float(indicators.get('ATR',          0)    or 0)
    atr_ratio  = float(indicators.get('ATR_Ratio',    0)    or 0)
    adx        = float(indicators.get('ADX',          0)    or 0)
    stoch_k    = float(indicators.get('Stoch_K',      50)   or 50)
    ema9       = float(indicators.get('EMA_9',        0)    or 0)
    ema21      = float(indicators.get('EMA_21',       0)    or 0)

    above_ma50  = "above" if indicators.get('Above_MA50')  == 1 else "below"
    above_ma200 = "above" if indicators.get('Above_MA200') == 1 else "below"
    vol_str     = (f"+{vol_change*100:.1f}% spike" if vol_change > 0.1
                   else f"{vol_change*100:.1f}% drop" if vol_change < -0.1
                   else "normal")
    candle_str  = "bullish" if candle > 0.005 else "bearish" if candle < -0.005 else "doji/neutral"
    bb_str      = ("SQUEEZE — breakout imminent" if bb_width < 0.05
                   else "EXPANDED — high volatility" if bb_width > 0.15
                   else "normal range")
    # Use real ATR if available; fall back to volatility-based approximation
    atr_approx  = real_atr if real_atr > 0 else (volatility * current)
    adx_str     = ("STRONG TREND" if adx > 25 else "WEAK/RANGING" if adx < 20 else "DEVELOPING TREND")

    # ── Fallback values (used when OpenAI unavailable or errors) ────────────────
    # ... (same as before)
    if prediction == 'BUY':
        fb_ideal       = round(current * 0.995, 2)
        fb_zone_low    = round(max(support, current * 0.985), 2)
        fb_zone_high   = round(current * 1.005, 2)
        fb_entry_cond  = (f"Buy when price holds above Rs. {round(max(support, current*0.98), 2)} "
                          f"on daily close with RSI < 65 and above-average volume")
        fb_t1          = round(resistance if resistance > current else current * 1.05, 2)
        fb_t2          = round(current * 1.10, 2)
        fb_sl          = round(support if 0 < support < current else current * 0.97, 2)
        fb_trail       = round(max(fb_zone_low, current * 0.985), 2)
        fb_exit_cond   = (f"Book 50% profit at T1 (Rs. {round(resistance if resistance > current else current*1.05, 2)}), "
                          f"trail stop to entry for remaining; full exit if daily close below Rs. {round(fb_sl*1.005, 2)}")
        fb_risk        = "Risk: broader NEPSE index weakness or sudden institutional selling below support level"
        fb_structure   = "BULLISH"
    elif prediction == 'SELL':
        fb_ideal       = round(current * 1.003, 2)
        fb_zone_low    = round(current * 0.997, 2)
        fb_zone_high   = round(min(resistance, current * 1.012) if resistance > current else current * 1.012, 2)
        fb_entry_cond  = (f"Sell/reduce when price fails to hold Rs. "
                          f"{round(resistance if resistance > current else current*1.02, 2)} resistance "
                          f"on 2 consecutive daily closes with declining volume")
        fb_t1          = round(support if 0 < support < current else current * 0.95, 2)
        fb_t2          = round(current * 0.90, 2)
        fb_sl          = round(resistance if resistance > current else current * 1.03, 2)
        fb_trail       = round(min(fb_zone_high, current * 1.015), 2)
        fb_exit_cond   = (f"Cover 50% at T1 (Rs. {round(support if 0 < support < current else current*0.95, 2)}), "
                          f"trail stop down for remaining; fully cover if RSI drops below 30")
        fb_risk        = "Risk: positive policy announcement or FII buying could trigger sharp reversal above resistance"
        fb_structure   = "BEARISH"
    else:  # HOLD
        fb_ideal       = round(current, 2)
        fb_zone_low    = round(support if 0 < support < current else current * 0.97, 2)
        fb_zone_high   = round(resistance if resistance > current else current * 1.03, 2)
        fb_entry_cond  = (f"Wait for confirmed breakout above Rs. {round(resistance if resistance > current else current*1.03, 2)} "
                          f"with volume 1.5× average, OR breakdown below Rs. {round(support if 0 < support < current else current*0.97, 2)} "
                          f"to decide direction")
        fb_t1          = round(resistance if resistance > current else current * 1.04, 2)
        fb_t2          = round(current * 1.08, 2)
        fb_sl          = round(support if 0 < support < current else current * 0.96, 2)
        fb_trail       = round(current * 0.985, 2)
        fb_exit_cond   = "Hold through consolidation; exit if price closes below support for 2 consecutive days without recovery"
        fb_risk        = "Risk: prolonged consolidation may resolve to downside if market breadth weakens"
        fb_structure   = "RANGING"

    daily_move = max(atr_approx, current * 0.003)
    price_gap  = abs(fb_t1 - current)
    raw_days   = round(price_gap / daily_move) if daily_move > 0 else 15
    # ADX adjustment: strong trend → faster move; ranging → slower/uncertain
    if adx > 30:
        adx_factor = 0.65   # strongly trending — reach target faster
    elif adx > 25:
        adx_factor = 0.80
    elif adx < 15:
        adx_factor = 1.60   # very choppy — takes much longer or may not reach
    elif adx < 20:
        adx_factor = 1.30
    else:
        adx_factor = 1.00
    fb_days = max(2, min(90, round(raw_days * adx_factor)))

    if client is None or force_fallback:
        explanation_text = "Analysis generated by Technical Model Engine." if force_fallback else "OpenAI API not configured. Using model-calculated technical levels."
        return _build_result(
            explanation     = explanation_text,
            market_structure= fb_structure,
            ideal_entry     = fb_ideal,
            entry_zone_low  = fb_zone_low,
            entry_zone_high = fb_zone_high,
            entry_condition = fb_entry_cond,
            target1         = fb_t1,
            target2         = fb_t2,
            stop_loss       = fb_sl,
            trailing_stop   = fb_trail,
            estimated_days  = fb_days,
            exit_condition  = fb_exit_cond,
            risk_note       = fb_risk,
            current         = current,
        )

    # ── Action-specific instruction for OpenAI ──────────────────────────────────
    if prediction == 'BUY':
        action_guide = (
            "BUY TRADE SETUP — determine:\n"
            "• ideal_entry: optimal accumulation price (at or slightly below current, prefer slight pullback)\n"
            "• entry_zone_low/high: acceptable zone to accumulate (low = near support, high = near current)\n"
            "• entry_condition: exact condition to enter (RSI threshold, price level, volume signal required)\n"
            "• target1: first resistance / near-term profit target (T1)\n"
            "• target2: extended target if momentum continues (T2, typically 8-15% above current)\n"
            "• stop_loss: hard stop below nearest support (max 4% risk from ideal_entry)\n"
            "• trailing_stop: initial trailing stop level once trade moves in favor\n"
            "• exit_condition: partial profit-taking strategy (e.g., sell 50% at T1, trail rest)\n"
            "• risk_note: single most important downside risk"
        )
    elif prediction == 'SELL':
        action_guide = (
            "SELL/REDUCE TRADE SETUP — determine:\n"
            "• ideal_entry: optimal exit/short price (at or slightly above current)\n"
            "• entry_zone_low/high: range to reduce/short (high = near resistance, low = near current)\n"
            "• entry_condition: exact condition (RSI level, rejection at resistance, volume drop signal)\n"
            "• target1: first support / near-term downside target (T1)\n"
            "• target2: extended downside target if selling pressure continues (T2)\n"
            "• stop_loss: hard stop above resistance for shorts (max 4% risk from ideal_entry)\n"
            "• trailing_stop: trailing stop level once short trade moves in favor\n"
            "• exit_condition: short covering strategy (partial at T1, rest at T2)\n"
            "• risk_note: single biggest upside risk for the short position"
        )
    else:
        action_guide = (
            "HOLD/WATCH SETUP — determine:\n"
            "• ideal_entry: best price to enter IF breakout/breakdown confirms\n"
            "• entry_zone_low/high: current consolidation range (support to resistance)\n"
            "• entry_condition: specific breakout trigger (price level + volume confirmation needed)\n"
            "• target1: breakout target above resistance\n"
            "• target2: extended target if breakout is sustained\n"
            "• stop_loss: breakdown level to exit if range breaks down\n"
            "• trailing_stop: stop level to set once position entered post-breakout\n"
            "• exit_condition: when to abandon if no directional move occurs\n"
            "• risk_note: what most likely causes breakdown instead of breakout"
        )

    rsi_tag    = '(OVERBOUGHT ⚠)' if rsi > 70 else '(OVERSOLD 🟢)' if rsi < 30 else '(neutral)'
    macd_tag   = '▲ BULLISH' if macd_diff > 0 else '▼ BEARISH'
    ema_cross  = ("EMA9 > EMA21 (BULLISH cross)" if ema9 > ema21 > 0 else
                  "EMA9 < EMA21 (BEARISH cross)" if ema21 > ema9 > 0 else "EMA data partial")

    prompt = f"""You are a senior quantitative trading analyst at a Nepali institutional investment firm specializing in NEPSE (Nepal Stock Exchange). Provide a precise, professional, actionable trade setup.

═══ SIGNAL ═══
Direction: {prediction} | Model Confidence: {confidence:.1f}%

═══ MARKET SENTIMENT (Advanced Analysis) ═══
Sentiment Index: {news_score:+.2f} ({news_trend})
Recent Headlines:
{news_text if news_text else "No recent news found for this symbol."}

═══ TECHNICAL SNAPSHOT ═══
Current Price (Reference): Rs. {current:,.2f}
RSI (14): {rsi:.1f} {rsi_tag} | Stochastic %K: {stoch_k:.1f}
MACD Histogram: {macd_diff:+.4f} → {macd_tag}
EMA Cross: {ema_cross}
MA50: Rs. {ma50:,.2f} | Price {above_ma50} MA50
MA200: Rs. {ma200:,.2f} | Price {above_ma200} MA200
Bollinger Band: Width={bb_width:.4f} → {bb_str}
ATR (14-day true range): Rs. {atr_approx:.2f} | ATR/Price ratio: {atr_ratio:.4f}
ADX (14): {adx:.1f} → {adx_str}
20-day Volatility: {volatility*100:.2f}% daily
Volume change: {vol_str} | Latest candle: {candle_str}
Key Support: Rs. {support:,.2f} | Key Resistance: Rs. {resistance:,.2f}

═══ YOUR TASK ═══
{action_guide}

HARD CONSTRAINTS (must be respected):
1. All prices must be within 20% of current price Rs. {current:,.2f}
2. stop_loss must be within 5% of ideal_entry
3. target1 must be at least 3% away from ideal_entry
4. target2 must be at least 7% away from ideal_entry
5. entry_zone_low ≤ ideal_entry ≤ entry_zone_high
6. estimated_days: integer between 2 and 90 — derive from ATR Rs. {atr_approx:.2f}/day and ADX {adx:.1f}:
   • price_gap ÷ ATR gives raw days; high ADX (>25) shortens timeline, low ADX (<20) lengthens it
   • Strong trending stocks (ADX>30): 3–20 days typical; ranging stocks (ADX<20): 20–60 days typical
7. All prices are in NPR (Nepalese Rupees)
8. Weigh Market Sentiment: The Sentiment Index ({news_score:+.2f}) reflects institutional and retail news flow. If Sentiment is BEARISH but technicals are BUY, look for a 'divergence' explanation. If both align, assign higher conviction to targets.

Respond with ONLY a valid JSON object. No markdown fences. No extra text. Start with {{ and end with }}:
{{
  "explanation": "Return 4 distinct paragraphs separated by \\n\\n: (1) Market Structure & Trend Context (discussing MACD/MA/ADX), (2) News/Sentiment Correlations with technical signals, (3) Detailed Trade Execution Logic (integrating entry/target/stop prices and breakout levels), (4) Timeline Reasoning & Primary Risk Factors.",
  "market_structure": "<BULLISH|BEARISH|RANGING>",
  "ideal_entry": <number>,
  "entry_zone_low": <number>,
  "entry_zone_high": <number>,
  "entry_condition": "<specific actionable entry trigger with exact Rs. price levels and volume confirmation>",
  "target1": <number>,
  "target2": <number>,
  "stop_loss": <number>,
  "trailing_stop": <number>,
  "estimated_days": <integer 2-90>,
  "exit_condition": "<specific profit-taking and position management strategy with Rs. levels>",
  "risk_note": "<single most important risk that could invalidate this trade setup>"
}}"""

    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a professional NEPSE quantitative trading analyst. "
                        "Output ONLY a valid JSON object — no markdown, no extra text, no code fences. "
                        "Start with { and end with }. Be precise with Rs. price levels."
                    )
                },
                {"role": "user", "content": prompt},
            ],
            max_tokens=700,
            temperature=0.25,
            timeout=25,
        )
        raw = response.choices[0].message.content.strip()
        # Strip any accidental markdown code fences
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.lower().startswith("json"):
                raw = raw[4:]
        raw = raw.strip()
        data = json.loads(raw)

        return _build_result(
            explanation     = str(data.get("explanation") or ""),
            market_structure= str(data.get("market_structure") or fb_structure),
            ideal_entry     = float(data.get("ideal_entry") or fb_ideal),
            entry_zone_low  = float(data.get("entry_zone_low") or fb_zone_low),
            entry_zone_high = float(data.get("entry_zone_high") or fb_zone_high),
            entry_condition = str(data.get("entry_condition") or fb_entry_cond),
            target1         = float(data.get("target1") or fb_t1),
            target2         = float(data.get("target2") or fb_t2),
            stop_loss       = float(data.get("stop_loss") or fb_sl),
            trailing_stop   = float(data.get("trailing_stop") or fb_trail),
            estimated_days  = int(float(data.get("estimated_days") or fb_days)),
            exit_condition  = str(data.get("exit_condition") or fb_exit_cond),
            risk_note       = str(data.get("risk_note") or fb_risk),
            current         = current,
        )

    except Exception as e:
        logger.error("OpenAI error: %s", e)
        return _build_result(
            explanation     = "AI analysis temporarily unavailable. Using model-calculated price levels from technical indicators.",
            market_structure= fb_structure,
            ideal_entry     = fb_ideal,
            entry_zone_low  = fb_zone_low,
            entry_zone_high = fb_zone_high,
            entry_condition = fb_entry_cond,
            target1         = fb_t1,
            target2         = fb_t2,
            stop_loss       = fb_sl,
            trailing_stop   = fb_trail,
            estimated_days  = fb_days,
            exit_condition  = fb_exit_cond,
            risk_note       = fb_risk,
            current         = current,
        )


def _build_result(explanation: str, market_structure: str,
                  ideal_entry: float, entry_zone_low: float, entry_zone_high: float,
                  entry_condition: str, target1: float, target2: float,
                  stop_loss: float, trailing_stop: float, estimated_days: int,
                  exit_condition: str, risk_note: str, current: float) -> dict:

    ref = ideal_entry if ideal_entry else current
    t1_pct    = round((target1      - ref) / ref * 100, 2) if ref else 0
    t2_pct    = round((target2      - ref) / ref * 100, 2) if ref else 0
    sl_pct    = round((stop_loss    - ref) / ref * 100, 2) if ref else 0
    trail_pct = round((trailing_stop- ref) / ref * 100, 2) if ref else 0
    rr        = round(abs(t1_pct / sl_pct), 2) if sl_pct != 0 else 0

    return {
        "explanation":       explanation,
        "market_structure":  market_structure,
        "ideal_entry":       round(ideal_entry,      2),
        "entry_zone_low":    round(entry_zone_low,   2),
        "entry_zone_high":   round(entry_zone_high,  2),
        "entry_condition":   entry_condition,
        "target_price":      round(target1,           2),   # kept for chart backward-compat
        "target2":           round(target2,           2),
        "stop_loss":         round(stop_loss,         2),
        "trailing_stop":     round(trailing_stop,     2),
        "estimated_days":    estimated_days,
        "exit_condition":    exit_condition,
        "risk_note":         risk_note,
        "target_pct":        t1_pct,
        "target2_pct":       t2_pct,
        "stop_loss_pct":     sl_pct,
        "trailing_stop_pct": trail_pct,
        "risk_reward":       rr,
    }
