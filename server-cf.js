import express from "express";
import helmet from "helmet";
import cors from "cors";
import dotenv from "dotenv";

// CloudFlare integration
import { setupCluster } from "./src/utils/clustering.js";
import { monitor } from "./src/middleware/performanceMonitor.js";
import { cacheMiddleware } from "./src/middleware/caching.js";
import { geoLocationMiddleware, geoBasedRouting } from "./src/middleware/geoLocation.js";
import { cfAnalytics } from "./src/middleware/cfAnalytics.js";

// Rutas
import geoAnalyticsRoutes from "./src/routes/geoAnalytics.js";
import accountRoutes from "./src/routes/accounts.js";
import transactionRoutes from "./src/routes/transactions.js";
import tokenRoutes from "./src/routes/tokens.js";
import analyticsRoutes from "./src/routes/analytics.js";

dotenv.config();

setupCluster(() => {
  const app = express();

  // Security & Performance
  app.use(helmet());
  app.use(cors({
    origin: process.env.ALLOWED_ORIGINS?.split(",") || ["http://localhost:3000"],
    credentials: true,
    maxAge: 86400,
  }));

  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ limit: "1mb", extended: true }));

  // Monitoring
  app.use(monitor.middleware());
  app.use(cfAnalytics.middleware());

  // 🌍 Geo-Location Middleware
  app.use(geoLocationMiddleware);
  app.use(geoBasedRouting);

  // Static files
  app.use(express.static("public"));

  // 🌍 Geo Analytics
  app.use("/api/geo", geoAnalyticsRoutes);

  // API Routes with caching
  app.use("/api/accounts", cacheMiddleware(300), accountRoutes);
  app.use("/api/transactions", cacheMiddleware(60), transactionRoutes);
  app.use("/api/tokens", cacheMiddleware(300), tokenRoutes);
  app.use("/api/analytics", cacheMiddleware(600), analyticsRoutes);

  // Health check
  app.get("/api/health", (req, res) => {
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      geo: req.geo,
      region: req.selectedOrigin,
    });
  });

  // Metrics
  app.get("/api/metrics", (req, res) => {
    res.json({
      performance: monitor.getMetrics(),
      cloudflare: cfAnalytics.getMetrics(),
    });
  });

  app.use((err, req, res, next) => {
    console.error("Error:", err);
    res.status(err.status || 500).json({ error: err.message });
  });

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`🌍 CloudFlare-Integrated Server running on port ${PORT}`);
    console.log(`📊 Geo Dashboard: http://localhost:${PORT}/geo-dashboard.html`);
  });
});