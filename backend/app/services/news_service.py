import httpx
import asyncio
import logging
import xml.etree.ElementTree as ET
from bs4 import BeautifulSoup
from typing import List

logger = logging.getLogger(__name__)

# Professional headers to avoid being blocked by local news sites
_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
}

# Keywords for basic financial sentiment scoring
POSITIVE_WORDS = {'dividend', 'bonus', 'profit', 'rise', 'growth', 'bullish', 'increase', 'award', 'bonus', 'right', 'merger'}
NEGATIVE_WORDS = {'loss', 'drop', 'fall', 'bearish', 'decrease', 'fine', 'scam', 'low', 'decline', 'risky', 'penalty'}

async def get_company_news(symbol: str) -> dict:
    """
    Universal News Scraper for NEPSE stocks.
    Aggregates news from Merolagani, Sharesansar, and Google News RSS.
    Returns: { "headlines": str, "sentiment_score": float, "trend": str }
    """
    symbol = symbol.upper().strip()
    all_headlines = []
    
    # Run scrapers in parallel
    results = await asyncio.gather(
        _scrape_merolagani(symbol),
        _scrape_sharesansar(symbol),
        _get_google_news(symbol)
    )
    
    for res in results:
        if res:
            all_headlines.extend(res)
            
    # Deduplicate and limit
    unique_headlines = list(dict.fromkeys(all_headlines))[:6]
    
    # Calculate Sentiment
    score = 0
    if unique_headlines:
        for h in unique_headlines:
            words = set(h.lower().replace('•', '').split())
            score += len(words & POSITIVE_WORDS)
            score -= len(words & NEGATIVE_WORDS)
        score = score / len(unique_headlines) # Normalize
        
    trend = "NEUTRAL"
    if score > 0.2:  trend = "BULLISH"
    if score < -0.2: trend = "BEARISH"
    
    return {
        "headlines": "\n".join(unique_headlines),
        "sentiment_score": round(score, 2),
        "trend": trend
    }

async def _scrape_sharesansar(symbol: str) -> List[str]:
    """Scrapes news from Sharesansar."""
    try:
        url = f"https://www.sharesansar.com/company/{symbol}"
        async with httpx.AsyncClient(headers=_HEADERS, verify=False, timeout=10.0) as client:
            resp = await client.get(url)
            if resp.status_code != 200: return []
            soup = BeautifulSoup(resp.text, 'html.parser')
            # Look for news in the 'News & Events' tab
            news_items = soup.select("#news h4 a")
            return [f"• {item.text.strip()}" for item in news_items[:3]]
    except: return []

async def _scrape_merolagani(symbol: str) -> List[str]:
    """Scrapes headlines from Merolagani."""
    try:
        url = f"https://merolagani.com/CompanyDetail.aspx?symbol={symbol}"
        async with httpx.AsyncClient(headers=_HEADERS, verify=False, timeout=10.0) as client:
            resp = await client.get(url)
            if resp.status_code != 200: return []
            soup = BeautifulSoup(resp.text, 'html.parser')
            news_section = soup.select("#ctl00_ContentPlaceHolder1_CompanyDetail1_divNews a")
            return [f"• {item.text.strip()}" for item in news_section[:3]]
    except: return []

async def _get_google_news(symbol: str) -> List[str]:
    """Fetches stock-specific news from Google News RSS."""
    try:
        query = f"{symbol}+Nepal+Stock+Exchange"
        url = f"https://news.google.com/rss/search?q={query}&hl=en-NP&gl=NP&ceid=NP:en"
        async with httpx.AsyncClient(headers=_HEADERS, timeout=10.0) as client:
            resp = await client.get(url)
            if resp.status_code != 200: return []
            root = ET.fromstring(resp.text)
            return [f"• {item.find('title').text.split(' - ')[0]}" for item in root.findall('.//item')[:3]]
    except: return []
