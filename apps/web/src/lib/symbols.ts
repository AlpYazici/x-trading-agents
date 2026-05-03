/** Map our internal (symbol, exchange) to a fully-qualified TradingView symbol. */
export function tvSymbol(sym: string, exchange: string = "US"): string {
  const s = sym.toUpperCase().trim();

  // already fully qualified (contains a colon)
  if (s.includes(":")) return s;

  if (exchange === "BIST") return `BIST:${s}`;

  if (exchange === "CRYPTO") {
    const cryptoMap: Record<string, string> = {
      BTC: "BINANCE:BTCUSDT",
      ETH: "BINANCE:ETHUSDT",
      SOL: "BINANCE:SOLUSDT",
      XRP: "BINANCE:XRPUSDT",
      DOGE: "BINANCE:DOGEUSDT",
      ADA: "BINANCE:ADAUSDT",
      AVAX: "BINANCE:AVAXUSDT",
      MATIC: "BINANCE:MATICUSDT",
      LINK: "BINANCE:LINKUSDT",
      DOT: "BINANCE:DOTUSDT",
      ATOM: "BINANCE:ATOMUSDT",
    };
    return cryptoMap[s] ?? `BINANCE:${s}USDT`;
  }

  // Most common US tickers — explicit exchange.
  // TradingView accepts bare symbols too but explicit is more reliable.
  const nasdaq = new Set([
    "AAPL", "MSFT", "GOOGL", "GOOG", "AMZN", "META", "NVDA", "TSLA",
    "AMD", "INTC", "QCOM", "AVGO", "MU", "ASML", "AMAT", "LRCX",
    "NFLX", "ADBE", "CRM", "ORCL", "CSCO", "PYPL", "SBUX", "COST",
    "PEP", "TMUS", "CMCSA", "TXN", "BKNG", "INTU", "ISRG", "GILD",
    "MDLZ", "REGN", "VRTX", "FISV", "ATVI", "ADP", "ADSK", "MAR",
    "PLTR", "SHOP", "PANW", "CRWD", "DDOG", "SNOW", "MDB", "NET",
    "ABNB", "UBER", "LYFT", "DOCU", "ZM", "OKTA", "TEAM", "WDAY",
    "MRVL", "MCHP", "ANET", "FTNT", "SMCI", "ARM", "COIN",
  ]);
  if (nasdaq.has(s)) return `NASDAQ:${s}`;
  return `NYSE:${s}`;
}
