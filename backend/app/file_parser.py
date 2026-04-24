"""
Multi-format stock data parser.
Supports: CSV, Excel (.xlsx/.xls), PDF
Returns a normalised pandas DataFrame with columns: Date, Open, High, Low, Close, Volume
"""

import io
import logging
import pandas as pd

logger = logging.getLogger(__name__)

# Broad aliases — covers NEPSE broker exports, SEBON, ShareSansar, Merolagani, etc.
_COL_ALIASES = {
    "date": [
        "date", "time", "timestamp", "datetime",
        "trading date", "trade date", "business date",
        "published date", "as of date", "fiscal date",
    ],
    "open": [
        "open", "open price", "opening", "opening price",
        "open rate", "o", "day open",
    ],
    "high": [
        "high", "high price", "day high", "max price",
        "maximum", "h", "52 week high",
    ],
    "low": [
        "low", "low price", "day low", "min price",
        "minimum", "l", "52 week low",
    ],
    "close": [
        "close", "close price", "closing", "closing price",
        "ltp", "last traded price", "last price", "last",
        "c", "price", "adj close", "adjusted close",
        "previous close", "prev close",
    ],
    "volume": [
        "volume", "vol", "qty", "quantity",
        "total volume", "traded quantity", "shares traded",
        "total traded quantity", "no. of transaction",
        "no of transactions", "total quantity",
    ],
}

# Columns to ignore when present — they don't map to OHLCV but could confuse matching
_IGNORE_COLS = {"percent change", "% change", "change", "turnover", "turn over",
                "traded amount", "symbol", "script", "scrip", "company"}


def _clean_numeric(series: pd.Series) -> pd.Series:
    """Strip every non-numeric character then coerce to float."""
    import re
    def _parse(val):
        if val is None:
            return float("nan")
        s = str(val).strip()
        # Common non-value placeholders
        if s in ("", "-", "--", "N/A", "NA", "n/a", "null", "None", "nan"):
            return float("nan")
        # Remove currency symbols, thousand separators, whitespace variants
        s = s.replace("\xa0", "").replace(",", "").replace("Rs.", "") \
             .replace("NPR", "").replace("₹", "").replace("$", "") \
             .replace("£", "").replace("€", "").replace("%", "").strip()
        # Keep only digits, dot, and leading minus
        s = re.sub(r"[^\d.\-]", "", s)
        try:
            return float(s)
        except ValueError:
            return float("nan")

    return series.map(_parse)


def _score_columns(cols: list[str]) -> int:
    """Return how many of the 6 OHLCV groups are represented in cols."""
    cols_lower = {c.strip().lower() for c in cols if isinstance(c, str)}
    return sum(
        any(alias in cols_lower for alias in aliases)
        for aliases in _COL_ALIASES.values()
    )


def _normalise(df: pd.DataFrame) -> pd.DataFrame:
    """Map whatever columns exist onto the canonical set and clean types."""
    # Strip whitespace from column names
    df.columns = [str(c).strip() if c is not None else "" for c in df.columns]

    col_lower = {c.lower(): c for c in df.columns}
    rename = {}
    for canonical, aliases in _COL_ALIASES.items():
        for alias in aliases:
            if alias in col_lower and col_lower[alias] not in rename.values():
                rename[col_lower[alias]] = canonical.capitalize()
                break

    df = df.rename(columns=rename)

    for col in ["Open", "High", "Low", "Close", "Volume"]:
        if col in df.columns:
            df[col] = _clean_numeric(df[col])

    # Drop rows where all OHLC values are NaN
    ohlc_cols = [c for c in ["Open", "High", "Low", "Close"] if c in df.columns]
    if ohlc_cols:
        df = df.dropna(subset=ohlc_cols, how="all")

    if "Date" in df.columns:
        df["Date"] = pd.to_datetime(df["Date"], errors="coerce")
        df = df.dropna(subset=["Date"])
        df = df.sort_values("Date", ascending=True).reset_index(drop=True)

    return df


def _try_header_rows(raw_df: pd.DataFrame) -> pd.DataFrame:
    """
    Many NEPSE/broker Excel exports have 1-5 title/metadata rows before the
    actual header row. Try each of the first 10 rows as the header and pick
    whichever produces the best OHLCV column score.
    """
    best_df    = raw_df
    best_score = _score_columns(list(raw_df.columns))

    for header_row in range(1, min(10, len(raw_df))):
        new_cols = raw_df.iloc[header_row].tolist()
        # Skip if too many empty/numeric cells in this row
        text_cells = [c for c in new_cols if isinstance(c, str) and c.strip()]
        if len(text_cells) < 3:
            continue
        candidate = raw_df.iloc[header_row + 1:].copy()
        candidate.columns = [str(c).strip() if c is not None else "" for c in new_cols]
        candidate = candidate.reset_index(drop=True)
        score = _score_columns(list(candidate.columns))
        if score > best_score:
            best_score = score
            best_df = candidate

    return best_df


# ── Public parsers ─────────────────────────────────────────────────────────────

def parse_csv(content: bytes) -> pd.DataFrame:
    for enc in ("utf-8", "utf-8-sig", "latin-1", "cp1252"):
        try:
            df = pd.read_csv(io.BytesIO(content), thousands=",", encoding=enc)
            df = _try_header_rows(df)
            return _normalise(df)
        except UnicodeDecodeError:
            continue
    raise ValueError("Cannot decode CSV file — try saving it as UTF-8.")


def parse_excel(content: bytes, filename: str) -> pd.DataFrame:
    engine   = "xlrd" if filename.lower().endswith(".xls") else "openpyxl"
    xl       = pd.ExcelFile(io.BytesIO(content), engine=engine)

    best_df    = None
    best_score = -1
    found_cols  = []          # for a helpful error message

    for sheet in xl.sheet_names:
        try:
            # Read with header=0 first, then also probe header rows 1-9
            raw = xl.parse(sheet, thousands=",", header=0)
            if raw.empty:
                continue

            candidate = _try_header_rows(raw)
            score     = _score_columns(list(candidate.columns))
            found_cols = list(candidate.columns)   # save for error reporting

            logger.debug("Sheet '%s': score=%d, cols=%s", sheet, score, found_cols)

            if score > best_score:
                best_score = score
                best_df = candidate
        except Exception as exc:
            logger.warning("Skipping sheet '%s': %s", sheet, exc)
            continue

    if best_df is None or best_score == 0:
        col_hint = ", ".join(str(c) for c in found_cols[:12]) if found_cols else "none found"
        raise ValueError(
            f"Could not find OHLCV columns in the Excel file. "
            f"Detected columns: [{col_hint}]. "
            f"Make sure the file has Open, High, Low, Close (or LTP) columns."
        )

    return _normalise(best_df)


def _pdf_header_key(header_row: list) -> tuple:
    """Canonical tuple of cleaned header strings — used to group same-structure tables."""
    return tuple(str(h).strip().lower() if h else "" for h in header_row)


def parse_pdf(content: bytes) -> pd.DataFrame:
    try:
        import pdfplumber
    except ImportError:
        raise ValueError("PDF support requires pdfplumber. Run: pip install pdfplumber")

    # Collect tables grouped by their header structure
    # key = header tuple, value = (header_list, [list_of_data_rows])
    grouped: dict[tuple, tuple] = {}

    with pdfplumber.open(io.BytesIO(content)) as pdf:
        for page in pdf.pages:
            for tbl in (page.extract_tables() or []):
                if not tbl or len(tbl) < 2:
                    continue

                # Detect which row is the header (first text-heavy row)
                header_idx = 0
                for i, row in enumerate(tbl[:5]):
                    text_cells = [c for c in row if isinstance(c, str) and c.strip()
                                  and not _is_numeric_str(c)]
                    if len(text_cells) >= 3:
                        header_idx = i
                        break

                raw_header = tbl[header_idx]
                data_rows  = tbl[header_idx + 1:]

                # Clean header: replace None / newlines
                header = [str(h).replace("\n", " ").strip() if h else "" for h in raw_header]
                hkey   = _pdf_header_key(header)

                if hkey not in grouped:
                    grouped[hkey] = (header, [])
                grouped[hkey][1].extend(data_rows)

    if not grouped:
        raise ValueError(
            "No tables found in the PDF. "
            "Make sure the PDF contains a financial data table (not just an image/chart)."
        )

    # Pick the header group with the best OHLCV score, then build one big DataFrame
    best_key    = max(grouped, key=lambda k: _score_columns(list(grouped[k][0])))
    best_header, all_rows = grouped[best_key]

    if not all_rows:
        raise ValueError("PDF tables were detected but contained no data rows.")

    # Build DataFrame — skip rows that look like repeated headers
    hkey_set = set(best_key)  # for quick membership check
    clean_rows = []
    for row in all_rows:
        cell_texts = [str(c).replace("\n", " ").strip() if c else "" for c in row]
        # Skip if this row is a repeated header
        if _pdf_header_key(cell_texts) == best_key:
            continue
        clean_rows.append(cell_texts)

    if not clean_rows:
        raise ValueError("PDF contained only header rows and no data rows.")

    df = pd.DataFrame(clean_rows, columns=best_header)
    return _normalise(df)


def _is_numeric_str(s: str) -> bool:
    """Return True if s looks like a number (possibly with commas, %, currency)."""
    import re
    cleaned = re.sub(r"[,₹$£€%\s]", "", str(s))
    try:
        float(cleaned)
        return True
    except ValueError:
        return False


def parse_file(content: bytes, filename: str) -> pd.DataFrame:
    """Dispatch to the right parser based on file extension."""
    ext = filename.rsplit(".", 1)[-1].lower()
    if ext == "csv":
        return parse_csv(content)
    elif ext in ("xlsx", "xls"):
        return parse_excel(content, filename)
    elif ext == "pdf":
        return parse_pdf(content)
    else:
        raise ValueError(
            f"Unsupported file type '.{ext}'. "
            f"Supported formats: CSV (.csv), Excel (.xlsx, .xls), PDF (.pdf)."
        )
