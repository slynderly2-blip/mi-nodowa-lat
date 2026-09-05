export function getDefaultSchema(adminPassword = "ortizuwu20") {
  return {
    config: {
      serverName: "Nodowa Network",
      currencyName: "Nodocoins",
      currencySymbol: "NC",
      adminPassword,
      binance: {
        payId: "123456789",
        walletAddress: "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb",
        qrImage: "/uploads/default_qr.svg",
        instruction: "Envía el monto exacto vía Binance Pay y sube tu comprobante o TXID para aprobación automática."
      }
    },
    users: {},
    storeItems: [],
    p2pMarket: [],
    orders: [],
    deliveries: [],
    deliveryIssues: [],
    transactions: [],
    linkTokens: {},
    ratings: []
  };
}
